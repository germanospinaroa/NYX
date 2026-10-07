import type { SupabaseClient } from '@supabase/supabase-js'
import type { ImportPreparation, PreparedImportRow } from './process'

type ImportFormat = 'CSV' | 'XLSX'
export type StagingRow = {
  owner_id: string
  import_id: string
  row_number: number
  raw_name: string
  raw_phone: string
  normalized_name: string | null
  phone_e164: string | null
  result: PreparedImportRow['result']
  error_code: string | null
  included: boolean
  row_is_ready: boolean
}

export type StagingMetrics = {
  rowsStaged: number
  batches: number
  remoteRequests: number
  bytesSent: number
  bytesReceived: number
  durationMs: number
}

export class SupabaseTimeoutError extends Error {
  constructor() { super('SUPABASE_TIMEOUT'); this.name = 'SupabaseTimeoutError' }
}

export class ImportOutcomeUnknownError extends Error {
  constructor(public readonly importId: string | null) { super('IMPORT_OUTCOME_UNKNOWN'); this.name = 'ImportOutcomeUnknownError' }
}

const MAX_BATCH_ROWS = 750
const MAX_BATCH_BYTES = 512 * 1024
const SUPABASE_REQUEST_TIMEOUT_MS = 30_000

function safeFilename(filename: string): string {
  return filename.replace(/[\u0000-\u001f\u007f]/gu, '').slice(0, 255) || 'contact-import'
}

export async function withTimeout<T>(promise: PromiseLike<T>, timeoutMs = SUPABASE_REQUEST_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new SupabaseTimeoutError()), timeoutMs) }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function stageRowsInBatches(
  rows: StagingRow[],
  insertBatch: (batch: StagingRow[]) => Promise<void>,
): Promise<StagingMetrics> {
  const startedAt = performance.now()
  let batch: StagingRow[] = []
  let batchBytes = 2
  let bytesSent = 0
  let batches = 0

  async function flush() {
    if (!batch.length) return
    await insertBatch(batch)
    batches += 1
    bytesSent += new TextEncoder().encode(JSON.stringify(batch)).byteLength
    batch = []
    batchBytes = 2
  }

  for (const row of rows) {
    const rowBytes = new TextEncoder().encode(JSON.stringify(row)).byteLength + 1
    if (batch.length && (batch.length >= MAX_BATCH_ROWS || batchBytes + rowBytes > MAX_BATCH_BYTES)) await flush()
    batch.push(row)
    batchBytes += rowBytes
  }
  await flush()
  return { rowsStaged: rows.length, batches, remoteRequests: batches, bytesSent, bytesReceived: 0, durationMs: performance.now() - startedAt }
}

type ImportRecord = {
  id: string
  status: string
  staging_complete: boolean
  created_contacts: number
  matched_existing_contacts: number
}

export async function persistPreparedImport(
  supabase: SupabaseClient,
  ownerId: string,
  filename: string,
  format: ImportFormat,
  preparation: ImportPreparation,
  idempotencyKey: string,
) {
  const startedAt = performance.now()
  const metrics: StagingMetrics = { rowsStaged: 0, batches: 0, remoteRequests: 0, bytesSent: 0, bytesReceived: 0, durationMs: 0 }
  let importRecord = await findImport(supabase, ownerId, idempotencyKey, metrics)

  if (!importRecord) {
    let created: { data: unknown; error: { code?: string } | null }
    try {
      created = await withTimeout(supabase
        .from('contact_imports')
        .insert({
          owner_id: ownerId,
          idempotency_key: idempotencyKey,
          original_filename: safeFilename(filename),
          source_format: format,
          status: 'PROCESSING',
          staging_complete: false,
          total_rows: preparation.summary.total,
          valid_rows: preparation.summary.valid,
          duplicate_rows: preparation.summary.duplicateInFile,
          invalid_rows: preparation.summary.invalid,
          started_at: new Date().toISOString(),
        })
        .select('id, status, staging_complete, created_contacts, matched_existing_contacts')
        .single())
    } catch (error) {
      if (error instanceof SupabaseTimeoutError) throw new ImportOutcomeUnknownError(null)
      throw error
    }
    metrics.remoteRequests += 1
    if (created.error || !created.data) {
      if (created.error?.code !== '23505') throw new Error('IMPORT_CREATE_FAILED')
      importRecord = await findImport(supabase, ownerId, idempotencyKey, metrics)
      if (!importRecord) throw new Error('IMPORT_CREATE_FAILED')
    } else {
      importRecord = created.data as ImportRecord
    }
  }

  if (importRecord.status === 'COMPLETED') return completedResult(importRecord, metrics, startedAt)

  const importId = importRecord.id
  const stagingRows = preparation.rows.map((row) => toStagingRow(ownerId, importId, row))
  try {
    if (importRecord.status === 'FAILED') {
      const { error: reopenError } = await withTimeout(supabase
        .from('contact_imports')
        .update({ status: 'PROCESSING', staging_complete: false })
        .eq('id', importId)
        .eq('owner_id', ownerId))
      metrics.remoteRequests += 1
      if (reopenError) throw new Error('IMPORT_REOPEN_FAILED')
      importRecord = { ...importRecord, status: 'PROCESSING', staging_complete: false }
    }

    if (!importRecord.staging_complete) {
      const stageMetrics = await stageRowsInBatches(stagingRows, async (batch) => {
        const { error } = await withTimeout(supabase
          .from('contact_import_rows')
          .upsert(batch, { onConflict: 'import_id,row_number', ignoreDuplicates: true }))
        if (error) throw new Error('IMPORT_ROWS_FAILED')
      })
      metrics.rowsStaged = stageMetrics.rowsStaged
      metrics.batches = stageMetrics.batches
      metrics.remoteRequests += stageMetrics.remoteRequests
      metrics.bytesSent = stageMetrics.bytesSent
      metrics.durationMs = performance.now() - startedAt

      const { error: stagedError } = await withTimeout(supabase
        .from('contact_imports')
        .update({ staging_complete: true })
        .eq('id', importId)
        .eq('owner_id', ownerId))
      metrics.remoteRequests += 1
      if (stagedError) throw new Error('IMPORT_STAGING_STATE_FAILED')
    }

    const { data: finalized, error: finalizeError } = await withTimeout(supabase
      .rpc('finalize_contact_import', { p_import_id: importId })
      .single())
    metrics.remoteRequests += 1
    if (finalizeError || !finalized) throw new Error('IMPORT_FINALIZE_FAILED')
    const result = finalized as { created_contacts: number; matched_existing_contacts: number; processed_rows: number }
    metrics.bytesReceived = new TextEncoder().encode(JSON.stringify(result)).byteLength
    metrics.durationMs = performance.now() - startedAt
    return { importId, createdContacts: result.created_contacts, matchedExistingContacts: result.matched_existing_contacts, processedRows: result.processed_rows, metrics }
  } catch (error) {
    if (error instanceof SupabaseTimeoutError) throw new ImportOutcomeUnknownError(importId)
    // Keep recoverable remote failures in PROCESSING. Marking the row FAILED
    // here could race with another confirmation and invalidate its progress;
    // the same idempotency key can safely retry staging/finalization instead.
    throw error instanceof Error && error.message.startsWith('IMPORT_') ? error : new Error('IMPORT_FAILED')
  }
}

async function findImport(supabase: SupabaseClient, ownerId: string, idempotencyKey: string, metrics: StagingMetrics): Promise<ImportRecord | null> {
  const { data, error } = await withTimeout(supabase
    .from('contact_imports')
    .select('id, status, staging_complete, created_contacts, matched_existing_contacts')
    .eq('owner_id', ownerId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle())
  metrics.remoteRequests += 1
  if (error) throw new Error('IMPORT_LOOKUP_FAILED')
  return data as ImportRecord | null
}

function completedResult(importRecord: ImportRecord, metrics: StagingMetrics, startedAt: number) {
  metrics.durationMs = performance.now() - startedAt
  return {
    importId: importRecord.id,
    createdContacts: importRecord.created_contacts,
    matchedExistingContacts: importRecord.matched_existing_contacts,
    processedRows: importRecord.created_contacts + importRecord.matched_existing_contacts,
    metrics,
  }
}

function toStagingRow(ownerId: string, importId: string, row: PreparedImportRow): StagingRow {
  const ready = row.result === 'VALID' || row.result === 'MATCHED_EXISTING'
  return {
    owner_id: ownerId,
    import_id: importId,
    row_number: row.rowNumber,
    raw_name: row.rawName,
    raw_phone: row.rawPhone,
    normalized_name: row.normalizedName ?? null,
    phone_e164: row.phoneE164 ?? null,
    result: row.result,
    error_code: row.errorCode ?? null,
    included: ready,
    row_is_ready: ready,
  }
}

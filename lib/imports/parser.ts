import { parse } from 'csv-parse/sync'
import ExcelJS from 'exceljs'

export type ParsedContactFile = {
  format: 'CSV' | 'XLSX'
  headers: string[]
  rows: Record<string, string>[]
}

const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_ROWS = 10_000
const MAX_COLUMNS = 100

function extension(filename: string): string {
  return filename.toLowerCase().split('.').pop() ?? ''
}

function normalizeCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  return String(value).trim()
}

function validateHeaders(headers: string[]) {
  if (headers.some((header) => !header) || new Set(headers).size !== headers.length) throw new Error('INVALID_HEADERS')
}

export async function parseContactFile(file: File): Promise<ParsedContactFile> {
  if (file.size > MAX_FILE_BYTES) throw new Error('FILE_TOO_LARGE')
  const ext = extension(file.name)
  const bytes = await file.arrayBuffer()
  if (bytes.byteLength === 0) throw new Error('EMPTY_FILE')

  if (ext === 'csv') {
    const records = parse(new TextDecoder().decode(bytes), {
      bom: true,
      skip_empty_lines: true,
    }) as string[][]
    if (records.length === 0) throw new Error('EMPTY_FILE')
    const headers = records[0].map(normalizeCell)
    if (headers.every((header) => !header)) throw new Error('EMPTY_FILE')
    validateHeaders(headers)
    if (headers.length > MAX_COLUMNS || records.length - 1 > MAX_ROWS) throw new Error('ROW_OR_COLUMN_LIMIT')
    return {
      format: 'CSV',
      headers,
      rows: records.slice(1).map((values) =>
        Object.fromEntries(headers.map((header, index) => [header, normalizeCell(values[index])])),
      ),
    }
  }

  if (ext === 'xlsx') {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(bytes)
    const worksheet = workbook.worksheets[0]
    if (!worksheet) throw new Error('EMPTY_FILE')
    const values = worksheet.getSheetValues().slice(1) as unknown[][]
    if (values.length === 0) throw new Error('EMPTY_FILE')
    const headers = (values[0] ?? []).slice(1).map(normalizeCell)
    if (headers.every((header) => !header)) throw new Error('EMPTY_FILE')
    validateHeaders(headers)
    if (headers.length > MAX_COLUMNS || values.length - 1 > MAX_ROWS) throw new Error('ROW_OR_COLUMN_LIMIT')
    return {
      format: 'XLSX',
      headers,
      rows: values.slice(1).map((row) =>
        Object.fromEntries(headers.map((header, index) => [header, normalizeCell(row[index + 1])])),
      ),
    }
  }

  throw new Error('UNSUPPORTED_FORMAT')
}

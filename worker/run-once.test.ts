import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const runOnce = readFileSync(resolve(process.cwd(), 'worker/run-once.ts'), 'utf8')
const worker = readFileSync(resolve(process.cwd(), 'worker/outbox-worker.ts'), 'utf8')
const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as { scripts: Record<string, string> }

describe('worker execution modes', () => {
  it('runs exactly one iteration and has a versioned persistent command', () => {
    expect(runOnce).toContain('processOutboxOnce()')
    expect(runOnce).not.toContain('runOutboxWorker')
    expect(packageJson.scripts['worker:once']).toBe('tsx worker/run-once.ts')
    expect(packageJson.scripts['worker:start']).toBe('tsx worker/run.ts')
  })

  it('uses OUTBOX_BATCH_SIZE for the claim limit', () => {
    expect(worker).toContain("p_limit: Number(process.env.OUTBOX_BATCH_SIZE ?? 20)")
    expect(worker).toContain('processOutboxOnce')
  })

  it('does not put a mock adapter on the production entrypoint', () => {
    expect(runOnce).not.toContain('MockEvolutionAdapter')
    expect(runOnce).not.toContain('claim_outbox_batch')
  })
})

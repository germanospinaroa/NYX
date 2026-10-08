import { runOutboxWorker } from './outbox-worker'

runOutboxWorker().catch((error: unknown) => {
  console.error('NYX outbox worker stopped:', error instanceof Error ? error.message : 'UNKNOWN_ERROR')
  process.exitCode = 1
})

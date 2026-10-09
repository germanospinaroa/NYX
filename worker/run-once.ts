import { processOutboxOnce } from './outbox-worker'

processOutboxOnce()
  .then((processed) => {
    console.log('NYX worker iteration complete:', processed)
  })
  .catch((error: unknown) => {
    console.error('NYX worker iteration failed:', error instanceof Error ? error.message : 'UNKNOWN_ERROR')
    process.exitCode = 1
  })

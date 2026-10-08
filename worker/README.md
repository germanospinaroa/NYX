# NYX outbox worker

El worker es un proceso persistente para el VPS. No se ejecuta dentro del
ciclo de vida de una request de Vercel y no debe apuntar a datos de producción
hasta completar la configuración y una revisión operativa explícita.

Requiere, únicamente en el entorno del proceso:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `EVOLUTION_BASE_URL`
- `EVOLUTION_API_KEY`
- `EVOLUTION_INSTANCE`

Opcionales:

- `OUTBOX_BATCH_SIZE`
- `OUTBOX_PACING_MS`
- `OUTBOX_POLL_INTERVAL_MS`
- `EVOLUTION_REQUEST_TIMEOUT_MS`

La ejecución local requiere un runner TypeScript del entorno, por ejemplo
`tsx`, y se inicia con `worker/run.ts`. No se incluyen credenciales ni se
ejecuta automáticamente desde Next.js.

Un timeout después de que Evolution pudo recibir el request se marca como
`OUTCOME_UNKNOWN`; el worker no reintenta automáticamente ni hace un segundo
POST ciego.

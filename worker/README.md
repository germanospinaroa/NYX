# NYX outbox worker

Modos de ejecución versionados:

- One-shot controlado: OUTBOX_BATCH_SIZE=1 npm run worker:once
- Persistente: npm run worker:start

El one-shot ejecuta exactamente una iteración y termina. Para el primer live
send debe usarse OUTBOX_BATCH_SIZE=1. En VPS debe mantenerse como proceso
dedicado con Restart=on-failure, usuario sin privilegios, secretos fuera de
Git y logs rotados; no depende de una sesión SSH ni comparte proceso con n8n
o Evolution.

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

El worker solo reclama mensajes individuales `QUEUED` o campañas en estado
`QUEUED`/`RUNNING`. Crear el snapshot deja la campaña en `READY`; el usuario
debe pulsar `Enviar campaña` para ejecutar `queue_campaign`.

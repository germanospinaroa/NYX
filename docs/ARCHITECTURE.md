# NYX — Arquitectura

## Flujo principal

`Web/API → PostgreSQL → Outbox → Node Worker → Evolution Adapter → WhatsApp`

## Webhooks

`Evolution → Webhook Inbox → PostgreSQL`

## Media

La media se almacena en Storage privado separado de PostgreSQL. PostgreSQL
guarda el path estable y el estado; el worker solicita una signed URL justo
antes del dispatch para evitar que una URL temporal expire mientras espera.
Si el enqueue falla después de subir una imagen, el path queda como media
pendiente de cleanup; no se eliminan automáticamente objetos reales durante
este hardening.

## Message sequences

Una secuencia pertenece a un owner y contacto, y contiene mensajes outbox con
`sequence_index` estable. El primer paso es elegible inicialmente; cada paso
posterior requiere que el anterior termine `SENT`. `FAILED`, `CANCELLED` y
`OUTCOME_UNKNOWN` detienen la secuencia sin retry automático. Un mensaje
individual es una secuencia de un paso.

Las campañas V1 guardan una plantilla de pasos y crean una secuencia propia por
`campaign_recipient`. El recipient congela `phone_snapshot` y
`gender_snapshot`; los mensajes de campaña usan esos snapshots y no vuelven a
consultar el contacto durante dispatch. `campaign_recipient` solo pasa a
`SENT` después de que todos sus pasos terminan `SENT`. La creación del snapshot
es una operación transaccional/set-based y deja la campaña en `READY`; el
envío requiere después la transición explícita de campaña a `QUEUED`.

El monitor interpreta `SENT` como aceptación del dispatch por el proveedor.
No significa entregado ni leído; esos estados dependerán de la futura inbox de
webhooks de Evolution.

## Principios

- PostgreSQL es la source of truth.
- El worker es persistente.
- No existe scheduler en el navegador.
- No se mantienen requests HTTP largos para ejecutar envíos.
- Evolution está desacoplado detrás de un adapter.
- Las operaciones relevantes deben ser idempotentes.
- `unknown` no se reproduce automáticamente.
- Los contratos externos deben verificarse con pruebas, no asumirse desde documentación.
- No introducir Redis/BullMQ inicialmente salvo evidencia técnica posterior que lo justifique.

## Límites de dominio

`contact`, `list`, `campaign`, `campaign_recipient` y `message` son entidades separadas. En particular, `contact != campaign_recipient != message`.

Este documento no diseña todavía cada tabla completa.


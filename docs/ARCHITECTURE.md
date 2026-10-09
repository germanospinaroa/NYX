# NYX — Arquitectura

## Flujo principal

`Web/API → PostgreSQL → Outbox → Node Worker → Evolution Adapter → WhatsApp`

## Webhooks

`Evolution → Webhook Inbox → PostgreSQL`

## Media

La media se almacena en Storage privado separado de PostgreSQL. PostgreSQL
guarda el path estable y el estado; el worker solicita una signed URL justo
antes del dispatch para evitar que una URL temporal expire mientras espera.

## Message sequences

Una secuencia pertenece a un owner y contacto, y contiene mensajes outbox con
sequence_index estable. El primer paso es elegible inicialmente; cada paso
posterior requiere que el anterior termine SENT. FAILED, CANCELLED y
OUTCOME_UNKNOWN detienen la secuencia sin retry automático. Un mensaje
individual es una secuencia de un paso. El modelo también permite asociar una
secuencia a una campaña futura sin cambiar la identidad de campaign_recipient.
Los snapshots de campaña existentes siguen siendo outbox de un paso; la
autoría de campañas multi-paso queda deliberadamente pendiente de aplicar y
verificar esta migración en Supabase.

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


# NYX — Arquitectura

## Flujo principal

`Web/API → PostgreSQL → Outbox → Node Worker → Evolution Adapter → WhatsApp`

## Webhooks

`Evolution → Webhook Inbox → PostgreSQL`

## Media

La media se almacenará en storage separado de PostgreSQL, con PostgreSQL como fuente de verdad de sus referencias y estado.

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


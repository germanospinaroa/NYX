# NYX — ESTADO

## Visión

NYX convierte la red personal y profesional de una persona en un activo organizado, accionable y con memoria.

## MVP actual

Importar agenda → limpiar y normalizar contactos → clasificar nombre → revisar ambiguos → seleccionar audiencia → crear mensaje → programar → enviar mediante Evolution → monitorear resultado.

## Arquitectura decidida

Next.js/TypeScript, Supabase Auth, PostgreSQL, Supabase Storage, Node worker persistente, Evolution API, Postgres outbox y VPS para worker + Evolution. Vercel queda como opción para la web.

Evolution es un proveedor de canal y no el núcleo del dominio.

## Fases

- Fase 0 — Evolution Contract Spike
- Fase 1 — Database + Contacts + Ingestion
- Fase 2 — Classification + Review
- Fase 3 — Campaign Composer
- Fase 4 — Scheduler + Outbox + Worker + Evolution
- Fase 5 — Monitoring + Pause/Stop + E2E + QA

## Estado actual

FASE 1 — BULK INGESTION REFACTOR READY FOR MIGRATION

La aplicación Next.js, el flujo de ingestión, la migración reproducible y las
pruebas puras están preparados. El proyecto Supabase configurado en
`.env.local` responde y las tablas `contacts`, `contact_imports` y
`contact_import_rows` ya existen en su Data API. El acceso anónimo está
bloqueado para inserts, pero esta sesión no tiene las credenciales ni una
sesión del usuario owner de prueba; por eso login, persistencia autenticada,
aislamiento RLS y el flujo E2E todavía no pueden declararse verificados.

La importación fue rediseñada para staging bulk y finalización set-based. La
nueva migración `20261007190000_bulk_finalize_contact_import.sql` debe aplicarse
antes de desplegar esta versión; no se ha ejecutado desde Codex.

Acción pendiente: ejecutar las pruebas con una sesión del usuario owner de
prueba, sin guardar su password en Git ni documentación. No se requiere
modificar `.env.local` para las claves públicas actuales.

Fase 0 verificó conexión/versionado, connection state de una instancia
dedicada, number check, sendText, sendMedia y el contrato observado de
webhooks. Retries operacionales, caída real, restart/reconnect y provider
idempotency key quedan explícitamente como no verificados y no bloquean el
cierre del spike.

## ECC

Plugin nativo de Codex `ecc@ecc`, versión `2.2.3`, revisión `ef648e01899ba3e8dc6371642deaaf64b4477775`.

## Decisiones pendientes

- Diseño detallado de la inbox idempotente de webhooks para Fase 4.
- Confirmación futura del digest contra el registry antes de infraestructura.
- Soporte de idempotency key del proveedor: no verificado.

## Último milestone

Aplicación inicial de Database + Contacts + Ingestion preparada; refactor de
bulk staging/set-based finalization implementado, pendiente de migración y
verificación E2E.

## Siguiente fase

FASE 1 — Database + Contacts + Ingestion (BULK REFACTOR READY FOR MIGRATION)

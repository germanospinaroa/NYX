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

FASE 1 — REVIEW WORKSPACE VERIFICADO; HARDENING PENDIENTE

La aplicación Next.js, el flujo de ingestión, la migración reproducible y las
pruebas puras están preparados. El proyecto Supabase configurado en
`.env.local` responde y las tablas `contacts`, `contact_imports` y
`contact_import_rows` ya existen en su Data API. El acceso anónimo está
bloqueado para inserts, pero esta sesión no tiene las credenciales ni una
sesión del usuario owner de prueba; por eso login, persistencia autenticada,
aislamiento RLS y el flujo E2E todavía no pueden declararse verificados.

La importación fue rediseñada para staging bulk, revisión paginada y
finalización set-based. Las migraciones bulk y review workspace ya fueron
aplicadas manualmente en Supabase. La nueva migration
`20261008120000_harden_rpc_grants_and_rls.sql` queda preparada, pero todavía
no se ha aplicado.

Acción pendiente: reparar el historial remoto con la CLI oficial de Supabase,
aplicar la migration de hardening y verificar `pg_proc.proacl`/policies con una
sesión owner. La CLI no está disponible en este entorno y no existe
`supabase/config.toml`; no se manipuló el historial manualmente.

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

Review workspace, gender review, labels y contacts UI implementados sobre el
refactor bulk y verificados contra el schema real; hardening de grants/RLS
preparado localmente, pendiente de reparación del historial y aplicación.

## Siguiente fase

FASE 1 — Database + Contacts + Ingestion (HARDENING PENDING)

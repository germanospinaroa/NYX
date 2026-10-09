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

FASE 3B — CAMPAIGN LIVE MONITOR V1 LOCAL

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
`20261008120000_harden_rpc_grants_and_rls.sql` también fue aplicada y
verificada contra Supabase real.

El núcleo operativo quedó preparado localmente: CRUD de contactos con notas y
archivo, biblioteca de labels, selección de audiencias, snapshot inmutable de
recipients, outbox, worker persistente y adapter Evolution. La migration
`20261008150000_core_operations.sql` todavía no se ha aplicado remotamente por
instrucción; por ello no se declara listo para producción ni se han ejecutado
envíos reales.

El hardening forward-only `20261008160000_harden_core_operations.sql` corrige
el límite de confirmación: un snapshot queda READY, `queue_campaign` es la
única transición explícita a QUEUED, el claim acepta solo campañas QUEUED/RUNNING,
y el worker reconcilia RUNNING/COMPLETED/FAILED y estados de recipients. Esta
migration tampoco se ha ejecutado remotamente.

La migración forward-only 20261008170000_message_sequences.sql añade
secuencias ordenadas, media privada en Storage y gating del outbox: solo el
primer paso o el sucesor de un paso SENT puede ser reclamado. El compositor
individual usa una única operación para persistir todos los pasos; el worker
resuelve media privada mediante signed URL justo antes del envío. Esta
migración queda pendiente de aplicación remota.

El hardening forward-only 20261008180000_harden_message_sequences.sql corrige
la precedencia de terminales FAILED/OUTCOME_UNKNOWN/CANCELLED, endurece el
claim por estado de secuencia, separa el enqueue individual de snapshots de
campaña, limita el bucket privado y añade índices para sus FKs. También queda
pendiente de aplicación remota.

La migration forward-only 20261008190000_fix_messages_destination_check.sql
corrige el constraint E.164 de messages para aceptar destinos con +. La API
registra errores de base sanitizados server-side; no se eliminan
automáticamente objetos de media si el enqueue falla.

La migration forward-only `20261008200000_campaign_sequences_v1.sql` corrige
el constraint E.164 de `campaign_recipients`, añade la plantilla
`campaign_sequence_steps` y crea una secuencia ordenada por recipient mediante
una operación transaccional. El teléfono y género del recipient quedan
congelados; el worker reconcilia el estado del recipient solo después de
actualizar la secuencia completa. El nuevo compositor de campañas usa los
mismos tipos TEXT/IMAGE y upload privado del compositor individual, sin URLs
manuales ni lenguaje de infraestructura.

La CLI de Supabase no está disponible en este entorno y no existe
`supabase/config.toml`; el historial remoto queda pendiente de reconciliación
antes de futuras automatizaciones. Las policies, grants y RPCs fueron
verificados externamente contra Supabase real.

Fase 0 verificó conexión/versionado, connection state de una instancia
dedicada, number check, sendText, sendMedia y el contrato observado de
webhooks. Retries operacionales, caída real, restart/reconnect y provider
idempotency key quedan explícitamente como no verificados y no bloquean el
cierre del spike.

El worker dispone localmente de un modo one-shot y uno persistente, ambos
versionados mediante tsx. Permanecen apagados durante QA; el primer live test
deberá usar OUTBOX_BATCH_SIZE=1 y detenerse antes del segundo paso.

## ECC

Plugin nativo de Codex `ecc@ecc`, versión `2.2.3`, revisión `ef648e01899ba3e8dc6371642deaaf64b4477775`.

## Decisiones pendientes

- Diseño detallado de la inbox idempotente de webhooks para Fase 4.
- Confirmación futura del digest contra el registry antes de infraestructura.
- Soporte de idempotency key del proveedor: no verificado.

## Último milestone

Campaign Live Monitor V1 implementado localmente: polling sin solapamientos,
resumen por recipient, detalle de pasos y estados públicos sanitizados. `SENT`
representa aceptación del dispatch por el proveedor, no entrega ni lectura.
No se tocaron datos reales, no se ejecutó el worker contra producción y no se
hizo deploy en este milestone.

## Siguiente fase

Aplicar y verificar `20261008150000_core_operations.sql` mediante el flujo
oficial de migraciones, después de reconciliar el historial remoto. Luego
seguir con QA controlado de campañas y worker; no enviar mensajes reales sin
autorización explícita.

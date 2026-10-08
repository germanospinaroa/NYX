# Contacts + Ingestion — Fase 1

La primera aplicación operativa de NYX importa CSV/XLSX en memoria, permite
confirmar el mapeo de nombre y teléfono, normaliza teléfonos a E.164 con
región por defecto configurable (`CO`), valida nombres, deduplica dentro del
archivo y contra el owner, y conserva trazabilidad en `contact_import_rows`.

Decisiones de Alpha:

- La primera fila válida de un teléfono repetido queda como candidata; las
  siguientes son `DUPLICATE_IN_FILE`.
- Un teléfono ya existente para el mismo owner es `MATCHED_EXISTING`; no se
  sobreescribe su nombre.
- `contacts.id` es UUID y el teléfono solo participa en la restricción
  operativa `(owner_id, phone_e164)`.
- Los datos se escriben primero en staging bulk; la finalización se ejecuta en
  una RPC transaccional set-based dentro de PostgreSQL.
- El archivo original no se almacena en Supabase Storage.
- El staging usa lotes limitados por filas y bytes serializados; el test de
  5.000 filas exige como máximo 10 requests de staging.
- `finalize_contact_import(import_id)` es `SECURITY INVOKER`, no transfiere
  contactos al navegador y no ejecuta selects/updates por fila.
- Una llamada repetida después de una respuesta perdida devuelve counts sin
  crear contactos duplicados.
- La misma `idempotency_key` reabre un import `FAILED` para reintentar el
  staging; si el timeout ocurre antes de conocer el `import_id`, la respuesta
  es `IMPORT_OUTCOME_UNKNOWN` sin inventar un identificador y el cliente debe
  repetir la misma operación, nunca crear otra clave.
- Los errores remotos recuperables no fuerzan `FAILED` desde la aplicación:
  conservan `PROCESSING` para que una confirmación concurrente no pueda
  invalidar el progreso de otra.
- La aplicación devuelve requests, bytes enviados/recibidos, batches, filas y
  duración para observar el presupuesto de red.

## Review workspace

La confirmación de un archivo solo crea `contact_import_rows` en staging; no
crea contactos definitivos. `/app/imports/[id]/review` pagina las filas a un
máximo de 50 visibles, permite corregir nombre, teléfono, género e inclusión,
y usa RPCs set-based para acciones masivas. La finalización solo acepta filas
incluidas, válidas y con `gender_review_status=REVIEWED` y `gender_final` no
nulo. Los archivos sin columnas de género reciben `gender_final=UNKNOWN` pero
`gender_review_status=PENDING`. Una sugerencia externa solo se promueve cuando
el archivo declara explícitamente `Gender Review=PRECLASSIFIED` y la sugerencia
es `MALE` o `FEMALE`; `REVIEW`, `REVIEWED` u otro marcador permanece pendiente.
Los cambios manuales se conservan localmente y se guardan mediante una única
operación batch por lote.

Las etiquetas son many-to-many mediante `labels` y `contact_labels`, con FKs
compuestas por owner y acciones bulk para agregar/quitar. Las migrations de
review workspace y hardening ya fueron aplicadas en el proyecto NYX.

Las migraciones base y bulk anteriores ya fueron aplicadas en el proyecto NYX.
La migration incremental se aplica una sola vez; las futuras correcciones deben
usar migrations forward-only. Persistencia autenticada y policies RLS fueron
verificadas contra Supabase real.

Revisión de dependencia XLSX (2026-10-07): `npm audit --omit=dev` identifica
`GHSA-w5hq-g745-h8pq` en `uuid@8.3.2`, transitiva de `exceljs@4.4.0`.
ExcelJS usa `uuid.v4()` en el flujo utilizado por NYX; el advisory afecta las
variantes v3/v5/v6 cuando reciben buffers. No hay una actualización compatible
que elimine la cadena; `npm audit fix --force` propone un downgrade mayor a
ExcelJS 3.4.0. Se mantiene la versión actual y se monitoriza el riesgo, sin
evidencia de una ruta explotable en el flujo de importación de NYX.

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
- Un error posterior a la creación del import queda como `FAILED` y conserva
  las filas ya escritas para diagnóstico; la fase no introduce todavía una
  RPC transaccional de importación.
- El archivo original no se almacena en Supabase Storage.

La migración de `supabase/migrations/` ya fue aplicada en el proyecto NYX;
persistencia autenticada y policies RLS siguen pendientes de prueba E2E.

Revisión de dependencia XLSX (2026-10-07): `npm audit --omit=dev` identifica
`GHSA-w5hq-g745-h8pq` en `uuid@8.3.2`, transitiva de `exceljs@4.4.0`.
ExcelJS usa `uuid.v4()` en el flujo utilizado por NYX; el advisory afecta las
variantes v3/v5/v6 cuando reciben buffers. No hay una actualización compatible
que elimine la cadena; `npm audit fix --force` propone un downgrade mayor a
ExcelJS 3.4.0. Se mantiene la versión actual y se monitoriza el riesgo, sin
evidencia de una ruta explotable en el flujo de importación de NYX.

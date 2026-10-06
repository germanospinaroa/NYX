# NYX — Instrucciones del proyecto

## Producto

- NYX es una plataforma de Relationship Intelligence.
- WhatsApp es un canal de acción, no el producto.
- Evolution debe permanecer detrás de un adapter.
- Mantener extensibilidad futura hacia otros canales.
- El principio central es: mejores relaciones y mejores conversaciones, no más mensajes.

## Alcance

- Implementar únicamente la fase solicitada.
- No ampliar el alcance automáticamente.
- No construir features P1/P2 durante P0.
- Preferir una solución simple antes que una abstracción prematura.
- No construir el MVP durante el bootstrap inicial.

## Desarrollo

Para tareas complejas:

`RESEARCH → PLAN → TEST → IMPLEMENT → REVIEW → VERIFY`

Para cambios triviales:

`IMPLEMENT → VERIFY`

Después de milestones relevantes, actualizar `ESTADO.md`.

Usar EXPLORER para investigación en modo lectura, DOCS RESEARCHER para contratos y documentación externa, y REVIEWER para revisar implementaciones desde contexto independiente. REVIEWER no debe implementar el mismo código que está auditando.

## Datos y dominio

- Preservar explícitamente `contact != campaign_recipient != message`.
- Mantener también separadas las entidades `contact`, `list`, `campaign`, `campaign_recipient` y `message`.
- Nunca usar el nombre como identidad única.
- El teléfono tampoco es la identidad interna permanente de la persona.
- Postgres es la fuente de verdad del sistema.

## Evolution

- Usar un adapter; Evolution es un proveedor de canal.
- Usar mocks por defecto.
- Crear contract tests antes de la integración completa.
- No asumir payloads desde documentación sin probarlos.
- No hacer retry automático ante `outcome_unknown`.
- No enviar mensajes reales durante tests automáticos.
- Usar únicamente destinatarios expresamente autorizados para pruebas reales.

## Seguridad

Nunca:

- commitear `.env`;
- registrar API keys;
- registrar QR;
- registrar teléfonos completos innecesariamente;
- enviar secrets al navegador;
- almacenar credentials de Evolution en cliente.

## Git y operaciones

- Hacer commits pequeños y descriptivos.
- No hacer force push.
- No modificar proyectos externos.
- No hacer deploy salvo instrucción explícita.
- No activar continuous learning, memory vault, autonomous loops, agent teams amplios, auto push, auto deploy, auto update, MCPs adicionales sin necesidad, herramientas pagas externas ni acciones automáticas sobre Evolution.
- No usar memoria de herramientas externas como sustituto de `ESTADO.md`.

## ECC en NYX

ECC es una herramienta auxiliar y no reemplaza `AGENTS.md`, `ESTADO.md`, la documentación de NYX ni su arquitectura.

Capacidades iniciales priorizadas: `search-first`, `explorer`, `docs-researcher`, `planning`, `tdd-workflow`, `postgres-patterns`, `database-migrations`, `security-review`, code review y `verification-loop`.

La integración de ECC debe ser la nativa de Codex. No usar `bash scripts/sync-ecc-to-codex.sh` ni combinar plugin nativo con legacy sync.


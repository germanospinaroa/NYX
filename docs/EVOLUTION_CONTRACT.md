# NYX — Evolution API Contract Spike

Estado: **FASE 0 COMPLETE**
Fecha de consulta y verificación local: **2026-10-07**

Este documento separa `DOCUMENTADO`, `OBSERVADO` y `NO VERIFICADO`. La
documentación pública no sustituye la prueba contra la instalación de NYX.

## Resumen

- El host Evolution es accesible desde el contenedor por un endpoint privado
  en el puerto `8080` (`http://<host>:8080` en documentación sanitizada).
- La evidencia autenticada fue obtenida por el operador y entregada de forma
  sanitizada; ningún secreto fue incorporado al repositorio.
- No se modificaron otras instancias, sesiones, PostgreSQL, Redis ni proyectos
  vecinos. Sí se creó y utilizó exclusivamente `nyx-contract-test`.
- `nyx-contract-test` fue creada y utilizada para la evidencia de conexión,
  number check, texto y media.
- No se ejecutaron nuevos envíos durante esta actualización.
- El contrato de webhooks quedó observado con las salvedades documentadas.

## Fuentes consultadas

Consultadas el 2026-10-07:

- [Repositorio oficial](https://github.com/evolution-foundation/evolution-api)
- [Releases oficiales](https://github.com/evolution-foundation/evolution-api/releases)
- [Rutas oficiales de instancia](https://github.com/evolution-foundation/evolution-api/blob/main/src/api/routes/instance.router.ts)
- [Rutas oficiales de mensajes](https://github.com/evolution-foundation/evolution-api/blob/main/src/api/routes/sendMessage.router.ts)
- [DTO oficial de mensajes](https://github.com/evolution-foundation/evolution-api/blob/main/src/api/dto/sendMessage.dto.ts)
- [Creación de instancia documentada](https://github.com/evolution-foundation/evolution-docs/blob/main/docs/03-Instance%20contoller/00-create-instance.md)
- [Eventos y retry de webhooks](https://github.com/evolution-foundation/evolution-api/blob/main/.env.example)
- [Headers/JWT de webhooks](https://github.com/evolution-foundation/docs-evolution/pull/22)

La documentación antigua está archivada y las fuentes de la rama actual son
código, no una especificación versionada. Sus afirmaciones quedan como
hipótesis hasta probarlas.

## Versión

### DOCUMENTADO

- El `package.json` de la rama oficial consultada reporta `2.3.7`.
- Las releases consultadas muestran `v2.3.7` como estable reciente y
  `2.4.0-rc2` como pre-release.

### OBSERVADO

- La respuesta raíz observada fue HTTP 200 con versión `2.3.7`,
  `clientName` `evolution_exchange` y mensaje de servicio operativo.
- El operador reportó imagen configurada `evoapicloud/evolution-api:latest`,
  versión interna `2.3.7`, image ID y digest concretos; no se modificaron ni
  inspeccionaron mediante Docker desde Codex.

### NO VERIFICADO

- Imagen/tag/commit de la instalación del host.
- Compatibilidad completa entre documentación e instalación real.

Recomendación para infraestructura futura: usar
`evoapicloud/evolution-api:2.3.7@sha256:966625532d9076a2381e973a271307d107e6f070450de3abeeea8bd18be07252`,
no `latest`. El digest fue observado sobre la imagen configurada como
`latest`; debe confirmarse contra el registry cuando Fase 4 sea autorizada.
No modificar la instalación existente.

## Instalación y autenticación

### DOCUMENTADO

- Las rutas v2 usan el header `apikey`.
- La creación documentada es `POST /instance/create`, con `instanceName`,
  `token` opcional, `qrcode` y webhook opcional.
- Las rutas oficiales aplican guards comunes de autenticación.

### OBSERVADO

- `GET /` respondió HTTP 200.
- `GET /instance/fetchInstances` sin `apikey` respondió HTTP 401.
- `GET /instance/fetchInstances` con una `apikey` sintética inválida respondió
  HTTP 401.
- Las operaciones autenticadas de esta continuación fueron ejecutadas por el
  operador; los valores de auth no fueron registrados.

### NO VERIFICADO

- Tipo completo de autenticación, proxy inverso y TLS del host.
- Endpoint de health/version y shape de respuesta.

## Lifecycle de instancia

### DOCUMENTADO

El código oficial expone rutas equivalentes a:

- `POST /instance/create`
- `GET /instance/connect/{instanceName}`
- `GET /instance/connectionState/{instanceName}`
- `GET /instance/fetchInstances`
- `DELETE /instance/logout/{instanceName}`
- `DELETE /instance/delete/{instanceName}`

La documentación muestra QR inicial en la creación y eventos
`QRCODE_UPDATED`/`CONNECTION_UPDATE`.

### OBSERVADO

- `nyx-contract-test` existe como instancia dedicada.
- `GET /instance/connectionState/nyx-contract-test` respondió con shape
  `{ instance: { instanceName, state } }` y `state: "open"`.
- El pairing/conexión de esa instancia quedó realizado por el operador.
- No se modificaron ni reutilizaron otras instancias.

### NO VERIFICADO

- Request exacto de creación, QR sanitizado, reconnect, logout, delete, estados
  transitorios y códigos HTTP completos de la instalación real.
- Si sus rutas usan `instanceName` o `instanceId`.

## Envío de texto

### DOCUMENTADO

El código modela `POST /message/sendText/{instanceName}` con `number` y `text`,
además de opcionales como `delay`, `linkPreview`, `quoted`, `mentioned` y
`mentionsEveryOne`. La ruta consultada devuelve HTTP 201 en el código actual.

### OBSERVADO

- `sendText` PASS, HTTP 201.
- La respuesta incluyó `provider_message_id` en `key.id`, `remoteJid`,
  `fromMe: true`, estado inmediato `PENDING`, `messageTimestamp` e
  `instanceId`.
- El destino real y los IDs fueron sanitizados y no se guardan.

### NO VERIFICADO

- Timeout y errores concretos de sendText.
- Formatos adicionales para grupos, PN JID y LID.

Decisión: persistir en NYX el `provider_message_id` derivado de `key.id`, junto
con referencias separadas a la instancia y al destino remoto; no usarlo como
identidad interna de `message`.

## Imagen + caption

### DOCUMENTADO

El DTO modela `POST /message/sendMedia/{instanceName}` con `mediatype`,
`media`, `caption`, `mimetype` y `fileName`. `media` puede ser URL o base64;
para documentos en base64 se exige `fileName`. También existe multipart.

### OBSERVADO

- `sendMedia`/imagen + caption PASS, HTTP 201.
- La evidencia indicó `messageType: imageMessage`, `messageTimestamp`,
  `instanceId` y `source: web`.
- No se conservaron URL, base64, IDs, caption real ni datos privados.

### NO VERIFICADO

- Límites, MIME, tamaño, timeout y provider message id específico de media.

## Number check

### DOCUMENTADO

El código expone `POST /chat/whatsappNumbers/{instanceName}`. Issues oficiales
muestran una respuesta esperada con `exists` y `jid`, pero no se toma como
contrato estable sin prueba de versión.

### OBSERVADO

- Number check PASS contra el único destinatario autorizado.
- La respuesta indicó `exists: true` y un `jid` con formato `@s.whatsapp.net`.
- No apareció un LID en esta operación y no se consultaron otros números.

### NO VERIFICADO

- Soporte LID en otros flujos, límites y comportamiento ante números no
  existentes.

## Webhooks

### DOCUMENTADO

La configuración contempla `QRCODE_UPDATED`, `MESSAGES_UPSERT`,
`MESSAGES_UPDATE`, `SEND_MESSAGE` y `CONNECTION_UPDATE`, entre otros eventos.
También documenta retry configurable. La configuración por instancia contempla
URL, eventos, `byEvents`, `base64` y headers; una PR oficial describe headers
estáticos y JWT automático mediante `jwt_key`.

### SOURCE-VERIFIED

El código oficial de Evolution 2.3.7 verifica que los webhooks aceptan headers
personalizados; `jwt_key` genera un `Authorization: Bearer` JWT HS256 con
`app=evolution` y `action=webhook`; existe `retryWebhookRequest`, política de
retries/backoff y códigos HTTP no reintentables.

Esto es `SOURCE-VERIFIED`, no comportamiento operacional observado. No se
provocaron fallos reales para probar retries.

### OBSERVADO

- Configuración persistida para `nyx-contract-test`: `enabled=true`,
  `byEvents=false`, `base64=false`.
- Eventos configurados: `SEND_MESSAGE`, `SEND_MESSAGE_UPDATE`,
  `MESSAGES_UPSERT`, `MESSAGES_UPDATE`, `CONNECTION_UPDATE`.
- Headers personalizados y `jwt_key` configurables.
- Se capturaron 7 webhooks reales; en los 7 el JWT y el custom header fueron
  válidos.
- Seguridad de webhook: **OBSERVED PASS** para JWT y custom header.
- Event names recibidos: `send.message`, `messages.update` y
  `messages.upsert`; son distintos de los nombres de configuración uppercase.
- Conteo: `send.message=1`, `messages.update=5`, `messages.upsert=1`.
- Secuencia observada: `send.message/PENDING`,
  `messages.update/DELIVERY_ACK`, `messages.update/SERVER_ACK`,
  `messages.update/DELIVERY_ACK`, `messages.update/READ`,
  `messages.upsert/DELIVERY_ACK`, `messages.update/SERVER_ACK`.
- `DELIVERY_ACK` y `SERVER_ACK` aparecieron repetidos.
- `messages.upsert` fue observado después de la respuesta autorizada. La
  dirección no se conservó en el resumen sanitizado; no se clasifica como
  incoming message demostrado.
- Cleanup completado por el operador: webhook temporal desactivado, headers
  temporales eliminados, receiver detenido, temporales borrados y secretos
  efímeros eliminados.
- Estado: **PASS para configuración y seguridad observadas; PARTIAL para el
  contrato total de eventos**.

### NO VERIFICADO

- Retries reales ante errores, backoff efectivo y códigos no reintentables.
- Event id único de proveedor: no se observó ninguno.
- Dirección `fromMe=false` o equivalente para clasificar `messages.upsert` como
  incoming message.
- HMAC, caída real del receiver, restart/reconnect y 10 retries completos.

Decisión: delivery/read no se infieren de HTTP 201; se observan posteriormente
mediante webhook. El procesamiento debe ser idempotente: no asumir un evento
por transición, secuencia estrictamente monotónica ni unicidad de estados.
No se debe inventar un provider event id.

## Identificadores y correlación

El código y ejemplos distinguen `instanceName`, `instanceId`, `remoteJid`,
`participant` y la key del mensaje. No se debe tratar el teléfono como
identidad permanente.

### OBSERVADO

- `instanceName` observado: `nyx-contract-test`.
- `state` observado: `open`.
- `provider_message_id` observado dentro de `key.id`.
- `remoteJid` observado en el resultado de texto.
- `instanceId` observado en texto y media.
- El number check devolvió JID `@s.whatsapp.net`; no apareció LID en esa
  operación.

### DECISIÓN

NYX debe persistir su `message` separado de `provider_message_id`,
`instance_name`, `remote_jid` y cualquier `participant`/LID observado. No
suponer `phone == provider identity`.

## Fallos y `outcome_unknown`

### DOCUMENTADO / EVIDENCIA PÚBLICA

Issues oficiales reportan 401, 404 por diferencias de rutas, 400 por payload
inválido, 500 por estados internos y timeouts/conexiones cerradas en ciertas
versiones o estados de Baileys. Son reportes externos, no pruebas de NYX.

### OBSERVADO

- Los contratos positivos de texto y media devolvieron HTTP 201.
- No se provocó ningún fallo destructivo ni se reinició Evolution.

### DECISIÓN NYX

Si el request sale del proceso pero la respuesta se pierde, vence el timeout o
la conexión se cierra después de transmitir posiblemente el request, el estado
es `outcome_unknown`, no `failed`. No habrá retry automático. Sin idempotency
key real no se puede afirmar exactly-once.

Conclusión de idempotencia: **PROVIDER SUPPORT NOT VERIFIED**.
NYX debe mantener idempotencia propia hasta el dispatch y tratar una respuesta
perdida como `outcome_unknown`.

## Seguridad de webhooks

### DOCUMENTADO

La documentación reciente describe headers personalizados, Bearer/API key,
Basic Auth y JWT automático por instancia.

### OBSERVADO

- JWT webhook security: **OBSERVED PASS**.
- Custom header delivery: **OBSERVED PASS**.
- No se observó HMAC ni otro mecanismo adicional.

### DECISIÓN PROVISIONAL

La validación JWT y custom header quedó observada como PASS durante este spike.
La futura inbox debe validar esos controles en cada request; si el despliegue
real difiere, Fase 4 necesitará proxy/gateway o secreto interno.

## Supuestos prohibidos en Fase 4

- No usar `latest` ni fijar una versión sin evidencia del host.
- No construir el adapter sobre documentación no reproducida.
- No asumir que HTTP 2xx/201 significa delivery.
- No usar el teléfono como identidad del proveedor.
- No asumir que `remoteJid` siempre es `number@s.whatsapp.net`.
- No asumir que `connectionState` tiene el mismo shape en todas las versiones.
- No repetir automáticamente `outcome_unknown`.
- No afirmar exactly-once sin idempotency key real.
- No usar number check para enumeración masiva.

## Harness y requisito para continuar

Harness: [`scripts/evolution-contract/`](../scripts/evolution-contract/).
Fixtures: [`fixtures/evolution/`](../fixtures/evolution/). Existe un fixture
sanitizado de raíz, auth, conexión, number check, texto y media; no contiene
PII, IDs reales, QR ni secretos.

Comandos de solo lectura que debe ejecutar el operador del host:

```bash
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}'
docker inspect --format '{{.Config.Image}}' <evolution-container-name>
docker image inspect --format '{{join .RepoTags " "}} {{.Id}}' <image-or-id>
```

El spike quedó cerrado con las salvedades documentadas. La futura inbox de
webhooks necesitará estrategia propia de idempotencia/deduplicación, sin
diseñar aquí toda su implementación.

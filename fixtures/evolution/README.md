# Evolution fixtures

El fixture `root-and-auth.observed.json` contiene estructuras sanitizadas
observadas durante Fase 0: raíz/auth, connection state, number check, sendText,
sendMedia y el resumen de 7 webhooks. No contiene valores reales de PII,
identificadores, QR, endpoints privados ni secretos.

Las capturas autorizadas solo conservan estructura sanitizada: teléfonos,
nombres, JID/LID, IDs de mensaje/instancia, URLs privadas, QR, tokens y
secretos se reemplazan antes de guardar. Cada fixture indica si su origen es
`documented`, `observed` o `synthetic`.

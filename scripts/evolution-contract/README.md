# Evolution Contract Harness

Harness mínimo y aislado para el spike de contrato de Evolution API. No es el
adapter definitivo de NYX ni un SDK.

## Seguridad por defecto

- Solo se permiten consultas `GET` desde la CLI.
- No crea, conecta, desconecta ni elimina instancias automáticamente.
- No envía mensajes reales.
- Las credenciales solo se leen desde el proceso y nunca se imprimen.
- Las respuestas se redactan antes de mostrarse.
- No se configuran números, QR, URLs privadas ni secretos en el repositorio.

## Uso de lectura

En un proceso seguro y manual, configurar temporalmente las variables del
proceso sin escribirlas en el repositorio:

```bash
export EVOLUTION_BASE_URL='https://<host-real>'
read -r -s EVOLUTION_API_KEY; printf '\n'
export EVOLUTION_API_KEY
node scripts/evolution-contract/probe.mjs GET /instance/connectionState/<instance-name>
```

El harness no debe ejecutarse contra una instancia existente de otro proyecto.
La instancia autorizada para NYX, si se aprueba posteriormente, debe ser
dedicada y reconocible como `nyx-contract-test`.

Las pruebas automáticas son locales:

```bash
node --test scripts/evolution-contract/probe.test.mjs
```

Los envíos reales, si algún día se autorizan, deben ejecutarse manualmente con
controles adicionales fuera de los tests automáticos. El harness exige una
confirmación explícita y un destinatario autorizado en memoria mediante
`assertLiveSendAllowed`; no se pide ni se admite poner el número en código.

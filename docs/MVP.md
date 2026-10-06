# NYX — MVP actual

Este documento define únicamente el MVP operativo actual. No incorpora funcionalidades fuera de este alcance.

## Objetivo

Importar una agenda, limpiar y normalizar contactos, clasificar nombres, revisar casos ambiguos, seleccionar una audiencia, crear un mensaje, programarlo, enviarlo mediante Evolution y monitorear el resultado.

## Alpha

La Alpha debe permitir utilizar NYX internamente lo antes posible, con el flujo operativo básico y trazable. Incluye:

- importación de agenda;
- nombre y teléfono;
- limpieza, normalización E.164 y deduplicación;
- clasificación probable hombre / probable mujer / desconocido;
- corrección manual y revisión de ambiguos;
- selección de destinatarios;
- mensaje neutral y variantes para hombres y mujeres;
- texto o imagen con caption;
- preview;
- ventana de envío;
- queue/outbox;
- worker persistente;
- pause y stop;
- trazabilidad.

La Alpha no incluye IA generativa.

## P0

Fundación operativa del MVP: contratos y límites del canal, persistencia, contactos e ingestión, clasificación y revisión, composición de campañas, y una base verificable para scheduler, outbox, worker y Evolution.

## P1

Capacidades posteriores del MVP que no deben construirse durante P0: evolución del flujo operativo más allá de la Alpha y mejoras que requieran decisiones aún no cerradas.

## P2

Capacidades futuras fuera del alcance actual del MVP inicial. No se implementan ni se especifican aquí.


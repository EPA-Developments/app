# Novedades (campanita) sobre FHIR `Communication`

La campanita del Header (smartphone y web) muestra las **notificaciones del sistema**:
turno confirmado, pago recibido, recordatorios, resultados listos… Todo es FHIR
`Communication`, auditado y dentro del compartimento del paciente.

- Portal: `src/fhir/notificaciones.ts` (taxonomía, cargar, contar, marcar leída, destino
  del toque) y `src/components/CampanitaNovedades.tsx` (badge + panel "Novedades").
- Quién las crea: los **bots** de Recepción / clínicos (`recepcionistas`), siempre bots
  `som-*` del proyecto `7ce5e559-…` (regla de aislamiento, ver `bot-som-interface.md`).

## Un recurso, dos superficies

| | Chat (Mensajes) | Novedades (campanita) |
|---|---|---|
| Qué es | Conversación con el equipo (`src/fhir/mensajes.ts`; Recepción la ve en su `ThreadInbox`) | Aviso del sistema |
| Forma | Communication "topic" con `topic` (el motivo) + hijas con `partOf` | Communication **sin** `partOf`, **sin** `topic` y **sin** hijas |
| `category` | — | `https://segundaopinionmedica.org/fhir/CodeSystem/notificacion` |

`ThreadInbox` solo lista topics con hijas, así que una novedad nunca aparece en el chat; y
el contador filtra por nuestra `category`, así que los mensajes del chat (también
`in-progress`) nunca inflan el badge.

## Contrato de una novedad (lo implementan los bots)

```json
{
  "resourceType": "Communication",
  "status": "in-progress",
  "subject": { "reference": "Patient/<id>" },
  "recipient": [{ "reference": "Patient/<id>" }],
  "sent": "2026-09-25T15:00:00.000Z",
  "category": [
    {
      "coding": [
        {
          "system": "https://segundaopinionmedica.org/fhir/CodeSystem/notificacion",
          "code": "reserva-confirmada",
          "display": "Turno confirmado"
        }
      ]
    }
  ],
  "about": [{ "reference": "Appointment/<id>" }],
  "payload": [
    { "contentString": "¡Tu turno de ecocardiograma quedó confirmado para el miércoles 30/09 a las 10:00!" }
  ]
}
```

| Campo | Regla |
|---|---|
| `category` | system `…/CodeSystem/notificacion`. Códigos: `reserva-confirmada` · `recordatorio` · `pago-recibido` · `resultados-listos` · `documento-nuevo` · `mensaje-nuevo` · `general`. Un código nuevo se muestra igual, como aviso, con su `display` de título. |
| `subject` | **Siempre** el Patient: es lo que usa la AccessPolicy para acotar. |
| `recipient` | El Patient (el portal busca por `recipient`). |
| `sent` | **Obligatorio**: el panel ordena por `-sent` y muestra "hace 5 minutos". |
| `about` | El recurso real; define a dónde lleva el toque (tabla de abajo). |
| `payload` | `contentString` = el texto (voz rioplatense, de la marca). `contentAttachment` opcional = comprobante (`Binary`); el portal lo descarga con `medplum.download`. |
| `status` | `in-progress` al crear = **no leída**. El portal la pasa a `completed` + `received` al tocarla. |
| `partOf` | **Nunca**: con `partOf` es un mensaje de chat. |

A dónde lleva el toque (`destinoNotificacion`):

| `about` | Destino |
|---|---|
| `Appointment`, `Invoice` | `/membership` (Mis turnos · Pagos) |
| `DiagnosticReport/<id>` | `/health-record/lab-results/<id>` |
| `MedicationRequest/<id>` | `/health-record/medications/<id>` |
| `CarePlan` | `/care-plan` |
| `ServiceRequest` | `/mi-segunda-opinion` |
| `Task` | `/get-care` (solicitudes de turno) |
| `DocumentReference` | `/health-record` |
| sin `about` | según el código: turnos/recordatorios/pagos → `/membership`; `resultados-listos` → `/health-record/biomarkers`; `general` no navega |

### Momentos que disparan una novedad (bots)

1. **Turno confirmado**: Recepción confirma la solicitud → `reserva-confirmada` + `about: Appointment`.
2. **Pago registrado**: pago o seña → `pago-recibido` + `about: Invoice` + comprobante adjunto.
3. **Recordatorio**: cron 24 h antes → `recordatorio` + `about: Appointment`.
4. **Resultados listos**: `som-procesar-laboratorio` terminó de leer el PDF →
   `resultados-listos` + `about: DiagnosticReport` (ver `bot-som-interface.md` §3).
5. **Documento nuevo**: el profesional dejó un informe, una orden o una receta →
   `documento-nuevo` + `about` = `DocumentReference` / `ServiceRequest` / `MedicationRequest`.
6. **Mensaje nuevo**: Recepción respondió en Mensajes → `mensaje-nuevo` + `about: Communication/<conversación>`
   (lo crea la bandeja de Recepción, `recepcionistas/src/lib/mensajes.ts`: uno por tanda de respuestas).
7. **Avisos generales**: `general` (cambios de horario, novedades).

### Probar hoy sin bots

En Medplum (proyecto `7ce5e559-…`) → Communication → New, con el id de un paciente de
prueba:

```json
{
  "resourceType": "Communication",
  "status": "in-progress",
  "subject": { "reference": "Patient/<id-del-paciente>" },
  "recipient": [{ "reference": "Patient/<id-del-paciente>" }],
  "sent": "2026-09-25T18:00:00.000Z",
  "category": [{ "coding": [{ "system": "https://segundaopinionmedica.org/fhir/CodeSystem/notificacion", "code": "reserva-confirmada", "display": "Turno confirmado" }] }],
  "payload": [{ "contentString": "¡Tu turno quedó confirmado para el miércoles 30/09 a las 10:00!" }]
}
```

→ El badge rojo aparece al volver a la app (o a los 2 minutos; al instante con tiempo real).
Tocar la tarjeta la marca como leída y lleva a Membresía.

## Mensajes (chat): contrato con la bandeja de Recepción

El portal escribe con el mismo modelo que el `ThreadInbox` / `ThreadChat` de Medplum, así la
bandeja del equipo muestra las conversaciones sin cambios:

- **Conversación** (topic): `status` `in-progress`, `subject` y `sender` = el Patient,
  `recipient` = el Patient + su médico de cabecera (`Patient.generalPractitioner`, si eligió
  uno), sin `partOf`, y `topic` con el **motivo**:
  `{ coding: [{ system: "https://segundaopinionmedica.org/fhir/CodeSystem/motivo-mensaje", code, display }], text }`.
  Códigos: `turnos` · `estudios` · `consulta-salud` · `plan-bienestar` · `pagos` · `otro`.
  El `text` es el que el ThreadInbox muestra como título.
- **Mensaje**: `partOf` → la conversación, `sender`, `recipient` (los de la conversación
  menos quien escribe), `subject`, `sent`, `payload[].contentString`.
- La conversación y su primer mensaje se crean en **una transacción**: nunca queda una
  conversación vacía (el ThreadInbox solo lista las que tienen mensajes).
- **Leído**: al abrir la conversación el portal pasa los mensajes del equipo a `completed` +
  `received`. Si el equipo **finaliza** la conversación (`status` `completed` en el topic), el
  paciente ya no escribe ahí: el portal le ofrece un mensaje nuevo con el mismo motivo.
- **Bandeja de Recepción**: pestaña "Mensajes" de la app de Recepción
  (`recepcionistas/app/src/pages/Mensajes.tsx`). Lista sin filtrar por `recipient` (una
  conversación sin médico de cabecera solo tiene al paciente como destinatario), muestra el
  motivo, cierra/reabre y, al responder, le deja al paciente la Novedad `mensaje-nuevo`.
- Una novedad puede apuntar a una conversación (`about: Communication/<id>`): el toque la abre.

## Refresco y tiempo real

- **Siempre**: la campanita, al abrir la app, al volver a ella (foco / pestaña visible) y
  cada 2 minutos; una conversación abierta, cada 15 segundos y al volver a la app.
- **Tiempo real (opcional)**: con `MEDPLUM_TIEMPO_REAL=true` en el entorno del deploy, la
  campanita además se suscribe por WebSocket
  (`Communication?recipient=Patient/<id>&category=<system>|`): una novedad nueva, o una
  leída en otro dispositivo, actualiza el badge al instante. Si el WebSocket no conecta,
  sigue el refresco periódico. Está apagado por defecto para no dejar reconexiones
  fallidas en cada navegador mientras el server no esté listo.

Checklist del server antes de prender `MEDPLUM_TIEMPO_REAL`:

1. **AccessPolicy** "Paciente SOM — Portal" con
   `{ "resourceType": "Subscription", "criteria": "Subscription?type=websocket" }` (ya en el
   espejo `access-policy-paciente-portal.json`). Acotada a suscripciones WebSocket: el
   paciente no puede tocar las Subscriptions *rest-hook* que disparan los bots. Lo que
   recibe sigue limitado por lo que puede leer.
2. **Reverse proxy** de `api.medplum.com.ar` que pase el upgrade de WebSocket en
   `/ws/subscriptions-r4` (nginx: `proxy_http_version 1.1`, `Upgrade $http_upgrade`,
   `Connection "upgrade"`, `proxy_read_timeout 300s`; Caddy lo hace solo; Apache:
   `mod_proxy_wstunnel`).
3. Prueba: portal abierto → DevTools → Network → WS: `/ws/subscriptions-r4` en
   **101 Switching Protocols**; crear la Communication de prueba → el badge se enciende
   sin refrescar.

## Cuidados conocidos

- **Edición cruzada**: marcar leída exige escritura en `Communication?subject=%patient`,
  que técnicamente deja al paciente editar mensajes de Recepción con su mismo subject.
  Riesgo bajo (queda historial de versiones); a futuro, canalizar la escritura por un bot.
- **Pendiente** (fases siguientes): bandeja de Recepción y bots emisores
  (`recepcionistas`), push con la app cerrada (PWA + web push) y, opcional, puente con
  WhatsApp Business (`Communication` sigue siendo la fuente de verdad).

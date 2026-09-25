# Novedades (campanita) sobre FHIR `Communication`

La campanita del Header (smartphone y web) muestra las **notificaciones del sistema**:
turno confirmado, pago recibido, recordatorios, resultados listos… Todo es FHIR
`Communication`, auditado y dentro del compartimento del paciente.

- Portal: `src/fhir/notificaciones.ts` (taxonomía, cargar, contar, marcar leída, destino
  del toque) y `src/components/CampanitaNovedades.tsx` (badge + panel "Novedades").
- Quién las crea: los **bots** de Recepción / clínicos (`recepcionistas`), siempre bots
  `som-*` del proyecto `7ce5e559-…` (regla de aislamiento: nada de `bw-*` ni de
  `biowellness.ar`).

## Un recurso, dos superficies

| | Chat (Mensajes) | Novedades (campanita) |
|---|---|---|
| Qué es | Conversación con hilos (`ThreadInbox`) | Aviso del sistema |
| Forma | Communication "topic" + hijas con `partOf` | Communication **sin** `partOf` y **sin** hijas |
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
| `category` | system `…/CodeSystem/notificacion`. Códigos: `reserva-confirmada` · `recordatorio` · `pago-recibido` · `resultados-listos` · `documento-nuevo` · `general`. Un código nuevo se muestra igual, como aviso, con su `display` de título. |
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
6. **Avisos generales**: `general` (cambios de horario, novedades).

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

## Refresco y tiempo real

- **Siempre**: al abrir la app, al volver a ella (foco / pestaña visible) y cada 2 minutos.
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

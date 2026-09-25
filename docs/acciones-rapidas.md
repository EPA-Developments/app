# Botón "+" — "¿Qué querés hacer?"

La hoja de acciones del "+" es **una sola** (`src/components/AccionesRapidas.tsx`) y se abre
desde dos lugares:

- **Smartphone**: botón central del menú inferior (`src/components/BottomNav.tsx`).
- **Web**: botón "+" del Header (`src/components/Header.tsx`, solo desktop).

Agregar una opción = sumar una entrada a `ACCIONES_RAPIDAS`; aparece en los dos.

## El camino: las opciones de referencia

Referencia de producto: el "+" del portal de Biowellness (8 opciones). SOM sigue ese
camino **con sus propios recursos y bots** (regla de aislamiento de proyecto, ver
`medplum/bot-som-interface.md`): se toma la experiencia, no los bots ni los CodeSystems.

| # | Opción | Texto de referencia | Estado en SOM | Ruta | Modelo FHIR (SOM) |
|---|---|---|---|---|---|
| 1 | Consulta médica | Elegí médico y horario disponible. | Pendiente | — | `Schedule`/`Slot` (lectura) → solicitud (`Task`) por bot `som-*`; el paciente no escribe `Appointment`. |
| 2 | Consulta por videollamada | Atendete desde donde estés, con el celular o la compu. | Pendiente | — | Igual que 1, con `serviceType`/`Appointment` virtual y el link de la videollamada. |
| 3 | Consulta con Director Médico | Médico · duración · precio · especialidad. | Pendiente | — | `Practitioner` del Director Médico (hoy `MARCA.responsable`) + `HealthcareService`; el precio sale del catálogo, no del código. |
| 4 | Reservar turno | Pedí tu próxima sesión. | ✅ Hecho | `/get-care` | Solicitud: bot `som-solicitar-turno` → `Task`. |
| 5 | Solicitar estudios | Pedí un control de laboratorio; tu médico lo revisa. | Pendiente | — | `ServiceRequest` propuesta, creada por un bot `som-*` (el paciente tiene `ServiceRequest` de solo lectura). |
| 6 | **Enviar estudios en PDF** | Laboratorio o eco doppler; lo procesamos automáticamente. | ✅ **Laboratorio** (eco doppler: pendiente) | `/enviar-estudios` | `Binary` + `DocumentReference` (LOINC 11502-2) + `Consent` → bot `som-procesar-laboratorio`. |
| 7 | Cargar resultado | Sumá un valor de laboratorio a mano. | ✅ Hecho | `/health-record/biomarkers` | `Observation` del paciente. |
| 8 | Enviar mensaje | Escribile al equipo. | ✅ Hecho | `/Communication` (nuevo: `/Communication/nuevo?motivo=<código>`) | Conversación `Communication` con motivo obligatorio (`…/CodeSystem/motivo-mensaje`) + mensajes hijos; ver `medplum/notificaciones.md`. |

Propia de SOM (no está en la referencia): **Mi Plan Bienestar** (`/care-plan/plan-100-dias`).

## 6 · Enviar estudios en PDF (laboratorio)

Pantalla `src/pages/EnviarEstudiosPage.tsx`, capa FHIR `src/fhir/estudios.ts`.

1. **Consentimiento informado** firmado (`DocumentReference` LOINC 59284-0): sin él no se
   sube nada; la pantalla lleva a firmarlo.
2. El paciente elige el PDF (hasta 15 MB; se valida la firma `%PDF-`, no solo la extensión)
   y tilda **"Autorizo a … a procesar este documento…"** (obligatorio).
3. El portal escribe en el compartimento del paciente:
   - `Binary` con el PDF (`securityContext` = el paciente).
   - `DocumentReference`: `type` LOINC `11502-2` (Laboratory report), `category`
     `https://segundaopinionmedica.org/fhir/CodeSystem/documento|resultado-laboratorio`,
     `subject`/`author` el paciente, `content[0].attachment` → el Binary.
   - `Consent` (`patient-privacy`, `policyRule` `…/CodeSystem/consentimiento|procesamiento-datos-salud`,
     `provision.data` → el DocumentReference). Si el server no lo deja crear, el envío sigue
     siendo válido.
4. El bot `som-procesar-laboratorio` (Subscription sobre esa `category`) lee el PDF y crea
   las `Observation` + el `DiagnosticReport`; al terminar suma el `DiagnosticReport` a
   `DocumentReference.context.related`. Contrato: `medplum/bot-som-interface.md` §3.
5. "Estudios enviados" muestra cada PDF como **En proceso** o **Ver resultados** (cuando
   `context.related` ya tiene el `DiagnosticReport`).

> Mientras la AccessPolicy del server no deje crear el `Binary`, los PDF de hasta 700 KB
> viajan embebidos en el `DocumentReference` (`attachment.data`), y los más grandes piden
> mandarlos por Mensajes. El bot tiene que aceptar las dos formas.

**Pendiente de esta opción**: eco doppler / imágenes (LOINC `18748-4`, category
`eco-doppler`), cuando exista su procesamiento.

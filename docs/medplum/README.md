# Configuración de Medplum (servidor)

Recursos de configuración del servidor Medplum (`https://api.medplum.com.ar`,
proyecto canónico `7ce5e559-f315-4538-abf2-61fa4922f996` — "Segunda Opinión Médica") que el portal necesita pero que
**no** viven en el código de la app. Se versionan acá como referencia y para
compartirlos con la app clínica / recepción.

> Estos archivos son la fuente de referencia; **la aplicación real se hace en el
> servidor Medplum** (app admin o API). El portal no los carga en runtime.

## `access-policy-paciente-portal.json`

AccessPolicy del rol **paciente** (la que usa el `invite` de Recepción y la que
debería estar como `defaultPatientAccessPolicy` del proyecto).

> **Fuente de verdad: el seed de recepción.** Esta definición es un **espejo** de
> `recepcionistas/src/fhir/access-policies.ts` (`POLICY_PACIENTE_PORTAL`), que
> `npm run seed` aplica por `name` (haría *upsert* y sobrescribiría lo que haya en
> el server). Mantener **ambos archivos idénticos**: si cambia uno, cambiar el otro.

Cubre todo lo que el portal lee/escribe:

- **Compartimento del paciente** — **escritura** (autogestión): `Patient` (perfil, y la
  extensión `onboarding-completed` del Patient Journey; el origen `patient-origin` lo
  setea el backend al invitar),
  `Observation` (biomarcadores y signos vitales), `QuestionnaireResponse`,
  `DocumentReference` (consentimiento y estudios en PDF), `Communication` (mensajes),
  `Consent` (la autorización para procesar cada estudio que manda) y `Binary` (el PDF que
  sube desde "Enviar estudios en PDF").
  > `Binary`: el portal lo crea con `securityContext` = el paciente, y la escritura queda
  > acotada con `Binary?_compartment=%patient`. **Verificar en el server** que Medplum
  > ponga al `Binary` en el compartimento del paciente por su `securityContext`; si el
  > server rechaza la creación, el portal manda los PDF de hasta 700 KB embebidos en el
  > `DocumentReference` y pide los más grandes por Mensajes (ver
  > `../acciones-rapidas.md`). La lectura general de `Binary` sigue como estaba.
- **Plan Bienestar (drop-in)** — el paciente INICIA su propio plan (`empezarPlan` crea
  CarePlan+Goal+Task+CareTeam+Condition por transacción) y tilda pasos (`completarPaso`
  actualiza Task). La escritura está acotada con criterios finos para no abrir el resto:
  - `CarePlan`: lectura general + **escritura SOLO** de planes que instancien la
    `PlanDefinition` del plan (`instantiates-canonical=…/menopausia-cardiovascular`).
    Al sumar nuevos planes (p.ej. 100 días genérico), agregar su canonical acá.
  - `Goal`: lectura/escritura de sus propias metas (`Goal?patient=%patient`). Sin esta
    entrada el portal recibe **404** al leer las metas (Medplum oculta lo no permitido).
  - `Task`: lectura general + **escritura SOLO** de tareas `intent=plan` (los pasos del
    plan). Las solicitudes de turno (Task del bot) siguen siendo de solo lectura.
  - `CareTeam`: escritura del propio (`CareTeam?patient=%patient`).
  - `Condition`: lectura general + **escritura SOLO** de los hallazgos SNOMED del plan
    (menopausia 289903006, prematura 373717006, perimenopausia 307409000,
    posmenopausia 76498008, quirúrgica 67207009).
  - `PlanDefinition`: **solo lectura** (el módulo la lee para evaluar la elegibilidad;
    sin esta entrada el portal recibe 404 al leerla).
  > Requisito adicional: publicar en el server el `Questionnaire` canónico del plan
  > (`MENOPAUSE_QUESTIONNAIRE_URL`); el paciente no puede crear Questionnaires, y el
  > módulo usa el publicado si existe.
- **Compartimento del paciente** — **solo lectura**: `Appointment`, `Coverage`,
  `Invoice` (pagos/señas), `DiagnosticReport`, `ServiceRequest` (sus solicitudes de
  Segunda Opinión), `RiskAssessment` (score PREVENT), `MedicationRequest`,
  `Immunization`. **Excepción `Coverage`**: el paciente escribe **solo** su obra social
  o prepaga (`type=v3-ActCode|HIP`, desde "Mis datos"); las membresías y paquetes siguen
  de solo lectura. La agenda y los planes/pagos
  los gestiona Recepción; reservar es por *modelo de solicitud*, así que el paciente
  no escribe `Appointment`. La **Segunda Opinión** también es por *modelo de solicitud*:
  el paciente escribe su `QuestionnaireResponse` + `DocumentReference` y ejecuta el bot
  `som-solicitar`, que crea la `ServiceRequest`; el informe (`DiagnosticReport`),
  el score (`RiskAssessment`) y el PDF los genera el bot `bot-som-report` (ver
  `bot-som-interface.md`) y el paciente solo los lee.
- **Definicional / compartido** (`readonly`): `ObservationDefinition` (rangos),
  `Questionnaire`, `Schedule`, `Slot`, `HealthcareService`, `Practitioner`,
  `Organization`, `Binary`.
- **Bot** (`readonly`, acotado): `som-solicitar-turno` (crea su `Task` de solicitud de
  turno de una consulta/estudio cardiovascular) y `som-solicitar` (crea su
  `ServiceRequest` de Segunda Opinión). Son los únicos bots que el paciente puede
  ejecutar; no puede ejecutar ningún otro.

`%patient` lo resuelve Medplum al `Patient` del login. Si en tu server no
resuelve, usar `%profile` (para un login de paciente es el mismo `Patient`).

> ⚠️ **Aplicarla en el proyecto correcto**: el proyecto activo del portal es
> **`7ce5e559-f315-4538-abf2-61fa4922f996`** (el del `.env`). Existe una copia de la
> policy en el proyecto `7f068d7d-…` (id `13e6a16e-…`) que NO gobierna a los pacientes
> del portal — editarla ahí no tiene efecto (fue la causa de que el 404 de `Goal`
> persistiera). Buscar la AccessPolicy "Paciente SOM — Portal" **dentro de `7ce5e559`**
> y pegar ahí el array `resource`.

### Cómo aplicarla

1. En la app de Medplum, abrir la AccessPolicy llamada **"Paciente SOM — Portal"**
   (buscarla por `name`; su `id` es propio de cada proyecto, no hardcodear), pestaña
   **JSON**, pegar el array `resource` del archivo y guardar. El nombre **debe** ser
   exactamente "Paciente SOM — Portal": es el que referencian las `ProjectMembership`
   de los pacientes y el que mantiene `recepcionistas` (`npm run seed`, upsert por nombre).
2. **Project → Default Patient Access Policy** = "Paciente SOM — Portal" (para que los
   nuevos pacientes invitados la hereden).
3. Para pacientes ya creados, confirmar que su `ProjectMembership.access.policy`
   apunta a esta AccessPolicy. Editar este recurso es **retroactivo** para los
   memberships que ya lo referencian.

> `meta.versionId` y `meta.lastUpdated` los gestiona el server; por eso no se
> incluyen en el archivo versionado.

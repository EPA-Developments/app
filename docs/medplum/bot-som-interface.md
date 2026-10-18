# Contrato de los bots de Segunda Opinión Médica (SOM)

Los bots **no viven en este repo** (el portal): viven en el repo de bots
(`recepcionistas`) y se despliegan en `api.medplum.com.ar`, proyecto
`7ce5e559-f315-4538-abf2-61fa4922f996` ("Segunda Opinión Médica"), que es el proyecto canónico
de SOM. Front y back comparten ese proyecto (ver
`som-backend-recepcionistas-kickoff.md`). Este documento es el **contrato** que el portal
espera, para que el backend lo implemente de forma compatible.

El portal (`src/fhir/som.ts`) define las constantes canónicas que **deben coincidir**:

| Constante | Valor |
|---|---|
| `SOM_SERVICE_SYSTEM` | `https://segundaopinionmedica.org/fhir/CodeSystem/som-services` |
| `SOM_SERVICE_CODE` | `som-cardiology` |
| `SOM_CATEGORY_SYSTEM` | `https://segundaopinionmedica.org/fhir/CodeSystem/som-categories` |
| `SOM_INTAKE_URL` | `https://segundaopinionmedica.org/Questionnaire/som-intake` |
| `SOM_ORIGIN_EXT` | `https://segundaopinionmedica.org/fhir/StructureDefinition/som-origin` |
| `SOM_SECTIONS_EXT` | `https://segundaopinionmedica.org/fhir/StructureDefinition/som-sections` |
| `TAREA_FIRMA_INFORME` | `firma-informe-som` (en `https://segundaopinionmedica.org/fhir/CodeSystem/task-tipo`) |

> ⛔ **REGLA INNEGOCIABLE — aislamiento de proyecto.** Los bots de SOM no interactúan
> con bots, recursos, secrets, Subscriptions ni proyectos de otros proyectos: solo bots
> `som-*`, systems bajo `segundaopinionmedica.org` y el proyecto `7ce5e559-…`. Si un flujo
> de SOM pasa por algo de otro proyecto, se sale de ahí y se crea un bot propio `som-*`
> en el proyecto `7ce5e559-…`. El portal lo aplica en `src/fhir/bots.ts`: solo resuelve
> y ejecuta bots `som-*` por nombre exacto, y rechaza cualquier bot cuyo
> `meta.project` no sea el de SOM.

> Importante: la `ANTHROPIC_API_KEY` y cualquier otro secreto van como **Project Secret**
> del bot en Medplum, **nunca** en el `.env` del portal (no se debe agregar
> `@anthropic-ai/sdk` a este repo).

---

## 1. Bot `som-solicitar` (whitelisteado para el paciente)

Único bot, además de `som-solicitar-turno`, que la AccessPolicy del paciente permite
ejecutar. Crea la **orden** a partir de lo que el paciente ya escribió en su
compartimento (su `QuestionnaireResponse` y sus `DocumentReference`).

### Input (lo que envía el portal)

```ts
{
  pacienteRef: string;             // "Patient/<id>"
  questionnaireResponseRef: string;// "QuestionnaireResponse/<id>" (motivo, antecedentes, medicación)
  documentReferences: string[];    // ["DocumentReference/<id>", ...] estudios adjuntos
  motivo: string;
  origin: 'self' | 'referral';
}
```

### Precondición: consentimiento informado (obligatoria)

Antes de crear nada, el bot **debe** verificar que el paciente firmó el consentimiento:
un `DocumentReference` con `subject=<pacienteRef>`, `status=current` y
`type=http://loinc.org|59284-0`. Si no existe, devolver
`{ ok: false, mensaje: 'Antes de pedir tu Segunda Opinión necesitamos que firmes el consentimiento informado.' }`
sin crear la `ServiceRequest` (y por lo tanto sin disparar `bot-som-report` ni enviar
datos clínicos al LLM). El portal ya lo exige del lado cliente, pero el portal no es
una barrera de seguridad: la verificación del bot es la que vale.

Además, el bot debe validar que `pacienteRef` sea el paciente del usuario que ejecuta
(no confiar en el input) y que las referencias de `questionnaireResponseRef` y
`documentReferences` pertenezcan a ese mismo paciente.

### Qué debe crear

Una `ServiceRequest` (status `active`, intent `order`) con:
- `code`: coding `{ system: SOM_SERVICE_SYSTEM, code: SOM_SERVICE_CODE, display: 'Segunda Opinión Cardiológica' }`
- `subject`: el paciente · `authoredOn`: ahora
- `reasonCode[0].text`: `motivo`
- `supportingInfo`: refs de la `QuestionnaireResponse` + los `DocumentReference`
- `extension[]`: `{ url: SOM_ORIGIN_EXT, valueCode: origin }`
- `performer`: el `Practitioner` del Dr. Barbagelata (si está disponible)

> ⚠️ **`runAsUser` debe quedar DESACTIVADO.** Con `runAsUser` el bot corre con la
> AccessPolicy del paciente (que tiene `ServiceRequest` en solo-lectura) y la creación
> da `Forbidden` (verificado en producción). El bot corre con su propia identidad —
> modelo de solicitud: el paciente no escribe, el bot escribe por él.

### Output (lo que el portal espera, `ResultadoSOM`)

```ts
{ ok: boolean; mensaje?: string; serviceRequestId?: string }
```

---

## 2. Bot `bot-som-report` (interno, no ejecutable por el paciente)

Se dispara por una **Subscription** de Medplum sobre la creación de la orden:

```
criteria: ServiceRequest?status=active&code=https://segundaopinionmedica.org/fhir/CodeSystem/som-services|som-cardiology
```

### Lógica (resumen del brief §6)

**El informe le llega a la paciente sólo firmado por un cardiólogo** (R-24 de
recepcionistas, `docs/som.md` §«Firma del informe por el cardiólogo»). `bot-som-report`
redacta un borrador y deja la firma para el equipo: **no** crea el PDF, **no** completa la
orden y **no** avisa a la paciente.

1. Pull de datos del paciente: `Patient`, `Condition`, `MedicationRequest`,
   `Observation` y los `DocumentReference` referenciados en `supportingInfo`.
2. Calcular **Score PREVENT** (AHA 2023) → crear `RiskAssessment`:
   - `status` `preliminary` (por la validación del modelo), `subject` el paciente,
     `basedOn` la `ServiceRequest`.
   - `prediction[]`: ASCVD 10a, IC 10a, ECV total 30a (cada uno con `outcome.text` y
     `probabilityDecimal`). El portal extrae estos 3 por texto del outcome
     (`extractPrevent` en `src/fhir/som.ts`).
   - Nace con el borrador y la API se lo deja leer a la paciente (R4 no tiene `status` para
     filtrar `RiskAssessment`): **el portal no lo muestra mientras la orden está `active`**.
3. Llamar a **Claude `claude-sonnet-4-6`** (Project Secret `ANTHROPIC_API_KEY`) con el
   contexto clínico estructurado para redactar el informe.
4. Crear el **borrador**: `DiagnosticReport` `preliminary` (LOINC `11488-4`, `basedOn` la
   `ServiceRequest`, `subject` el paciente) con las secciones en la extensión
   `SOM_SECTIONS_EXT`, cuyas sub-extensiones (`valueString`) usan **exactamente** estas
   claves (el portal las lee y titula en `MiSegundaOpinion.tsx`):
   `executive-summary`, `risk-assessment`, `history-analysis`, `studies-analysis`,
   `conclusions`, `pending-studies`. La policy de la paciente no le deja leer un
   `preliminary` (ver §2 ter).
5. Crear la **tarea de firma** (`Task`, una por solicitud, sin dueño):
   - `code` = `https://segundaopinionmedica.org/fhir/CodeSystem/task-tipo|firma-informe-som`,
     **`intent` = `order`**, identifier
     `https://segundaopinionmedica.org/fhir/Identifier/firma-informe-som|<id de la ServiceRequest>`;
   - `for` = la paciente, `basedOn` = [la `ServiceRequest`], `focus` = el `DiagnosticReport`;
   - `status` (R4) `requested` → `in-progress` → `completed`; el estado del equipo, en
     `businessStatus` (`https://segundaopinionmedica.org/fhir/CodeSystem/estado-firma-informe`:
     `draft` / `in-review` / `completed`);
   - su texto no dice nada clínico: la paciente la lee para ver «En revisión por el
     cardiólogo». Es del equipo: el portal nunca la escribe.
6. La `ServiceRequest` **sigue `active`**.

## 2 bis. La firma: bot `som-firmar-informe` (interno, lo ejecuta el dashboard)

Un cardiólogo toma la tarea y firma desde el dashboard. Recién ahí, en este orden:

1. el **PDF** con el texto final, su nombre y su matrícula (`Binary`, `securityContext` = la
   paciente);
2. el **informe** → `final`, `resultsInterpreter` = el `Practitioner`, `issued`,
   `presentedForm` = el PDF;
3. el **documento** del PDF: `DocumentReference` LOINC `11488-4`, `docStatus` `final`,
   `author` y `authenticator` = el cardiólogo, `context.related` = la `ServiceRequest`;
4. la **tarea** → `completed`;
5. la **`ServiceRequest`** → `completed`, con `performer` = el cardiólogo (en la misma
   escritura);
6. los **avisos**: WhatsApp «Segunda Opinión Médica: el cardiólogo ya firmó tu informe. Lo ves
   en el portal.» (sin texto de la IA; lo manda el backend) y la Novedad del portal
   `notificacion|informe-som-firmado` con **`about` = la `ServiceRequest`** (no el
   `DiagnosticReport`, que en el portal lleva a Resultados de laboratorio), `status`
   `in-progress` y el texto «El cardiólogo ya firmó tu informe de segunda opinión. Ya lo podés
   ver y descargar.».

Los informes emitidos **antes** de R-24 quedan como estaban: `final` sin
`resultsInterpreter`, orden `completed`, PDF sin `docStatus`. El portal los sigue mostrando
igual (no exige la firma para mostrar uno viejo).

## 2 ter. Cómo lo lee el portal

**El estado de cada solicitud** (`estadoSolicitudSOM` en `src/fhir/som.ts`, el mismo en Mi
Segunda Opinión y en las dos Home):

| `ServiceRequest.status` | Tarea de firma (por `basedOn`) | Lo que ve la paciente |
|---|---|---|
| `active` | no hay | «En análisis» (se está redactando) |
| `active` | hay (no cargada por error) | «En revisión por el cardiólogo»: sin informe, sin PDF y sin PREVENT |
| `completed` | (no importa) | «Ver informe»; si el informe tiene `resultsInterpreter`, «Firmado por …» |
| `revoked`, `entered-in-error` | — | Cancelada |

Una tarea de firma ya `completed` con la orden todavía `active` (una firma que se cortó entre
la tarea y la orden) sigue «En revisión»: el informe se muestra recién con la orden
`completed` (volver a firmar completa lo que falta).

**Las tareas de firma**, en UNA búsqueda para todas las solicitudes (`cargarTareasFirma`):

```
Task?patient=Patient/<id>&code=https://segundaopinionmedica.org/fhir/CodeSystem/task-tipo|firma-informe-som&intent=order
```

Y del lado del cliente se vuelve a exigir el código **y** `intent=order` (`esTareaFirma`): la
paciente puede dar de alta `Task` `intent=plan` con cualquier código (los pasos de su plan), y
una suya con el código de la firma no cambia el estado que ve. Mi Segunda Opinión la busca al
abrir; las Home, sólo si hay una solicitud activa. Si la búsqueda falla, la solicitud se ve «En
análisis», como antes. Ninguna lista de tareas de la paciente la muestra: todas buscan por su
propio `code` (`solicitud-turno`, `consulta-plan`, las de GLP-1) o por su `CarePlan`.

**El informe**, sólo de una orden `completed` (`cargarInformeSOM`):
- `DiagnosticReport?based-on=ServiceRequest/<id>&status=final,amended,corrected,appended`
  (sólo los emitidos; la policy tampoco devuelve el borrador);
- `DocumentReference?related=ServiceRequest/<id>` (toma el de `application/pdf`);
- `RiskAssessment?subject=Patient/<id>` y filtra por `basedOn = ServiceRequest/<id>`
  (R4 no tiene search param `based-on` para `RiskAssessment`).

**Firmado** = `final` + un `Practitioner/<id>` en `resultsInterpreter` (`firmanteDelInforme`).
El portal lee ese `Practitioner` (la policy se lo deja) para «Firmado por <nombre>»; si no
puede, dice «Firmado por el cardiólogo».

**La Novedad** `informe-som-firmado` lleva a `/mi-segunda-opinion?solicitud=<id del about>`,
que abre el informe de esa solicitud (y vuelve a pedir las búsquedas, por si la caché del
cliente es de antes de la firma).

---

## 3. Bot `som-procesar-laboratorio` (interno, lo dispara una Subscription)

Procesa los **PDF de laboratorio** que manda el paciente desde "Enviar estudios en PDF"
(`src/fhir/estudios.ts`). Es un bot propio de SOM (regla de aislamiento): vive en el
proyecto `7ce5e559-…` con su propio Project Secret `ANTHROPIC_API_KEY`. El paciente no lo ejecuta (no va en la AccessPolicy).

### Qué escribe el portal (y dispara al bot)

| Recurso | Contenido |
|---|---|
| `Binary` | El PDF, con `securityContext` = `Patient/<id>`. |
| `DocumentReference` | `status` `current` · `type` LOINC `11502-2` (Laboratory report) · `category` `https://segundaopinionmedica.org/fhir/CodeSystem/documento` \| `resultado-laboratorio` · `subject`/`author` el paciente · `content[0].attachment` = `{ contentType: 'application/pdf', url: <Binary>, title, size, creation }`. |
| `Consent` | `status` `active` · `scope` `patient-privacy` · `category` v3-ActCode `IDSCL` · `policyRule` `https://segundaopinionmedica.org/fhir/CodeSystem/consentimiento` \| `procesamiento-datos-salud` · `provision.data[0]` = `{ meaning: 'instance', reference: DocumentReference/<id> }`. Se crea **después** del DocumentReference y puede faltar (no bloquea el envío). |

> Hasta que la AccessPolicy deje crear el `Binary`, los PDF de hasta 700 KB llegan
> **embebidos** (`attachment.data` en base64, sin `url`). El bot tiene que leer las dos
> formas: `url` → `medplum.download(url)`; `data` → base64.

### Subscription

```
criteria: DocumentReference?category=https://segundaopinionmedica.org/fhir/CodeSystem/documento|resultado-laboratorio
channel:  rest-hook → Bot/<id de som-procesar-laboratorio>
extension subscription-supported-interaction = create
```

Solo en **create**: el bot actualiza ese mismo DocumentReference al terminar y no tiene
que volver a dispararse. La `category` propia evita que el consentimiento firmado (también
un DocumentReference) dispare el bot.

### Lógica

1. **Precondición**: consentimiento informado firmado (`DocumentReference` `subject` =
   el paciente, `status=current`, `type=http://loinc.org|59284-0`). Si falta, no procesar
   ni mandar nada al LLM. El `Consent` por estudio es el registro de la casilla; como se
   crea unos instantes después del documento, no exigirlo sin reintentar.
2. Leer el PDF (ver arriba) y extraer con Claude: analito, valor, unidad, rango de
   referencia del laboratorio y fecha de extracción.
3. Crear una `Observation` por analito: `status` `final`, `category` `laboratory`
   (`http://terminology.hl7.org/CodeSystem/observation-category`), `code` del catálogo
   del portal (LOINC o `https://segundaopinionmedica.org/fhir/CodeSystem/biomarker`, los
   mismos de las `ObservationDefinition`: es lo que buscan los paneles de Biomarcadores),
   `subject`, `effectiveDateTime` = fecha de extracción, `valueQuantity` (UCUM),
   `referenceRange` del informe, `derivedFrom` = `DocumentReference/<id>`.
4. Crear el `DiagnosticReport`: `status` `final`, `category` `LAB`
   (`http://terminology.hl7.org/CodeSystem/v2-0074`), `code` LOINC `11502-2`, `subject`,
   `effectiveDateTime`, `issued`, `result` = las Observation, `presentedForm` = el
   attachment del PDF.
5. **Cerrar el circuito**: sumar `DiagnosticReport/<id>` a
   `DocumentReference.context.related`. El portal muestra el estudio como "Ver resultados"
   (y lleva a `/health-record/lab-results/<id>`); mientras no esté, "En proceso".
   Y avisar al paciente con una novedad `resultados-listos` + `about: DiagnosticReport/<id>`
   (campanita; contrato en `notificaciones.md`).
6. Si el PDF no se puede leer: `Communication` al paciente (le decimos que lo contactamos
   por Mensajes) y avisar al equipo.

> ⚠️ `runAsUser` **desactivado**: el paciente tiene `DiagnosticReport` de solo lectura; el
> bot escribe con su propia identidad.

### CodeSystems propios que usa este flujo

| CodeSystem | Código | Uso |
|---|---|---|
| `https://segundaopinionmedica.org/fhir/CodeSystem/documento` | `resultado-laboratorio` | `DocumentReference.category` del PDF de laboratorio. |
| `https://segundaopinionmedica.org/fhir/CodeSystem/documento` | `adjunto-turno` | `DocumentReference.category` de un estudio adjunto a un turno (`context.related` → `Appointment/<id>`). **No** dispara a este bot: ver `../adjuntos-turno.md`. |
| `https://segundaopinionmedica.org/fhir/CodeSystem/documento` | `informe-ckm` | `DocumentReference.category` del informe CKM firmado (`docStatus` `final`, PDF en `Binary/<id>`). Lo escribe el médico desde el dashboard; la paciente solo lo lee y lo baja en «Informes de tu médico» (`/health-record/informes`, `src/fhir/informesCkm.ts`). **No** dispara a este bot. |
| `https://segundaopinionmedica.org/fhir/CodeSystem/consentimiento` | `procesamiento-datos-salud` | `Consent.policyRule` (Ley 25.326). |

---

## 4. Pendiente de aplicar en el server

- Desplegar los bots `som-solicitar`, `bot-som-report` y `som-firmar-informe` (R-24:
  `npm run deploy:bots` en recepcionistas).
- Aplicar la policy de R-24 (`DiagnosticReport` sólo emitidos: `npm run seed` en
  recepcionistas).
- Crear la **Subscription** del punto 2.
- Cargar el `Questionnaire` canónico `SOM_INTAKE_URL` (opcional; el portal arma la
  `QuestionnaireResponse` igual).
- Aplicar la AccessPolicy actualizada (`access-policy-paciente-portal.json`) y
  **sincronizarla** con `recepcionistas/src/fhir/access-policies.ts`.
- Cargar el Project Secret `ANTHROPIC_API_KEY`.
- Desplegar `som-procesar-laboratorio` y crear su **Subscription** (punto 3).
- AccessPolicy: `Binary` (el paciente sube su PDF) y `Consent` (autorización por estudio).
  Ver `README.md` de esta carpeta.

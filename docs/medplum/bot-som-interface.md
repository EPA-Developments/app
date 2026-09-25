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

1. Pull de datos del paciente: `Patient`, `Condition`, `MedicationRequest`,
   `Observation` y los `DocumentReference` referenciados en `supportingInfo`.
2. Calcular **Score PREVENT** (AHA 2023) → crear `RiskAssessment`:
   - `status` `final`, `subject` el paciente, `basedOn` la `ServiceRequest`.
   - `prediction[]`: ASCVD 10a, IC 10a, ECV total 30a (cada uno con `outcome.text` y
     `probabilityDecimal`). El portal extrae estos 3 por texto del outcome
     (`extractPrevent` en `src/fhir/som.ts`).
3. Llamar a **Claude `claude-sonnet-4-6`** (Project Secret `ANTHROPIC_API_KEY`) con el
   contexto clínico estructurado para generar el informe.
4. Crear `DiagnosticReport` (status `final`, `basedOn` la `ServiceRequest`,
   `subject` el paciente) con las secciones en la extensión `SOM_SECTIONS_EXT`, cuyas
   sub-extensiones (`valueString`) usan **exactamente** estas claves (el portal las lee
   y titula en `MiSegundaOpinion.tsx`):
   `executive-summary`, `risk-assessment`, `history-analysis`, `studies-analysis`,
   `conclusions`, `pending-studies`.
5. Generar el **PDF** (Puppeteer/html-pdf-node) y crear un `DocumentReference`
   (type LOINC `11488-4`, contentType `application/pdf`) con
   `context.related = [ServiceRequest/<id>]` para que el portal lo encuentre
   (`DocumentReference?related=ServiceRequest/<id>`). Opcionalmente, setear también
   `DiagnosticReport.presentedForm` apuntando al PDF.
6. Actualizar la `ServiceRequest` a status `completed`.
7. Notificar al paciente (email/WhatsApp).

### Cómo lo lee el portal

`cargarInformeSOM` (en `src/fhir/som.ts`) busca:
- `DiagnosticReport?based-on=ServiceRequest/<id>`
- `DocumentReference?related=ServiceRequest/<id>` (toma el de `application/pdf`)
- `RiskAssessment?subject=Patient/<id>` y filtra por `basedOn = ServiceRequest/<id>`
  (R4 no tiene search param `based-on` para `RiskAssessment`).

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
| `https://segundaopinionmedica.org/fhir/CodeSystem/consentimiento` | `procesamiento-datos-salud` | `Consent.policyRule` (Ley 25.326). |

---

## 4. Pendiente de aplicar en el server

- Desplegar los bots `som-solicitar` y `bot-som-report`.
- Crear la **Subscription** del punto 2.
- Cargar el `Questionnaire` canónico `SOM_INTAKE_URL` (opcional; el portal arma la
  `QuestionnaireResponse` igual).
- Aplicar la AccessPolicy actualizada (`access-policy-paciente-portal.json`) y
  **sincronizarla** con `recepcionistas/src/fhir/access-policies.ts`.
- Cargar el Project Secret `ANTHROPIC_API_KEY`.
- Desplegar `som-procesar-laboratorio` y crear su **Subscription** (punto 3).
- AccessPolicy: `Binary` (el paciente sube su PDF) y `Consent` (autorización por estudio).
  Ver `README.md` de esta carpeta.

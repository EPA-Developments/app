# Contrato de los bots de Segunda Opinión Médica (SOM)

Los bots **no viven en este repo** (el portal): viven en el repo de bots
(`recepcionistas`) y se despliegan en `api.medplum.com.ar`, proyecto
`78ead38c-0f59-4576-b196-71685537588c` ("HeartInnovations"), que es el proyecto canónico
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

> Importante: la `ANTHROPIC_API_KEY` y cualquier otro secreto van como **Project Secret**
> del bot en Medplum, **nunca** en el `.env` del portal (no se debe agregar
> `@anthropic-ai/sdk` a este repo).

---

## 1. Bot `som-solicitar` (whitelisteado para el paciente)

Único bot, además de `bw-solicitar-turno`, que la AccessPolicy del paciente permite
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

### Qué debe crear

Una `ServiceRequest` (status `active`, intent `order`) con:
- `code`: coding `{ system: SOM_SERVICE_SYSTEM, code: SOM_SERVICE_CODE, display: 'Segunda Opinión Cardiológica' }`
- `subject`: el paciente · `authoredOn`: ahora
- `reasonCode[0].text`: `motivo`
- `supportingInfo`: refs de la `QuestionnaireResponse` + los `DocumentReference`
- `extension[]`: `{ url: SOM_ORIGIN_EXT, valueCode: origin }`
- `performer`: el `Practitioner` del Dr. Barbagelata (si está disponible)

Recomendado endurecer con `runAsUser` para que el `requester` no se pueda falsificar
(igual que la nota de seguridad de `bw-solicitar-turno`).

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

## 3. Pendiente de aplicar en el server

- Desplegar los bots `som-solicitar` y `bot-som-report`.
- Crear la **Subscription** del punto 2.
- Cargar el `Questionnaire` canónico `SOM_INTAKE_URL` (opcional; el portal arma la
  `QuestionnaireResponse` igual).
- Aplicar la AccessPolicy actualizada (`access-policy-paciente-portal.json`) y
  **sincronizarla** con `recepcionistas/src/fhir/access-policies.ts`.
- Cargar el Project Secret `ANTHROPIC_API_KEY`.

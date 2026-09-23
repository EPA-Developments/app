# Handoff / Kickoff — SOM BackEnd en `recepcionistas`

Documento de traspaso para arrancar el backend de **Segunda Opinión Médica (SOM)** en el
repo **`drdalessandro/recepcionistas`** (BackEnd de producción, FHIR R4 en
`https://api.medplum.com.ar`). El portal del paciente (`drdalessandro/app`, PR #2) ya
implementó el flujo SOM del lado cliente y **espera** los bots y permisos que se describen
acá.

> Este repo (`app`) es solo el portal. El trabajo de backend se hace en una sesión
> scopeada a `recepcionistas`. El bloque de abajo es el **prompt de arranque** listo para
> pegar en esa sesión. El contrato técnico detallado está en
> [`docs/medplum/bot-som-interface.md`](./medplum/bot-som-interface.md) y la AccessPolicy
> espejo en [`docs/medplum/access-policy-paciente-portal.json`](./medplum/access-policy-paciente-portal.json).

## Proyecto Medplum (definido)

- **Proyecto canónico de SOM: `7ce5e559-f315-4538-abf2-61fa4922f996` — "Segunda Opinión Médica"
  (221 recursos FHIR cargados y verificados).** Tanto el backend (`recepcionistas`) como el
  portal (`app`) deben apuntar a este proyecto. El portal (`app/.env.defaults`) ya lo usa.
- ⚠️ **Acción pendiente en el server:** aplicar/sincronizar la AccessPolicy del paciente
  **en este proyecto** (`7ce5e559-…`) y confirmar que el `ClientApplication` `516dfb15-…` y
  las `ProjectMembership` de los pacientes pertenecen a él. Si la policy quedó aplicada en
  otro proyecto (`7f068d7d-…` o `78ead38c-…`), el paciente recibe `403` en todo lo readonly
  (`ObservationDefinition`, `Questionnaire`, `Invoice`) — que es exactamente el síntoma visto
  en producción.

## ⚠️ Systems FHIR canónicos renombrados (el seed DEBE coincidir)

El portal (`app`) ya migró todos los `system`/`url` canónicos de `biowellness.ar` /
`bio.medplum.com.ar` a **`segundaopinionmedica.org`**. El seed de `recepcionistas` y los
recursos FHIR del server (proyecto `7ce5e559-…` "Segunda Opinión Médica") **deben re-seedearse con estos mismos
valores**, o el portal deja de matchear los datos:

| Concepto | Nuevo valor canónico |
|---|---|
| CodeSystem biomarcadores | `https://segundaopinionmedica.org/fhir/CodeSystem/biomarker` |
| CodeSystem panel | `https://segundaopinionmedica.org/fhir/CodeSystem/panel-biomarcador` |
| CodeSystem tipo de rango | `https://segundaopinionmedica.org/fhir/CodeSystem/tipo-rango` |
| Base extensiones (Coverage/planes) | `https://segundaopinionmedica.org/fhir` |
| Questionnaires LE8 | `https://segundaopinionmedica.org/fhir/Questionnaire/le8-*` |
| Questionnaire intake clínico | `https://segundaopinionmedica.org/Questionnaire/intake-clinico` (name `som-intake-clinico`) |
| Services / categorías / extensiones SOM | ver `app/src/fhir/som.ts` (ya en `segundaopinionmedica.org`) |

---

## Prompt de arranque (pegar en la sesión de `recepcionistas`)

```markdown
# Claude Code — SOM BackEnd (repo `recepcionistas`) · Rebrand de dominio a Segunda Opinión Médica

## ⚠️ REGLA DE ORO
Este repo (`drdalessandro/recepcionistas`) es el **BackEnd de PRODUCCIÓN** que corre en
`https://api.medplum.com.ar` (FHIR R4). **TODO lo que tiene ya desarrollado es valioso y
funciona.** NO crear módulos/bots/seeds nuevos en paralelo: **MODIFICAR lo existente**.
Antes de cambiar nada: leer, entender el patrón, y reusar.

## PROYECTO MEDPLUM (definido)
SOM corre sobre el proyecto **`7ce5e559-f315-4538-abf2-61fa4922f996` ("Segunda Opinión Médica")**.
`MEDPLUM_PROJECT_ID=7ce5e559-f315-4538-abf2-61fa4922f996`. Seedear/deployar SIEMPRE contra
este proyecto. El portal (`drdalessandro/app`) ya apunta al mismo.

## CONTEXTO DEL CAMBIO
`recepcionistas` nació para un centro de **salud funcional / longevidad** (terapias HBOT,
IHHT, Red Light, Crioterapia, Terapia IV, Terapia Biológica, Recovery, etc.).
**Segunda Opinión Médica (SOM) es OTRO proyecto de salud**, sobre el MISMO backend FHIR:
- Enfoque: **salud CONVENCIONAL CARDIOVASCULAR**. NO hay salud funcional.
- Sí **"Salud 3.0"**: foco en **datos y prevención** (segunda opinión, monitoreo, genómica).
- Fuente de verdad del negocio: **www.segundaopinionmedica.org** (Dr. Alejandro Barbagelata,
  cardiólogo Favaloro/Duke). Basarse en ese sitio en TODO momento.
- Por eso **cambian los JSON/catálogos de servicios**: salen las terapias funcionales,
  entran los servicios cardiovasculares de SOM.

## LO QUE EL FRONTEND YA ESPERA DEL BACKEND (contrato, no negociable)
El portal ya tiene implementado el flujo SOM del paciente (PR #2 en `app`). Espera DOS bots
y unos permisos. El contrato completo está en el repo `app`:
`docs/medplum/bot-som-interface.md`. Resumen:

1. **Bot `som-solicitar`** (lo ejecuta el paciente; whitelistear en la AccessPolicy):
   - Input: `{ pacienteRef, questionnaireResponseRef, documentReferences[], motivo, origin }`.
   - Crea una `ServiceRequest` (status `active`, `code` system
     `https://segundaopinionmedica.org/fhir/CodeSystem/som-services` / `som-cardiology`),
     con `reasonCode.text = motivo`, `supportingInfo` = QR + docs, extensión
     `…/som-origin = origin`. ⚠️ `runAsUser` DESACTIVADO (con la policy del paciente
     la creación daría Forbidden; el bot escribe con su propia identidad).
   - Output: `{ ok, mensaje?, serviceRequestId? }`.
   - PATRÓN A SEGUIR: la misma mecánica del bot de turnos `som-solicitar-turno` (ver §
     "Turnos rebrandeados" abajo).

2. **Bot `bot-som-report`** (interno; lo dispara una `Subscription` sobre
   `ServiceRequest?status=active&code=…som-services|som-cardiology`):
   - Pull Patient/Condition/Observation/MedicationRequest + los DocumentReference.
   - Calcular PREVENT (AHA 2023) → `RiskAssessment` (`prediction[]`: ASCVD 10a, IC 10a,
     ECV total 30a, con `outcome.text` + `probabilityDecimal`).
   - Llamar a **Claude `claude-sonnet-4-6`** (Project Secret `ANTHROPIC_API_KEY`) → generar
     `DiagnosticReport` (status final) con secciones en la extensión
     `…/som-sections` y SUB-extensiones con claves EXACTAS:
     `executive-summary`, `risk-assessment`, `history-analysis`, `studies-analysis`,
     `conclusions`, `pending-studies`.
   - Generar PDF → `DocumentReference` (LOINC `11488-4`, `application/pdf`,
     `context.related=[ServiceRequest/<id>]`).
   - `ServiceRequest` → `completed`. Notificar al paciente (reusar el canal WhatsApp/email
     que ya use recepción, p.ej. el secret `RECEPCION_WHATSAPP_TO`).

3. **AccessPolicy del paciente** (`src/fhir/access-policies.ts`, `POLICY_PACIENTE_PORTAL`):
   sumar (de SOLO LECTURA) `ServiceRequest?subject=%patient` y
   `RiskAssessment?subject=%patient`, y un segundo Bot ejecutable `Bot?name=som-solicitar`.
   Debe quedar IDÉNTICA al espejo del portal:
   `app/docs/medplum/access-policy-paciente-portal.json`.

## CATÁLOGO DE SERVICIOS SOM (validar contra el sitio)
Reemplazar el catálogo de terapias funcionales (HBOT/IHHT/Red Light/Crio/IV/Biológica/…)
por los servicios cardiovasculares de SOM, tomados del menú de segundaopinionmedica.org:
- Second Opinion Consulting (segunda opinión cardiológica)
- Specialists Second Opinion (red de especialistas / líderes globales)
- Referring Partners (derivación de colegas)
- Monitoreo Remoto (datos/prevención — Salud 3.0)
- Longevos / Super Agers (envejecimiento saludable, basado en datos)
- Genómica
- Corazón y Mujer (salud CV de la mujer)
- Evaluación Inicial
- Plan Bienestar (membresía/suscripción)
- Estudios y Prácticas
- Historia Clínica · Contenidos
NO inventar precios ni reglas: tomarlos del sitio / del usuario.

## PATIENT JOURNEY (el portal ya lo implementó; el backend debe setear el origen)

El portal muestra una pantalla de primera vez que ramifica según el origen del paciente:
**Bienvenida** (auto-registrado) u **Onboarding** (invitado). El backend debe **setear al
invitar** la extensión en el `Patient`:

- URL: `https://segundaopinionmedica.org/fhir/StructureDefinition/patient-origin`
- `valueCode`: `reception` (invitación de Recepción) | `referral` (derivación de colega)
- Ausente ⇒ el portal lo trata como auto-registrado.

El portal escribe (no tocar desde el backend):
`…/StructureDefinition/onboarding-completed` (`valueDateTime`) cuando el paciente
completa el journey.

## PLAN BIENESTAR 100 DÍAS (gamificación; el backend crea el CarePlan al inscribir)

El portal muestra una tarjeta de progreso (día X/100, hitos, racha semanal) calculada
client-side. Detecta la inscripción así (en orden):

1. **`CarePlan`** del paciente (contrato preferido) — crearlo al inscribir:
   - `status: active`, `subject`: el paciente,
   - `category` coding: `https://segundaopinionmedica.org/fhir/CodeSystem/care-plans`
     / código **`plan-bienestar-100`**,
   - `period.start` = día 1, `period.end` = start + 100 días.
2. *Fallback*: `Coverage` activo cuyo `plan-codigo` contenga `BIENESTAR`, con
   `period.start` cargado.

Los hitos y la racha se calculan desde los recursos que el paciente ya genera
(DocumentReference de consentimiento, Observations, QuestionnaireResponses LE8,
ServiceRequest SOM) — el backend no tiene que escribir nada más para el MVP.

## BIOMARCADORES: PERFIL LIPÍDICO FALTANTE EN EL PANEL CARDIOMETABÓLICO

El panel "Cardiometabólico" del portal se arma con las `ObservationDefinition` que
publica el servidor (panel `metabolico`); la lista del server REEMPLAZA al catálogo
local. Hoy el server publica glucemia/insulina/HOMA/HbA1c/úrico/fructosamina pero
**faltan los lípidos**, por eso el paciente no ve Colesterol total, HDL, LDL,
Triglicéridos, ApoB, Lp(a) ni LDL-P.

**Fix (Opción A, elegida):** cargar las 7 `ObservationDefinition` de lípidos con
panel `metabolico`. Listas para pegar en
[`docs/medplum/observation-definitions/cardiometabolico-lipidos.json`](./medplum/observation-definitions/cardiometabolico-lipidos.json)
(Bundle transaction con el shape exacto que parsea `app/src/fhir/biomarkers.ts`:
`code` LOINC, `category` `panel-biomarcador|metabolico`, `quantitativeDetails.unit`,
`qualifiedInterval` con `tipo-rango` convencional/funcional y `gender` para HDL).

Cómo aplicar (una sola vez): consola Medplum → proyecto `7ce5e559` → **Batch** →
pegar el JSON → ejecutar. ⚠️ No tiene creates condicionales (R4 no define search
params para ObservationDefinition): si se corre dos veces, duplica — verificar antes.
Incorporar también estas definiciones al seed de `recepcionistas` como fuente de verdad.

> ⚠️ REVISIÓN MÉDICA: el rango funcional de **Colesterol total (< 100 mg/dL)** viene
> del catálogo institucional pero es fisiológicamente improbable (¿errata por el
> objetivo de LDL?). Confirmar con el Dr. Barbagelata antes del seed definitivo;
> los demás rangos son los de la tabla institucional.

## TURNOS REBRANDEADOS (el portal ya cambió; el backend debe alinear)

El portal migró el flujo de "Pedir un turno" de terapias funcionales a servicios
cardiovasculares (`app/src/fhir/solicitudes.ts`). El backend debe alinear:

1. **Renombrar el bot** `bw-solicitar-turno` → **`som-solicitar-turno`** (deploy +
   AccessPolicy). El portal ya ejecuta `som-solicitar-turno` y la AccessPolicy espejo ya
   lo whitelistea. (También conviene de-brandear los bots de reserva
   `bw-reservar-turno`/`bw-reservar-combo` → `som-*`; el portal no los ejecuta, pero el
   prefijo `bw` = marca anterior.)
2. **Input del bot** (lo que envía el portal): `{ pacienteRef, servicio, servicioCodigo,
   preferenciaInicio?, preferenciaTexto?, nota }`. Antes eran `terapia`/`terapiaCodigo`;
   ahora son **`servicio`/`servicioCodigo`**.
3. **Catálogo de `servicioCodigo`** que el bot debe aceptar/validar (debe coincidir con
   `SERVICIOS` en `app/src/fhir/solicitudes.ts`):
   `CONSULTA_CARDIO`, `EVALUACION_INICIAL`, `TELECONSULTA`, `ECG`, `ECOCARDIOGRAMA`,
   `ERGOMETRIA`, `HOLTER`, `MAPA`, `MONITOREO_REMOTO`, `REHABILITACION_CV`,
   `LABORATORIO_CARDIO`. (Validar/ajustar contra el sitio y los precios reales.)
4. El `Task` sigue con `code=solicitud-turno` (el portal lo lee así). Reglas de reserva
   funcionales (p.ej. "HBOT primero") ya no aplican; reemplazar por las de cardiología.

## ORDEN DE TRABAJO (recon primero, NO refactor)
1. `ls -la && cat package.json` y leer el README.
2. Mapear lo existente que se REUSA/MODIFICA:
   - Bots: `bw-solicitar-turno` (→ renombrar a `som-solicitar-turno`), `bw-reservar-turno`,
     `bw-reservar-combo` (ver cómo se definen/despliegan: `npm run deploy:bots`).
   - Seed/FHIR: `src/fhir/access-policies.ts`, `src/fhir/coverage.ts`, `src/lib/planes.ts`,
     catálogo de terapias → reemplazar por el de servicios cardiovasculares, `npm run seed`.
   - App de recepción (vistas, p.ej. "Solicitudes").
3. Proponer el plan de CAMBIOS sobre esos archivos (no nuevos), confirmarlo, y recién
   entonces editar.
4. Verificar (`npm run build`/tests del repo) antes de seedear/deployar.

## RAMA
Trabajar en una rama dedicada (p.ej. `claude/som-backend-rebrand`). NO pushear a `main`
sin permiso. NO crear PR salvo que el usuario lo pida.
```

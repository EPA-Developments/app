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

- **Proyecto canónico de SOM: `78ead38c-0f59-4576-b196-71685537588c` — "HeartInnovations".**
  Tanto el backend (`recepcionistas`) como el portal (`app`) deben apuntar a este proyecto.
- ⚠️ **Acción pendiente en `app`:** hoy `app/.env.defaults` apunta a `7f068d7d-…`
  (ex-BioWellness / "Segunda Opinión Médica"). Para que el flujo SOM funcione end-to-end,
  el portal debe repuntarse a `78ead38c-…` (HeartInnovations) — front y back tienen que
  compartir el mismo proyecto FHIR. Confirmar y actualizar `MEDPLUM_PROJECT_ID`,
  `MEDPLUM_CLIENT_ID` y la AccessPolicy del paciente en ese proyecto.

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
SOM corre sobre el proyecto **`78ead38c-0f59-4576-b196-71685537588c` ("HeartInnovations")**.
`MEDPLUM_PROJECT_ID=78ead38c-0f59-4576-b196-71685537588c`. Seedear/deployar SIEMPRE contra
este proyecto. El portal (`drdalessandro/app`) debe apuntar al mismo (hoy todavía usa
`7f068d7d-…`: hay que alinearlo).

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
     `…/som-origin = origin`. Endurecer con `runAsUser`.
   - Output: `{ ok, mensaje?, serviceRequestId? }`.
   - PATRÓN A SEGUIR: clonar la mecánica del bot existente **`bw-solicitar-turno`**.

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

## ORDEN DE TRABAJO (recon primero, NO refactor)
1. `ls -la && cat package.json` y leer el README.
2. Mapear lo existente que se REUSA/MODIFICA:
   - Bots: `bw-solicitar-turno`, `bw-reservar-turno`, `bw-reservar-combo` (ver cómo se
     definen/despliegan: `npm run deploy:bots`).
   - Seed/FHIR: `src/fhir/access-policies.ts`, `src/fhir/coverage.ts`, `src/lib/planes.ts`,
     catálogo de terapias/servicios, `npm run seed`.
   - App de recepción (vistas, p.ej. "Solicitudes").
3. Proponer el plan de CAMBIOS sobre esos archivos (no nuevos), confirmarlo, y recién
   entonces editar.
4. Verificar (`npm run build`/tests del repo) antes de seedear/deployar.

## RAMA
Trabajar en una rama dedicada (p.ej. `claude/som-backend-rebrand`). NO pushear a `main`
sin permiso. NO crear PR salvo que el usuario lo pida.
```

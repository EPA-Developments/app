# ⚠️ Repositorio congelado — movido a EPA-Developments/app

Este repositorio fue el hogar original del **portal de pacientes de Segunda Opinión
Médica** (app.segundaopinionmedica.org). El desarrollo se **unificó** y continúa en:

> ## 👉 [github.com/EPA-Developments/app](https://github.com/EPA-Developments/app)

**No commitear acá**: cualquier cambio nuevo va al repo canónico. Este repo queda
como archivo histórico (toda su historia fue mergeada al canónico vía la rama
[`unificacion/epa-canonico`](../../tree/unificacion/epa-canonico)).

## Qué es la app

Portal del paciente de **Segunda Opinión Médica** — segunda opinión cardiológica
(Salud 3.0: datos y prevención), del Dr. Alejandro Barbagelata:

- Solicitud de Segunda Opinión (caso + estudios) e informe con score PREVENT.
- Plan Bienestar · 100 días y plan cardiovascular en menopausia (módulo drop-in).
- Historia clínica, biomarcadores cardiometabólicos, signos vitales, cuestionarios
  LE8 (PSQI / MEDAS / EVS / tabaco), consentimiento informado y membresía.

**Stack**: React 19 + TypeScript + Vite + Mantine 8 + Medplum React SDK · FHIR R4 en
`https://api.medplum.com.ar` (proyecto `7ce5e559`) · deploy en Vercel.

## Referencias que siguen siendo útiles acá

- `docs/medplum/` — AccessPolicy del paciente ("Paciente SOM — Portal") y contrato de
  los bots SOM.
- `docs/som-backend-recepcionistas-kickoff.md` — handoff del backend (`recepcionistas`).

*Base original: [Foo Medical](https://github.com/medplum/foomedical) (Medplum, Apache-2.0).*

---
Powered by **EPA Bienestar IA** · CTO: Dr. Alejandro Sergio D'Alessandro

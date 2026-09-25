# Segunda Opinión Médica — Portal del paciente

Repositorio canónico del **portal de pacientes de Segunda Opinión Médica**
([app.segundaopinionmedica.org](https://app.segundaopinionmedica.org)), de EPA Bienestar IA.
Acá se desarrolla todo el portal: el repo original (`drdalessandro/app`) quedó archivado y
su historia se unificó en este (rama `unificacion/epa-canonico`).

El backend (bots, AccessPolicy, seeds) vive en
[`EPA-Developments/recepcionistas`](https://github.com/EPA-Developments/recepcionistas).

## Qué es la app

Portal del paciente de **Segunda Opinión Médica** — segunda opinión cardiológica
(Salud 3.0: datos y prevención), del Dr. Alejandro Barbagelata:

- Solicitud de Segunda Opinión (caso + estudios) e informe con score PREVENT.
- Plan Bienestar · 100 días y plan cardiovascular en menopausia (módulo drop-in).
- Historia clínica, biomarcadores cardiometabólicos, signos vitales, cuestionarios
  LE8 (PSQI / MEDAS / EVS / tabaco), consentimiento informado y membresía.

**Stack**: React 19 + TypeScript + Vite + Mantine 8 + Medplum React SDK · FHIR R4 en
`https://api.medplum.com.ar` (proyecto `7ce5e559`) · deploy en Vercel.

## Marca blanca

Todo lo que identifica a la marca en el portal (logo, pie de página, títulos de ingreso y
registro, título de la pestaña y consentimiento informado) sale de un solo lugar:

- **`src/marca.json`**: los valores por defecto del repo (hoy, Segunda Opinión Médica).
- **Variables `MARCA_*`** en el entorno del deploy (p. ej. Vercel): pisan al JSON sin tocar
  código. Ver la lista comentada en `.env.defaults`.

| Campo | Variable | Dónde se ve |
|---|---|---|
| `nombre` | `MARCA_NOMBRE` | Logo (la última palabra va en peso normal), pie, ingreso/registro, título de la pestaña, consentimiento |
| `nombreConsentimiento` | `MARCA_NOMBRE_CONSENTIMIENTO` | Aceptación y documento firmado del consentimiento (vacío = el nombre en mayúsculas) |
| `responsable` | `MARCA_RESPONSABLE` | Pie de página y del consentimiento |
| `dirigidoPor` | `MARCA_DIRIGIDO_POR` | Frase "…dirigido por el Dr. …" del consentimiento |
| `direccion` | `MARCA_DIRECCION` | Pie de página y del consentimiento |
| `email` | `MARCA_EMAIL` | Pie, revocación y derechos sobre los datos del consentimiento |

El texto del consentimiento es legal: cambiar la marca cambia el prestador que figura en
él, así que cada marca nueva necesita su revisión legal. La landing pública todavía no
usa esta configuración.

## Referencias

- `docs/medplum/` — AccessPolicy del paciente ("Paciente SOM — Portal") y contrato de
  los bots SOM.
- `docs/som-backend-recepcionistas-kickoff.md` — handoff del backend (`recepcionistas`).
- `docs/acciones-rapidas.md` — el botón "+" (smartphone y web): opciones hechas y el camino
  de las que faltan.
- `docs/medplum/notificaciones.md` — la campanita de Novedades: contrato de las
  notificaciones que crean los bots y checklist del tiempo real.

*Base original: [Foo Medical](https://github.com/medplum/foomedical) (Medplum, Apache-2.0).*

---
Powered by **EPA Bienestar IA** · CTO: Dr. Alejandro Sergio D'Alessandro

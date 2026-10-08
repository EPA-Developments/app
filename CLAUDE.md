# CLAUDE.md — portal de la paciente

Reglas del repo, sacadas del `README.md` y de `docs/`. Si algo no coincide, manda el README.

## Idioma

- Todo en español rioplatense, con voseo («cargá», «tenés»): textos al paciente,
  comentarios, docs, tests y mensajes de commit.

## Marca

- **Sin la marca anterior.** Ningún archivo nombra ni apunta a la marca de la que se partió
  (prefijos de sus bots, su dominio, su servidor). Lo verifica `src/sin-marca-anterior.test.ts`;
  no la nombres ni para documentar la regla.
- **La marca sale de la configuración.** Nombre, prestador del consentimiento, responsable,
  dirección, email, el servicio que pide la paciente («Segunda Opinión»), términos y
  privacidad salen de `MARCA` (`src/marca.ts`), con los valores por defecto en
  `src/marca.json` y las variables `MARCA_*` del deploy encima (lista en `.env.defaults`).
  Fuera de esos dos archivos no se escribe a mano el nombre ni el dominio de la marca: lo
  verifica el mismo test. Si un caso de verdad lo necesita, va a su lista blanca
  (`EXCEPCIONES`) con el motivo.
- Las URLs canónicas FHIR (`…/fhir/…`, `…/Questionnaire/…`) son identificadores del contrato
  de datos con Recepción: no cambian con la marca.
- El texto del consentimiento es legal (lo redactan los médicos y legales): no se reescribe;
  cambiar la marca cambia solo el prestador que figura.

## Backend y bots

- El portal solo ejecuta bots `som-*` de Recepción
  ([`EPA-Developments/recepcionistas`](https://github.com/EPA-Developments/recepcionistas)),
  por nombre exacto (`src/fhir/bots.ts`); nada de bots, recursos ni proyectos ajenos. Contrato
  en `docs/medplum/bot-som-interface.md`.
- La AccessPolicy del paciente es espejo del seed de Recepción (`docs/medplum/README.md`):
  si cambia una, cambia la otra.
- Los secretos viven en el servidor Medplum, nunca en el repo: `.env.defaults` solo tiene
  identificadores públicos. Nada de datos de pacientes en código, tests ni docs.

## Vendor

- `src/vendor/` es una copia del monorepo `plan-bienestar-100-dias`: no se edita a mano. Los
  cambios se hacen allá y se resincroniza (`src/vendor/plan-bienestar/README.md`).

## Cómo verificar

Con npm 11 (`corepack enable`) y `npm ci`:

- `npx tsc --noEmit` — typecheck.
- `npm test` — vitest, incluye los tests de marca.
- `npm run build` — `tsc` + `vite build`.
- `npm run lint` — ojo: corre `eslint --fix`, y necesita un `eslint.config.*` que hoy el repo
  no tiene (ESLint 9 se cae sin configuración).

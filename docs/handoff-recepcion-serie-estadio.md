# Handoff para `recepcionistas`: la serie del estadío CKM en Segunda Opinión

> **Qué es:** lo que necesita el portal para mostrarle a la paciente el estadío CKM del
> equipo en el proyecto de SOM. Del lado del servidor son tres cosas: comprobar, decidir y
> proteger.
>
> **De dónde viene:** de tres PRs mergeados el 23.10.2026.
>
> | Repo | PR | Qué trae |
> | --- | --- | --- |
> | plan-bienestar-100-dias | #38 | El cálculo del hGraph, compartido (core 0.18.0) |
> | dashboard-cardiometabolismo | #49 | El dashboard calcula el hGraph con ese módulo |
> | app (portal) | #60 | Las Home muestran el estadío del equipo, y «Tus valores» sin publicar |
>
> **El cambio del portal:** el estadío que ve la paciente sale de `src/fhir/ckmEquipo.ts`, en
> este orden:
> 1. La evaluación más nueva de la **serie** que escribe el bot `ckm-recalculate` del
>    dashboard.
> 2. Si no hay serie, el último estadío que **validó un médico** en «Validar estadío».
> 3. Si no hay ninguno de los dos, la Home no muestra etapa y dice «Tu equipo todavía no
>    definió tu etapa».
>
> Ya no muestra el estadío del plan ni la estimación del portal: daban otro número que la
> ficha.
>
> **El problema:** según el handoff del dashboard (`docs/handoff-serie-estadio-ckm.md` §3.3,
> del 07.10.2026), en Segunda Opinión `ckm-recalculate` **no corre**. Si sigue así, en SOM la
> paciente sólo va a ver el estadío que haya validado un médico.

## Prompt (pegar en la sesión de `recepcionistas`)

```markdown
# Claude Code — recepcionistas · La serie del estadío CKM en el proyecto SOM

## Contexto
El portal (`EPA-Developments/app`, PR #60, mergeado el 23.10.2026) muestra en la Home el
estadío CKM **del equipo**, nunca una estimación propia. Lo lee de las Observations
`estadio-ckm` del Plan Bienestar (system
`https://epa-bienestar.ar/fhir/CodeSystem/plan-bienestar-100-dias`), en este orden:

1. **La serie**: la que escribe el bot `ckm-recalculate` del dashboard
   (`EPA-Developments/dashboard-cardiometabolismo`). Cada evaluación lleva el identifier
   `https://seguimiento.medplum.com.ar/fhir/identifier/ckm-estadio-evaluacion` (valor
   `<paciente>/<día>`) y el tag
   `https://seguimiento.medplum.com.ar/fhir/CodeSystem/ckm-algoritmo|serie-tabla4-v1`. Es el
   número que el médico ve en la ficha.
2. **El validado**: method `estadio-ckm-validado`, el que carga el médico en «Validar estadío».
3. **Ninguno**: la Home no muestra etapa.

Lo que escribió una paciente (`meta.author` Patient) no cuenta nunca: ni en el portal ni en el
dashboard.

Según el dashboard (`docs/handoff-serie-estadio-ckm.md` §3.3, 07.10.2026), en el proyecto de
SOM `ckm-recalculate` no corre, y desplegarlo es "una decisión a tomar juntos". Si sigue sin
correr, la paciente de SOM sólo ve el estadío que validó un médico.

OBJETIVO: saber qué hay hoy en el proyecto SOM, llevar la decisión de desplegar la serie a
quien corresponde y proteger lo que el bot escribe en el Patient.

## 1. Comprobar (sólo lectura, con el `.env` de SOM)
Sólo cantidades: ningún dato de paciente en el chat ni en un commit.

1. **¿Existe el bot?** `Bot?name=ckm-recalculate`. Si existe, ¿tiene una `Subscription`
   activa con endpoint `Bot/<id>` y criteria `Observation?code=…`?
2. **¿Cuántas evaluaciones de la serie hay?**
   `Observation?code=https://epa-bienestar.ar/fhir/CodeSystem/plan-bienestar-100-dias|estadio-ckm&_tag=https://seguimiento.medplum.com.ar/fhir/CodeSystem/ckm-algoritmo|serie-tabla4-v1&_summary=count`
3. **¿Cuántos estadíos validados hay?**
   `Observation?code=https://epa-bienestar.ar/fhir/CodeSystem/plan-bienestar-100-dias|estadio-ckm&method=https://epa-bienestar.ar/fhir/CodeSystem/plan-bienestar-100-dias|estadio-ckm-validado&_summary=count`
4. **Subscriptions sobre `Observation` o `Patient`** que no estén en este repo. Este repo sólo
   suscribe `ServiceRequest` (`bot-som-report`) y `DocumentReference` (el laboratorio), así que
   la serie no dispara ningún bot de acá. Pero conviene ver qué hay en el servidor.

Si 1 da que no hay bot, el resultado esperado es 0 en el punto 2.

## 2. La decisión (no la toma este repo solo)
Desplegar `ckm-recalculate` en SOM cambia de dónde sale el estadío que ven la paciente y el
equipo. Por la regla 4 de `CLAUDE.md`, se consulta con el Dr. Barbagelata y el
Dr. D'Alessandro, y se acuerda con el dashboard.

**Lo que el bot hace:**
- Escucha las Observations con los códigos CKM.
- Recalcula el hGraph, PREVENT y la serie del estadío con el algoritmo firmado del Plan
  Bienestar.
- Escribe la serie como Observations `estadio-ckm`, y las extensiones `CKMStage` y
  `hGraphData` en el Patient.
- No manda avisos: las alertas son de otro bot, que no hace falta desplegar.

**Si se decide desplegarlo**, lo corre el dashboard, no este repo:
- `npm run deploy-bots-server -- --solo ckm-recalculate`, con la marca de SOM.
- Después, la reconstrucción de la historia: `npm run ckm-estadio-doctor -- --todos` (sólo
  lee), y recién después `--todos --aplicar --confirmo-todos`.

**Si se decide no desplegarlo:** la única fuente del estadío en SOM es «Validar estadío». Que
los médicos lo sepan: sin validación, la paciente no ve etapa.

**Un dato para la misma charla.** En SOM hay hoy otro estadío más: el que calcula este repo
(`src/lib/ckm.ts`). Lo usan el día 0 de Recepción cuando no hay uno validado, y la extensión
`ckm-stage` del `RiskAssessment` del informe de segunda opinión. El portal no lo muestra en la
Home. Pero la paciente puede ver en su informe un estadío distinto del de la Home. Conviene
decidir cuál manda.

## 3. Proteger lo que el bot escribe en el Patient (cambio en este repo)
La policy de la paciente (`POLICY_PACIENTE_PORTAL`) le deja escribir todo su Patient
(`Patient?_id=%patient.id`). Eso afecta a las dos extensiones que escribe sólo
`ckm-recalculate`:
- `https://seguimiento.medplum.com.ar/fhir/StructureDefinition/CKMStage`
- `https://seguimiento.medplum.com.ar/fhir/StructureDefinition/hGraphData`

El dashboard las lee: por ejemplo, la lista de pacientes de alto riesgo usa `hGraphData`.

Hay un camino concreto para pisarlas sin querer: «Perfil» del portal guarda el Patient entero
(`updateResource({ ...profile, … })`) con el perfil que cargó al entrar. Si el bot escribió
después, guardar el perfil vuelve las dos extensiones a sus valores viejos.

**Propuesta:** `readonlyFields` sólo para esas dos extensiones, con la misma forma que ya usa
`hiddenFields` en la policy de Recepción:

    { resourceType: 'Patient', criteria: 'Patient?_id=%patient.id',
      readonlyFields: [
        "Patient.extension('https://seguimiento.medplum.com.ar/fhir/StructureDefinition/CKMStage')",
        "Patient.extension('https://seguimiento.medplum.com.ar/fhir/StructureDefinition/hGraphData')",
      ] }

- **No** usar `readonlyFields: ['extension']` entero: el portal escribe otras extensiones del
  Patient (la de la Bienvenida completada).
- Verificá con una paciente sintética que Medplum 5.1 respeta esa forma en `readonlyFields`,
  como lo hace en `hiddenFields`:
  - guardar el perfil no cambia esas dos extensiones;
  - la Bienvenida sigue guardando la suya.
- No hace falta tocar `Observation`. La paciente lee la serie (el portal se la muestra), así
  que **no** hay que excluir el tag `ckm-algoritmo` (§3.1 del handoff del dashboard: queda
  decidido que la ve). Puede crear una Observation `estadio-ckm`, pero ningún lector toma lo
  que escribió una paciente.
- Es un cambio de la policy espejo: `npm run seed` lo aplica, y el portal actualiza
  `docs/medplum/access-policy-paciente-portal.json` en el mismo momento (un PR acá y otro allá).

## Reglas
- Sólo lectura contra el servidor en el punto 1. El seed del punto 3 va después del merge,
  como siempre.
- Ningún dato de pacientes reales en el chat, en un ticket ni en un commit: las pruebas, con
  una paciente sintética.

## Al terminar
Avisá en la sesión del portal y en la del dashboard:
- los cuatro resultados del punto 1;
- qué se decidió en el punto 2, y quién;
- si la forma de `readonlyFields` funcionó, y el PR del punto 3.
```

## Qué hace el portal con cada respuesta

| Si en SOM… | La paciente ve en la Home |
| --- | --- |
| Corre la serie | El estadío de la última evaluación: «Según tu equipo, con tus datos del …» |
| No corre, pero hay un validado | Ese estadío: «La validó tu médico el …» |
| Ninguno de los dos | Sin etapa en el escenario de la E; en las tarjetas CKM, «Tu equipo todavía no definió tu etapa» |

Ninguna respuesta pide cambiar código del portal: sólo cambia lo que se ve. Lo único que toca
el portal es el espejo de la policy, si se aplica el punto 3.

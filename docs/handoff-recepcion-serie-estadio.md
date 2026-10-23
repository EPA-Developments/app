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
> **Lo que se sabe:**
> - El handoff del dashboard (`docs/handoff-serie-estadio-ckm.md` §3.3, del 07.10.2026) decía
>   que en Segunda Opinión `ckm-recalculate` no corría.
> - El 23.10.2026, `npm run verify-prevent` del dashboard, conectado al proyecto de SOM,
>   encontró el bot `ckm-recalculate` y su Subscription `active`.
> - Falta saber si **escribe la serie**: el script cortó con un 403 al crear su paciente de
>   prueba, antes de probar nada (ver «El 403 de `verify-prevent`», al final). Si el bot no
>   escribe la serie, en SOM la paciente sólo ve el estadío que haya validado un médico.

> **Respuesta de recepcionistas (recepcionistas#115, 23.10.2026).** El `readonlyFields` con
> `Patient.extension('url')` del punto 3 **no funciona** en Medplum (5.1.42 y `main`):
> `removeField` parte el path por `.`, no evalúa FHIRPath y lo ignora sin dar error. La
> protección es una `writeConstraint` por extensión:
> `%before.extension.where(url = '…') ~ %after.extension.where(url = '…')`.
>
> Con esa constraint, el portal tiene que guardar el Patient releído y con If-Match. Si no,
> «Mis datos» y la Bienvenida reciben 403 cuando el bot escribió después del login. Eso lo
> hace `src/fhir/guardarPatient.ts`, y el espejo de la policy ya tiene la constraint. El seed
> de recepcionistas va **después** del deploy del portal. Detalle en
> `docs/handoff-app-serie-ckm.md` de recepcionistas.

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

El 07.10.2026 el dashboard decía que en SOM `ckm-recalculate` no corría, y que desplegarlo era
"una decisión a tomar juntos" (`docs/handoff-serie-estadio-ckm.md` §3.3). El 23.10.2026,
`npm run verify-prevent` del dashboard encontró en el proyecto de SOM el bot y su Subscription
`active`. No llegó a probar si escribe la serie: cortó con un 403 al crear su paciente de prueba.
Si el bot no la escribe, la paciente de SOM sólo ve el estadío que validó un médico.

OBJETIVO: saber si la serie se está escribiendo en SOM, llevar a quien corresponde lo que falte
decidir y proteger lo que el bot escribe en el Patient.

## 1. Comprobar (sólo lectura, con el `.env` de SOM)
Sólo cantidades: ningún dato de paciente en el chat ni en un commit.

1. **¿El bot corre?** El bot y su Subscription `active` ya aparecieron (`verify-prevent`,
   23.10.2026). Falta ver que se ejecute y cómo le va: los últimos
   `AuditEvent?entity=Bot/<id del bot>&_sort=-_lastUpdated&_count=10`, con su `outcome`.
   Sin AuditEvents, la Subscription no dispara: revisar que el proyecto tenga la feature
   `bots`.
2. **¿Cuántas evaluaciones de la serie hay?**
   `Observation?code=https://epa-bienestar.ar/fhir/CodeSystem/plan-bienestar-100-dias|estadio-ckm&_tag=https://seguimiento.medplum.com.ar/fhir/CodeSystem/ckm-algoritmo|serie-tabla4-v1&_summary=count`
3. **¿Cuántos estadíos validados hay?**
   `Observation?code=https://epa-bienestar.ar/fhir/CodeSystem/plan-bienestar-100-dias|estadio-ckm&method=https://epa-bienestar.ar/fhir/CodeSystem/plan-bienestar-100-dias|estadio-ckm-validado&_summary=count`
4. **Subscriptions sobre `Observation` o `Patient`** que no estén en este repo. Este repo sólo
   suscribe `ServiceRequest` (`bot-som-report`) y `DocumentReference` (el laboratorio), así que
   la serie no dispara ningún bot de acá. Pero conviene ver qué hay en el servidor.

Cómo leer los resultados:
- **El bot corre y el punto 2 da más de 0:** la serie se escribe.
- **El bot corre pero el punto 2 da 0:** el bundle desplegado es anterior a la serie
  (07.10.2026). Se vuelve a desplegar desde el dashboard: `npm run build:bots` y
  `npm run deploy-bots-server -- --solo ckm-recalculate`, con la marca de SOM.

## 2. Lo que hay que decidir (no lo decide este repo solo)
Con la serie en SOM cambia de dónde sale el estadío que ven la paciente y el equipo. El bot ya
está desplegado, pero el 07.10 era "una decisión a tomar juntos". Por la regla 4 de
`CLAUDE.md`, se confirma con el Dr. Barbagelata y el Dr. D'Alessandro, y se acuerda con el
dashboard.

**Lo que el bot hace:**
- Escucha las Observations con los códigos CKM.
- Recalcula el hGraph, PREVENT y la serie del estadío con el algoritmo firmado del Plan
  Bienestar.
- Escribe la serie como Observations `estadio-ckm`, y las extensiones `CKMStage` y
  `hGraphData` en el Patient.
- No manda avisos: las alertas son de otro bot, que no hace falta desplegar.

**Si se confirma:** el bot escribe la serie a medida que llegan datos nuevos, pero no
reconstruye la historia de las pacientes que ya estaban. Eso lo corre el dashboard, no este
repo, con credenciales de **admin del proyecto**:
- primero `npm run ckm-estadio-doctor -- --todos`, que sólo lee;
- después `--todos --aplicar --confirmo-todos`.

**Si no se confirma:** se saca el bot del proyecto, desde el admin, con su Subscription. La
única fuente del estadío en SOM pasa a ser «Validar estadío». Que los médicos lo sepan: sin
validación, la paciente no ve etapa.

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

**Propuesta** (no funcionó: ver la respuesta de recepcionistas#115, arriba):
`readonlyFields` sólo para esas dos extensiones, con la misma forma que ya usa `hiddenFields`
en la policy de Recepción:

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
- los cuatro resultados del punto 1 (cantidades, sin datos de pacientes);
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

## El 403 de `verify-prevent`

`verify-prevent` (dashboard) prueba el bot de punta a punta:
1. Crea una paciente de referencia, «PREVENT Referencia».
2. Le carga los datos.
3. Espera a que el bot calcule.

En SOM leyó el `Bot` y la `Subscription`, y cortó con `Forbidden` en el primer paso, el
`upsertResource` del Patient (PUT condicional por identifier).

**Qué quiere decir:** la AccessPolicy del ClientApplication con el que se corrió lo deja leer,
pero no crear ni actualizar un `Patient`. No dice nada del bot: el bot corre con su propia
identidad, no con la del script.

**No hace falta darle ese permiso.** En SOM la paciente de prueba quedaría entre las pacientes
reales, a la vista de Recepción. Para saber si el bot escribe la serie alcanza con leer (los
puntos 1 a 3 del prompt), o con `npm run ckm-bots-doctor` del dashboard, que sólo mira bots,
Subscriptions y AuditEvents.

Si igual se quiere la prueba de punta a punta:
- se corre con un ClientApplication admin del proyecto;
- después se borra la paciente con `npm run verify-prevent -- --cleanup`.

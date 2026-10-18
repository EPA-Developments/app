# Handoff para `recepcionistas` — el deploy de la firma del informe (R-24)

> **Qué es:** el paso a paso para poner en marcha R-24 en el servidor. R-24 es la firma del
> informe de segunda opinión por un cardiólogo, y del lado del servidor es todo de
> recepcionistas: su policy, sus bots y sus Subscriptions.
>
> **De dónde viene:** del portal (`EPA-Developments/app`), con los tres repos ya mergeados
> (18.10.2026):
>
> | Repo | PR | Qué trae |
> | --- | --- | --- |
> | recepcionistas | #112 y #113 | #112: el borrador, la tarea de firma, el bot que firma y las policies. #113: los docs y lo que encontró la revisión |
> | app (portal) | #56 y #57 | «En revisión por el cardiólogo», «Firmado por …», la Novedad nueva y el espejo de la policy |
> | dashboard-cardiometabolismo | #48 | La bandeja «Informes para firmar» y las acciones por el bot |
>
> **Qué no es:** no hay que cambiar código en ningún repo. Es operación: correr dos comandos
> en orden y comprobar.
>
> **Estado (18.10.2026):** el preflight sin servidor ya pasó en `som-base` (`db1d774`):
> - `npm run verify`: 1476 tests;
> - `npm run seed -- --dry-run`: 156 recursos;
> - `npm run bots:bundle`: 38 bots;
> - el espejo de la policy es idéntico, y el dashboard llama a `som-firmar-informe` con
>   `{ tarea, accion, secciones? }`.
>
> Falta el deploy, que corre el usuario con el `.env` de SOM.

## Prompt (pegar en la sesión de `recepcionistas`)

```markdown
# Claude Code — recepcionistas · Deploy de R-24 (firma del informe de segunda opinión)

## Contexto
R-24 ya está mergeado en `som-base` (PRs #112 y #113). El informe de segunda opinión le llega
a la paciente sólo firmado por un cardiólogo:
- `bot-som-report` deja un borrador (`DiagnosticReport` `preliminary`) y una `Task` de firma
  sin dueño.
- El cardiólogo la toma y la firma desde el dashboard con `som-firmar-informe`.

El portal (PRs #56 y #57 de `EPA-Developments/app`) y el dashboard (PR #48 de
`EPA-Developments/dashboard-cardiometabolismo`) ya están mergeados. Falta el servidor:
nada llega a Medplum por mergear.

OBJETIVO: aplicar la policy y desplegar los bots de R-24 en el proyecto de SOM, en este
orden, y comprobar el circuito de punta a punta con una paciente sintética.

## Antes de empezar
1. **Que el dashboard esté publicado con la bandeja** (PR #48). Si no:
   - nadie puede firmar desde la app del equipo;
   - cada solicitud nueva queda en borrador, sin llegarle a la paciente.

   El portal (PRs #56 y #57) conviene que también esté publicado. Si no, la paciente ve
   «En análisis» mientras el cardiólogo revisa, y al firmarse el informe se ve igual. No se
   rompe nada.
2. `som-base` al día, y las comprobaciones de siempre, sin servidor:
   `npm run verify`, `npm run seed -- --dry-run` y `npm run bots:bundle`. Ya pasaron en
   `db1d774`; repetirlas sólo si `som-base` cambió.
3. El `.env` con las credenciales del proyecto SOM. `seed` y `deploy:bots` abortan si son de
   otro proyecto (`MEDPLUM_PROJECT_ID`). No pegues las credenciales en el chat.
4. **El `Bot` `som-firmar-informe` existe, o las credenciales son de admin del proyecto.**
   `deploy:bots` sólo crea un bot nuevo con una ClientApplication admin. Si no lo es:
   - crealo UNA vez en Medplum (Project Admin → Bots → New Bot), con ese nombre exacto y el
     runtime del script (`BOT_RUNTIME_VERSION`, por defecto `awslambda`);
   - o confirmá que la ClientApplication del `.env` es admin del proyecto.

   Hacelo antes del deploy, no después. Si no, `deploy:bots` despliega `bot-som-report`
   (el que deja los borradores) sin el bot que los firma.

## El deploy, en este orden
1. **`npm run seed`** (las policies). Es lo primero porque:
   - la policy de la paciente pasa a leer sólo los `DiagnosticReport` emitidos
     (`final,amended,corrected,appended`): no ve el borrador ni su historial;
   - `BOTS_MEDICO` suma `som-firmar-informe` (Nutrición no lo tiene);
   - la tarea de firma deja de ser escribible para el equipo (`CRITERIO_TAREAS_DEL_EQUIPO`).

   Sembrar antes es seguro: las policies nombran los bots por nombre (`Bot?name=`), y con los
   bots viejos los informes siguen naciendo `final`.
2. **`npm run deploy:bots`** (`bot-som-report` y `som-firmar-informe`, con sus Subscriptions).
   - Con el `Bot` ya creado (paso 4 de arriba), el script lo encuentra y lo despliega.
   - Si igual dice que **falta crear `som-firmar-informe`**, crealo como en el paso 4 y volvé a
     correr `npm run deploy:bots`.
   - Al revés (bots antes que policy), la paciente podría leer por la API el borrador de la
     IA. El portal ya no lo lista, pero la API sí lo daría.

## Los usuarios de los cardiólogos
El bot reconoce al cardiólogo por su `Practitioner`, que tiene que tener Cardiología
(SNOMED 394579002) en un `PractitionerRole` activo o en su `qualification`. Ese
`Practitioner` sale del `profile` de su `ProjectMembership`.

Revisá que cada cardiólogo del plantel esté atado a **su** `Practitioner` del seed
(`docs/usuarios.md`, paso 3). Uno invitado que quedó con otro `Practitioner` ve la bandeja,
pero el bot le contesta «Sólo un cardiólogo del plantel puede tomar o firmar el informe de
segunda opinión.».

## Cómo comprobarlo
Con una paciente sintética (sin datos reales), con consentimiento y una solicitud de segunda
opinión nueva. Seguí la lista de `docs/usuarios.md` §«La firma del informe de segunda
opinión (R-24)», y sumá lo que se ve en el portal y en el dashboard:

1. **Borrador.** `bot-som-report` deja el `DiagnosticReport` `preliminary` y la `Task` de
   firma (`requested`, `intent=order`, sin dueño).
   - En el portal, «Mi Segunda Opinión» dice «En revisión por el cardiólogo», sin informe,
     PDF ni PREVENT. Las dos Home dicen lo mismo.
   - Con el token de la paciente, el borrador no sale por la API.
2. **Bandeja.** En el dashboard de la marca SOM, «Mi tablero» muestra «Informes para firmar»
   con esa paciente. Con un perfil de Nutrición, la tarjeta no aparece.
3. **Tomar.** Un cardiólogo abre el borrador y toca «Tomar»: queda «En revisión por el
   cardiólogo» a su nombre. Otro cardiólogo que toca «Tomar» o «Firmar» ve «La está
   revisando otro cardiólogo.». Un médico que no es cardiólogo ve el mensaje de «Sólo un
   cardiólogo…».
4. **Firmar.** Corregí una sección y tocá «Firmar». El bot deja:
   - el informe `final`, con `resultsInterpreter`;
   - el PDF (`DocumentReference` `docStatus` `final`);
   - la tarea y la solicitud `completed`, con el cardiólogo en `performer`;
   - la Novedad `informe-som-firmado` y el WhatsApp (`som-informe-listo`, que hoy sale con
     la plantilla genérica `som_aviso`, ver `docs/whatsapp.md`).

   En el portal, la Novedad abre esa segunda opinión con el informe, «Firmado por …» y el PDF.
   En el PDF, la sección corregida sale como la dejó el cardiólogo.
5. **Historial.** Con el token de la paciente, el historial del informe firmado da 403.

## Si algo sale mal
- **La policy nueva puede quedar** aunque haya que volver atrás: con los bots de antes, los
  informes nacen `final` y la paciente los sigue viendo.
- **Para volver los bots,** se despliegan desde `1afbd55` (el merge de #111, anterior a #112:
  #112 es el que cambió `bot-som-report` y sumó `som-firmar-informe`). Un borrador que haya
  quedado a medio camino se firma después desde la bandeja, con los bots de R-24 de vuelta.
- **Volver atrás no borra `som-firmar-informe` del servidor.** Sin él en `BOTS_MEDICO` de las
  policies viejas, nadie lo ejecuta. Si hace falta, se borra desde el admin.

## Reglas
- No consultar ni pegar datos de pacientes reales: la prueba va con una paciente sintética.
- Ningún secreto ni link con `?jwt=` en el chat, en un ticket ni en un commit.

## Al terminar
Avisá en la sesión del portal y en la del dashboard:
- qué se desplegó, y si hubo que crear el `Bot` a mano;
- qué paso de la comprobación falló, si alguno falló.
```

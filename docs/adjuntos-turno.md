# Estudios adjuntos a un turno

La persona puede **adjuntar estudios a un turno** (PDF o fotos) para que el profesional que
la atiende los vea **antes de la consulta**. Se puede en teleconsultas y en turnos
presenciales, pero el dashboard no los muestra igual en los dos:

- En una **teleconsulta**, al lado de la sala. La pantalla dice que el profesional los ve
  antes de la consulta y que, si se adjunta algo a último momento, puede que todavía no le
  aparezca: que se lo cuente cuando empiece la llamada (la ficha previa no se relee sola).
- En un **turno en el centro**, solo arriba de la ficha que el profesional abre desde la
  «Agenda de hoy» de su tablero: el mismo día, y no siempre (ver «Dónde la ve el
  profesional»). La pantalla dice que los puede ver el día de la consulta y pide llevarlos
  igual.

- **Dónde**: en la sala de la teleconsulta (`/teleconsulta/:appointmentId`, debajo de
  «Entrar»/la espera; con la videollamada abierta queda plegado) y en **Mis turnos**, en cada
  turno próximo, plegado detrás de «Adjuntar estudios (N)».
- **Código**: capa FHIR `src/fhir/adjuntosTurno.ts`; pantalla
  `src/components/turnos/AdjuntosDelTurno.tsx` («Estudios para esta consulta»).

## El contrato con el dashboard de los profesionales

El dashboard (`EPA-Developments/dashboard-cardiometabolismo`, su ficha previa, sección
«Adjuntó a este turno») busca:

```
DocumentReference?related=Appointment/<id>&subject=Patient/<id>&status=current
```

El search param `related` es `DocumentReference.context.related`. Trae **solo lo vigente de
la persona del turno** (y lo vuelve a filtrar en el cliente, por si el server ignorara un
parámetro); **no filtra por categoría**. De cada documento muestra
`content[0].attachment.title` (o `description`), con link si hay `attachment.url` (sin URL, el
nombre sin link), y la fecha `date`.

Su otra sección, «Su historia de documentos», trae los vigentes de la persona
(`DocumentReference?subject=Patient/<id>&status=current`), **una fila por archivo** (la copia
de «Elegir de los que ya mandaste» no se repite junto a su original), con la etiqueta
«Adjunto a otro turno» para lo adjuntado a otro turno, y muestra **las 12 más nuevas** (si hay
más, avisa que no entran).

La ficha previa **se lee al abrir la pantalla y no se actualiza sola**. Si el profesional ya
la tenía abierta, lo que la persona adjunta no le aparece, y lo que quita le sigue apareciendo,
hasta que la vuelve a abrir (y el cliente de Medplum guarda las búsquedas un minuto).

### Dónde la ve el profesional

- **Teleconsulta**: en la pantalla de la sala (`/teleconsulta/<id>`), en «Lo que trajo el
  paciente», desde que abre la pantalla (la videollamada se abre 15 minutos antes). A esa
  pantalla también se llega solo desde la tarjeta «Agenda de hoy» (abajo), pero el
  profesional tiene que pasar por ahí para atender: si atiende, la ficha previa está al lado.
- **Turno en el centro**: arriba de la ficha de la persona («Este turno»), **solo si la abre
  desde la tarjeta «Agenda de hoy»** de su tablero. La tarjeta pasa el turno en la URL
  (`?turno=<id>`), y la ficha lo muestra solo si el turno es de esa persona. Pero la agenda
  trae **solo los turnos de hoy** (de todo el centro, ordenados por hora, contando los ya
  atendidos: saca solo los cancelados y los cargados por error) y la tarjeta muestra **los 6
  primeros**: el resto queda en un «+N más» que lleva a una lista genérica, sin el turno.
  Si abre la ficha desde «Pacientes» o desde cualquier otro lado, no ve ni «Este turno» ni
  ningún documento.

Por eso, en un turno en el centro, la pantalla promete menos: «Quedan guardados con este turno
y el profesional los puede ver el día de la consulta. Llevalos igual, por las dudas.»

El vínculo con el turno **vive en el documento** y no en `Appointment.supportingInformation`:
la persona no puede escribir el turno (lo lee; lo gestionan Recepción y sus bots).

## El recurso

Un `DocumentReference` por estudio adjunto, en el compartimento de la persona:

| Campo                   | Valor                                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| `status`                | `current`                                                                                                      |
| `category`              | `https://segundaopinionmedica.org/fhir/CodeSystem/documento` \| `adjunto-turno` («Estudio adjunto a un turno») |
| `type.text`             | `Estudio adjunto a un turno`                                                                                   |
| `subject`, `author`     | la persona (`Patient/<id>`)                                                                                    |
| `date`                  | cuándo lo adjuntó                                                                                              |
| `description`           | `Adjuntado para el turno del <día y hora en Argentina>: <título>`                                              |
| `content[0].attachment` | `{ contentType, url: <Binary> \| data, title, size }`                                                          |
| `context.related`       | `[{ reference: 'Appointment/<id>' }]`                                                                          |
| `context.period.start`  | el inicio del turno, si lo tiene                                                                               |

- **Qué se puede subir**: PDF, JPEG y PNG, de hasta 15 MB. El tipo se valida por la **firma**
  del archivo (`%PDF-`, `FF D8 FF`, la firma PNG) y no por el `type` que informa el navegador.
- **El archivo**: siempre un `Binary` con `securityContext` = la persona (`attachment.url`),
  igual que «Enviar estudios en PDF», pero **sin su plan B**: si el server no deja crear el
  `Binary`, no se embebe (`attachment.data`), porque el dashboard solo linkea la URL y el
  profesional vería el nombre sin poder abrirlo. La pantalla lo dice y pide mandarlo por
  Mensajes (`MENSAJE_SIN_BINARIO`).
- **Elegir de los que ya mandó**: para un PDF de laboratorio que ya envió, se crea un
  `DocumentReference` **nuevo** de categoría `adjunto-turno` que apunta al **mismo**
  attachment (la misma `url`). El original no se toca: es un registro clínico que también
  actualiza el bot de laboratorio. Si ese archivo ya está adjunto y vigente en el turno
  (mismo `Binary`), no se crea otro. La lista ofrece solo los que todavía no están en el
  turno, y no los anulados (`entered-in-error`) ni los que se mandaron **embebidos** (cuando
  el server no dejaba crear el `Binary`): esos no se pueden abrir desde el dashboard, y la
  pantalla dice que hay que subirlos de nuevo. La URL que se copia es la firmada que devuelve
  el server al leer; Medplum la vuelve a guardar como `Binary/<id>` al escribir y la firma de
  nuevo en cada lectura, por eso el «mismo archivo» se compara por el id del `Binary` y no
  por la URL.
- **Un toque, una escritura**: mientras se adjunta o se quita algo, la pantalla no arranca
  otra escritura (un segundo toque rápido crearía una copia antes de que el botón se vea
  deshabilitado). Mientras se sube un archivo, «Quitar» queda deshabilitado; si el diálogo de
  quitar ya estaba abierto, dice que hay que esperar.

## No lo procesa el bot de laboratorio

La Subscription de `som-procesar-laboratorio` es **solo** sobre la categoría
`resultado-laboratorio`, en create (`medplum/bot-som-interface.md` §3). Un adjunto al turno
tiene otra categoría: **no lo lee la IA ni se suma a los biomarcadores**. La pantalla lo dice
y manda a «Enviar estudios en PDF» para eso. Si algún día se amplía esa Subscription a todo el
CodeSystem `documento`, hay que excluir `adjunto-turno`.

## Cómo se quita

Un solo `update` del documento:

1. Se **saca** `Appointment/<id>` de `context.related` (si quedan otras referencias, quedan;
   `context.period` queda como dato). El dashboard ya no lo mostraría aunque quedara, porque
   busca solo lo vigente, pero la referencia se saca igual: para que nadie que lea el turno
   sin filtrar por status lo tome como adjunto.
2. `status` pasa a `entered-in-error`.

Solo se quitan documentos de categoría `adjunto-turno` que apunten a ese turno: un
laboratorio, el consentimiento o lo que haya asociado otro al turno se muestran, pero no se
tocan. El `Binary` no se borra (si vino de «Elegir de los que ya mandaste», el original sigue
igual).

Como la ficha previa lee solo lo vigente (`status=current`), lo quitado deja de aparecer en
sus dos secciones **la próxima vez que el profesional la abre**: no se relee sola, y si la
había abierto en el último minuto, el cliente de Medplum puede devolverle la lectura anterior.
El diálogo dice lo que importa para la persona: «Si el profesional ya tiene abierta tu ficha,
lo va a seguir viendo hasta que la vuelva a abrir». Dice también que el archivo no se borra y
que, si lo subió por error, avise por Mensajes. Las pantallas genéricas del dashboard
(`/DocumentReference`, sin link desde la ficha) no filtran por status.

Una salvedad, que el diálogo también dice: si lo que se quita es la copia de un PDF que ya
mandó («Elegir de los que ya mandaste»), el envío original sigue vigente y sigue entrando en
«Su historia de documentos» (que muestra las 12 más nuevas: uno viejo puede no verse ahí). El
portal no sabe si un PDF adjunto es una copia sin volver a leer los estudios enviados, así que
el diálogo lo dice como condición («Si lo sumaste con…»), y solo para un PDF: una foto nunca es
una copia, porque esa lista ofrece solo PDFs.

## Cuándo se puede

- Hace falta el **consentimiento informado** firmado (`buscarConsentimiento`), como para
  enviar estudios: si falta, no se escribe nada y la pantalla lleva a firmarlo. Para quitar
  un adjunto no hace falta.
- El turno no tiene que estar `cancelled`, `noshow`, `entered-in-error` ni `fulfilled`, ni
  ser una reserva del portal **vencida** (`pending` con `reservaExpira` pasada: Recepción
  libera el horario), y no tiene que haber terminado (`end`, o una hora después de `start` si
  no dice cuándo termina). Después, la sección muestra lo adjuntado, sin sumar ni quitar, y
  dice por qué (`porQueNoSeAdjunta`: se canceló, venció la reserva o ya pasó).

## La pantalla

- En la sala de la teleconsulta es siempre el mismo componente (`AdjuntosDelTurnoPlegables`,
  con `plegable` en falso mientras espera). Al abrirse la videollamada se pliega **sin
  desmontarse**: una subida en curso sigue, el contador se actualiza y, si algo termina o
  falla con la sección plegada, el aviso aparece junto al botón. Lo mismo en «Mis turnos» si
  la persona pliega el panel en medio de una subida.
- Teclado: después de subir, el foco vuelve a «Subir un PDF o una foto»; después de adjuntar
  uno ya enviado, a «Elegir de los que ya mandaste»; al cancelar el diálogo de quitar, al
  «Quitar» que lo abrió; y después de quitar, al título de la sección. Nunca queda en `<body>`.
- En «Mis turnos», el botón «Adjuntar estudios (N)» tiene como descripción el turno (servicio,
  día y hora) y el título de la sección lo suma oculto: con varios turnos, un lector de
  pantalla dice de cuál es cada uno.

## Permisos

Nada nuevo: la AccessPolicy de la persona (`medplum/README.md`) ya le deja escribir
`DocumentReference` y `Binary` en su compartimento y leer sus `Appointment`. No cambia la
policy ni Recepción.

Un límite: la escritura es `DocumentReference?subject=%patient`, que **no restringe
`context.related`**. Que el turno sea de la persona lo controla el portal (solo ofrece sus
turnos, y uno ajeno ni se puede leer), pero no la policy: por API, una persona que conociera
el id del turno de otra podría crear un documento propio que apunte a ese turno. Por eso el
dashboard filtra también por `subject`: ese documento no aparece en la ficha de la otra
persona.

## Lo que hizo el dashboard

Lo que el portal le pidió (handoff `docs/handoff-portal-ficha-previa.md` de
`EPA-Developments/dashboard-cardiometabolismo`, 13.10.2026) quedó hecho en
[EPA-Developments/dashboard-cardiometabolismo#44](https://github.com/EPA-Developments/dashboard-cardiometabolismo/pull/44),
mergeado el 13.10.2026. Allá van numerados por prioridad:

1. **Solo la persona del turno**: «Adjuntó a este turno» filtra por `subject` (ver «Permisos»).
2. **Turnos presenciales**: la «Agenda de hoy» abre la ficha con `?turno=<id>` y arriba
   aparece «Este turno», con lo adjuntado, el cuestionario previo y la historia de documentos,
   sin el consentimiento de teleconsulta. Cubre menos de lo que hace falta para prometer que
   el profesional los ve antes (ver «Dónde la ve el profesional»): en el centro, el portal dice
   que los puede ver el día de la consulta y sigue pidiendo llevarlos.
3. **Quitados**: «Su historia de documentos» filtra `status=current`; lo quitado deja de
   aparecer (ver «Cómo se quita»).
4. **Cuestionario previo**: el prefijo sale de la marca, y primero va la respuesta de este
   turno (abajo).
5. **Copias**: una fila por archivo en la historia, y «Adjunto a otro turno» para lo de otro
   turno.

Que el PR esté mergeado no quiere decir que ya esté en el servidor: su `docs/MARCA-BLANCA.md`
describe los dos caminos (un proyecto de Vercel por marca, y una EC2 por marca como «camino de
producción»). Los textos del portal que dependen de esto (el de los turnos en el centro y el
del diálogo de quitar) salen con el dashboard ya desplegado en producción, verificado con una
paciente de prueba, sin datos reales:

- [ ] Desde «Agenda de hoy», un turno presencial de prueba con un adjunto (a primera hora,
      para que entre en los 6 de la tarjeta) abre `/Patient/<id>?turno=<id>`, y arriba aparece
      «Este turno» con «Adjuntó a este turno».
- [ ] Quitar un adjunto desde el portal en una teleconsulta de prueba y recargar la sala (o
      esperar más de un minuto para volver a abrirla: el cliente de Medplum guarda las
      búsquedas 60 s). Ya no aparece ni en «Adjuntó a este turno» ni en «Su historia de
      documentos».

Cuando estén las dos, este párrafo pasa a pasado, con la fecha.

### Lo que sigue abierto allá

Está entregado como segundo handoff: `docs/handoff-portal-ficha-previa-2.md` de ese repo
([EPA-Developments/dashboard-cardiometabolismo#45](https://github.com/EPA-Developments/dashboard-cardiometabolismo/pull/45),
13.10.2026), con el código de cada pedido probado en una copia de su `main`. Arranca por las
dos pruebas de arriba, para dar por desplegado el #44, y pide tres cosas:

1. **Que la ficha previa se relea** mientras está abierta: cada 30 s y al volver a la
   pestaña, sin la caché del cliente, marcando «Nuevo» lo que llega. Con eso, la bajada de la
   teleconsulta y el diálogo de quitar pueden cambiar sus salvedades (las frases propuestas
   están en su «Lo que le toca al portal»).
2. **Que la «Agenda de hoy» muestre todos los turnos del día.** Hoy, del 7.º en adelante no
   se puede abrir ni la sala ni «Este turno» desde el tablero.
3. **Que «Este turno» aparezca sin pasar por la agenda**: la ficha busca el próximo
   presencial de la persona. Lo decide el dueño del producto. Con este (y el 1), la bajada de
   los turnos en el centro puede prometer casi lo mismo que la de la teleconsulta, con una
   salvedad corta.

Ningún texto del portal cambia antes de que el pedido correspondiente esté desplegado y
probado en producción.

### Lo que falta en el portal

- **El cuestionario previo** (su pedido 4 ya está en el dashboard): falta que la dirección
  médica defina el contenido y que Recepción publique el `Questionnaire`. Después, en la sala y
  en «Mis turnos», elegido por el `serviceType.code` del turno, con una sola
  `QuestionnaireResponse` por turno (`identifier` `…/fhir/Identifier/previo-turno` = id del
  turno; se actualiza, no se duplica). El contrato completo está en el handoff, «Pendientes de
  otros repos».

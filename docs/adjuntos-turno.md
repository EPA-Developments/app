# Estudios adjuntos a un turno

La persona puede **adjuntar estudios a un turno** (PDF o fotos) para que el profesional que
la atiende los vea **antes de la consulta**. Se puede en teleconsultas y en turnos
presenciales, pero hoy el dashboard los muestra **solo en su pantalla de teleconsulta** (ver
«Pendiente del lado del dashboard»): en un turno en el centro la pantalla no promete que el
profesional los ve antes, dice que quedan guardados con el turno y pide llevarlos igual.

- **Dónde**: en la sala de la teleconsulta (`/teleconsulta/:appointmentId`, debajo de
  «Entrar»/la espera; con la videollamada abierta queda plegado) y en **Mis turnos**, en cada
  turno próximo, plegado detrás de «Adjuntar estudios (N)».
- **Código**: capa FHIR `src/fhir/adjuntosTurno.ts`; pantalla
  `src/components/turnos/AdjuntosDelTurno.tsx` («Estudios para esta consulta»).

## El contrato con el dashboard de los profesionales

El dashboard (`EPA-Developments/dashboard-cardiometabolismo`, su ficha previa, sección
«Adjuntó a este turno») busca:

```
DocumentReference?related=Appointment/<id>
```

El search param `related` es `DocumentReference.context.related`. **No filtra por status ni
por categoría**, y de cada documento muestra `content[0].attachment.title` (o `description`),
con link si hay `attachment.url` (sin URL, el nombre sin link), y la fecha `date`.

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
   `context.period` queda como dato). Si no se sacara, el dashboard lo seguiría mostrando:
   no filtra por status.
2. `status` pasa a `entered-in-error`.

Solo se quitan documentos de categoría `adjunto-turno` que apunten a ese turno: un
laboratorio, el consentimiento o lo que haya asociado otro al turno se muestran, pero no se
tocan. El `Binary` no se borra (si vino de «Elegir de los que ya mandaste», el original sigue
igual).

Por eso el diálogo **no** dice que el profesional deja de verlo: dice que deja de estar entre
los estudios de la consulta, que el archivo no se borra y que, si lo subió por error, avise por
Mensajes. Hoy el dashboard lo sigue mostrando en «Su historia de documentos» (ver abajo).

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
dashboard tendría que filtrar también por `subject` (abajo).

## Pendiente del lado del dashboard

Handoff para `EPA-Developments/dashboard-cardiometabolismo` (su ficha previa,
`src/teleconsulta/hooks/useFichaPrevia.ts` y `components/FichaPrevia.tsx`). **Ya está
entregado:** `docs/handoff-portal-ficha-previa.md` de ese repo (13.10.2026), con la
corrección propuesta y los tests de cada punto. Allá van numerados por prioridad: este 4 es
su pedido 1, el 1 su 2, el 2 su 3 y el 3 su 5; su pedido 4 es el prefijo del cuestionario
previo, que sale de la marca.

1. **Turnos presenciales.** La ficha previa (la única pantalla que lee `DocumentReference`) se
   monta solo en `/teleconsulta/:appointmentId`; la agenda lleva un turno no virtual a
   `/Patient/<id>`, y esa ficha no tiene vista de documentos. Hace falta mostrar «Adjuntó a
   este turno» también para los presenciales (en la ficha o en la agenda). Hasta entonces el
   portal no promete que el profesional los ve antes en esos turnos. Decisión del dueño del
   producto (12.10.2026): mientras tanto se sigue ofreciendo adjuntar en los presenciales, con
   el texto que pide llevarlos.
2. **Quitados.** «Su historia de documentos» (`DocumentReference?subject=Patient/<id>`) no
   filtra por status: un adjunto quitado deja de estar en «Adjuntó a este turno», pero ahí
   se sigue listando, con su link. Conviene que esa búsqueda filtre `status=current`.
3. **Copias repetidas.** Esa misma lista solo excluye lo del turno que se está mirando: las
   copias de «Elegir de los que ya mandaste» de otros turnos aparecen junto a su original de
   laboratorio (mismo nombre, otra fecha, sin badge: el dashboard solo reconoce
   `…/CodeSystem/documento-paciente`) y ocupan lugar en el recorte de 12. Conviene excluir o
   rotular la categoría
   `https://segundaopinionmedica.org/fhir/CodeSystem/documento|adjunto-turno` (ya se ven en
   «Adjuntó a este turno» de su turno).
4. **Solo la persona del turno.** Sumar `subject: Patient/<pacienteId>` a la búsqueda
   `related=Appointment/<id>`, así la ficha previa muestra solo documentos de la persona del
   turno (ver «Permisos»).

### Lo que le toca al portal cuando el dashboard despliegue

- **Su pedido 1 y su 3** (filtra por `subject` y por `status=current`): actualizar este doc y
  el diálogo de «Quitar», que ya puede decir que el profesional deja de verlo. Salvedad: si
  se quita una copia de «Elegir de los que ya mandaste», el laboratorio original sigue
  vigente y el profesional lo sigue viendo en «Su historia de documentos». Cierra los
  puntos 4 y 2 de arriba.
- **Su pedido 2** (presenciales): cambiar el texto de los turnos en el centro (hoy pide
  llevarlos) y cerrar el punto 1.
- **Su pedido 5** (copias): cerrar el punto 3.
- **Su pedido 4 y el `Questionnaire` publicado por Recepción**: el cuestionario previo en la
  sala y en «Mis turnos», elegido por el `serviceType.code` del turno, con una sola
  `QuestionnaireResponse` por turno (`identifier` `…/fhir/Identifier/previo-turno` = id del
  turno; se actualiza, no se duplica). El contrato completo está en el handoff, «Pendientes
  de otros repos». El contenido lo define la dirección médica.

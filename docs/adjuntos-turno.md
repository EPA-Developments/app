# Estudios adjuntos a un turno

La persona puede **adjuntar estudios a un turno** (PDF o fotos) para que el profesional que
la atiende los vea **antes de la consulta**. Sirve para teleconsultas y para turnos
presenciales.

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
- **El archivo**: `Binary` con `securityContext` = la persona, igual que «Enviar estudios en
  PDF». Si el server todavía no deja crear el `Binary`, los de hasta 700 KB viajan embebidos
  (`attachment.data`) y los más grandes piden mandarlos por Mensajes.
- **Elegir de los que ya mandó**: para un PDF de laboratorio que ya envió, se crea un
  `DocumentReference` **nuevo** de categoría `adjunto-turno` que apunta al **mismo**
  attachment (la misma `url` o los mismos `data`). El original no se toca: es un registro
  clínico que también actualiza el bot de laboratorio. Si ese archivo ya está adjunto y
  vigente en el turno (mismo `Binary`; si es embebido, mismo título y tamaño), no se crea
  otro.

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

## Cuándo se puede

- Hace falta el **consentimiento informado** firmado (`buscarConsentimiento`), como para
  enviar estudios: si falta, no se escribe nada y la pantalla lleva a firmarlo. Para quitar
  un adjunto no hace falta.
- El turno no tiene que estar `cancelled`, `noshow`, `entered-in-error` ni `fulfilled`, y no
  tiene que haber terminado (`end`, o una hora después de `start` si no dice cuándo termina).
  Después, la sección muestra lo adjuntado, sin sumar ni quitar.

## Permisos

Nada nuevo: la AccessPolicy de la persona (`medplum/README.md`) ya le deja escribir
`DocumentReference` y `Binary` en su compartimento y leer sus `Appointment`. No cambia la
policy ni Recepción.

## Pendiente del lado del dashboard

«Su historia de documentos» (`DocumentReference?subject=Patient/<id>`) tampoco filtra por
status: un adjunto quitado deja de estar en «Adjuntó a este turno», pero ahí se seguiría
listando (como `entered-in-error`). Conviene que esa búsqueda filtre `status=current`.

# Home del portal — 5 propuestas de diseño

Propuestas para rediseñar la Home del portal del paciente (`src/pages/HomePage.tsx`, ruta `/`, ya logueado).
Los mockups de alta fidelidad (escritorio y celular de cada una) están en el lienzo de diseño
[**«Home SOM · 5 propuestas»**](https://claude.ai/artifact/2GUtBXCe9in1ihKvww8ZCj) (privado: pedile acceso a
quien lo compartió). Cada propuesta es una columna: escritorio a la izquierda y celular a la derecha, con las
primeras pantallas alineadas arriba para comparar la sensación de entrada. Con **Play** se prueban los celulares de
A, B, C y E y el escritorio de A.

> Estado: **implementada**. La dirección médica eligió **E** para las mujeres de 45 a 55 años y **D** para el
> resto. Los dos estilos están implementados (`src/pages/inicio/`) y el D reemplazó a la Home clásica, que ya no
> está. Ver [La decisión](#la-decisión).

## La decisión

- **Quién ve qué** (`src/pages/inicio/estilo.ts`): las pacientes con `Patient.gender = female` y de 45 a 55 años
  cumplidos, ambos extremos incluidos (la misma semántica que la elegibilidad del plan), ven el estilo **E**. El
  resto, el **D**. Sin sexo o sin fecha de nacimiento, D. La fecha de hoy es la de Argentina.
- **Para probar**: `/?estilo=e` o `/?estilo=d` fuerzan un estilo con cualquier usuario; `/?petalos=tinta`,
  `dominio` o `banda` cambian cómo se pintan los pétalos de la rosa (`COLORES_PETALOS` en
  `src/pages/inicio/rosa.ts`; hoy, `tinta`); `/?tema=claro` o `/?tema=oscuro` fuerzan el tema de la D sin
  guardarlo.
- **Los tres caminos** (decisión del negocio, `src/pages/inicio/caminos.ts`). La Home ofrece, en este orden:
  1. **Plan Bienestar · 100 días**: sumarse o seguirlo.
  2. **Segunda Opinión**: pedirla, o seguir la que ya pidió.
  3. **Teleconsulta**: quien sube datos tiene que recibir una devolución. Si cargó algo (laboratorio o hábitos) y
     no tiene turno, la teleconsulta va como «Recomendado para vos», «Para hoy» propone «Revisemos juntos tus
     resultados» y el laboratorio leído por IA y el PREVENT estimado llevan su botón para reservarla. La reserva
     arranca en «videollamada» (`/get-care?modalidad=teleconsulta`).
- **PREVENT**: el del informe firmado si lo hay; si no, la estimación con sus datos (la misma que mostraba la
  Home clásica) rotulada «Estimado con tus datos · sin revisión médica», con la teleconsulta y la Segunda Opinión
  como próximos pasos. Las reglas viven en un modelo que comparten E y D (`src/pages/inicio/prevent.ts`).
- **La Home clásica ya no está**: la reemplazó el D. Su test «ninguna opción ofrece la Segunda Opinión» ya no mira
  el Inicio (el camino 2 es pedirla); sigue para el menú inferior y la guía CKM.
- **El estilo D** («Salidas y llegadas», `src/pages/inicio/HomeEstiloD.tsx`), en este orden: la puerta (un solo
  próximo paso, la tira de pase del Plan Bienestar y la ruta de ida y vuelta de sus datos, con el consentimiento
  como control), el tablero «Salidas y llegadas de tus datos», los tres caminos, sus tres instrumentos (LE8, CKM y
  PREVENT), el seguimiento GLP-1 si corresponde, sus servicios y un cierre con quién acompaña a la persona. Textos
  neutros (lo ven hombres y mujeres). Oscuro por defecto, con un modo claro equivalente: los tokens `--d-*` se
  definen una sola vez en `HomeEstiloD.module.css` y el selector «Oscuro · Claro» guarda la elección en este dispositivo
  (`localStorage['home-d-tema']`).
- **El tablero y sus fuentes FHIR** (`tablero.ts`, `useTableroHomeD.ts`): cada fila es un recurso real con su
  estado real. Salidas: los PDFs de laboratorio (`DocumentReference`: en proceso, demorado o procesado), los
  pedidos de Segunda Opinión (`ServiceRequest`), los cuestionarios de hábitos y el de ingreso
  (`QuestionnaireResponse`), las mediciones de la casa y el laboratorio cargado a mano (`Observation`, una fila
  por día). Llegadas: los resultados de cada PDF (`DiagnosticReport`, todos en una sola búsqueda, con su aviso si
  no tienen revisión médica), el informe de la Segunda Opinión («Firmado» solo con la firma médica registrada) y
  las Novedades (`Communication`). Si un informe no se pudo leer, su llegada dice «Listo» sin afirmar nada de la
  revisión ni de la firma, y el tablero avisa que no trajo todo. Lo cargado por error no aparece. Son seis
  consultas en paralelo: si una falla, el tablero lo dice y muestra el resto. Lo que sigue en curso (un pedido en
  análisis, su informe en camino, un PDF en proceso o demorado) entra siempre entre las 20 filas. «Nuevo» quiere
  decir que cambió desde la última visita en este dispositivo; lo que llega en tiempo real usa la misma
  suscripción que la campanita, y los avisos seguidos se juntan en una sola recarga.
- **Honestidad (de la revisión del código)**: la Home dice «firmado» solo si el informe trae la firma de un médico
  (`DiagnosticReport` `final` con un `resultsInterpreter` Practitioner). Hoy `bot-som-report` completa la orden y
  arma el informe con IA sin ese paso, así que se ve «Tu informe está listo». La teleconsulta se ofrece con «un
  profesional de nuestro equipo» (la reserva abre el catálogo, no el equipo de la paciente) y avisa qué tiene costo
  junto a cada botón que la reserva (en la D: la puerta, la ruta, PREVENT y el camino 3). Se deja de pedir cuando
  hubo una consulta posterior al laboratorio, y no se empuja mientras la Segunda Opinión está en análisis. La ruta
  de la D marca la estación del equipo médico como recorrida solo con una revisión registrada o una consulta
  posterior al laboratorio (con solo hábitos no hay fecha con qué comparar: queda por recorrer); con el informe
  completado sin firma, la estación dice «sin firma registrada». El pulso de luz de la ruta hace una sola pasada
  (como mucho 4 s): en loop, sin forma de pausarlo, no cumplía WCAG 2.2.2.
- **Para acordar con Recepción**: (1) registrar la firma médica del informe de la Segunda Opinión y la revisión
  del laboratorio (`resultsInterpreter`); (2) una consulta de «revisión de resultados» con los profesionales del
  equipo de la paciente y la referencia al `DiagnosticReport` en el pedido de turno.

## El objetivo

Que entrar a la Home haga sentir a la paciente que está **en el lugar correcto**, **segura**, **acompañada** y
con **una propuesta concreta para mejorar su salud**. Y que cuente, mejor que nadie en LatAm y EE. UU., el
diferencial: **los datos que cargás en la app viajan a tu historia clínica (FHIR R4), nuestros agentes de IA los
ordenan, calculan y redactan borradores, y tu equipo médico revisa, decide y firma la devolución.**

## Diagnóstico de la Home actual

- **Sin jerarquía de «qué hago hoy»**: en escritorio es una lista larga de tarjetas del mismo peso (Plan
  Bienestar, LE8, CKM, PREVENT, 9 accesos rápidos, «Cómo funciona»).
- **El hero es genérico**: una foto de stock de montaña que no dice nada de la paciente ni del servicio.
- **No se cuenta el diferencial**: en ningún lado se ve que hay un equipo médico (y agentes de IA) trabajando con
  sus datos, ni qué pasa con lo que carga.
- **Accesibilidad** (medido en el código actual):
  - Los «Accesos rápidos» de escritorio son `<Card onClick>`: no se alcanzan con teclado ni los anuncia un lector
    de pantalla. Tienen que ser `<a href>` (o `component={Link}`).
  - Botones con texto blanco sobre `#007ce8` (el `primaryShade: 6` del tema): **4,16:1**, no llega a AA (4,5:1) en
    texto de tamaño normal. Con `#0061b8` (tono 7) da **6,17:1**.
  - Tarjeta azul de la Home mobile: la bajada en `gray.3` sobre `#007ce8` da **3,19:1**.

## Reglas comunes a las 5

- **Mismos datos de ejemplo** en todos los mockups, para comparar diseños y no datos: Laura Méndez (ficticia), día
  63 de 100 del Plan Bienestar, racha de 4 semanas, hitos 4/5, LE8 64/100 (moderada, día 0: 58), sueño 45, CKM
  estadio 2, PDF de laboratorio del 3/10 con 14 valores, Segunda Opinión «En análisis» desde el 28/09.
- **«Lo de hoy» sale de una regla fija**, no de la IA: consentimiento sin firmar → cuestionario de ingreso →
  devolución sin leer → paso semanal del plan → próximo hito → hábito LE8 sin dato → estudio esencial faltante →
  «Hoy estás al día».
- **Honestidad sobre la IA**: la IA ordena, calcula y redacta borradores; el médico revisa, decide y firma. Lo que
  un agente leyó de un PDF se muestra como «todavía sin revisión médica». No se nombran proveedores de IA.
- **Consentimiento visible**: «Sin tu consentimiento firmado, ningún dato clínico pasa por la IA».
- **PREVENT** se muestra recién con el informe firmado (a validar con dirección médica).
- **Sin datos de negocio inventados**: tiempos de respuesta, certificaciones, número de pacientes o testimonios van
  como `[PLACEHOLDER]` hasta tener el dato real.
- **Tema**: pasar a `primaryShade: 7` (`#0061b8`) para botones y texto chico; `#007ce8` queda para el logo,
  gráficos, íconos y texto de 24px o más.

## Las propuestas

### A · Horizonte de 100 días — la evolución segura

- **Idea**: la montaña de stock se reemplaza por el horizonte de Laura dibujado con sus datos: un arco de 100 días
  con hoy (día 63) como punto de luz y 5 muescas de hitos. Debajo, **una sola tarjeta resuelve el paso de hoy ahí
  mismo** (presión y peso en línea) y al guardar se vuelve una **constancia** que cuenta adónde fue el dato.
- **Flujo de datos**: se cuenta a la escala de cada acción («Lo cargaste vos · 9:42» → «Se guardó en tu historia
  clínica, en formato FHIR R4» → «Se suma a tus 8 hábitos y queda a la vista de tu equipo médico») y en una banda
  «Así viaja lo que cargás».
- **Look**: claro, monocromo azul, mucho aire. Lexend (display) + Atkinson Hyperlegible Next (texto, pensada para
  baja visión).
- **Construir**: `RingProgress` no alcanza para el arco (SVG propio); formulario de signos vitales en línea
  (`NumberInput`, `Observation` con los códigos de `measurementsMeta`); motor de prioridad con tests.
- **Tradeoff**: es la menos «vidriera»; el diferencial se cuenta de a poco. En escritorio puede verse vacía.

### B · Tu parte, nuestra parte — el acompañamiento a primera vista

- **Idea**: la Home es una mesa de dos lados. A la izquierda, sobre blanco, **lo que hacés vos hoy** (una tarea
  corta). A la derecha, sobre el azul profundo de la marca, **lo que nuestro lado hace con tus datos**, en dos
  franjas: «Nuestros agentes de IA» y «Tu equipo médico». Entre los dos, una costura por donde cruza lo que mandás y
  vuelve lo que te devolvemos.
- **Flujo de datos**: por actores y con estados reales («Leyeron tu PDF del 3/10: 14 valores», «Calcularon tu
  LE8», «Tu Segunda Opinión, en análisis»). Sin consentimiento, la costura se dibuja cortada, con candado.
- **Look**: claro con el color en bloques; tres tonos de la misma escala azul por actor (blanco vos, `#004d92`
  agentes, `#003a6e` equipo médico). Familia Red Hat (Display, Text y Mono).
- **Construir**: Mantine estándar (`Card`, `Stack`, `Timeline`); el «cruce» es una animación FLIP.
- **Tradeoff**: para que la franja del equipo sea del todo honesta, el backend tiene que exponer un estado
  intermedio (borrador `DiagnosticReport` `preliminary` → `final`, o una `Task` de revisión). Mientras tanto, la
  Segunda Opinión queda «entre las dos franjas». A una paciente nueva el lado azul le queda vacío.

### C · Carta de tu equipo — la explicabilidad como tipografía

- **Idea**: la Home deja de ser un tablero y pasa a ser **la carta del día de tu equipo**, en papel clínico: una
  columna de lectura armada con plantillas fijas a partir de los datos reales (no es texto generado por IA) y un
  margen de notas. Cada afirmación clínica lleva una llamada (¹ ² ³) con su **sello de procedencia**: qué cargaste
  vos, qué calculó o redactó un agente de IA y qué revisó y firmó un médico.
- **Regla visual**: punteado = calculado o borrador; sólido = hecho por una persona. Lo que firma un médico va en
  serif itálica; lo armado con datos, en sans.
- **Look**: papel cálido `#f8f6f1` con tinta azul. Newsreader (serif) + Hanken Grotesk.
- **Construir**: motor de frases con plantillas (plurales, datos faltantes, sin plan) con revisión clínica y legal.
- **Tradeoff**: la menos «app» y la de menos impacto al primer vistazo. Depende de datos de procedencia que hoy no
  siempre están (`meta.author`, `derivedFrom`, `DiagnosticReport.resultsInterpreter`, que el portal todavía no lee).

### D · Salidas y llegadas — la opción oscura y premium

- **Idea**: un lounge nocturno y calmo. Los datos de Laura viajan de verdad, así que la Home los muestra como un
  **tablero de salidas** (lo que mandó desde la app) **y llegadas** (lo que vuelve de su equipo), con letras de
  paleta que se dan vuelta solo en las filas que cambiaron desde la última visita. Arriba, una sola puerta: tu
  próximo paso, y la ruta en U de ida y vuelta con un «control» que es el consentimiento.
- **Flujo de datos**: cada fila es un recurso real con su estado real (`DocumentReference` «En proceso» →
  «Procesado: 14 valores»; `ServiceRequest` «En análisis» / «Completada»).
- **Look**: azul noche `#04182f`, el azul de la marca convertido en luz (`#66abff`). Schibsted Grotesk + IBM Plex
  Mono (solo en el tablero). Necesita un modo claro equivalente.
- **Tradeoff**: el tema oscuro es la opción más riesgosa para 40–70 años (halos, lectura al sol). Hace visible la
  espera: hace falta un estado «Demorado» y no prometer plazos. Junta 5 consultas FHIR.

### E · Vos en el centro — la apuesta para marcar tendencia

- **Idea**: un observatorio de tu salud sobre el azul más profundo de la marca. En el centro, **la «rosa» de
  Laura**: 8 pétalos, uno por hábito de Life's Essential 8, cada uno tan largo como su puntaje. Alrededor, **dos
  anillos que son el backend hecho forma**: punteado = agentes de IA; sólido = equipo médico. Los datos salen del
  centro hacia los anillos y la devolución vuelve como una onda.
- **Diferencial**: crea un activo visual propio («tu forma») que puede viajar al plan, al PDF del informe y a la
  comunicación de la marca.
- **Look**: escenario `#003a6e` arriba y claro abajo. Bricolage Grotesque + Figtree.
- **Construir**: la rosa y los anillos son SVG a medida, con una tabla equivalente para accesibilidad. El orden de
  la Home por estadio CKM (0–2: hábitos; 3–4: turnos, medicación y equipo) necesita validación clínica.
- **Tradeoff**: la más espectacular y la más cara. Los gráficos radiales comparan peor que las barras (por eso van
  barras abajo). Con pocos datos la rosa queda casi vacía.

## Comparativa

|                                             | A Horizonte | B Tu parte / nuestra          | C Carta                                           | D Salidas y llegadas       | E Vos en el centro            |
| ------------------------------------------- | ----------- | ----------------------------- | ------------------------------------------------- | -------------------------- | ----------------------------- |
| Tema                                        | Claro       | Claro + bloques azules        | Papel cálido                                      | Oscuro                     | Oscuro arriba, claro abajo    |
| «Qué hago hoy»                              | Muy fuerte  | Fuerte                        | Media                                             | Fuerte                     | Media                         |
| Cuenta el diferencial (datos → IA → médico) | Media       | Muy fuerte                    | Fuerte                                            | Muy fuerte                 | Muy fuerte                    |
| Seguridad / confianza clínica               | Fuerte      | Fuerte                        | Muy fuerte                                        | Fuerte                     | Fuerte                        |
| Impacto al entrar                           | Medio       | Alto                          | Medio                                             | Alto                       | Muy alto                      |
| Riesgo con público 40–70                    | Bajo        | Bajo                          | Bajo                                              | Alto                       | Medio                         |
| Costo de construir                          | Bajo        | Medio                         | Medio-alto                                        | Alto                       | Alto                          |
| Cambios en el backend                       | Ninguno     | Estado intermedio del informe | Procedencia (`meta.author`, `resultsInterpreter`) | Estados de proceso del PDF | Estado intermedio del informe |

## Recomendación

**B · Tu parte, nuestra parte** como base, con dos injertos:

1. De **A**, la acción de hoy resuelta en línea con su constancia («Listo. Llegó a tu historia clínica…»).
2. De **C**, el sello de procedencia (punteado = agentes de IA, sólido = médico) como regla visual de todo el
   portal, no solo de la Home.

Es la que mejor dice «no estás sola: del otro lado hay un equipo con nombre trabajando en lo tuyo», pone el
diferencial en la primera pantalla sin abandonar patrones de app conocidos, y se construye con Mantine estándar.
Si se busca impacto de marca para EE. UU., **E** es la apuesta (su rosa puede convivir con B como pieza del
informe y de la comunicación).

## Lecciones de la revisión de los mockups

Cada mockup pasó una revisión adversarial (contraste medido par por par, honestidad clínica, voseo, coherencia de
datos entre escritorio y celular, y comportamiento a 390px de ancho). Lo que encontró vale como regla para la
implementación, elijan la propuesta que elijan:

- **Ningún título puede sugerir revisión médica que no hubo.** «Lo que volvió de tu equipo» o «lo que te devolvió
  tu equipo» son falsos si lo que hay son valores que un agente leyó de un PDF o una Segunda Opinión en análisis:
  va «Lo que vuelve a vos» y cada ítem dice si tiene revisión médica o no.
- **No afirmar garantías que la propia pantalla contradice** (p. ej. «no te mostramos números sin revisión médica»
  al lado del LE8 o de los biomarcadores, que no la tienen).
- **No inventar historia ni fechas**: nada de «antes estabas en el estadio 1» ni fechas de procesamiento que el
  recurso FHIR no registra.
- **Mismos datos en escritorio y en celular** (día del plan, racha, hitos, puntajes).
- **Tooltips y gráficos a 390px**: los rótulos absolutos sobre SVG y los tooltips `nowrap` generan scroll
  horizontal; hay que anclarlos o sacarlos del overlay.
- **Promesas de resultado**: evitar frases como «cada mejora suma mucho»; el plan acompaña, no promete.

## Próximos pasos

1. Elegir dirección (o combinación) sobre el lienzo.
2. Validar con dirección médica: cuándo mostrar PREVENT, textos sobre la IA y el orden por estadio CKM.
3. Acordar con Recepción el estado intermedio del informe (`DiagnosticReport` `preliminary` → `final`).
4. Implementar por etapas: tema (`primaryShade: 7`, tipografía) → motor de «lo de hoy» con tests → Home nueva
   en escritorio y celular → animaciones (con `prefers-reduced-motion`).

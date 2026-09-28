import type { Accion } from './acciones-nivel1.js';

/**
 * Anexo C bis — Biblioteca de acciones ampliada.
 *
 * 40 acciones neutras (ambos sexos, 30 a 79 años) que operacionalizan los ítems
 * de conducta y monitoreo de los catálogos firmados el 27/09/2026 (estadíos CKM
 * 0 a 4). Cubren lo que el Anexo C, escrito para la mujer en menopausia, no
 * tenía: nicotina, presión en casa, sodio, alcohol, apnea, días de enfermedad
 * con SGLT2i, adherencia a medicación, medición de cintura y señales de alarma.
 *
 * MISMAS REGLAS QUE EL ANEXO C
 * ----------------------------
 *   - la IA elige códigos, no redacta acciones; el médico aprueba;
 *   - ninguna acción indica, ajusta ni suspende un fármaco: cuando nombra uno ya
 *     indicado es para la seguridad de quien lo toma (agua con la gliflozina,
 *     avisar antes de un procedimiento con anticoagulante);
 *   - un código fuera de la biblioteca se rechaza antes de tocar FHIR.
 *
 * QUÉ CAMBIA
 * ----------
 * Además de las señales del cuestionario baseline, una acción puede activarse
 * por el **estadío CKM validado** (`estadio:2`) y por las **condiciones del
 * catálogo** que registra el equipo (`condicion:hta`, `condicion:toma-sglt2i`).
 * `requiere` exige que todas estén presentes (una acción de seguridad con SGLT2i
 * sólo aparece con SGLT2i); `activadaPor` sigue siendo "alguna de".
 *
 * Cada acción cita los ítems del catálogo (`items`) que operacionaliza; un test
 * comprueba que existan y que cada `condicion:` esté en `CONDICIONES`.
 *
 * Estado: borrador para firma de los Dres. Barbagelata y D'Alessandro, con el
 * mismo formato que el Anexo C.
 */

const N: Accion[] = [
  {
    codigo: 'N11',
    anexo: 'C-bis',
    pilar: 'nutricion-glp1',
    nombre: 'Sal: menos de una cucharadita al día',
    practica:
      'Cocinar sin sal y condimentar con hierbas, limón o ajo; no llevar el salero a la mesa; elegir panificados, ' +
      'fiambres y quesos "sin sal agregada" leyendo la etiqueta. La meta es menos de 2300 mg de sodio por día; con ' +
      'presión alta o enfermedad renal, tu equipo te dice si la tuya es 1500 o 2000.',
    racional:
      'Sodio < 2300 mg/día, ideal < 1500 con HTA (guía HTA 2025); < 2 g/día con ERC (KDIGO). El 70 % del sodio viene ' +
      'de panificados, fiambres y quesos, de ahí el foco en etiquetas.',
    activadaPor: [
      'condicion:hta',
      'condicion:pa-elevada',
      'condicion:erc',
      'condicion:ic',
      'condicion:pre-ic',
      'condicion:sindrome-metabolico',
    ],
    items: ['E2-DIETA-04', 'E2-HTA-03', 'E2-ERC-03', 'E3-PREIC-04', 'E4-IC-03'],
  },
  {
    codigo: 'N12',
    anexo: 'C-bis',
    pilar: 'nutricion-glp1',
    nombre: 'Pescado dos veces por semana',
    practica:
      'Incluir pescado graso (caballa, sardina, atún fresco, salmón) o, si no, pescado blanco, en dos comidas de la ' +
      'semana. Los suplementos de omega-3 sólo si tu médico los indica.',
    racional:
      'Omega-3 dietético en hipertrigliceridemia y dislipidemia; el icosapent ethyl es decisión médica (Sección 5.5.2), ' +
      'no de la biblioteca.',
    activadaPor: ['condicion:tg-altos', 'condicion:sindrome-metabolico', 'condicion:ldl-fuera-de-meta'],
    items: ['E2-TG-02'],
  },
  {
    codigo: 'N13',
    anexo: 'C-bis',
    pilar: 'nutricion-glp1',
    nombre: 'Menos azúcar y harinas refinadas',
    practica:
      'Reemplazar las bebidas azucaradas por agua o soda, y el pan blanco, las galletitas y las facturas por pan ' +
      'integral, avena o legumbres, en al menos dos comidas por día.',
    racional:
      'Los triglicéridos y la glucemia posprandial responden en semanas a menos azúcar y harinas refinadas; base del ' +
      'manejo no farmacológico de TG y prediabetes (Secciones 5.5.2 y 5.4.5).',
    activadaPor: ['condicion:tg-altos', 'condicion:prediabetes', 'condicion:dm2', 'condicion:sindrome-metabolico'],
    items: ['E2-TG-01', 'E1-GLU-01', 'E2-DM2-03'],
  },
  {
    codigo: 'N14',
    anexo: 'C-bis',
    pilar: 'nutricion-glp1',
    nombre: 'Grasas que bajan el LDL',
    practica:
      'Cambiar manteca, fiambres, frituras y aceites de coco o palma por aceite de oliva, un puñado de frutos secos ' +
      'sin sal, legumbres tres veces por semana y avena en el desayuno.',
    racional:
      'Dieta cardiosaludable como base del descenso de LDL junto con la estatina (Sección 7.1; guía de dislipidemia ' +
      '2026). No reemplaza al fármaco; suma.',
    activadaPor: [
      'condicion:ldl-fuera-de-meta',
      'condicion:aterosclerosis-subclinica',
      'condicion:coronaria',
      'condicion:acv',
      'condicion:eap',
      'condicion:toma-estatina',
    ],
    items: ['E3-DIETA-06', 'E4-ASCVD-01', 'E1-LIP-01'],
  },
  {
    codigo: 'N15',
    anexo: 'C-bis',
    pilar: 'nutricion-glp1',
    nombre: 'Registro alimentario tres días por semana',
    practica:
      'Anotar en la app todo lo que comés y tomás durante tres días de la semana (dos de semana y uno de fin de ' +
      'semana), con foto o texto, sin cambiar lo que comés para que salga "bien".',
    racional:
      'Automonitoreo alimentario: componente de la intervención multicomponente (COR 1, LOE A; Sección 5.4.2). Insumo ' +
      'del nutricionista, no juicio.',
    activadaPor: ['etapa:contemplacion', 'etapa:preparacion', 'autoeficacia:baja', 'condicion:exceso-adiposidad'],
    generaRegistro: true,
    items: ['E1-DIETA-03'],
  },
  {
    codigo: 'N16',
    anexo: 'C-bis',
    pilar: 'nutricion-glp1',
    nombre: 'Comer para el riñón',
    practica:
      'Seguir la cantidad de proteína que fijó tu nutricionista (ni más ni menos), elegir frutas y verduras según tu ' +
      'potasio y fósforo en sangre, y no usar sales "light" ni sustitutos con potasio sin consultar.',
    racional:
      'Dieta renal: sodio < 2 g, proteínas 0,8 g/kg/día (0,6 a 0,8 en avanzada, individualizado), potasio y fósforo ' +
      'según laboratorio (KDIGO). Las cantidades las fija nutrición, la biblioteca no.',
    activadaPor: ['condicion:erc', 'condicion:erc-muy-alto-riesgo', 'condicion:falla-renal'],
    derivaA: 'nutricion',
    items: ['E2-ERC-03', 'E3-ERC-04', 'E4-RENAL-02'],
  },
  {
    codigo: 'N17',
    anexo: 'C-bis',
    pilar: 'nutricion-glp1',
    nombre: 'Líquidos con medida',
    practica:
      'Tomar por día la cantidad de líquido que te indicó cardiología (contando sopas, infusiones y frutas muy ' +
      'jugosas), repartida en el día, y anotar si un día la superaste.',
    racional:
      'Restricción de líquidos individualizada en pre-IC e IC con congestión (Sección 6.3; guía IC 2022). El volumen lo ' +
      'fija el cardiólogo.',
    activadaPor: ['condicion:ic', 'condicion:pre-ic'],
    items: ['E3-PREIC-04', 'E4-IC-03'],
  },
];

const A: Accion[] = [
  {
    codigo: 'A11',
    anexo: 'C-bis',
    pilar: 'osteomuscular-movimiento',
    nombre: 'Caminata rápida progresiva hacia 150 minutos',
    practica:
      'Empezar con 10 minutos por día de caminata a paso rápido (podés hablar pero no cantar) y sumar 5 minutos por ' +
      'semana hasta llegar a 30 minutos, 5 días por semana. Vale bici, natación o baile.',
    racional:
      'Progresión segura para sedentarios hasta los 150 min/semana de actividad moderada de la guía y de LE8 (COR 1, ' +
      'LOE A; Sección 5.4.2).',
    activadaPor: ['barrera:sedentarismo', 'etapa:preparacion', 'etapa:accion', 'autoeficacia:media'],
    items: ['E1-AF-01', 'E0-AF-01'],
  },
  {
    codigo: 'A12',
    anexo: 'C-bis',
    pilar: 'osteomuscular-movimiento',
    nombre: 'Fuerza dos veces por semana',
    practica:
      'Dos sesiones semanales de 20 minutos con el peso del cuerpo o bandas: sentadillas a una silla, flexiones contra ' +
      'la pared, remo con banda y puente de glúteos, 2 series de 10 repeticiones cada uno.',
    racional:
      'La fuerza preserva masa magra durante la pérdida de peso, sobre todo con GLP-1, y suma al dominio actividad de ' +
      'LE8. Con caídas recientes va con supervisión (A15).',
    activadaPor: [
      'etapa:preparacion',
      'etapa:accion',
      'condicion:toma-glp1',
      'barrera:perdida-muscular',
      'condicion:exceso-adiposidad',
    ],
    contraindicadaPor: ['flag:caidas-recientes'],
    items: ['E1-AF-02', 'E1-GLP1-02', 'E0-AF-02'],
  },
  {
    codigo: 'A13',
    anexo: 'C-bis',
    pilar: 'osteomuscular-movimiento',
    nombre: 'Dos minutos de pie cada hora',
    practica:
      'Poner una alarma cada 60 minutos en las horas sentadas y levantarse a caminar, estirarse o buscar agua durante ' +
      'dos minutos.',
    racional:
      'Cortar el sedentarismo mejora la glucemia posprandial y la sensibilidad a la insulina, independiente de los ' +
      'minutos de ejercicio (LE8).',
    activadaPor: ['barrera:sedentarismo', 'barrera:falta-de-tiempo'],
    items: ['E1-AF-03'],
  },
  {
    codigo: 'A14',
    anexo: 'C-bis',
    pilar: 'osteomuscular-movimiento',
    nombre: 'Treinta minutos de caminata después de la comida principal',
    practica:
      'Caminar a paso cómodo durante 30 minutos dentro de la hora siguiente al almuerzo o la cena, al menos 4 días ' +
      'por semana.',
    racional:
      'La actividad posprandial reduce el pico glucémico y el ejercicio aeróbico baja la PA (Secciones 5.5.1 y 5.5.3). ' +
      'Versión larga de A07 para quien ya tiene HTA o diabetes.',
    activadaPor: ['condicion:dm2', 'condicion:hta', 'condicion:prediabetes'],
    items: ['E2-AF-04'],
  },
  {
    codigo: 'A15',
    anexo: 'C-bis',
    pilar: 'osteomuscular-movimiento',
    nombre: 'Empezar con supervisión',
    practica:
      'Hacer las primeras cuatro sesiones de fuerza e intensidad con kinesiología o educación física, y recién después ' +
      'seguir con el plan en casa.',
    racional:
      'Ejercicio supervisado al inicio en pre-IC, ERC avanzada y tras caídas (Sección 5.6.2); apto médico previo en ' +
      'estadíos 3 y 4.',
    activadaPor: [
      'condicion:pre-ic',
      'condicion:erc-muy-alto-riesgo',
      'condicion:ic',
      'condicion:falla-renal',
      'flag:caidas-recientes',
      'flag:densitometria-alterada',
      'estadio:3',
      'estadio:4',
    ],
    derivaA: 'kinesiologia',
    items: ['E3-AF-05', 'E3-PREIC-06', 'E4-RENAL-04'],
  },
  {
    codigo: 'A16',
    anexo: 'C-bis',
    pilar: 'osteomuscular-movimiento',
    nombre: 'Caminar aunque duelan las piernas',
    practica:
      'Caminar hasta que aparezca la molestia en las pantorrillas, parar hasta que pase, y seguir; 30 a 45 minutos en ' +
      'total, 3 veces por semana, mejor en programa supervisado. Revisarse los pies todos los días.',
    racional:
      'Ejercicio de marcha supervisado en arteriopatía periférica subclínica y clínica (Sección 5.6.1; guía EAP 2024). ' +
      'Claudicación nueva o en reposo: aviso al equipo, no más caminata.',
    activadaPor: ['condicion:itb-bajo', 'condicion:eap'],
    derivaA: 'kinesiologia',
    items: ['E3-ATERO-05', 'E4-ASCVD-04'],
  },
  {
    codigo: 'A17',
    anexo: 'C-bis',
    pilar: 'osteomuscular-movimiento',
    nombre: 'Rehabilitación cardiovascular: ir a todas las sesiones',
    practica:
      'Asistir a las 2 o 3 sesiones semanales del programa de rehabilitación cardiovascular durante 12 semanas y marcar ' +
      'cada asistencia en la app; avisar el mismo día si vas a faltar.',
    racional:
      'Rehabilitación cardiovascular tras síndrome coronario, revascularización, IC y arteriopatía (guías coronaria ' +
      '2023, IC 2022 y EAP 2024). Es tratamiento; la asistencia se monitorea (E4-EVAL-12).',
    activadaPor: ['condicion:coronaria', 'condicion:ic', 'condicion:eap'],
    derivaA: 'rehabilitacion-cardiovascular',
    generaRegistro: true,
    items: ['E4-REHAB-01', 'E4-IC-07'],
  },
];

const S: Accion[] = [
  {
    codigo: 'S11',
    anexo: 'C-bis',
    pilar: 'sueno-termorregulacion',
    nombre: 'Cuarto oscuro, fresco y sin alcohol de noche',
    practica:
      'Dormir con la habitación a oscuras (cortinas o antifaz), fresca y ventilada, y sin alcohol en las tres horas ' +
      'previas a acostarse.',
    racional:
      'Higiene del sueño neutra para el dominio sueño de LE8: la luz y el alcohol fragmentan el sueño y reducen el ' +
      'sueño profundo. Versión sin sofocos de S01.',
    activadaPor: ['barrera:despertares-precoces', 'barrera:horarios-irregulares', 'etapa:preparacion', 'etapa:accion'],
    items: ['E1-SUE-01', 'E0-SUE-01'],
  },
  {
    codigo: 'S12',
    anexo: 'C-bis',
    pilar: 'sueno-termorregulacion',
    nombre: 'Ocho preguntas sobre cómo dormís',
    practica:
      'Responder el cuestionario STOP-BANG en la app (ronquidos, cansancio de día, pausas al respirar, presión, IMC, ' +
      'edad, cuello, sexo) y, si roncás o alguien notó pausas, contarlo aunque el puntaje dé bajo.',
    racional:
      'Tamizaje de apnea del sueño con obesidad, HTA resistente, FA, IC o ACV (Tabla 45, COR 2a). STOP-BANG subestima ' +
      'en mujeres: los síntomas pesan más que el puntaje. El estudio del sueño lo pide el médico.',
    activadaPor: [
      'condicion:imc-30',
      'condicion:hta-resistente',
      'condicion:apnea-sospecha',
      'condicion:fa',
      'condicion:ic',
      'condicion:acv',
      'condicion:pre-ic',
    ],
    generaRegistro: true,
    items: ['E1-SUE-02', 'E2-HTA-06', 'E4-FA-03'],
  },
];

const C: Accion[] = [
  {
    codigo: 'C11',
    anexo: 'C-bis',
    pilar: 'conducta-adherencia',
    nombre: 'Dos acciones por semana, elegidas el domingo',
    practica:
      'Cada domingo elegir dos acciones de tu plan para la semana, marcarlas en la app cuando las hacés, y al día 30, ' +
      '60 y 100 revisar con tu equipo qué se pudo y qué no.',
    racional:
      'Mecanismo del plan semanal firmado (E1-ADH-01): resolución guiada de problemas y metas pequeñas sostienen la ' +
      'autoeficacia (Sección 5.4.2, COR 1, LOE A).',
    activadaPor: ['etapa:contemplacion', 'etapa:preparacion', 'etapa:accion'],
    generaRegistro: true,
    items: ['E1-ADH-01'],
  },
  {
    codigo: 'C12',
    anexo: 'C-bis',
    pilar: 'conducta-adherencia',
    nombre: 'Pastillero semanal y recordatorio',
    practica:
      'Armar el pastillero de la semana el domingo, con una alarma diaria en el teléfono a la hora de tomar los ' +
      'remedios, y llevarlo cuando salís de casa.',
    racional:
      'Organización de la toma en quien tiene medicación indicada; la suspensión inadecuada es el error más frecuente ' +
      '(Tabla 12). No modifica ni sugiere dosis.',
    activadaPor: ['condicion:medicacion', 'barrera:olvidos', 'condicion:polifarmacia'],
    requiere: ['condicion:medicacion'],
    items: ['E2-MED-EDU-01', 'E3-ADH-02', 'E4-ADH-02'],
  },
  {
    codigo: 'C13',
    anexo: 'C-bis',
    pilar: 'conducta-adherencia',
    nombre: '¿Cuántas dosis te olvidaste esta semana?',
    practica:
      'Responder cada semana en la app cuántas dosis olvidaste; si son más de una, tu persona de referencia te ayuda a ' +
      'simplificar el esquema.',
    racional:
      'Medición simple de adherencia (Tabla 12); insumo del check-in semanal y de la respuesta a 100 días en estadío 4 ' +
      '(cero dosis olvidadas en 4 semanas).',
    activadaPor: ['condicion:medicacion'],
    requiere: ['condicion:medicacion'],
    generaRegistro: true,
    items: ['E2-MED-EDU-02', 'E4-ADH-02'],
  },
  {
    codigo: 'C14',
    anexo: 'C-bis',
    pilar: 'conducta-adherencia',
    nombre: 'Un solo horario para todos los remedios',
    practica:
      'Pedirle a tu equipo que agrupe los remedios en el menor número de tomas posible y asociar cada toma a una rutina ' +
      'fija (desayuno, cena), sin cambiar nada por tu cuenta.',
    racional:
      'Simplificación del esquema y anclaje de hábitos para la adherencia con polifarmacia (Tabla 12); el ' +
      'reordenamiento lo hace el médico o farmacia clínica, no la persona.',
    activadaPor: ['condicion:polifarmacia', 'barrera:olvidos'],
    requiere: ['condicion:medicacion'],
    items: ['E3-ADH-02', 'E4-ADH-02'],
  },
  {
    codigo: 'C15',
    anexo: 'C-bis',
    pilar: 'conducta-adherencia',
    nombre: 'Cinco minutos de respiración al día',
    practica:
      'Hacer la respiración guiada de 5 minutos de la app una vez al día, a la misma hora, y anotar del 1 al 5 cómo te ' +
      'sentís después.',
    racional:
      'Manejo del estrés como parte del estilo de vida (Sección 5.1); la salud psicológica pobre es potenciador (Tabla ' +
      '9). Con PHQ-2 o GAD-2 positivos, además, psicología.',
    activadaPor: [
      'clinico:estres-elevado',
      'condicion:phq-gad-positivo',
      'barrera:ansiedad-nocturna',
      'condicion:potenciadores',
    ],
    generaRegistro: true,
    items: ['E1-EST-01', 'E0-EST-01', 'E3-EST-03', 'E4-EST-04'],
  },
];

const P: Accion[] = [
  {
    codigo: 'P01',
    anexo: 'C-bis',
    pilar: 'presion-corazon',
    nombre: 'Presión en casa los 7 días antes de cada control',
    practica:
      'Los 7 días previos al control: dos tomas a la mañana y dos a la noche, sentado, 5 minutos de reposo, espalda ' +
      'apoyada, brazo a la altura del corazón, sin hablar; anotar las cuatro en la app.',
    racional:
      'AMPA con promedio de 7 días es la medida de control de la guía HTA 2025; detecta HTA incipiente (paso a estadío ' +
      '2), de bata blanca y enmascarada.',
    activadaPor: ['estadio:1', 'estadio:2', 'estadio:3', 'estadio:4', 'condicion:pa-elevada'],
    generaRegistro: true,
    items: ['E1-PA-01', 'E2-HTA-01'],
  },
  {
    codigo: 'P02',
    anexo: 'C-bis',
    pilar: 'presion-corazon',
    nombre: 'Presión en casa una vez por semana',
    practica:
      'Entre controles, un día fijo por semana: dos tomas a la mañana y dos a la noche, con la misma técnica, anotadas ' +
      'en la app.',
    racional:
      'Seguimiento de la PA bajo tratamiento (E2-EVAL-03); el promedio ≥ 130/80 al día 30, 60 o 100 dispara la alerta ' +
      'de intensificación al médico (E2-HTA-MED-02).',
    activadaPor: ['condicion:hta', 'condicion:toma-antihipertensivo'],
    requiere: ['condicion:hta'],
    generaRegistro: true,
    items: ['E2-HTA-01'],
  },
  {
    codigo: 'P03',
    anexo: 'C-bis',
    pilar: 'presion-corazon',
    nombre: 'Cuándo llamar a emergencias',
    practica:
      'Guardar el número de emergencias en la pantalla de inicio y acordar con tu familia la regla: dolor u opresión en ' +
      'el pecho de más de 10 minutos, falta de aire brusca, desmayo, debilidad de un lado o dificultad para hablar o ' +
      'ver: llamar, no manejar.',
    racional:
      'Señales de síndrome coronario, IC aguda y ACV; el tiempo a la reperfusión define el pronóstico. Firmado en los ' +
      'estadíos 2, 3 y 4.',
    activadaPor: ['estadio:2', 'estadio:3', 'estadio:4'],
    items: ['E2-ALARM-01', 'E3-ALARM-01', 'E4-ALARM-01'],
  },
  {
    codigo: 'P04',
    anexo: 'C-bis',
    pilar: 'presion-corazon',
    nombre: 'Cuándo consultar hoy, sin esperar al control',
    practica:
      'Avisar a tu equipo el mismo día si: subiste 2 kg en 3 días, las piernas se hinchan más, te falta el aire ' +
      'acostado, tenés palpitaciones sostenidas, un sangrado que no para, orinás muy poco u oscuro, o la presión pasa ' +
      'de 180/110.',
    racional:
      'Congestión incipiente, arritmia, sangrado por antitrombóticos, deterioro renal y crisis hipertensiva (Sección ' +
      '5.6.2; guía IC 2022). Contacto el mismo día, no emergencias.',
    activadaPor: [
      'estadio:3',
      'estadio:4',
      'condicion:pre-ic',
      'condicion:ic',
      'condicion:toma-antitrombotico',
      'condicion:hta-resistente',
    ],
    items: ['E3-ALARM-02', 'E4-ALARM-02', 'E2-ALARM-01'],
  },
  {
    codigo: 'P05',
    anexo: 'C-bis',
    pilar: 'presion-corazon',
    nombre: 'Peso diario a la mañana',
    practica:
      'Pesarse todos los días al levantarse, después de orinar y antes de desayunar, con la misma balanza, y anotarlo ' +
      'en la app; si subís 2 kg en 3 días o dormís con más almohadas, avisar ese día.',
    racional:
      'Detección temprana de congestión en pre-IC e IC; regla de 2 kg en 3 días (guía IC 2022). Distinto de R01 (peso ' +
      'semanal para la meta de peso).',
    activadaPor: ['condicion:pre-ic', 'condicion:ic'],
    generaRegistro: true,
    items: ['E3-PREIC-02', 'E4-IC-02'],
  },
  {
    codigo: 'P06',
    anexo: 'C-bis',
    pilar: 'presion-corazon',
    nombre: 'Registrá las palpitaciones',
    practica:
      'Anotar en la app cuándo empiezan, cuánto duran y cómo te sentís; si tenés reloj con ECG, guardar el trazado. ' +
      'Palpitaciones sostenidas con mareo o falta de aire: consulta el mismo día.',
    racional:
      'Correlación síntoma-ritmo y carga de FA (guía FA 2023); insumo de la decisión de control del ritmo ' +
      '(E4-FA-MED-07).',
    activadaPor: ['condicion:fa'],
    generaRegistro: true,
    items: ['E4-FA-04'],
  },
];

const M: Accion[] = [
  {
    codigo: 'M01',
    anexo: 'C-bis',
    pilar: 'medicacion-seguridad',
    nombre: 'Días de enfermedad: llamá el mismo día',
    practica:
      'Si tenés vómitos, diarrea o fiebre y no podés comer ni beber con normalidad, llamar a tu equipo ese mismo día ' +
      'antes de la siguiente toma: algunos remedios se pausan hasta que te recuperes. No los suspendas ni los reanudes ' +
      'por tu cuenta.',
    racional:
      'Reglas de días de enfermedad para RASi, diuréticos, SGLT2i y metformina (Tabla 14; KDIGO): evitan lesión renal ' +
      'aguda y cetoacidosis. La decisión de pausar es del médico.',
    activadaPor: ['condicion:toma-sglt2i', 'condicion:toma-rasi-mra', 'condicion:erc', 'condicion:dm2'],
    items: ['E2-SEG-01', 'E2-ERC-05', 'E2-DM2-04'],
  },
  {
    codigo: 'M02',
    anexo: 'C-bis',
    pilar: 'medicacion-seguridad',
    nombre: 'Antiinflamatorios: consultá antes',
    practica:
      'No tomar ibuprofeno, diclofenac, naproxeno ni similares más de dos días seguidos sin consultar; para el dolor ' +
      'ocasional, preguntar a tu equipo qué alternativa podés usar.',
    racional:
      'Los AINE suben la PA, dañan el riñón y descompensan la IC; con antitrombóticos aumentan el sangrado (KDIGO; guía ' +
      'HTA 2025; guía IC 2022).',
    activadaPor: [
      'condicion:hta',
      'condicion:erc',
      'condicion:ic',
      'condicion:toma-antitrombotico',
      'condicion:erc-muy-alto-riesgo',
    ],
    items: ['E2-SEG-02', 'E2-ERC-02', 'E3-ERC-03', 'E4-IC-08'],
  },
  {
    codigo: 'M03',
    anexo: 'C-bis',
    pilar: 'medicacion-seguridad',
    nombre: 'Con tu gliflozina: agua e higiene',
    practica:
      'Tomar agua durante el día, cuidar la higiene genital diaria y avisar a tu equipo si tenés vómitos, ayuno ' +
      'prolongado o una cirugía programada: esos días se pausa.',
    racional:
      'Seguridad con SGLT2i ya indicado: infecciones genitales, depleción de volumen, cetoacidosis euglucémica (Tabla ' +
      '14). Educación, sin dosis.',
    activadaPor: ['condicion:toma-sglt2i'],
    requiere: ['condicion:toma-sglt2i'],
    items: ['E2-DM2-04', 'E3-PREIC-07'],
  },
  {
    codigo: 'M04',
    anexo: 'C-bis',
    pilar: 'medicacion-seguridad',
    nombre: 'Azúcar bajo: qué hacer',
    practica:
      'Ante temblor, sudor frío o confusión: tomar 15 g de azúcar de acción rápida (3 caramelos, medio vaso de jugo o ' +
      'gaseosa común), esperar 15 minutos y volver a medir; llevar siempre algo dulce encima.',
    racional:
      'Prevención y manejo de la hipoglucemia en quienes usan insulina o sulfonilureas (ADA); no aplica a metformina, ' +
      'SGLT2i ni GLP-1 solos.',
    activadaPor: ['condicion:riesgo-hipoglucemia'],
    requiere: ['condicion:riesgo-hipoglucemia'],
    items: ['E2-DM2-06'],
  },
  {
    codigo: 'M05',
    anexo: 'C-bis',
    pilar: 'medicacion-seguridad',
    nombre: 'Medite el azúcar como te lo pidieron',
    practica:
      'Medir la glucemia capilar (o mirar el sensor) en los momentos que indicó tu médico y registrarla en la app; sin ' +
      'cambiar los remedios por un valor aislado.',
    racional:
      'Automonitoreo capilar o sensor mientras se ajusta el esquema (Tabla 47); el ajuste lo hace el médico entre ' +
      'controles.',
    activadaPor: ['condicion:automonitoreo-glucemia'],
    requiere: ['condicion:automonitoreo-glucemia', 'condicion:dm2'],
    generaRegistro: true,
    items: ['E2-DM2-07'],
  },
  {
    codigo: 'M06',
    anexo: 'C-bis',
    pilar: 'medicacion-seguridad',
    nombre: 'El análisis de las 2 a 4 semanas',
    practica:
      'Si empezaste o te subieron un remedio para la presión o el riñón, agendar el análisis de potasio y creatinina ' +
      'para dentro de 2 a 4 semanas y llevar el resultado al equipo.',
    racional:
      'Evento de laboratorio tras iniciar o subir RASi, MRA o SGLT2i (Tabla 47, COR 2a); una caída de eGFR ≤ 30 % es ' +
      'esperable, potasio > 5,5 requiere ajuste.',
    activadaPor: ['condicion:inicia-rasi-mra', 'condicion:inicia-sglt2i'],
    items: ['E2-HTA-05', 'E2-ERC-04'],
  },
  {
    codigo: 'M07',
    anexo: 'C-bis',
    pilar: 'medicacion-seguridad',
    nombre: 'Antiagregante o anticoagulante: avisá antes',
    practica:
      'Antes de cualquier estudio, extracción dental, cirugía o remedio nuevo, avisar que tomás antiagregante o ' +
      'anticoagulante; nunca suspenderlo por tu cuenta. Sangre en orina, heces negras o un golpe en la cabeza: consulta ' +
      'el mismo día.',
    racional:
      'Seguridad con antitrombóticos: suspensión perioperatoria coordinada e interacciones (guías coronaria 2023 y FA ' +
      '2023). La suspensión inadecuada es la causa más frecuente de eventos.',
    activadaPor: ['condicion:toma-antitrombotico'],
    requiere: ['condicion:toma-antitrombotico'],
    items: ['E4-ASCVD-02', 'E4-FA-02', 'E4-ADH-01'],
  },
  {
    codigo: 'M08',
    anexo: 'C-bis',
    pilar: 'medicacion-seguridad',
    nombre: 'Vacunas al día',
    practica:
      'Vacunarse contra la gripe cada año y verificar con tu equipo neumococo y COVID según calendario; anotar la fecha ' +
      'de cada dosis en la app.',
    racional:
      'Vacunación en ECV establecida y falla renal (guías IC 2022 y coronaria 2023; KDIGO): las infecciones ' +
      'respiratorias descompensan el corazón. Firmado en el estadío 4.',
    activadaPor: [
      'condicion:ic',
      'condicion:coronaria',
      'condicion:acv',
      'condicion:eap',
      'condicion:fa',
      'condicion:falla-renal',
    ],
    items: ['E4-VAC-01', 'E4-IC-07'],
  },
];

const T: Accion[] = [
  {
    codigo: 'T01',
    anexo: 'C-bis',
    pilar: 'tabaco-alcohol',
    nombre: 'Una fecha para dejar de fumar',
    practica:
      'Elegir con tu equipo una fecha en los próximos 30 días para dejar de fumar o vapear, anotarla en la app y pedir ' +
      'el tratamiento de apoyo que tu médico te ofrece.',
    racional:
      'Consejería y tratamiento de cesación en cada contacto (Sección 5.1); dominio nicotina de LE8. La farmacoterapia ' +
      'la indica el médico (E4-ASCVD-MED-12).',
    activadaPor: ['condicion:fuma'],
    requiere: ['condicion:fuma'],
    derivaA: 'cesacion-tabaquica',
    items: ['E1-NIC-01', 'E0-NIC-01', 'E3-ATERO-04', 'E4-NIC-02'],
  },
  {
    codigo: 'T02',
    anexo: 'C-bis',
    pilar: 'tabaco-alcohol',
    nombre: 'Alcohol: no más de una medida, y no todos los días',
    practica:
      'Si tomás alcohol, no más de una medida por día (una copa de vino, una lata de cerveza, una medida de destilado) ' +
      'y al menos tres días por semana sin alcohol; nada de alcohol de noche si dormís mal.',
    racional:
      'El alcohol sube la PA y los triglicéridos, precipita FA y fragmenta el sueño (Secciones 5.5.2 y 5.5.3; guía FA ' +
      '2023).',
    activadaPor: ['condicion:alcohol', 'condicion:hta', 'condicion:tg-altos', 'condicion:fa', 'barrera:alcohol-picante'],
    items: ['E2-DIETA-05', 'E4-FA-03'],
  },
  {
    codigo: 'T03',
    anexo: 'C-bis',
    pilar: 'tabaco-alcohol',
    nombre: 'Cigarrillos y medidas de la semana',
    practica:
      'Anotar cada domingo cuántos cigarrillos fumaste y cuántas medidas de alcohol tomaste en la semana; el número no ' +
      'se juzga, se mira la tendencia.',
    racional: 'Automonitoreo de nicotina y alcohol para el tablero LE8 y para ajustar el apoyo de cesación.',
    activadaPor: ['condicion:fuma', 'condicion:alcohol'],
    generaRegistro: true,
    items: ['E1-NIC-01', 'E2-DIETA-05'],
  },
];

const R: Accion[] = [
  {
    codigo: 'R01',
    anexo: 'C-bis',
    pilar: 'medicion-registro',
    nombre: 'Pesate una vez por semana',
    practica:
      'Pesarse un día fijo por semana, a la mañana, después de orinar, con la misma balanza y la misma ropa, y ' +
      'anotarlo en la app.',
    racional:
      'Automonitoreo del peso para la respuesta a 100 días (≥ 5 % / 3 a < 5 % / < 3 %); el protocolo único evita ' +
      'ruido. Con pre-IC o IC el peso es diario (P05).',
    activadaPor: ['condicion:exceso-adiposidad', 'etapa:preparacion', 'etapa:accion'],
    generaRegistro: true,
    items: ['E1-PESO-03', 'E0-PESO-02'],
  },
  {
    codigo: 'R02',
    anexo: 'C-bis',
    pilar: 'medicion-registro',
    nombre: 'Medite la cintura una vez por mes',
    practica:
      'Una vez por mes, de pie y al final de una espiración normal, medir la cintura en el punto medio entre la última ' +
      'costilla y la cresta ilíaca, dos veces, y anotar el promedio; mirar primero el video de un minuto.',
    racional:
      'Protocolo de cintura OMS firmado, dos mediciones promediadas; la cintura vale como respuesta alternativa al peso ' +
      '(5 cm menos como meta).',
    activadaPor: ['condicion:exceso-adiposidad', 'condicion:sindrome-metabolico'],
    generaRegistro: true,
    items: ['E1-PESO-03', 'E2-TG-03'],
  },
];

/** Las 40 acciones del Anexo C bis. Borrador para firma; misma regla cerrada que el Anexo C. */
export const BIBLIOTECA_C_BIS: readonly Accion[] = Object.freeze(
  [...N, ...A, ...S, ...C, ...P, ...M, ...T, ...R].map((accion) => Object.freeze(accion)),
);

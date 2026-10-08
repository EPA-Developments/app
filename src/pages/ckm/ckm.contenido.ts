// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Contenido educativo sobre salud CKM (Cardio-Reno-Metabólica) y los estadios 0-4 de
// la guía AHA 2023 (Presidential Advisory, Ndumele et al., Circulation). Redactado en
// voz de paciente y alineado con los labels del motor de estadificación del vendor
// (`careplan-menopausia/ckm/staging.ts`).
//
// ⚠️ Contenido educativo orientativo: no reemplaza la evaluación médica. Revisar por
// el equipo médico de SOM antes de darlo por definitivo. El nombre de la marca sale de
// `src/marca.ts`.
import { MARCA } from '../../marca';

export interface EstadioInfo {
  /** Estadio CKM (0-4). */
  estadio: 0 | 1 | 2 | 3 | 4;
  /** Nombre corto en voz de paciente. */
  nombre: string;
  /** Qué significa, en una frase. */
  resumen: string;
  /** Ejemplos de lo que suele incluir este estadío (lenguaje simple). */
  ejemplos: string[];
  /** Acción concreta recomendada para el paciente. */
  quePodesHacer: string;
  /** Color Mantine del semáforo (verde → rojo). */
  color: string;
}

/** Qué es la salud CKM, en lenguaje simple. */
export const QUE_ES_CKM = {
  titulo: 'Tu corazón, tus riñones y tu metabolismo trabajan en equipo',
  parrafos: [
    'La salud CKM (Cardio-Reno-Metabólica) mira a tu corazón, tus riñones y tu metabolismo como un solo sistema: cuando uno se desequilibra, arrastra a los otros. La presión, el azúcar, el colesterol, el peso y la función renal están conectados.',
    'La Asociación Americana del Corazón (AHA) publicó en 2026 una guía (Ndumele y col.) que ordena esa conexión en fases o estadios, del 0 al 4. La idea es simple y poderosa: detectar en qué fase estás HOY para actuar ANTES de que aparezca un evento como un infarto o un ACV.',
  ],
} as const;

/** Qué trae de nuevo la guía AHA 2023, en 4 puntos. */
export const NOVEDADES_GUIA: { titulo: string; texto: string }[] = [
  {
    titulo: 'Un solo mapa: corazón · riñones · metabolismo',
    texto: 'Antes se evaluaban por separado; ahora se miran juntos, porque se afectan entre sí.',
  },
  {
    titulo: 'Fases claras, del 0 al 4',
    texto: 'Cada persona está en una fase. Saberla ordena las prioridades: qué controlar, qué estudiar y qué tratar.',
  },
  {
    titulo: 'Riesgo PREVENT a 10 y 30 años',
    texto: 'Un score nuevo que estima tu probabilidad de eventos cardiovasculares, incluso a largo plazo, para decidir a tiempo.',
  },
  {
    titulo: 'Prevención desde temprano',
    texto: 'Las fases 0 a 2 son el gran territorio de oportunidad: con hábitos y controles se puede frenar (y hasta revertir) la progresión.',
  },
];

/** Los 5 estadios CKM en voz de paciente (alineados con CKM_STAGE_LABEL del vendor). */
export const ESTADIOS: EstadioInfo[] = [
  {
    estadio: 0,
    nombre: 'Salud CKM preservada',
    resumen: 'Sin factores de riesgo: peso, presión, azúcar, lípidos y riñones en rango saludable.',
    ejemplos: [
      'Peso y cintura en rango saludable.',
      'Presión, glucemia y colesterol normales, sin medicación.',
      'Función renal normal.',
    ],
    quePodesHacer: 'Mantené tus hábitos y controlate una vez por año para confirmar que seguís acá.',
    color: 'teal',
  },
  {
    estadio: 1,
    nombre: 'Exceso de adiposidad o prediabetes',
    resumen: 'El primer paso silencioso: sobrepeso, cintura aumentada o azúcar apenas por arriba de lo normal.',
    ejemplos: [
      'Sobrepeso u obesidad (IMC elevado).',
      'Cintura aumentada (grasa abdominal).',
      'Prediabetes (glucemia o HbA1c levemente elevadas).',
    ],
    quePodesHacer:
      'Es la fase MÁS reversible: alimentación, movimiento y sueño pueden devolverte al estadío 0. Un plan guiado acelera el cambio.',
    color: 'lime',
  },
  {
    estadio: 2,
    nombre: 'Factores de riesgo metabólicos o renales',
    resumen: 'Aparecen la hipertensión, los triglicéridos altos, la diabetes, el síndrome metabólico o la enfermedad renal crónica.',
    ejemplos: [
      'Presión arterial alta.',
      'Triglicéridos elevados o HDL bajo.',
      'Diabetes tipo 2 o síndrome metabólico.',
      'Enfermedad renal crónica en etapas iniciales.',
    ],
    quePodesHacer:
      'Acá el tratamiento correcto cambia el pronóstico: metas de presión, azúcar y lípidos claras, y controles renales. Una segunda opinión ordena prioridades.',
    color: 'yellow',
  },
  {
    estadio: 3,
    nombre: 'Enfermedad subclínica (sin síntomas)',
    resumen: 'Los estudios ya muestran daño silencioso en las arterias o un riesgo calculado alto, aunque no sientas nada.',
    ejemplos: [
      'Aterosclerosis detectada por imágenes (por ej., calcio coronario).',
      'Riñón de alto riesgo.',
      'Riesgo PREVENT alto, equivalente a enfermedad subclínica.',
    ],
    quePodesHacer:
      'Momento clave para intensificar el tratamiento y evitar el primer evento. Una segunda opinión experta puede redefinir tu plan por completo.',
    color: 'orange',
  },
  {
    estadio: 4,
    nombre: 'Enfermedad cardiovascular establecida',
    resumen: 'Ya hubo un evento o diagnóstico: infarto, angina, insuficiencia cardíaca, ACV, arritmia o enfermedad arterial.',
    ejemplos: [
      'Infarto, angioplastia o bypass previos.',
      'Insuficiencia cardíaca o fibrilación auricular.',
      'ACV o enfermedad arterial periférica.',
      '4a: sin falla renal · 4b: con falla renal (cambia el manejo).',
    ],
    quePodesHacer:
      'El tratamiento óptimo y la rehabilitación marcan la diferencia en cómo vivís de acá en adelante. Una segunda opinión confirma que estás recibiendo lo mejor disponible.',
    color: 'red',
  },
];

/** Cómo acompaña el Plan Bienestar 100 días, por qué sirve en cualquier estadío. */
export const PLAN_BIENESTAR_CKM = {
  titulo: 'Plan Bienestar · 100 días: tu estadío no es un destino',
  parrafos: [
    `Sea cual sea tu fase, la guía AHA muestra que se puede mejorar. El Plan Bienestar de 100 días convierte esa evidencia en pasos concretos: tus datos (presión, cintura, laboratorio), tus hábitos (sueño, alimentación, actividad y tabaco con los cuestionarios LE8) y tus metas, con el acompañamiento de un profesional de la red ${MARCA.nombre}.`,
  ],
  bullets: [
    'Cargás tus datos y conocés tu estadío CKM y tu riesgo PREVENT.',
    'Recibís metas y pasos semanales adaptados a tu fase.',
    'Un profesional de la red revisa tu progreso y ajusta el plan.',
  ],
} as const;

/** Prefijo del motivo cuando el paciente pide la Segunda Opinión desde su estadío. */
export function motivoPorEstadio(estadio: number): string {
  const info = ESTADIOS.find((e) => e.estadio === estadio);
  const nombre = info ? ` (${info.nombre.toLowerCase()})` : '';
  return `Según la guía AHA de salud CKM estoy en estadío ${estadio}${nombre}. Quiero una segunda opinión sobre mi situación, mis estudios y el mejor plan para mi caso.`;
}

export const DISCLAIMER_CKM =
  'Este contenido es educativo y orientativo: te ayuda a entender la guía AHA 2023 (Ndumele y col.), pero no reemplaza la evaluación de tu equipo de salud. Ante síntomas agudos, acudí a una guardia.';

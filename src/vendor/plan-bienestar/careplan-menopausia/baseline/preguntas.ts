/**
 * Cuestionario baseline del PB100D — la entrada de la biblioteca de acciones.
 *
 * La biblioteca (Anexo C) elige acciones filtrando por `Senal`. Este archivo es
 * de dónde salen esas señales: lo que la paciente responde una vez, al empezar.
 *
 * UNA SOLA DECLARACIÓN
 * --------------------
 * Las preguntas y el mapeo respuesta → señal se declaran juntos, acá. De esta
 * lista se derivan las dos cosas que necesitan estar de acuerdo:
 *
 *   `baselineQuestionnaireItems()`  el Questionnaire FHIR que se le muestra
 *   `perfilDesdeRespuesta()`        el PerfilBaseline que lee el generador
 *
 * Si estuvieran escritas por separado podrían divergir en silencio: una opción
 * que la paciente elige y que no activa nada, o una señal que la biblioteca
 * espera y que ninguna pregunta produce. Derivadas de la misma fuente, no.
 *
 * QUÉ NO ESTÁ ACÁ
 * ---------------
 * Los `Flag` (caídas recientes, densitometría alterada, incontinencia
 * frecuente). Son hallazgos clínicos que carga el equipo, no algo que la
 * paciente auto-reporte: deciden **seguridad**, no preferencia. Una paciente
 * puede decir que le cuesta el impacto sin que eso contraindique nada, pero una
 * densitometría alterada sí veta la caminata de impacto. Mezclarlos sería dejar
 * que un checkbox levante una contraindicación.
 */

import type { Senal } from '../biblioteca/acciones-nivel1.js';

/** URL canónica del cuestionario baseline. */
export const BASELINE_QUESTIONNAIRE_URL = 'https://epa-bienestar.ar/fhir/Questionnaire/pb100d-baseline';

export interface OpcionBaseline {
  code: string;
  display: string;
  /** Señal que activa esta respuesta. Sin señal = no aporta nada al filtro. */
  senal?: Senal;
}

export interface PreguntaBaseline {
  linkId: string;
  /** Grupo al que pertenece, para agrupar en la pantalla. */
  grupo: string;
  text: string;
  opciones: OpcionBaseline[];
  /** La paciente puede marcar varias. */
  multiple?: boolean;
}

export interface GrupoBaseline {
  linkId: string;
  text: string;
}

export const BASELINE_GRUPOS: readonly GrupoBaseline[] = Object.freeze([
  { linkId: 'momento', text: 'En qué momento estás' },
  { linkId: 'digestion', text: 'Digestión y apetito' },
  { linkId: 'cuerpo', text: 'Cuerpo y movimiento' },
  { linkId: 'descanso', text: 'Descanso' },
  { linkId: 'organizacion', text: 'Organización del día a día' },
  { linkId: 'preferencias', text: 'Cómo te gusta encarar los cambios' },
]);

const NINGUNA: OpcionBaseline = { code: 'ninguna', display: 'Ninguna de estas' };

export const BASELINE_PREGUNTAS: readonly PreguntaBaseline[] = Object.freeze([
  // -- Momento ---------------------------------------------------------------
  {
    linkId: 'etapa-de-cambio',
    grupo: 'momento',
    text: '¿Con cuál te identificás más hoy?',
    opciones: [
      {
        code: 'contemplacion',
        display: 'Estoy dándole vueltas, todavía no arranqué',
        senal: 'etapa:contemplacion',
      },
      {
        code: 'preparacion',
        display: 'Ya decidí empezar y estoy organizándome',
        senal: 'etapa:preparacion',
      },
      {
        code: 'accion',
        display: 'Ya estoy haciendo cambios',
        senal: 'etapa:accion',
      },
    ],
  },
  {
    linkId: 'autoeficacia',
    grupo: 'momento',
    text: '¿Cuánta confianza tenés en poder sostener un cambio de hábitos estos 100 días?',
    opciones: [
      { code: 'poca', display: 'Poca: me cuesta sostener las cosas', senal: 'autoeficacia:baja' },
      { code: 'media', display: 'Más o menos: depende de la semana', senal: 'autoeficacia:media' },
      { code: 'mucha', display: 'Bastante: cuando me propongo algo lo sostengo' },
    ],
  },
  {
    linkId: 'autoeficacia-fisica',
    grupo: 'momento',
    text: '¿Y con el movimiento y el ejercicio en particular?',
    opciones: [
      {
        code: 'insegura',
        display: 'Me siento insegura o tengo miedo de lastimarme',
        senal: 'autoeficacia:fisica-baja',
      },
      { code: 'comoda', display: 'Me siento cómoda moviéndome' },
    ],
  },
  {
    linkId: 'glp1',
    grupo: 'momento',
    text: '¿Estás con tratamiento con GLP-1 (semaglutida, tirzepatida u otro)?',
    opciones: [
      { code: 'si', display: 'Sí' },
      { code: 'no', display: 'No' },
    ],
  },

  // -- Digestión -------------------------------------------------------------
  {
    linkId: 'nauseas',
    grupo: 'digestion',
    text: '¿Tenés náuseas?',
    opciones: [
      { code: 'no', display: 'No' },
      { code: 'leves', display: 'Leves, tolerables', senal: 'barrera:nauseas-leves' },
      { code: 'marcadas', display: 'Marcadas, me condicionan las comidas', senal: 'barrera:nauseas' },
    ],
  },
  {
    linkId: 'digestivo',
    grupo: 'digestion',
    text: '¿Cuáles de estas te pasan seguido? Marcá todas las que correspondan.',
    multiple: true,
    opciones: [
      { code: 'estrenimiento', display: 'Voy de cuerpo con dificultad', senal: 'barrera:estrenimiento' },
      { code: 'reflujo', display: 'Acidez o reflujo, sobre todo de noche', senal: 'barrera:reflujo' },
      { code: 'saciedad-precoz', display: 'Me lleno enseguida al comer', senal: 'barrera:saciedad-precoz' },
      { code: 'inapetencia', display: 'Casi no tengo hambre', senal: 'barrera:inapetencia' },
      { code: 'ingesta-rapida', display: 'Como muy rápido', senal: 'barrera:ingesta-rapida' },
      { code: 'perdida-muscular', display: 'Siento que estoy perdiendo masa muscular', senal: 'barrera:perdida-muscular' },
      NINGUNA,
    ],
  },

  // -- Cuerpo ----------------------------------------------------------------
  {
    linkId: 'cuerpo',
    grupo: 'cuerpo',
    text: '¿Cuáles de estas te pasan? Marcá todas las que correspondan.',
    multiple: true,
    opciones: [
      {
        code: 'incontinencia-leve',
        display: 'Se me escapa un poco de pis al toser, reírme o hacer fuerza',
        senal: 'barrera:incontinencia-leve',
      },
      { code: 'temor-caidas', display: 'Tengo miedo de caerme', senal: 'barrera:temor-caidas' },
      { code: 'dolor-articular', display: 'Me levanto con las articulaciones rígidas o con dolor', senal: 'barrera:dolor-articular' },
      { code: 'sedentarismo', display: 'Paso muchas horas sentada', senal: 'barrera:sedentarismo' },
      { code: 'estres', display: 'Ando con mucha tensión o estrés', senal: 'clinico:estres-elevado' },
      NINGUNA,
    ],
  },

  // -- Descanso --------------------------------------------------------------
  {
    linkId: 'descanso',
    grupo: 'descanso',
    text: '¿Qué te complica el descanso? Marcá todas las que correspondan.',
    multiple: true,
    opciones: [
      { code: 'sofocos-nocturnos', display: 'Me despierto de calor a la noche', senal: 'barrera:sofocos-nocturnos' },
      { code: 'sofocos-conciliacion', display: 'Los sofocos no me dejan dormirme', senal: 'barrera:sofocos-conciliacion' },
      { code: 'despertares-precoces', display: 'Me despierto muy temprano y no puedo volver a dormirme', senal: 'barrera:despertares-precoces' },
      { code: 'pantallas', display: 'Uso pantallas hasta que me duermo', senal: 'barrera:pantallas-nocturnas' },
      { code: 'fatiga-matutina', display: 'Me levanto cansada aunque haya dormido', senal: 'barrera:fatiga-matutina' },
      { code: 'ansiedad-nocturna', display: 'Me acuesto ansiosa o con palpitaciones', senal: 'barrera:ansiedad-nocturna' },
      { code: 'alcohol-picante', display: 'Suelo cenar con alcohol o comida picante', senal: 'barrera:alcohol-picante' },
      { code: 'horarios-irregulares', display: 'Me acuesto y me levanto a horarios muy distintos', senal: 'barrera:horarios-irregulares' },
      NINGUNA,
    ],
  },

  // -- Organización ----------------------------------------------------------
  {
    linkId: 'organizacion',
    grupo: 'organizacion',
    text: '¿Qué es lo que más te cuesta sostener? Marcá todas las que correspondan.',
    multiple: true,
    opciones: [
      { code: 'falta-de-tiempo', display: 'No me alcanza el tiempo para organizarme', senal: 'barrera:falta-de-tiempo' },
      { code: 'imprevistos', display: 'Cualquier imprevisto me saca del plan', senal: 'barrera:imprevistos' },
      { code: 'ingesta-emocional', display: 'Como por ansiedad o para calmarme', senal: 'barrera:ingesta-emocional' },
      { code: 'olvidos', display: 'Me olvido de hacer lo que me propuse', senal: 'barrera:olvidos' },
      { code: 'frustracion-peso', display: 'La balanza me frustra', senal: 'barrera:frustracion-peso' },
      { code: 'ingesta-impulsiva', display: 'Compro por impulso lo que después como de más', senal: 'barrera:ingesta-impulsiva' },
      NINGUNA,
    ],
  },

  // -- Preferencias ----------------------------------------------------------
  {
    linkId: 'preferencias',
    grupo: 'preferencias',
    text: '¿Qué te viene bien a vos? Marcá todas las que correspondan.',
    multiple: true,
    opciones: [
      { code: 'alta-proteina', display: 'Comidas con buena carga de proteína', senal: 'preferencia:alta-proteina' },
      { code: 'remedios-naturales', display: 'Recursos naturales (infusiones, hierbas)', senal: 'preferencia:remedios-naturales' },
      { code: 'apoyo-social', display: 'Hacerlo acompañada, contándoselo a alguien', senal: 'preferencia:apoyo-social' },
      NINGUNA,
    ],
  },
]);

/** `linkId` y código de la respuesta que indica tratamiento con GLP-1 activo. */
export const GLP1_LINK_ID = 'glp1';
export const GLP1_CODE_SI = 'si';

/** Todas las señales que este cuestionario puede producir. */
export function senalesDelBaseline(): Senal[] {
  const senales = new Set<Senal>();
  for (const pregunta of BASELINE_PREGUNTAS) {
    for (const opcion of pregunta.opciones) {
      if (opcion.senal) {
        senales.add(opcion.senal);
      }
    }
  }
  return [...senales];
}

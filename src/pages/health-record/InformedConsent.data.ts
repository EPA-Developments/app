// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { MARCA } from '../../marca';

/**
 * Contenido del Consentimiento Informado (uno solo para todos los servicios del portal:
 * Plan Bienestar · 100 días y, si la pide, la Segunda Opinión).
 *
 * Marca blanca: el nombre del prestador, el responsable, la dirección y el email salen de
 * `src/marca.ts`. La sección 1 (Tus datos) se completa con los datos de la persona logueada
 * y la firma; el resto del texto se reproduce para su lectura y se guarda en el
 * DocumentReference firmado, con su versión.
 *
 * Versionado: al cambiar el texto, subir `VERSION_CONSENTIMIENTO` y contar en
 * `NOVEDADES_VERSION` qué cambió. Quien firmó una versión anterior lo vuelve a firmar (el
 * portal le avisa en el inicio y en esta pantalla).
 *
 * ⚠️ BORRADOR 2026-10: lo revisan el equipo legal y el médico antes de publicarlo.
 */

export type ConsentBlock =
  | { readonly type: 'p'; readonly text: string }
  | { readonly type: 'sub'; readonly text: string }
  | { readonly type: 'ul'; readonly items: string[] };

export interface ConsentSection {
  /** Para armar las páginas públicas (/legal) sin depender del número. */
  readonly id: 'servicios' | 'alcance' | 'ia' | 'comunicaciones' | 'veracidad' | 'datos' | 'revocacion' | 'declaracion';
  readonly heading: string;
  readonly blocks: ConsentBlock[];
}

/** Versión del texto vigente (AAAA-MM). Quien firmó otra versión lo vuelve a firmar. */
export const VERSION_CONSENTIMIENTO = '2026-10';

/** Qué cambió respecto de la versión anterior (se lo mostramos a quien ya había firmado). */
export const NOVEDADES_VERSION: readonly string[] = [
  'Incluye el Plan Bienestar · 100 días: seguimiento, cuestionarios, mediciones, laboratorios y consultas con tu equipo.',
  'Explica para qué usamos inteligencia artificial: leer tus laboratorios en PDF, sugerir respuestas a tus mensajes (siempre revisadas por el equipo) y el informe de Segunda Opinión.',
  'Detalla qué proveedores procesan tus datos y cómo te escribimos (WhatsApp, correo y Mensajes).',
];

export const consentTitle = 'Consentimiento Informado';
export const consentSubtitle = `Servicios de salud cardiovascular de ${MARCA.nombre}`;
export const consentDatosHeading = '1. Tus datos';

export const consentSections: ConsentSection[] = [
  {
    id: 'servicios',
    heading: '2. Qué servicios incluye',
    blocks: [
      {
        type: 'p',
        text: `${MARCA.nombre}, dirigido por ${MARCA.dirigidoPor}, brinda servicios de prevención y seguimiento de la salud cardiovascular, a distancia y presenciales.`,
      },
      { type: 'sub', text: 'Plan Bienestar · 100 días' },
      {
        type: 'ul',
        items: [
          'Seguimiento de tu salud cardiovascular y metabólica durante 100 días, con un equipo de profesionales de la salud.',
          "Cuestionarios sobre tus hábitos (Life's Essential 8, de la American Heart Association): sueño, alimentación, actividad física y tabaco.",
          'Registro de tus mediciones (peso, presión arterial, cintura) y de tus estudios de laboratorio, con un tablero que muestra tu evolución.',
          'Estimación de tu riesgo cardiovascular (score PREVENT) y de tu estadío cardio-reno-metabólico, con fines orientativos.',
          'Consultas programadas con el equipo, presenciales o por videollamada. Antes de tu primera teleconsulta te pedimos un consentimiento específico.',
          'Mensajes con tu equipo y recordatorios de tus turnos.',
        ],
      },
      { type: 'sub', text: 'Segunda Opinión cardiovascular (solo si la pedís)' },
      {
        type: 'ul',
        items: [
          'Revisión de tu motivo de consulta, antecedentes, medicación y estudios, y un informe de segunda opinión elaborado con apoyo de inteligencia artificial, revisado y validado por un profesional médico.',
        ],
      },
    ],
  },
  {
    id: 'alcance',
    heading: '3. Alcance y limitaciones',
    blocks: [
      { type: 'p', text: 'Comprendo y acepto que:' },
      {
        type: 'ul',
        items: [
          'Estos servicios son de prevención, información y seguimiento: complementan pero NO reemplazan la consulta ni la relación con mi médico tratante.',
          'No son un servicio de urgencias. Ante una emergencia debo ir a la guardia más cercana o llamar al servicio de emergencias de mi zona.',
          'Los resultados dependen de que la información que aporto sea completa y veraz, y de mi participación en el plan.',
          'Las estimaciones de riesgo y los informes no garantizan un diagnóstico definitivo ni un resultado clínico determinado.',
          'Las decisiones sobre mi diagnóstico y mi tratamiento se toman con mi médico o mi equipo tratante.',
        ],
      },
    ],
  },
  {
    id: 'ia',
    heading: '4. Inteligencia artificial',
    blocks: [
      {
        type: 'p',
        text: 'Para prestar estos servicios, la plataforma usa sistemas de inteligencia artificial (proveedor: Anthropic) en estas tareas:',
      },
      {
        type: 'ul',
        items: [
          'Leer los informes de laboratorio que subo en PDF y cargar sus valores en mi historia clínica. Cada PDF lo autorizo al enviarlo.',
          'Sugerirle a mi equipo borradores de respuesta a mis mensajes. Una persona del equipo los revisa antes de enviarlos.',
          'Elaborar el borrador del informe de Segunda Opinión, si la pido. Un profesional médico lo revisa y valida antes de entregármelo.',
        ],
      },
      {
        type: 'ul',
        items: [
          'La inteligencia artificial no toma decisiones sobre mi salud: asiste al equipo, que es el responsable.',
          'El proveedor procesa mi información solo para estas tareas y bajo deber de confidencialidad.',
          'Consiento expresamente este procesamiento asistido por inteligencia artificial.',
        ],
      },
    ],
  },
  {
    id: 'comunicaciones',
    heading: '5. Cómo te contactamos',
    blocks: [
      {
        type: 'ul',
        items: [
          'Me pueden escribir por WhatsApp, por correo electrónico y por los Mensajes del portal para coordinar turnos, enviarme recordatorios y el link de mis teleconsultas, y avisarme de mis resultados.',
          'Para recibir novedades o promociones me pedirán una autorización aparte, que puedo no dar.',
        ],
      },
    ],
  },
  {
    id: 'veracidad',
    heading: '6. Declaración de veracidad',
    blocks: [
      {
        type: 'p',
        text: 'Declaro que la información, los antecedentes y los estudios que aporto son completos y veraces. Entiendo que una omisión o una inexactitud puede afectar la calidad de la atención y de los informes.',
      },
    ],
  },
  {
    id: 'datos',
    heading: '7. Tus datos personales y tu historia clínica',
    blocks: [
      {
        type: 'p',
        text: `Mis datos de salud son datos sensibles (Ley N° 25.326 de Protección de Datos Personales). Doy mi consentimiento expreso para que ${MARCA.nombre} los trate en estas condiciones:`,
      },
      {
        type: 'ul',
        items: [
          'Se usan solo para prestarme estos servicios, con carácter confidencial y con acceso restringido a los profesionales y al personal autorizado.',
          'Forman parte de mi historia clínica digital, de la que soy titular (Ley N° 26.529 de Derechos del Paciente), y se conservan por el plazo que fija la ley.',
          `${MARCA.nombre} no los vende ni los cede. Solo los procesan, bajo deber de confidencialidad, los proveedores tecnológicos necesarios para prestar el servicio: alojamiento de la historia clínica en la nube (Amazon Web Services), inteligencia artificial (Anthropic), mensajería (WhatsApp, de Meta) y pagos (Mercado Pago, solo los datos del pago). Algunos procesan la información fuera de la Argentina, y consiento esa transferencia internacional.`,
          'También pueden comunicarse por requerimiento judicial o de la autoridad sanitaria, en los casos que prevé la ley.',
          `Puedo ejercer mis derechos de acceso, rectificación, actualización y supresión escribiendo a ${MARCA.email}.`,
        ],
      },
      {
        type: 'p',
        text: 'El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los mismos en forma gratuita a intervalos no inferiores a seis meses, salvo que se acredite un interés legítimo al efecto conforme lo establecido en el artículo 14, inciso 3 de la Ley N° 25.326. La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, en su carácter de Órgano de Control de la Ley N° 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de protección de datos personales.',
      },
    ],
  },
  {
    id: 'revocacion',
    heading: '8. Revocación',
    blocks: [
      {
        type: 'p',
        text: `Puedo revocar este consentimiento en cualquier momento escribiendo a ${MARCA.email} o por Mensajes. La revocación interrumpe los servicios que dependen de él, no afecta lo ya realizado y no limita mis derechos como paciente.`,
      },
    ],
  },
  {
    id: 'declaracion',
    heading: '9. Declaración final y consentimiento',
    blocks: [
      { type: 'p', text: 'Yo, el/la abajo firmante, declaro que:' },
      {
        type: 'ul',
        items: [
          'Soy mayor de 18 años.',
          'He leído y comprendido completamente el contenido de este documento.',
          'Pude hacer preguntas (por Mensajes o al equipo) y me las respondieron.',
          `Consiento libre y voluntariamente recibir los servicios de ${MARCA.nombre}, incluido el procesamiento de mi información con apoyo de inteligencia artificial y el tratamiento de mis datos de salud en las condiciones descriptas.`,
          'La información que aporto sobre mi estado de salud es completa y veraz.',
        ],
      },
    ],
  },
];

function secciones(ids: ConsentSection['id'][]): ConsentSection[] {
  return consentSections.filter((s) => ids.includes(s.id));
}

/** Página /legal · términos del servicio: qué servicios incluye y su alcance y limitaciones. */
export const SECCIONES_TERMINOS = secciones(['servicios', 'alcance']);
/** Página /legal · privacidad: inteligencia artificial, comunicaciones y tratamiento de datos (Ley 25.326). */
export const SECCIONES_PRIVACIDAD = secciones(['ia', 'comunicaciones', 'datos', 'revocacion']);

export const consentFooter = `${MARCA.nombre} · ${MARCA.responsable}  |  ${MARCA.direccion}  |  ${MARCA.email}  ·  Powered by EPA Bienestar IA`;

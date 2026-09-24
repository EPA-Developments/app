// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { MARCA } from '../../marca';

/**
 * Contenido del Consentimiento Informado.
 *
 * Marca blanca: el nombre del prestador, el responsable, la dirección y el email salen de
 * `src/marca.ts` (texto idéntico al original con la marca por defecto). La sección 1 (Datos del paciente) se completa dinámicamente con los datos
 * del paciente logueado y la firma; el resto del texto se reproduce para su lectura y se
 * almacena en el DocumentReference firmado.
 *
 * ⚠️ Texto orientativo redactado para un servicio de segunda opinión informativa.
 * Debe ser revisado por el equipo legal/médico antes de producción.
 */

export type ConsentBlock =
  | { readonly type: 'p'; readonly text: string }
  | { readonly type: 'sub'; readonly text: string }
  | { readonly type: 'ul'; readonly items: string[] };

export interface ConsentSection {
  readonly heading: string;
  readonly blocks: ConsentBlock[];
}

export const consentTitle = 'Consentimiento Informado';
export const consentSubtitle = `Servicio de ${MARCA.nombre} cardiovascular`;

export const consentSections: ConsentSection[] = [
  {
    heading: '2. Descripción del servicio',
    blocks: [
      {
        type: 'p',
        text: `${MARCA.nombre} es un servicio de segunda opinión médica cardiovascular dirigido por ${MARCA.dirigidoPor}. Brinda una revisión experta de tu caso a partir de la información clínica y los estudios que vos aportás. El servicio incluye:`,
      },
      {
        type: 'ul',
        items: [
          'Revisión de tu motivo de consulta, antecedentes, medicación y estudios aportados.',
          'Estimación de tu riesgo cardiovascular (score PREVENT), con fines orientativos.',
          'Elaboración de un informe de segunda opinión con apoyo de sistemas de inteligencia artificial, revisado y validado por un profesional médico.',
        ],
      },
      {
        type: 'p',
        text: 'El servicio se presta de forma remota (no presencial) y sobre la base de la información que vos aportás.',
      },
    ],
  },
  {
    heading: '3. Alcance y limitaciones',
    blocks: [
      { type: 'p', text: 'Comprendo y acepto que:' },
      {
        type: 'ul',
        items: [
          'La segunda opinión tiene carácter informativo y orientativo; complementa pero NO reemplaza la consulta ni la relación con mi médico tratante.',
          'No constituye una atención de urgencia. Ante una emergencia debo acudir al servicio de guardia más cercano o llamar a emergencias.',
          'La calidad del informe depende de la veracidad y completitud de la información y los estudios que aporto.',
          'El informe se elabora con apoyo de inteligencia artificial y es revisado por un profesional; no garantiza un diagnóstico definitivo ni un resultado clínico determinado.',
          'La decisión final sobre cualquier conducta diagnóstica o terapéutica debe tomarse junto a mi médico tratante.',
        ],
      },
    ],
  },
  {
    heading: '4. Uso de inteligencia artificial',
    blocks: [
      {
        type: 'p',
        text: 'Para elaborar el informe, mi información clínica es procesada por sistemas de inteligencia artificial (proveedor: Anthropic) sobre infraestructura tecnológica de la plataforma.',
      },
      {
        type: 'ul',
        items: [
          'El procesamiento se realiza con el único fin de generar el informe de segunda opinión.',
          'Un profesional médico revisa y valida el contenido antes de su entrega.',
          'Consiento expresamente este procesamiento asistido por inteligencia artificial.',
        ],
      },
    ],
  },
  {
    heading: '5. Declaración de veracidad',
    blocks: [
      {
        type: 'p',
        text: `Declaro que la información, los antecedentes y los estudios que aporto son completos y veraces. Entiendo que la omisión o inexactitud puede afectar la calidad de la segunda opinión, eximiendo a ${MARCA.nombre} y a sus profesionales de responsabilidad ante dichos eventos.`,
      },
    ],
  },
  {
    heading: '6. Privacidad y tratamiento de datos personales',
    blocks: [
      {
        type: 'p',
        text: `De conformidad con la Ley N° 25.326 de Protección de Datos Personales, ${MARCA.nombre} se compromete a:`,
      },
      {
        type: 'ul',
        items: [
          'Tratar mis datos personales y de salud con carácter confidencial y únicamente para la prestación del servicio.',
          'No ceder, vender ni compartir mi información con terceros, salvo los proveedores tecnológicos necesarios para prestar el servicio (servicios de nube e inteligencia artificial) bajo deber de confidencialidad, o ante requerimiento judicial.',
          'Alojar la información en infraestructura de nube (AWS) con medidas de seguridad acordes.',
          `Garantizar el acceso, la rectificación y la supresión de mis datos mediante solicitud a ${MARCA.email}.`,
        ],
      },
      {
        type: 'p',
        text: `Autorizo a ${MARCA.nombre} a registrar y conservar la información provista en mi historia clínica digital, con acceso restringido a los profesionales autorizados.`,
      },
    ],
  },
  {
    heading: '7. Declaración final y consentimiento',
    blocks: [
      { type: 'p', text: 'Yo, el/la abajo firmante, declaro que:' },
      {
        type: 'ul',
        items: [
          'He leído y comprendido completamente el contenido de este documento.',
          'He tenido la oportunidad de realizar preguntas y todas han sido respondidas satisfactoriamente.',
          `Consiento libre y voluntariamente recibir el servicio de ${MARCA.nombre}, incluido el procesamiento de mi información con apoyo de inteligencia artificial, habiendo sido informado/a de sus características, alcance y limitaciones.`,
          'La información que aporto sobre mi estado de salud es completa y veraz.',
          'Entiendo que puedo revocar este consentimiento en cualquier momento, lo cual implicará la interrupción del servicio, sin afectar mis derechos como usuario.',
        ],
      },
    ],
  },
];

export const consentFooter = `${MARCA.nombre} · ${MARCA.responsable}  |  ${MARCA.direccion}  |  ${MARCA.email}  ·  Powered by EPA Bienestar IA`;

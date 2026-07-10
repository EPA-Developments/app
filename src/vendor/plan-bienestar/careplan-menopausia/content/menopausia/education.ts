import type { EducationTemplate } from '../../model/planTemplate.js';

/**
 * Educational content items for the menopause cardiovascular care plan.
 * Aligned with the EPA Bienestar "Mes del Corazon" material and the AHA
 * menopause / CKM prevention messaging.
 */
export const MENOPAUSE_EDUCATION: EducationTemplate[] = [
  {
    key: 'menopausia-y-corazon',
    title: 'Menopausia y salud del corazon',
    description: 'Por que la transicion menopausica es una ventana clave para cuidar el corazon: cambios en grasa corporal, colesterol y vasos sanguineos.',
  },
  {
    key: 'nutricion',
    title: 'Alimentacion cardiosaludable',
    description: 'Patron DASH / mediterraneo: mas vegetales, legumbres y granos integrales; menos sodio, azucares y ultraprocesados.',
  },
  {
    key: 'actividad-fisica-fuerza',
    title: 'Movimiento y fuerza en la menopausia',
    description: 'Como sumar 150 minutos semanales de actividad aerobica y entrenamiento de fuerza para proteger musculo, hueso y metabolismo.',
  },
  {
    key: 'sueno',
    title: 'Dormir mejor',
    description: 'Higiene del sueno y manejo del insomnio y los despertares nocturnos frecuentes en la menopausia.',
  },
  {
    key: 'estres-vasomotores',
    title: 'Estres y sintomas vasomotores',
    description: 'Tecnicas de relajacion y respiracion para manejar sofocos, estres y bienestar emocional.',
  },
  {
    key: 'cesacion-tabaquica',
    title: 'Dejar el tabaco',
    description: 'Beneficios cardiovasculares de la cesacion y recursos de apoyo para lograrlo.',
  },
  {
    key: 'factores-riesgo-mujer',
    title: 'Factores de riesgo propios de la mujer',
    description: 'Antecedentes que aumentan el riesgo cardiovascular femenino: preeclampsia, diabetes gestacional y menopausia precoz.',
  },
  {
    key: 'salud-osea',
    title: 'Cuidado de los huesos',
    description: 'Calcio, vitamina D y ejercicio de fuerza para prevenir la perdida de masa osea posmenopausica.',
  },
];

import type { ActivityTemplate } from '../../model/planTemplate.js';

/**
 * Action items for the plan. Each becomes a FHIR Task (the "action-items" that
 * FooMedical renders under /care-plan) linked to the CarePlan.
 */
export const MENOPAUSE_ACTIVITIES: ActivityTemplate[] = [
  {
    key: 'cuestionario-cv-menopausia',
    kind: 'monitoreo',
    title: 'Completar el cuestionario de salud cardiovascular en menopausia',
    description: 'Responder el cuestionario inicial para personalizar el plan (etapa, sintomas, antecedentes y habitos).',
    usesQuestionnaire: true,
  },
  {
    key: 'postas-mediciones',
    kind: 'monitoreo',
    title: 'Registrar mediciones en las postas saludables',
    description: 'Cargar peso, altura, circunferencia de cintura y presion arterial en las postas o desde el hogar.',
  },
  {
    key: 'laboratorio-cardiometabolico',
    kind: 'derivacion',
    title: 'Realizar laboratorio cardiometabolico',
    description: 'Perfil lipidico (colesterol total, HDL, LDL, no-HDL, trigliceridos), glucosa en ayunas, HbA1c y relacion albumina/creatinina en orina.',
  },
  {
    key: 'plan-actividad-fisica',
    kind: 'conducta',
    title: 'Seguir el plan de actividad fisica semanal',
    description: '150 minutos semanales de actividad aerobica moderada mas 2 sesiones de fuerza.',
  },
  {
    key: 'higiene-sueno',
    kind: 'conducta',
    title: 'Aplicar habitos de higiene del sueno',
    description: 'Rutina de sueno consistente apuntando a 7-9 horas por noche.',
  },
  {
    key: 'taller-relajacion',
    kind: 'educacion',
    title: 'Participar del taller de relajacion y respiracion',
    description: 'Tecnicas para manejar el estres y los sintomas vasomotores.',
  },
  {
    key: 'interconsulta-equipo',
    kind: 'derivacion',
    title: 'Agendar interconsulta con el equipo de salud',
    description: 'Revisar resultados y ajustar el plan con el equipo interdisciplinario cuando corresponda.',
  },
];

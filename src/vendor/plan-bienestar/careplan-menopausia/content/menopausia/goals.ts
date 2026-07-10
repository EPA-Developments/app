import type { GoalTemplate } from '../../model/planTemplate.js';
import { LOINC } from '../../terminology/loinc.js';

/**
 * SMART-style goals for the menopause cardiovascular care plan.
 *
 * The lifestyle goals map to the AHA "Life's Essential 8" cardiovascular health
 * components. Metabolic/cardiovascular/renal targets follow widely used
 * prevention thresholds and the CKM framework (Ndumele et al., AHA Presidential
 * Advisory 2023). Menopause-specific rationale draws on the AHA Scientific
 * Statement "Menopause Transition and Cardiovascular Disease Risk" (El Khoudary
 * et al., 2020).
 *
 * Thresholds are prevention defaults for a "plan template" (no individual risk
 * engine yet) and should be individualised by the care team.
 */
export const MENOPAUSE_GOALS: GoalTemplate[] = [
  {
    key: 'dieta-cardiosaludable',
    category: 'estilo-de-vida',
    le8Domain: 'dieta',
    description: 'Adoptar un patron alimentario cardiosaludable (tipo DASH o mediterraneo), rico en vegetales, frutas, legumbres, granos integrales y grasas saludables, con bajo consumo de sodio, azucares y ultraprocesados.',
    priority: 'high',
    rationale: 'Life’s Essential 8 (dieta). La transicion menopausica se asocia a cambios adversos en lipidos y distribucion de grasa; el patron alimentario es la base de la prevencion.',
  },
  {
    key: 'actividad-fisica',
    category: 'estilo-de-vida',
    le8Domain: 'actividad-fisica',
    description: 'Realizar al menos 150 minutos por semana de actividad fisica aerobica de intensidad moderada, e incorporar entrenamiento de fuerza 2 veces por semana.',
    target: { comparator: '>=', low: 150, unit: 'min/semana', ucumCode: 'min/wk' },
    priority: 'high',
    rationale: 'Life’s Essential 8 (actividad fisica). El entrenamiento de fuerza es especialmente relevante en menopausia por la perdida de masa muscular y osea.',
  },
  {
    key: 'libre-de-nicotina',
    category: 'estilo-de-vida',
    le8Domain: 'nicotina',
    description: 'Mantenerse libre de tabaco y nicotina; si fuma, iniciar y sostener un plan de cesacion.',
    measure: LOINC.smokingStatus,
    priority: 'high',
    rationale: 'Life’s Essential 8 (exposicion a nicotina). El tabaquismo adelanta la edad de menopausia y multiplica el riesgo cardiovascular.',
  },
  {
    key: 'sueno-saludable',
    category: 'estilo-de-vida',
    le8Domain: 'sueno',
    description: 'Dormir de forma consistente entre 7 y 9 horas por noche con buena higiene del sueno.',
    measure: LOINC.sleepDuration,
    target: { low: 7, high: 9, unit: 'h', ucumCode: 'h' },
    priority: 'medium',
    rationale: 'Life’s Essential 8 (sueno). Los sintomas vasomotores y el insomnio son frecuentes en la menopausia e impactan el riesgo cardiometabolico.',
  },
  {
    key: 'peso-composicion-corporal',
    category: 'estilo-de-vida',
    le8Domain: 'imc',
    description: 'Mantener o alcanzar una circunferencia de cintura menor a 88 cm y un indice de masa corporal en rango saludable.',
    measure: LOINC.waistCircumference,
    target: { comparator: '<', high: 88, unit: 'cm', ucumCode: 'cm' },
    priority: 'high',
    rationale: 'Life’s Essential 8 (IMC) y CKM estadio 1. La menopausia favorece la redistribucion de grasa hacia el abdomen (adiposidad visceral), motor de la progresion CKM.',
  },
  {
    key: 'lipidos',
    category: 'cardiovascular',
    le8Domain: 'lipidos',
    description: 'Mantener el colesterol no-HDL por debajo de 130 mg/dL.',
    measure: LOINC.nonHdlCholesterol,
    target: { comparator: '<', high: 130, unit: 'mg/dL', ucumCode: 'mg/dL' },
    priority: 'high',
    rationale: 'Life’s Essential 8 (lipidos). El perfil lipidico empeora durante la transicion menopausica (aumento de LDL y no-HDL).',
  },
  {
    key: 'glucemia',
    category: 'metabolico',
    le8Domain: 'glucemia',
    description: 'Mantener la glucemia en ayunas por debajo de 100 mg/dL y la HbA1c por debajo de 5.7%.',
    measure: LOINC.hba1c,
    target: { comparator: '<', high: 5.7, unit: '%', ucumCode: '%' },
    priority: 'medium',
    rationale: 'Life’s Essential 8 (glucemia) y CKM estadio 2. La resistencia a la insulina aumenta en la menopausia.',
  },
  {
    key: 'presion-arterial',
    category: 'cardiovascular',
    le8Domain: 'presion-arterial',
    description: 'Mantener la presion arterial en valores optimos, por debajo de 120/80 mmHg.',
    measure: LOINC.systolicBloodPressure,
    target: { comparator: '<', high: 120, unit: 'mmHg', ucumCode: 'mm[Hg]' },
    priority: 'high',
    rationale: 'Life’s Essential 8 (presion arterial). La presion arterial tiende a elevarse tras la menopausia.',
  },
  {
    key: 'salud-renal',
    category: 'renal',
    description: 'Mantener la relacion albumina/creatinina en orina por debajo de 30 mg/g.',
    measure: LOINC.urineAlbuminCreatinineRatio,
    target: { comparator: '<', high: 30, unit: 'mg/g', ucumCode: 'mg/g' },
    priority: 'medium',
    rationale: 'Componente renal del sindrome CKM (Ndumele et al.). La albuminuria es un marcador temprano de dano renal y de riesgo cardiovascular.',
  },
  {
    key: 'bienestar-sintomas',
    category: 'bienestar',
    description: 'Reducir el impacto de los sintomas vasomotores y del estres, y sostener el bienestar emocional durante la transicion menopausica.',
    priority: 'medium',
    rationale: 'Especifico de menopausia. Los sintomas vasomotores frecuentes/persistentes se asocian a peor perfil de riesgo cardiovascular.',
  },
];

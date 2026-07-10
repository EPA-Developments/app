import type { MonitoringTemplate } from '../../model/planTemplate.js';
import { LOINC } from '../../terminology/loinc.js';

/**
 * Observations tracked during the plan. These define WHAT to measure and at
 * what cadence; the actual Observation resources are created when data is
 * captured (postas saludables, laboratorio, apps), out of scope for this
 * template layer.
 */
export const MENOPAUSE_MONITORING: MonitoringTemplate[] = [
  { key: 'peso', label: 'Peso', code: LOINC.bodyWeight, unit: 'kg', frequency: 'mensual' },
  { key: 'altura', label: 'Altura', code: LOINC.bodyHeight, unit: 'cm', frequency: 'basal' },
  { key: 'imc', label: 'Indice de masa corporal', code: LOINC.bmi, unit: 'kg/m2', frequency: 'mensual' },
  { key: 'cintura', label: 'Circunferencia de cintura', code: LOINC.waistCircumference, unit: 'cm', frequency: 'mensual' },
  { key: 'pas', label: 'Presion arterial sistolica', code: LOINC.systolicBloodPressure, unit: 'mmHg', frequency: 'mensual' },
  { key: 'pad', label: 'Presion arterial diastolica', code: LOINC.diastolicBloodPressure, unit: 'mmHg', frequency: 'mensual' },
  { key: 'colesterol-total', label: 'Colesterol total', code: LOINC.totalCholesterol, unit: 'mg/dL', frequency: 'trimestral' },
  { key: 'hdl', label: 'Colesterol HDL', code: LOINC.hdlCholesterol, unit: 'mg/dL', frequency: 'trimestral' },
  { key: 'ldl', label: 'Colesterol LDL', code: LOINC.ldlCholesterol, unit: 'mg/dL', frequency: 'trimestral' },
  { key: 'no-hdl', label: 'Colesterol no-HDL', code: LOINC.nonHdlCholesterol, unit: 'mg/dL', frequency: 'trimestral' },
  { key: 'trigliceridos', label: 'Trigliceridos', code: LOINC.triglycerides, unit: 'mg/dL', frequency: 'trimestral' },
  { key: 'glucosa-ayunas', label: 'Glucosa en ayunas', code: LOINC.fastingGlucose, unit: 'mg/dL', frequency: 'trimestral' },
  { key: 'hba1c', label: 'Hemoglobina glicosilada (HbA1c)', code: LOINC.hba1c, unit: '%', frequency: 'trimestral' },
  { key: 'acr', label: 'Relacion albumina/creatinina en orina', code: LOINC.urineAlbuminCreatinineRatio, unit: 'mg/g', frequency: 'anual' },
  { key: 'pasos', label: 'Pasos diarios', code: LOINC.steps24h, unit: 'pasos/dia', frequency: 'diario' },
  { key: 'sueno', label: 'Horas de sueno', code: LOINC.sleepDuration, unit: 'h', frequency: 'diario' },
  { key: 'tabaquismo', label: 'Estado de consumo de tabaco', code: LOINC.smokingStatus, frequency: 'mensual' },
];

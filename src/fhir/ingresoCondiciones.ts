// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Del grupo «Salud de la mujer» del ingreso a la Condition SNOMED de la etapa de la
// menopausia. Sólo corre con INGRESO_SALUD_MUJER prendida (CuestionarioIngreso.tsx, después
// de crear el QuestionnaireResponse): hasta la firma médica no se llama.
//
// - La etapa sale del código de la opción de `etapa-menstrual` (no del texto, que está a
//   firmar) y va a LIFE_STAGES del core: peri 307409000, pos 76498008, quirúrgica 67207009 y,
//   si la última menstruación fue antes de los 40, prematura 373717006 en lugar de pos.
// - «Menstrúo con regularidad», «No sé» o el grupo sin responder no escriben nada.
// - La Condition se escribe con buildCondition del core, activa, SIN CONFIRMAR (la declara
//   la persona: asserter = el paciente) y con el QuestionnaireResponse como evidencia.
// - Idempotente: busca las Condition del paciente con los 5 SNOMED de menopausia que le
//   permite escribir la AccessPolicy; si ya hay una vigente con el código de la etapa, no
//   escribe otra. Si la etapa cambió, pasa a `inactive` la que había declarado antes.
//
// La AccessPolicy del portal no cambia: ya le deja al paciente escribir Condition con esos
// 5 códigos (docs/medplum/access-policy-paciente-portal.json).
import {
  buildCondition,
  datosDelIngreso,
  LIFE_STAGES,
  SNOMED,
  SYSTEM,
  type WomanLifeStage,
} from '@epa/careplan-menopausia';
import type { MedplumClient } from '@medplum/core';
import { createReference, getReferenceString } from '@medplum/core';
import type { Condition, Patient, QuestionnaireResponse } from '@medplum/fhirtypes';
import { ETAPA_MENSTRUAL } from '../pages/intake.questionnaire';

/**
 * Edad de la última menstruación desde la que la menopausia natural deja de ser prematura.
 * Menos de 40 es prematura (como en Potenciadores); el cuestionario anterior de menopausia
 * usaba 45: unificar el corte está a firmar (8.4, n.º 17).
 */
export const EDAD_MENOPAUSIA_PREMATURA = 40;

/** Los 5 SNOMED de menopausia que el paciente puede escribir (la menopausia «a secas» y las 4 etapas). */
export const CODIGOS_MENOPAUSIA_SNOMED: readonly string[] = [
  SNOMED.menopausePresent.code as string,
  ...Object.values(LIFE_STAGES).map((etapa) => etapa.coding.code as string),
];

/** Los SNOMED que son una etapa (sin la menopausia «a secas», que no es etapa). */
const CODIGOS_ETAPA: ReadonlySet<string> = new Set(Object.values(LIFE_STAGES).map((e) => e.coding.code as string));

const VERIFICACION_DESCARTADA: ReadonlySet<string> = new Set(['refuted', 'entered-in-error']);

/**
 * La etapa que corresponde a lo declarado en el grupo «Salud de la mujer» de esta
 * respuesta, o undefined si no da una etapa (menstrúa con regularidad, no sabe, no
 * respondió, o la respuesta no trae el grupo). Lee con `datosDelIngreso` del core, el mismo
 * lector del perfil del plan. Una menopausia quirúrgica antes de los 40 queda quirúrgica:
 * la edad sólo distingue la natural prematura.
 */
export function etapaDelIngreso(respuesta: QuestionnaireResponse): WomanLifeStage | undefined {
  const datos = datosDelIngreso([respuesta]);
  switch (datos?.etapaMenstrual) {
    case ETAPA_MENSTRUAL.perimenopausia:
      return 'perimenopausia';
    case ETAPA_MENSTRUAL.posmenopausia: {
      const edad = datos.edadUltimaMenstruacion;
      return edad !== undefined && edad > 0 && edad < EDAD_MENOPAUSIA_PREMATURA
        ? 'menopausia-prematura'
        : 'posmenopausia';
    }
    case ETAPA_MENSTRUAL.quirurgica:
      return 'menopausia-quirurgica';
    default:
      return undefined;
  }
}

function codigoSnomed(condition: Condition): string | undefined {
  return condition.code?.coding?.find(
    (c) => c.system === SYSTEM.snomed && c.code && CODIGOS_MENOPAUSIA_SNOMED.includes(c.code)
  )?.code;
}

/** Vigente: activa (o sin estado clínico) y no refutada ni cargada por error. */
function vigente(condition: Condition): boolean {
  const clinico = condition.clinicalStatus?.coding?.[0]?.code;
  const activa = clinico === undefined || clinico === 'active' || clinico === 'recurrence' || clinico === 'relapse';
  return activa && !VERIFICACION_DESCARTADA.has(condition.verificationStatus?.coding?.[0]?.code ?? '');
}

function declaradaPor(condition: Condition, patient: Patient): boolean {
  return condition.asserter?.reference === getReferenceString(patient);
}

export interface EtapaRegistradaDelIngreso {
  /** La etapa declarada, o undefined si lo respondido no da una (no se escribió nada). */
  etapa?: WomanLifeStage;
  /** La Condition vigente con el código de la etapa: la recién creada o la que ya estaba. */
  condition?: Condition;
  /** True si se creó una Condition nueva. */
  creada: boolean;
  /** Las Condition de otra etapa, declaradas antes por la persona, que pasaron a inactive. */
  inactivadas: Condition[];
}

/**
 * Registra la etapa de la menopausia declarada en el ingreso como Condition SNOMED sin
 * confirmar, sin duplicarla, e inactiva la etapa que la persona había declarado antes si
 * cambió. Sólo toca las Condition que declaró la persona (asserter = el paciente): las que
 * cargó el equipo y la menopausia «a secas» (289903006, que escribe el plan anterior) no se
 * inactivan. Llamar sólo con INGRESO_SALUD_MUJER prendida.
 */
export async function registrarEtapaDelIngreso(
  medplum: MedplumClient,
  patient: Patient,
  respuesta: QuestionnaireResponse
): Promise<EtapaRegistradaDelIngreso> {
  const etapa = etapaDelIngreso(respuesta);
  if (!etapa) {
    return { creada: false, inactivadas: [] };
  }
  const codigo = LIFE_STAGES[etapa].coding.code as string;

  const existentes = await medplum.searchResources(
    'Condition',
    {
      subject: getReferenceString(patient),
      code: CODIGOS_MENOPAUSIA_SNOMED.map((c) => `${SYSTEM.snomed}|${c}`).join(','),
      _count: '100',
    },
    { cache: 'no-cache' }
  );
  const vigentes = existentes.filter(vigente);

  let condition = vigentes.find((c) => codigoSnomed(c) === codigo);
  let creada = false;
  if (!condition) {
    const base = buildCondition(LIFE_STAGES[etapa].coding, {
      patient: createReference(patient),
      now: respuesta.authored ?? new Date().toISOString(),
    });
    condition = await medplum.createResource<Condition>({
      ...base,
      verificationStatus: {
        coding: [{ system: SYSTEM.conditionVerStatus, code: 'unconfirmed', display: 'Unconfirmed' }],
      },
      asserter: createReference(patient),
      evidence: [{ detail: [createReference(respuesta)] }],
    });
    creada = true;
  }

  // Primero la nueva y después la anterior: si algo falla en el medio, queda la etapa
  // nueva (la más reciente, que es la que toma el core) y no la persona sin etapa.
  const inactivadas: Condition[] = [];
  for (const anterior of vigentes) {
    const otro = codigoSnomed(anterior);
    if (!otro || otro === codigo || !CODIGOS_ETAPA.has(otro) || !declaradaPor(anterior, patient)) {
      continue;
    }
    inactivadas.push(
      await medplum.updateResource<Condition>({
        ...anterior,
        clinicalStatus: { coding: [{ system: SYSTEM.conditionClinical, code: 'inactive', display: 'Inactive' }] },
      })
    );
  }

  return { etapa, condition, creada, inactivadas };
}

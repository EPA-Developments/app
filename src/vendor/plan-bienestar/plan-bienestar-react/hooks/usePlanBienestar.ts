import {
  BASELINE_QUESTIONNAIRE_URL,
  LIFE_STAGES,
  MENOPAUSE_QUESTIONNAIRE_URL,
  PLAN_DEFINITION_SUFIJO_MENOPAUSIA,
  PLAN_DEFINITION_URL,
  SNOMED,
  SYSTEM,
  buildMenopauseCarePlanBundle,
  buildPb100dCarePlanBundle,
  coincide,
  condicionesDesdeCkm,
  esCarePlanDelPrograma,
  estadioCatalogo,
  evaluateCkmStage,
  extractCkmInput,
  perfilDesdeRespuesta,
  type CkmStage,
  type Condicion,
  type PerfilCatalogo,
} from '@epa/careplan-menopausia';
import { createReference, getReferenceString } from '@medplum/core';
import type {
  Bundle,
  CarePlan,
  Condition,
  Goal,
  Observation,
  Patient,
  QuestionnaireResponse,
  Reference,
  Task,
} from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useCallback, useEffect, useState } from 'react';
import { usePaciente } from '../PlanBienestarContext';

export interface UsePlanBienestarOptions {
  /** Patient override; defaults to provider config or the logged-in profile. */
  patient?: Patient;
  /**
   * Canonical URL of the PlanDefinition to instantiate. Defaults to the single
   * CKM-stage definition of the signed catalog (`pb100d-ckm`); the menopause URL
   * keeps building the menopause plan.
   */
  planDefinitionUrl?: string;
}

export interface PlanBienestar {
  cargando: boolean;
  /** Active CarePlan of the program, if the patient has one (either PlanDefinition). */
  carePlan?: CarePlan;
  /** Action items (FHIR Tasks) of the plan, in plan order. */
  pasos: Task[];
  /** Goals of the plan. */
  metas: Goal[];
  /**
   * True when the CarePlan exists but some of its details (Tasks/Goals) could
   * not be loaded. The plan is still shown.
   */
  errorDetalles: boolean;
  completados: number;
  total: number;
  /**
   * Missing data that stopped the last `empezarPlan` (the CKM stage could not be
   * estimated). Empty while nothing blocked it.
   */
  faltantesParaEmpezar: string[];
  /**
   * Creates the CarePlan + Goals + Tasks for the patient (transaction Bundle).
   * With the PB100D definition it uses the validated CKM stage (the team's
   * `estadio-ckm` Observation) or, failing that, the stage estimated from the
   * record; returns undefined and fills `faltantesParaEmpezar` when there is
   * not enough data for either.
   */
  empezarPlan: () => Promise<CarePlan | undefined>;
  /** Marks a step (Task) as completed / back to requested. */
  completarPaso: (paso: Task, completado?: boolean) => Promise<void>;
  refrescar: () => void;
}

/**
 * Whether a CarePlan belongs to the Plan Bienestar (it instantiates the plan's
 * PlanDefinition). Host apps use it to route the plan's CarePlan to the
 * patient-friendly plan screens instead of a raw FHIR resource view.
 *
 * Reads tolerantly: the given `url` (exact, or `url|version`) and any of the
 * program's PlanDefinitions in any accepted namespace (`esCarePlanDelPrograma`),
 * so plans written with the menopause definition and with `pb100d-ckm` both
 * count. Writing keeps using `url`.
 */
export function esCarePlanDelPlan(carePlan: CarePlan, url: string = PLAN_DEFINITION_URL): boolean {
  const canonicals = carePlan.instantiatesCanonical ?? [];
  return (
    canonicals.some((canonical) => canonical === url || canonical.startsWith(`${url}|`)) ||
    esCarePlanDelPrograma(canonicals)
  );
}

/** Sortable creation date of a CarePlan (created > period.start > lastUpdated). */
function fechaDelPlan(carePlan: CarePlan): string {
  return carePlan.created ?? carePlan.period?.start ?? carePlan.meta?.lastUpdated ?? '';
}

/**
 * Busca en el servidor el CarePlan activo del plan. El mas reciente primero: si
 * quedaron planes viejos de pruebas, gana el nuevo. Lo usan tanto la carga como
 * el alta, para que ambas coincidan en cual es "el" plan.
 */
export async function buscarPlanActivo(
  medplum: ReturnType<typeof useMedplum>,
  paciente: Patient,
  url: string = PLAN_DEFINITION_URL,
): Promise<CarePlan | undefined> {
  const planes = await medplum.searchResources('CarePlan', {
    subject: getReferenceString(paciente),
    status: 'active',
  });
  return planes
    .filter((candidate) => esCarePlanDelPlan(candidate, url))
    .sort((a, b) => fechaDelPlan(b).localeCompare(fechaDelPlan(a)))[0];
}

const CODIGOS_MENOPAUSIA = new Set([
  SNOMED.menopausePresent.code,
  ...Object.values(LIFE_STAGES).map((etapa) => etapa.coding.code),
]);

function condicionActiva(condition: Condition): boolean {
  const estado = condition.clinicalStatus?.coding?.[0]?.code;
  return estado === undefined || estado === 'active' || estado === 'recurrence' || estado === 'relapse';
}

/** Stage validated by the team: the latest `estadio-ckm` Observation (EPA code system). */
export function estadioValidado(observations: Observation[]): { stage: CkmStage; observation: Observation } | undefined {
  const registros = observations
    .filter(
      (o) =>
        o.status !== 'entered-in-error' &&
        (o.code?.coding ?? []).some((c) => c.system === SYSTEM.epa && c.code === 'estadio-ckm'),
    )
    .sort((a, b) => (b.effectiveDateTime ?? b.issued ?? '').localeCompare(a.effectiveDateTime ?? a.issued ?? ''));
  for (const observation of registros) {
    const code = (observation.valueCodeableConcept?.coding ?? []).find((c) => c.system === SYSTEM.epa)?.code ?? '';
    const match = /^estadio-ckm-([0-4])/.exec(code);
    if (match) return { stage: Number(match[1]) as CkmStage, observation };
  }
  return undefined;
}

export type PerfilParaEmpezar =
  | { perfil: PerfilCatalogo; ckmObservation?: Observation; estimado: boolean }
  | { faltantes: string[] };

/**
 * Builds the catalog profile (stage + conditions) of a patient from the record:
 * the validated stage if the team registered one, otherwise the estimate; plus
 * what the record adds (menopause finding, GLP-1 from the baseline questionnaire).
 */
export function perfilParaEmpezar(d: {
  patient: Patient;
  observations: Observation[];
  conditions: Condition[];
  baseline?: QuestionnaireResponse;
}): PerfilParaEmpezar {
  const input = extractCkmInput({ patient: d.patient, observations: d.observations, conditions: d.conditions });
  const resultado = evaluateCkmStage(input);
  const validado = estadioValidado(d.observations);
  const stage = validado?.stage ?? resultado.stage;
  if (stage === undefined) {
    return { faltantes: resultado.faltantes.length ? resultado.faltantes : ['datos básicos (peso, presión, glucemia, lípidos)'] };
  }
  const extras: Condicion[] = [];
  if (d.conditions.some((c) => condicionActiva(c) && (c.code?.coding ?? []).some((k) => k.system === SYSTEM.snomed && CODIGOS_MENOPAUSIA.has(k.code)))) {
    extras.push('menopausia');
  }
  if (perfilDesdeRespuesta(d.baseline).conGlp1) extras.push('toma-glp1');
  return {
    perfil: { estadio: estadioCatalogo(stage), condiciones: condicionesDesdeCkm(resultado, input, extras) },
    ...(validado ? { ckmObservation: validado.observation } : {}),
    estimado: validado === undefined,
  };
}

/**
 * Loads (and lets the patient start) their CarePlan instantiated from the
 * plan's PlanDefinition, plus its Tasks ("pasos") and Goals ("metas").
 */
export function usePlanBienestar(options: UsePlanBienestarOptions = {}): PlanBienestar {
  const medplum = useMedplum();
  const paciente = usePaciente(options.patient);
  const url = options.planDefinitionUrl ?? PLAN_DEFINITION_URL;
  const [version, setVersion] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [carePlan, setCarePlan] = useState<CarePlan | undefined>(undefined);
  const [pasos, setPasos] = useState<Task[]>([]);
  const [metas, setMetas] = useState<Goal[]>([]);
  const [errorDetalles, setErrorDetalles] = useState(false);
  const [faltantesParaEmpezar, setFaltantesParaEmpezar] = useState<string[]>([]);

  const refrescar = useCallback(() => setVersion((current) => current + 1), []);

  useEffect(() => {
    let cancelado = false;

    if (!paciente?.id) {
      setCargando(false);
      setCarePlan(undefined);
      setPasos([]);
      setMetas([]);
      return undefined;
    }

    setCargando(true);
    (async () => {
      const plan = await buscarPlanActivo(medplum, paciente, url).catch(() => undefined);
      if (cancelado) return;

      if (!plan) {
        setCarePlan(undefined);
        setPasos([]);
        setMetas([]);
        setCargando(false);
        return;
      }

      // El plan existe: publicarlo antes de cargar detalles, para que ninguna
      // falla posterior lo haga parecer inexistente ("todavia no empezaste").
      setCarePlan(plan);

      // Tolerante a referencias rotas: un Goal/Task borrado en el servidor no
      // puede tirar abajo la pagina entera (mostramos lo que si existe).
      const [tareas, objetivos] = await Promise.all([
        medplum
          .searchResources('Task', { 'based-on': getReferenceString(plan), _count: '200' })
          .catch(() => [] as Task[]),
        Promise.all(
          (plan.goal ?? [])
            .filter((referencia) => referencia.reference)
            .map((referencia) =>
              medplum.readReference(referencia as Reference<Goal>).catch(() => undefined),
            ),
        ),
      ]);
      if (cancelado) return;

      setPasos(tareas);
      setMetas(objetivos.filter((objetivo) => objetivo !== undefined));
      setErrorDetalles(objetivos.some((objetivo) => objetivo === undefined));
      setCargando(false);
    })().catch(() => {
      if (!cancelado) setCargando(false);
    });

    return () => {
      cancelado = true;
    };
  }, [medplum, paciente, url, version]);

  const empezarPlan = useCallback(async (): Promise<CarePlan | undefined> => {
    if (!paciente?.id) return undefined;

    // Guardia de idempotencia: si el servidor ya tiene un plan activo, usarlo.
    // El estado local puede estar desactualizado (otra pestana, carga fallida);
    // sin esta guardia cada toque de "Empezar mi plan" crea un CarePlan
    // duplicado con todos sus Goals y Tasks.
    const existente = await buscarPlanActivo(medplum, paciente, url).catch(() => undefined);
    if (existente) {
      refrescar();
      return existente;
    }

    const now = new Date().toISOString().slice(0, 10);
    let bundle: Bundle;
    if (coincide(url.split('|')[0], PLAN_DEFINITION_SUFIJO_MENOPAUSIA)) {
      // Plan de menopausia (definicion anterior): preferir el Questionnaire ya
      // publicado en el servidor; bajo politicas de acceso restrictivas los
      // pacientes no pueden crear Questionnaires.
      const cuestionarios = await medplum
        .searchResources('Questionnaire', { url: MENOPAUSE_QUESTIONNAIRE_URL, status: 'active' })
        .catch(() => []);
      const publicado = cuestionarios[0];
      bundle = buildMenopauseCarePlanBundle({
        patient: createReference(paciente),
        planDefinitionUrl: url,
        existingQuestionnaire: publicado ? createReference(publicado) : undefined,
        now,
      });
    } else {
      // PB100D por estadio CKM: el plan se arma con lo que aplica al estadio
      // (validado por el equipo o estimado) y a las condiciones de la persona.
      const ref = getReferenceString(paciente);
      const [observations, conditions, baselines] = await Promise.all([
        medplum.searchResources('Observation', { subject: ref, _count: '200' }).catch(() => [] as Observation[]),
        medplum.searchResources('Condition', { subject: ref, _count: '100' }).catch(() => [] as Condition[]),
        medplum
          .searchResources('QuestionnaireResponse', {
            subject: ref,
            questionnaire: BASELINE_QUESTIONNAIRE_URL,
            _sort: '-_lastUpdated',
            _count: '1',
          })
          .catch(() => [] as QuestionnaireResponse[]),
      ]);
      const armado = perfilParaEmpezar({ patient: paciente, observations, conditions, baseline: baselines[0] });
      if ('faltantes' in armado) {
        setFaltantesParaEmpezar(armado.faltantes);
        return undefined;
      }
      setFaltantesParaEmpezar([]);
      bundle = buildPb100dCarePlanBundle({
        patient: createReference(paciente),
        perfil: armado.perfil,
        planDefinitionUrl: url,
        ckmObservation: armado.ckmObservation,
        now,
      });
    }

    const resultado = (await medplum.executeBatch(bundle)) as Bundle;
    // executeBatch no invalida el cache de busquedas del cliente; sin esto,
    // las relecturas del hook devolverian los resultados vacios cacheados.
    for (const tipo of ['CarePlan', 'Task', 'Goal', 'CareTeam', 'Condition', 'Questionnaire'] as const) {
      medplum.invalidateSearches(tipo);
    }
    const creado = (resultado.entry ?? [])
      .map((entry) => entry.resource)
      .find((resource): resource is CarePlan => resource?.resourceType === 'CarePlan');
    refrescar();
    return creado;
  }, [medplum, paciente, url, refrescar]);

  const completarPaso = useCallback(
    async (paso: Task, completado = true): Promise<void> => {
      await medplum.updateResource<Task>({
        ...paso,
        status: completado ? 'completed' : 'requested',
      });
      refrescar();
    },
    [medplum, refrescar],
  );

  const completados = pasos.filter((paso) => paso.status === 'completed').length;

  return {
    cargando,
    carePlan,
    pasos,
    metas,
    errorDetalles,
    completados,
    total: pasos.length,
    faltantesParaEmpezar,
    empezarPlan,
    completarPaso,
    refrescar,
  };
}

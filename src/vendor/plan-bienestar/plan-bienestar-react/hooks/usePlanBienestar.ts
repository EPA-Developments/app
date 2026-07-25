import {
  MENOPAUSE_PLAN_DEFINITION_URL,
  MENOPAUSE_QUESTIONNAIRE_URL,
  buildMenopauseCarePlanBundle,
} from '@epa/careplan-menopausia';
import { createReference, getReferenceString } from '@medplum/core';
import type { Bundle, CarePlan, Goal, Patient, Task } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import type { MedplumClient } from '@medplum/core';
import { useCallback, useEffect, useState } from 'react';
import { usePaciente } from '../PlanBienestarContext';

export interface UsePlanBienestarOptions {
  /** Patient override; defaults to provider config or the logged-in profile. */
  patient?: Patient;
  /** Canonical URL of the PlanDefinition. Defaults to the menopause plan. */
  planDefinitionUrl?: string;
}

export interface PlanBienestar {
  cargando: boolean;
  /** Active CarePlan instantiated from the PlanDefinition, if the patient has one. */
  carePlan?: CarePlan;
  /** Action items (FHIR Tasks) of the plan, in plan order. */
  pasos: Task[];
  /** Goals of the plan. */
  metas: Goal[];
  /**
   * True when the CarePlan exists but some of its details (Tasks/Goals) could
   * not be loaded — e.g. a restrictive AccessPolicy. The plan is still shown.
   */
  errorDetalles: boolean;
  completados: number;
  total: number;
  /** Creates the CarePlan + Goals + Tasks for the patient (transaction Bundle). */
  empezarPlan: () => Promise<CarePlan | undefined>;
  /** Marks a step (Task) as completed / back to requested. */
  completarPaso: (paso: Task, completado?: boolean) => Promise<void>;
  refrescar: () => void;
}

/**
 * Whether a CarePlan belongs to the Plan Bienestar (it instantiates the plan's
 * PlanDefinition). Host apps use it to route the plan's CarePlan to the
 * patient-friendly plan screens instead of a raw FHIR resource view.
 */
export function esCarePlanDelPlan(carePlan: CarePlan, url: string = MENOPAUSE_PLAN_DEFINITION_URL): boolean {
  return (carePlan.instantiatesCanonical ?? []).some(
    (canonical) => canonical === url || canonical.startsWith(`${url}|`),
  );
}

/** Sortable creation date of a CarePlan (created > period.start > lastUpdated). */
function fechaDelPlan(carePlan: CarePlan): string {
  return carePlan.created ?? carePlan.period?.start ?? carePlan.meta?.lastUpdated ?? '';
}

/**
 * Finds the patient's active CarePlan of the plan on the server. With
 * duplicates (e.g. leftovers from testing), the most recent one wins, so every
 * screen agrees on which plan is "the" plan.
 */
async function buscarPlanActivo(
  medplum: MedplumClient,
  paciente: Patient,
  url: string,
): Promise<CarePlan | undefined> {
  const planes = await medplum.searchResources('CarePlan', {
    subject: getReferenceString(paciente),
    status: 'active',
  });
  return planes
    .filter((candidato) => esCarePlanDelPlan(candidato, url))
    .sort((a, b) => fechaDelPlan(b).localeCompare(fechaDelPlan(a)))[0];
}

/**
 * Loads (and lets the patient start) their CarePlan instantiated from the
 * plan's PlanDefinition, plus its Tasks ("pasos") and Goals ("metas").
 *
 * Loading is fault-tolerant: if the CarePlan exists but its details cannot be
 * read (e.g. AccessPolicy), the plan is still reported (with `errorDetalles`)
 * instead of pretending the patient never started — otherwise the UI would
 * offer "start my plan" again and create duplicates.
 */
export function usePlanBienestar(options: UsePlanBienestarOptions = {}): PlanBienestar {
  const medplum = useMedplum();
  const paciente = usePaciente(options.patient);
  const url = options.planDefinitionUrl ?? MENOPAUSE_PLAN_DEFINITION_URL;
  const [version, setVersion] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [carePlan, setCarePlan] = useState<CarePlan | undefined>(undefined);
  const [pasos, setPasos] = useState<Task[]>([]);
  const [metas, setMetas] = useState<Goal[]>([]);
  const [errorDetalles, setErrorDetalles] = useState(false);

  const refrescar = useCallback(() => setVersion((current) => current + 1), []);

  useEffect(() => {
    let cancelado = false;

    if (!paciente?.id) {
      setCargando(false);
      setCarePlan(undefined);
      setPasos([]);
      setMetas([]);
      setErrorDetalles(false);
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
        setErrorDetalles(false);
        setCargando(false);
        return;
      }

      // El plan existe: mostrarlo aunque después falle la carga de detalles.
      setCarePlan(plan);

      let fallo = false;
      const tareas = await medplum
        .searchResources('Task', { 'based-on': getReferenceString(plan) })
        .catch(() => {
          fallo = true;
          return [] as Task[];
        });

      const resultados = await Promise.allSettled(
        (plan.goal ?? [])
          .filter((referencia) => referencia.reference)
          .map((referencia) => medplum.readReference(referencia as { reference: string })),
      );
      const objetivos: Goal[] = [];
      for (const resultado of resultados) {
        if (resultado.status === 'fulfilled') {
          objetivos.push(resultado.value as Goal);
        } else {
          fallo = true;
        }
      }
      if (cancelado) return;

      setPasos(tareas as Task[]);
      setMetas(objetivos);
      setErrorDetalles(fallo);
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

    // Guardia de idempotencia: si ya hay un plan activo en el servidor, usarlo.
    // El estado local puede estar desactualizado (o su carga pudo haber
    // fallado); sin esta guardia cada toque de "Empezar mi plan" crearía un
    // CarePlan duplicado con todos sus Goals y Tasks.
    const existente = await buscarPlanActivo(medplum, paciente, url).catch(() => undefined);
    if (existente) {
      refrescar();
      return existente;
    }

    // Preferir el Questionnaire ya publicado en el servidor: bajo politicas de
    // acceso restrictivas los pacientes no pueden crear Questionnaires.
    const cuestionarios = await medplum
      .searchResources('Questionnaire', { url: MENOPAUSE_QUESTIONNAIRE_URL, status: 'active' })
      .catch(() => []);
    const publicado = cuestionarios[0];
    const bundle = buildMenopauseCarePlanBundle({
      patient: createReference(paciente),
      planDefinitionUrl: url,
      existingQuestionnaire: publicado ? createReference(publicado) : undefined,
      now: new Date().toISOString().slice(0, 10),
    });
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
    empezarPlan,
    completarPaso,
    refrescar,
  };
}

import { PARAMETROS_CKM, parametrosParaSexo, type ParametroCkm } from '@epa/careplan-menopausia';
import { createReference, getReferenceString } from '@medplum/core';
import type { Observation, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useCallback, useEffect, useState } from 'react';
import { usePaciente } from '../PlanBienestarContext';

export interface ValorParametro {
  parametro: ParametroCkm;
  /** Latest value on record, or undefined if never measured. */
  valor?: number;
  /** effectiveDateTime of the latest value. */
  fecha?: string;
}

export interface DatosCkm {
  cargando: boolean;
  valores: ValorParametro[];
  /** Parameters with no value yet. */
  faltantes: ValorParametro[];
  /** Writes a value as a FHIR Observation for the given parameter. */
  guardar: (parametro: ParametroCkm, valor: number) => Promise<Observation | undefined>;
  refrescar: () => void;
}

export interface UseDatosCkmOptions {
  patient?: Patient;
}

function ultimo(observations: Observation[], code: string): Observation | undefined {
  let mejor: Observation | undefined;
  for (const o of observations) {
    if (!(o.code?.coding ?? []).some((c) => c.code === code)) continue;
    if (o.valueQuantity?.value === undefined) continue;
    const f = o.effectiveDateTime ?? o.issued ?? '';
    const fm = mejor?.effectiveDateTime ?? mejor?.issued ?? '';
    if (!mejor || f >= fm) mejor = o;
  }
  return mejor;
}

/**
 * Reads the patient's latest value for each CKM assessment parameter and lets
 * the patient record new ones (as FHIR Observations with the right LOINC code).
 */
export function useDatosCkm(options: UseDatosCkmOptions = {}): DatosCkm {
  const medplum = useMedplum();
  const paciente = usePaciente(options.patient);
  const [version, setVersion] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [valores, setValores] = useState<ValorParametro[]>([]);

  const refrescar = useCallback(() => setVersion((v) => v + 1), []);
  const parametros = parametrosParaSexo(paciente?.gender === 'male' ? 'male' : 'female');

  useEffect(() => {
    let cancelado = false;
    if (!paciente?.id) {
      setCargando(false);
      setValores(parametros.map((parametro) => ({ parametro })));
      return undefined;
    }
    setCargando(true);
    medplum
      .searchResources('Observation', { subject: getReferenceString(paciente), _count: '200' })
      .then((observations) => {
        if (cancelado) return;
        setValores(
          parametros.map((parametro) => {
            const o = ultimo(observations as Observation[], parametro.loinc.code as string);
            return { parametro, valor: o?.valueQuantity?.value, fecha: o?.effectiveDateTime };
          }),
        );
        setCargando(false);
      })
      .catch(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medplum, paciente, version]);

  const guardar = useCallback(
    async (parametro: ParametroCkm, valor: number): Promise<Observation | undefined> => {
      if (!paciente?.id) return undefined;
      const observation = await medplum.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        category: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/observation-category',
                code: parametro.categoria === 'antropometria' || parametro.categoria === 'presion' ? 'vital-signs' : 'laboratory',
              },
            ],
          },
        ],
        code: { coding: [parametro.loinc], text: parametro.etiqueta },
        subject: createReference(paciente),
        effectiveDateTime: new Date().toISOString(),
        valueQuantity: {
          value: valor,
          unit: parametro.unidad,
          system: parametro.ucum ? 'http://unitsofmeasure.org' : undefined,
          code: parametro.ucum,
        },
      });
      medplum.invalidateSearches('Observation');
      refrescar();
      return observation;
    },
    [medplum, paciente, refrescar],
  );

  const faltantes = valores.filter((v) => v.valor === undefined);

  return { cargando, valores, faltantes, guardar, refrescar };
}

export { PARAMETROS_CKM };

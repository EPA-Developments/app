import { TC } from '@epa/teleconsulta-core';
import type { DocumentReference, Encounter, MedicationRequest, ServiceRequest } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useCallback, useEffect, useState } from 'react';

export interface DocumentosDelTurno {
  /** Consultation reports (PDF) left by the professional. */
  informes: DocumentReference[];
  /** Anything else linked to the appointment (e.g. studies the patient uploaded). */
  adjuntos: DocumentReference[];
  ordenes: ServiceRequest[];
  recetas: MedicationRequest[];
  encounter?: Encounter & { id: string };
  cargando: boolean;
  recargar: () => Promise<void>;
}

export function esInforme(doc: DocumentReference): boolean {
  return (doc.category ?? []).some((c) =>
    (c.coding ?? []).some((k) => k.system === TC.documento && k.code === 'informe-consulta'),
  );
}

/**
 * What a consultation left behind: report PDFs and other documents linked to
 * the appointment, and the orders and prescriptions of its Encounter. Each
 * search fails soft (an AccessPolicy may hide some types).
 */
export function useDocumentosDelTurno(appointmentId: string | undefined): DocumentosDelTurno {
  const medplum = useMedplum();
  const [estado, setEstado] = useState<Omit<DocumentosDelTurno, 'recargar'>>({
    informes: [],
    adjuntos: [],
    ordenes: [],
    recetas: [],
    cargando: true,
  });

  const recargar = useCallback(async () => {
    if (!appointmentId) return;
    const buscar = async <T>(promesa: Promise<T[]>): Promise<T[]> => promesa.catch(() => [] as T[]);
    const opciones = { cache: 'no-cache' as const };
    const [documentos, encounter] = await Promise.all([
      buscar(
        medplum.searchResources('DocumentReference', { related: `Appointment/${appointmentId}` }, opciones),
      ),
      medplum
        .searchOne('Encounter', { appointment: `Appointment/${appointmentId}` }, opciones)
        .catch(() => undefined),
    ]);
    const [ordenes, recetas] = encounter?.id
      ? await Promise.all([
          buscar(medplum.searchResources('ServiceRequest', { encounter: `Encounter/${encounter.id}` }, opciones)),
          buscar(medplum.searchResources('MedicationRequest', { encounter: `Encounter/${encounter.id}` }, opciones)),
        ])
      : [[], []];
    setEstado({
      informes: documentos.filter(esInforme),
      adjuntos: documentos.filter((d) => !esInforme(d)),
      ordenes,
      recetas,
      encounter: encounter?.id ? (encounter as Encounter & { id: string }) : undefined,
      cargando: false,
    });
  }, [medplum, appointmentId]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  return { ...estado, recargar };
}

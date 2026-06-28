// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Modelo de Membresía (eje Cliente) — SOLO LECTURA.
//
// Espeja el modelo que gestiona Recepción (repo `recepcionistas`): los planes del
// paciente son recursos `Coverage` con extensiones Segunda Opinión Médica, y los pagos son
// recursos `Invoice`. El portal NO calcula reglas de negocio ni precios: solo lee
// esos recursos (ya acotados al paciente por la AccessPolicy "Paciente — Portal")
// y arma el saldo para mostrarlo, igual que el panel de la app de recepción.
//
// Las URLs de extensión y la forma del saldo deben coincidir con:
//   recepcionistas/src/fhir/identifiers.ts  (EXT.*)
//   recepcionistas/src/fhir/coverage.ts     (estadoDeCoverage)
//   recepcionistas/src/lib/planes.ts        (saldoPlan)
//   recepcionistas/app/src/lib/panelPlanes.ts (baldes realizadas/próximas/libres)
import type { MedplumClient } from '@medplum/core';
import { getReferenceString } from '@medplum/core';
import type { Appointment, Coverage, Invoice, Patient } from '@medplum/fhirtypes';

const BASE = 'https://segundaopinionmedica.org/fhir';

/** Extensiones Segunda Opinión Médica usadas para leer planes y pagos (deben coincidir con recepción). */
const EXT = {
  tipoCobertura: `${BASE}/StructureDefinition/tipo-cobertura`,
  planCodigo: `${BASE}/StructureDefinition/plan-codigo`,
  sesionesMes: `${BASE}/StructureDefinition/sesiones-mes`,
  sesionesTotal: `${BASE}/StructureDefinition/sesiones-total`,
  sesionesUsadas: `${BASE}/StructureDefinition/sesiones-usadas`,
  cicloMes: `${BASE}/StructureDefinition/ciclo-mes`,
  coberturaUsada: `${BASE}/StructureDefinition/cobertura-usada`,
  esSena: `${BASE}/StructureDefinition/es-sena`,
  medioPago: `${BASE}/StructureDefinition/medio-pago`,
} as const;

export type TipoCobertura = 'membresia' | 'paquete';

const ESTADOS_TURNO_OCULTOS = new Set(['cancelled', 'entered-in-error']);

function extInteger(c: Coverage, url: string): number | undefined {
  return c.extension?.find((e) => e.url === url)?.valueInteger;
}
function extString(c: Coverage, url: string): string | undefined {
  return c.extension?.find((e) => e.url === url)?.valueString;
}

/** Estado base de un plan, leído del Coverage (espeja `estadoDeCoverage` de recepción). */
export interface EstadoPlan {
  tipo: TipoCobertura;
  /** Sesiones del ciclo (membresía) o totales (paquete). */
  total: number;
  usadas: number;
  /** Vencimiento ISO (paquetes). Las membresías no vencen (resetean por ciclo). */
  vencimiento?: string;
  activo: boolean;
}

export function estadoDeCoverage(c: Coverage): EstadoPlan {
  const tipo = (c.extension?.find((e) => e.url === EXT.tipoCobertura)?.valueCode ?? 'membresia') as TipoCobertura;
  const totalUrl = tipo === 'membresia' ? EXT.sesionesMes : EXT.sesionesTotal;
  const total = extInteger(c, totalUrl) ?? 0;
  const usadas = extInteger(c, EXT.sesionesUsadas) ?? 0;
  return { tipo, total, usadas, vencimiento: c.period?.end, activo: c.status === 'active' };
}

/**
 * Saldo de sesiones de un plan, con los tres baldes que ve el paciente:
 *   total = realizadas + próximas + libres
 *   - realizadas: sesiones ya consumidas que NO son turnos futuros.
 *   - próximas:   turnos futuros agendados con este plan (ya descuentan saldo).
 *   - libres:     saldo sin comprometer = lo que falta agendar antes de perderlo.
 */
export interface SaldoSesiones {
  coverageId: string;
  tipo: TipoCobertura;
  planCodigo?: string;
  nombre: string;
  total: number;
  usadas: number;
  restantes: number;
  realizadas: number;
  proximas: number;
  libres: number;
  vencido: boolean;
  agotado: boolean;
  /** Vencimiento ISO (solo paquetes). */
  vencimiento?: string;
  /** Ciclo facturado YYYY-MM (solo membresías). */
  ciclo?: string;
}

/** Etiqueta legible sin depender del catálogo (que vive en recepción). */
function planLabel(tipo: TipoCobertura, planCodigo?: string): string {
  const t = tipo === 'membresia' ? 'Membresía' : 'Paquete';
  return planCodigo ? `${t} · ${planCodigo}` : t;
}

/**
 * Planes activos del paciente con su saldo y consumo resueltos. Lee Coverage
 * (activos) y los Appointment del paciente para contar las sesiones "próximas".
 */
export async function cargarSesiones(medplum: MedplumClient, patient: Patient): Promise<SaldoSesiones[]> {
  const ref = getReferenceString(patient);
  const [coverages, appointments] = await Promise.all([
    medplum.searchResources('Coverage', `beneficiary=${ref}&status=active&_count=50`),
    medplum.searchResources('Appointment', `patient=${ref}&_count=200`),
  ]);

  const now = Date.now();
  const proximasPorCobertura = new Map<string, number>();
  for (const a of appointments as Appointment[]) {
    if (ESTADOS_TURNO_OCULTOS.has(a.status ?? '')) {
      continue;
    }
    if (!a.start || new Date(a.start).getTime() < now) {
      continue;
    }
    const covRef = a.extension?.find((e) => e.url === EXT.coberturaUsada)?.valueString;
    const id = covRef?.startsWith('Coverage/') ? covRef.slice('Coverage/'.length) : undefined;
    if (id) {
      proximasPorCobertura.set(id, (proximasPorCobertura.get(id) ?? 0) + 1);
    }
  }

  const filas: SaldoSesiones[] = [];
  for (const c of coverages as Coverage[]) {
    if (!c.id) {
      continue;
    }
    const estado = estadoDeCoverage(c);
    const restantes = Math.max(estado.total - estado.usadas, 0);
    const vencido = estado.vencimiento ? new Date(estado.vencimiento).getTime() < now : false;
    const planCodigo = extString(c, EXT.planCodigo);
    // Las próximas no pueden superar las usadas (ambas descuentan del saldo).
    const proximas = Math.min(proximasPorCobertura.get(c.id) ?? 0, estado.usadas);
    const realizadas = Math.max(estado.usadas - proximas, 0);

    filas.push({
      coverageId: c.id,
      tipo: estado.tipo,
      planCodigo,
      nombre: planLabel(estado.tipo, planCodigo),
      total: estado.total,
      usadas: estado.usadas,
      restantes,
      realizadas,
      proximas,
      libres: restantes,
      vencido,
      agotado: restantes <= 0,
      vencimiento: estado.vencimiento,
      ciclo: extString(c, EXT.cicloMes),
    });
  }
  return filas;
}

/** Pago/seña del paciente, leído de un Invoice (sin recalcular nada). */
export interface PagoResumen {
  id: string;
  fecha?: string;
  concepto: string;
  total?: number;
  moneda: string;
  estado: NonNullable<Invoice['status']>;
  medioPago?: string;
  esSena: boolean;
}

/** Medio de pago: extensión (señas/planes) o el texto de `paymentTerms` (cobros). */
function medioPagoDeInvoice(inv: Invoice): string | undefined {
  const ext = inv.extension?.find((e) => e.url === EXT.medioPago)?.valueCode;
  if (ext) {
    return ext;
  }
  const m = inv.paymentTerms?.match(/Medio de pago:\s*(.+)/i);
  return m?.[1]?.trim();
}

function toPago(inv: Invoice): PagoResumen {
  const total = inv.totalGross ?? inv.totalNet;
  return {
    id: inv.id ?? '',
    fecha: inv.date,
    concepto: inv.lineItem?.[0]?.chargeItemCodeableConcept?.text ?? 'Cobro',
    total: total?.value,
    moneda: total?.currency ?? 'ARS',
    estado: inv.status ?? 'issued',
    medioPago: medioPagoDeInvoice(inv),
    esSena: inv.extension?.find((e) => e.url === EXT.esSena)?.valueBoolean === true,
  };
}

/** Pagos del paciente (Invoice), del más reciente al más antiguo. */
export async function cargarPagos(medplum: MedplumClient, patient: Patient): Promise<PagoResumen[]> {
  const ref = getReferenceString(patient);
  const invoices = await medplum.searchResources('Invoice', `subject=${ref}&_sort=-date&_count=100`);
  return (invoices as Invoice[]).map(toPago);
}

/** Estado de un Invoice (FHIR R4) → etiqueta en español y color de marca. */
export const ESTADO_PAGO: Record<string, { label: string; color: string }> = {
  draft: { label: 'Borrador', color: 'gray' },
  issued: { label: 'A pagar', color: 'yellow' },
  balanced: { label: 'Pagado', color: 'segundaOpinion' },
  cancelled: { label: 'Anulado', color: 'red' },
  'entered-in-error': { label: 'Error de carga', color: 'red' },
};

/** Formatea un monto en pesos argentinos (sin decimales). */
export function formatARS(value: number | undefined, moneda = 'ARS'): string {
  if (value === undefined) {
    return '—';
  }
  return value.toLocaleString('es-AR', { style: 'currency', currency: moneda, maximumFractionDigits: 0 });
}

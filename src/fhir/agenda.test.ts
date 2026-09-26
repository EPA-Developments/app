// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import type { ActivityDefinition, Appointment, Patient, PractitionerRole, Schedule, Slot, Task } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { indexarDefinicionesFhir } from './__fixtures__/glp1';
import {
  admiteModalidad,
  agruparPorDia,
  agruparPorEspecialidad,
  cargarHorarios,
  dentroDeVentana,
  estadoReservaPortal,
  EXT_AGENDA,
  MENSAJE_RESERVA_NO_DISPONIBLE,
  modalidadesDe,
  nombreSegunModalidad,
  parseConsulta,
  parseConsultaPlan,
  parseProfesional,
  reservarHorario,
  SYSTEM_GRUPO_ESPECIALIDAD,
  SYSTEM_MEDICO,
  SYSTEM_SERVICIO,
  SYSTEM_TASK_TIPO,
  TAREA_CONSULTA_PLAN,
  V3_ACT_CODE,
} from './agenda';

// El MockClient solo filtra por `status`, `start`, `active`, … con las definiciones FHIR indexadas.
beforeAll(() => indexarDefinicionesFhir());

const AMB = { system: V3_ACT_CODE, code: 'AMB', display: 'ambulatory' };
const VR = { system: V3_ACT_CODE, code: 'VR', display: 'virtual' };
const USAGE = 'http://terminology.hl7.org/CodeSystem/usage-context-type';
const ext = (url: string, valueCoding: typeof AMB) => ({ url, valueCoding });

/** Una ActivityDefinition como la que publica el seed de recepcionistas. */
function consulta(codigo: string, nombre: string, opts: { grupo?: [string, string]; modalidades?: ('AMB' | 'VR')[]; precio?: number; plan?: boolean } = {}): ActivityDefinition {
  const mods = opts.modalidades ?? ['AMB', 'VR'];
  return {
    resourceType: 'ActivityDefinition',
    status: 'active',
    name: codigo,
    title: nombre,
    identifier: [{ system: SYSTEM_SERVICIO, value: codigo }],
    topic: opts.grupo ? [{ coding: [{ system: SYSTEM_GRUPO_ESPECIALIDAD, code: opts.grupo[0], display: opts.grupo[1] }], text: opts.grupo[1] }] : [{ text: 'Programa' }],
    useContext: [
      ...mods.map((m) => ({ code: { system: USAGE, code: 'workflow' }, valueCodeableConcept: { coding: [m === 'AMB' ? AMB : VR] } })),
      ...(opts.plan ? [{ code: { system: USAGE, code: 'program' }, valueCodeableConcept: { text: 'Plan Bienestar 100 Días®' } }] : []),
    ],
    extension: [
      { url: EXT_AGENDA.precioArs, valueDecimal: opts.precio ?? 150000 },
      ...(opts.plan ? [{ url: EXT_AGENDA.valorReferenciaArs, valueDecimal: 100000 }] : []),
    ],
  };
}

test('parseConsulta lee código, grupo, precio y modalidades del catálogo', () => {
  const c = parseConsulta(consulta('CARDIOLOGIA', 'Consulta de Cardiología', { grupo: ['cardiologia', 'Cardiología'] }))!;
  expect(c).toMatchObject({
    codigo: 'CARDIOLOGIA',
    nombre: 'Consulta de Cardiología',
    grupo: 'cardiologia',
    grupoNombre: 'Cardiología',
    precioARS: 150000,
    modalidades: ['presencial', 'teleconsulta'],
    incluidaEnPlan: false,
  });
  const plan = parseConsulta(consulta('CONSULTA_PB100D', 'Consulta del Plan Bienestar', { precio: 0, plan: true }))!;
  expect(plan).toMatchObject({ incluidaEnPlan: true, precioARS: 0, valorReferenciaARS: 100000 });
  expect(plan.grupo).toBeUndefined();
  expect(parseConsulta({ resourceType: 'ActivityDefinition', status: 'active', title: 'Otra cosa' })).toBeUndefined();
  expect(nombreSegunModalidad('Consulta de Cardiología', 'teleconsulta')).toBe('Teleconsulta de Cardiología');
  expect(nombreSegunModalidad('Consulta de Cardiología', 'presencial')).toBe('Consulta de Cardiología');
});

test('agruparPorEspecialidad deja afuera la consulta del plan y las que no tienen la modalidad', () => {
  const catalogo = [
    parseConsulta(consulta('CONSULTA_PB100D', 'Consulta del Plan Bienestar', { precio: 0, plan: true }))!,
    parseConsulta(consulta('CARDIOLOGIA', 'Consulta de Cardiología', { grupo: ['cardiologia', 'Cardiología'] }))!,
    parseConsulta(consulta('HEMODINAMIA', 'Consulta de Hemodinamia', { grupo: ['cardiologia-especialidad', 'Cardiología con especialidad'], modalidades: ['AMB'] }))!,
  ];
  const tele = agruparPorEspecialidad(catalogo, 'teleconsulta');
  expect(tele.map((g) => g.nombre)).toEqual(['Cardiología']);
  expect(tele[0]!.consultas.map((c) => c.codigo)).toEqual(['CARDIOLOGIA']);
  const presencial = agruparPorEspecialidad(catalogo, 'presencial');
  expect(presencial.map((g) => g.grupo)).toEqual(['cardiologia', 'cardiologia-especialidad']);
});

test('parseConsultaPlan y dentroDeVentana: la tarea del plan y su ventana (hora de Argentina)', () => {
  const tarea: Task = {
    resourceType: 'Task',
    id: 't-mitad',
    status: 'requested',
    intent: 'order',
    code: { coding: [{ system: SYSTEM_TASK_TIPO, code: TAREA_CONSULTA_PLAN }] },
    input: [
      { type: { text: 'consulta' }, valueCode: 'mitad' },
      { type: { text: 'dia' }, valueInteger: 50 },
    ],
    restriction: { period: { start: '2026-11-07', end: '2026-11-21' } },
  };
  const c = parseConsultaPlan(tarea)!;
  expect(c).toMatchObject({ taskId: 't-mitad', clave: 'mitad', titulo: 'Consulta del día 50', estado: 'por-agendar', ventana: { desde: '2026-11-07', hasta: '2026-11-21' } });
  expect(dentroDeVentana(new Date('2026-11-07T01:00:00-03:00'), c.ventana)).toBe(true);
  expect(dentroDeVentana(new Date('2026-11-21T23:30:00-03:00'), c.ventana)).toBe(true);
  expect(dentroDeVentana(new Date('2026-11-22T00:30:00-03:00'), c.ventana)).toBe(false);
  // Un turno del día 6 a las 23:00 de Argentina es 02:00Z del 7: sigue siendo el 6 (afuera).
  expect(dentroDeVentana(new Date('2026-11-07T02:00:00Z'), c.ventana)).toBe(false);
  const agendada = parseConsultaPlan({ ...tarea, status: 'completed', output: [{ type: { text: 'turno' }, valueReference: { reference: 'Appointment/a1' } }] })!;
  expect(agendada).toMatchObject({ estado: 'agendada', appointmentRef: 'Appointment/a1' });
  expect(parseConsultaPlan({ ...tarea, code: { text: 'otra' } })).toBeUndefined();
});

test('parseProfesional lee código, nombre, especialidad, consultas y modalidades del PractitionerRole', () => {
  const rol: PractitionerRole = {
    resourceType: 'PractitionerRole',
    active: true,
    identifier: [{ system: SYSTEM_MEDICO, value: 'ROL_MED_GOLD' }],
    practitioner: { reference: 'Practitioner/x', display: 'Dra. Mariana Andrea Gold' },
    specialty: [{ text: 'Clínica Médica' }],
    code: [{ coding: [{ system: SYSTEM_SERVICIO, code: 'CONSULTA_PB100D' }] }],
    extension: [ext(EXT_AGENDA.modalidad, AMB), ext(EXT_AGENDA.modalidad, VR)],
  };
  expect(parseProfesional(rol)).toEqual({
    codigo: 'MED_GOLD',
    nombre: 'Dra. Mariana Andrea Gold',
    especialidad: 'Clínica Médica',
    modalidades: ['presencial', 'teleconsulta'],
    servicios: ['CONSULTA_PB100D'],
  });
  expect(parseProfesional({ ...rol, active: false })).toBeUndefined();
});

test('modalidadesDe / admiteModalidad: una franja sin marca admite las dos', () => {
  const soloTele: Slot = { resourceType: 'Slot', status: 'free', schedule: { reference: 'Schedule/s' }, start: '', end: '', extension: [ext(EXT_AGENDA.modalidad, VR)] };
  expect(modalidadesDe(soloTele)).toEqual(['teleconsulta']);
  expect(admiteModalidad(soloTele, 'teleconsulta')).toBe(true);
  expect(admiteModalidad(soloTele, 'presencial')).toBe(false);
  expect(admiteModalidad({ extension: [] }, 'presencial')).toBe(true);
});

test('agruparPorDia agrupa en hora de Argentina y ordena', () => {
  const h = (iso: string) => ({ slotId: iso, inicio: new Date(iso), fin: new Date(iso) });
  const dias = agruparPorDia([h('2026-09-29T21:30:00Z'), h('2026-09-28T21:00:00Z'), h('2026-09-29T02:30:00Z')]);
  // 28/09 18:00 y 23:30 ART (02:30Z del 29 sigue siendo el 28 en Argentina); 29/09 18:30.
  expect(dias.map((d) => d.dia)).toEqual(['2026-09-28', '2026-09-29']);
  expect(dias[0]!.horarios.map((x) => x.slotId)).toEqual(['2026-09-28T21:00:00Z', '2026-09-29T02:30:00Z']);
});

test('estadoReservaPortal: tentativo con link, vencido, y cancelado por vencimiento', () => {
  const ahora = new Date('2026-09-25T12:00:00Z');
  const base: Appointment = { resourceType: 'Appointment', status: 'pending', participant: [] };
  const tentativo = {
    ...base,
    extension: [
      { url: EXT_AGENDA.reservaExpira, valueDateTime: '2026-09-25T12:30:00Z' },
      { url: EXT_AGENDA.linkPagoSena, valueUrl: 'https://mp.test/pagar' },
    ],
  };
  expect(estadoReservaPortal(tentativo, ahora)).toEqual({ estado: 'tentativo', expira: new Date('2026-09-25T12:30:00Z'), linkPago: 'https://mp.test/pagar' });
  expect(estadoReservaPortal(tentativo, new Date('2026-09-25T12:31:00Z'))).toMatchObject({ estado: 'vencido' });
  expect(estadoReservaPortal({ ...tentativo, status: 'cancelled' }, ahora)).toMatchObject({ estado: 'cancelado-por-vencimiento' });
  // Un tentativo de Recepción (sin vencimiento ni link) no es una reserva del portal.
  expect(estadoReservaPortal(base, ahora)).toBeUndefined();
  expect(estadoReservaPortal({ ...base, status: 'booked' }, ahora)).toBeUndefined();
});

test('cargarHorarios: solo las franjas libres del profesional que admiten la modalidad, desde ahora', async () => {
  const medplum = new MockClient();
  const agenda = await medplum.createResource<Schedule>({
    resourceType: 'Schedule',
    identifier: [{ system: SYSTEM_MEDICO, value: 'SCH_MED_TEST' }],
    actor: [{ display: 'Dra. Prueba' }],
  });
  const ahora = new Date('2026-09-25T12:00:00Z');
  const franja = (start: string, end: string, status: Slot['status'], mods: (typeof AMB)[]) =>
    medplum.createResource<Slot>({
      resourceType: 'Slot',
      status,
      schedule: { reference: `Schedule/${agenda.id}` },
      start,
      end,
      extension: [{ url: EXT_AGENDA.profesional, valueString: 'MED_TEST' }, ...mods.map((m) => ext(EXT_AGENDA.modalidad, m))],
    });
  const ambas = await franja('2026-09-28T21:00:00Z', '2026-09-28T21:30:00Z', 'free', [AMB, VR]);
  const soloTele = await franja('2026-09-28T21:30:00Z', '2026-09-28T22:00:00Z', 'free', [VR]);
  await franja('2026-09-28T22:00:00Z', '2026-09-28T22:30:00Z', 'busy', [AMB, VR]);
  await franja('2026-09-24T21:00:00Z', '2026-09-24T21:30:00Z', 'free', [AMB, VR]); // pasada

  const presencial = await cargarHorarios(medplum, { codigo: 'MED_TEST' }, 'presencial', { ahora });
  expect(presencial.map((h) => h.slotId)).toEqual([ambas.id]);
  const tele = await cargarHorarios(medplum, { codigo: 'MED_TEST' }, 'teleconsulta', { ahora });
  expect(tele.map((h) => h.slotId)).toEqual([ambas.id, soloTele.id]);
  // Con la ventana de una consulta del plan que no incluye ese día: nada.
  expect(await cargarHorarios(medplum, { codigo: 'MED_TEST' }, 'teleconsulta', { ahora, ventana: { desde: '2026-10-01' } })).toEqual([]);
  // Un profesional sin agenda: nada.
  expect(await cargarHorarios(medplum, { codigo: 'MED_NADIE' }, 'teleconsulta', { ahora })).toEqual([]);
});

test('reservarHorario sin el bot desplegado no escribe nada y lo dice', async () => {
  const medplum = new MockClient();
  const patient = await medplum.createResource<Patient>({ resourceType: 'Patient' });
  const r = await reservarHorario(medplum, patient, { servicioCodigo: 'CARDIOLOGIA', slotId: 's1', modalidad: 'teleconsulta' });
  expect(r).toEqual({ ok: false, mensaje: MENSAJE_RESERVA_NO_DISPONIBLE });
  expect(await medplum.searchResources('Appointment', 'status=pending')).toHaveLength(0);
});

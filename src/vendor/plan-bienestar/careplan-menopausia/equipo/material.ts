import type { CarePlan, Goal, Patient, Task } from '@medplum/fhirtypes';
import { PB100D_DURACION_DIAS, PB100D_NOMBRE } from '../contrato/pb100d.js';
import { MOMENTO_LABEL, type Momento } from '../model/catalogo.js';
import { CONTROLES, controlActual, diaDelPlan, fechaDelControl, momentosDeTask, type MomentoControl } from './momentos.js';
import { pasosDeLaPersona } from './seguimiento.js';

/**
 * Material para el paciente: los pasos del plan clínico ordenados por momento, listos
 * para imprimir, y el aviso por WhatsApp con los próximos pasos y el enlace al portal.
 * Lógica pura: mandar el mensaje es de la app anfitriona (Recepción lo hace con sus
 * plantillas aprobadas; sin eso, queda el enlace `wa.me` y copiar el texto).
 */
export interface PasoMaterial {
  codigo?: string;
  titulo: string;
  texto?: string;
  momentos: Momento[];
  completado: boolean;
}

export interface SeccionMaterial {
  momento: Momento;
  titulo: string;
  pasos: PasoMaterial[];
}

export interface MetaMaterial {
  nombre: string;
  valor?: string;
}

export interface MaterialPersona {
  nombre: string;
  telefono?: string;
  enlaceWhatsApp?: string;
  textoWhatsApp: string;
  /** Todo el plan en texto plano (para imprimir o pegar). */
  textoImprimible: string;
  secciones: SeccionMaterial[];
  metas: MetaMaterial[];
  inicio?: string;
  dia?: number;
  /** Fechas de los controles del plan clínico. */
  controles: { momento: MomentoControl; fecha: string }[];
  /** Los pasos que van en el WhatsApp (pendientes del momento actual y continuos). */
  proximos: PasoMaterial[];
}

/** Orden de las secciones del material: primero lo de ahora, después los controles. */
const ORDEN_MOMENTOS: Momento[] = ['dia-0', 'continuo', 'semanal', 'mensual', 'dia-30', 'dia-60', 'dia-100', 'evento'];

/** Nombre de pila y apellido de la persona ("María Adela Bianchi"). */
export function nombreDe(patient: Patient | undefined): string {
  const n = patient?.name?.[0];
  if (!n) return 'Paciente';
  return n.text ?? [n.given?.join(' '), n.family].filter(Boolean).join(' ') ?? 'Paciente';
}

/** Código de país que `telefonoWhatsApp` supone cuando no se le pasa otro: Argentina. */
export const CODIGO_PAIS_WHATSAPP = '54';

export interface OpcionesTelefonoWhatsApp {
  /**
   * Código de país E.164 (sin `+`; se toleran `+` y espacios) que se antepone a un número
   * que no lo trae. Default `54` (Argentina, `CODIGO_PAIS_WHATSAPP`).
   */
  codigoPais?: string;
}

/** Largo de un número E.164 completo (código de país incluido), en dígitos. */
const E164_MIN_DIGITOS = 8;
const E164_MAX_DIGITOS = 15;

/**
 * El teléfono de la persona en formato E.164 sin `+`, para `wa.me`. Toma el celular
 * (`use: mobile`) o, si no hay, el primer teléfono.
 *
 * - Con `codigoPais` `54` (el default) el número se lee como argentino: sin código de país
 *   se le antepone `549` (celular) y se le sacan el 0 de larga distancia y el 15; con `54`
 *   y sin el 9 del celular, se le agrega.
 * - Con otro `codigoPais` no se agrega ningún 9: un número escrito con `+` o `00` ya es
 *   internacional y queda como está (sin el `00`); si ya empieza con el código, también;
 *   si no, se le saca el 0 inicial de larga distancia y se le antepone el código.
 *
 * Es una normalización, no una validación del número: la app anfitriona que tenga el
 * número validado debería pasarlo así, y la que atiende fuera de Argentina pasa su código
 * (en el menú del equipo, `integracion.codigoPais`).
 */
export function telefonoWhatsApp(patient: Patient | undefined, opciones: OpcionesTelefonoWhatsApp = {}): string | undefined {
  const telefonos = (patient?.telecom ?? []).filter((t) => t.system === 'phone' && t.value);
  const preferido = telefonos.find((t) => t.use === 'mobile') ?? telefonos[0];
  if (!preferido?.value) return undefined;
  const codigoPais = (opciones.codigoPais ?? CODIGO_PAIS_WHATSAPP).replace(/\D/g, '') || CODIGO_PAIS_WHATSAPP;
  const digitos = preferido.value.replace(/\D/g, '');
  if (codigoPais === CODIGO_PAIS_WHATSAPP) return telefonoArgentino(digitos);
  return telefonoConCodigo(digitos, codigoPais, preferido.value.trim().startsWith('+'));
}

/** Argentina: celular con `549`. */
function telefonoArgentino(numero: string): string | undefined {
  let digitos = numero;
  if (digitos.startsWith('00')) digitos = digitos.slice(2);
  if (digitos.startsWith('54')) {
    if (!digitos.startsWith('549') && digitos.length === 12) digitos = `549${digitos.slice(2)}`;
    return digitos;
  }
  if (digitos.startsWith('0')) digitos = digitos.slice(1);
  if (digitos.startsWith('15')) digitos = digitos.slice(2);
  return digitos.length >= 8 ? `549${digitos}` : undefined;
}

/** Otro país: E.164 con el código de país, sin agregar ningún 9. */
function telefonoConCodigo(numero: string, codigoPais: string, conMas: boolean): string | undefined {
  let digitos = numero;
  const con00 = digitos.startsWith('00');
  if (con00) digitos = digitos.slice(2);
  if (!conMas && !con00 && !digitos.startsWith(codigoPais)) {
    if (digitos.startsWith('0')) digitos = digitos.slice(1);
    digitos = `${codigoPais}${digitos}`;
  }
  return digitos.length >= E164_MIN_DIGITOS && digitos.length <= E164_MAX_DIGITOS ? digitos : undefined;
}

export function enlaceWhatsApp(telefono: string, texto: string): string {
  return `https://wa.me/${telefono}?text=${encodeURIComponent(texto)}`;
}

function tituloDe(task: Task): string {
  return task.code?.text ?? task.code?.coding?.find((k) => k.display)?.display ?? task.description ?? 'Paso del plan';
}

/** Los pasos del plan clínico de la persona como material (título, texto, momentos). */
export function pasosMaterial(tasks: Task[]): PasoMaterial[] {
  return pasosDeLaPersona(tasks)
    .filter((t) => t.status !== 'cancelled' && t.status !== 'rejected' && t.status !== 'entered-in-error')
    .map((t) => {
      const codigo = t.code?.coding?.find((k) => k.code && /^E\d-/u.test(k.code))?.code;
      const texto = t.description;
      return {
        ...(codigo ? { codigo } : {}),
        titulo: tituloDe(t),
        ...(texto && texto !== tituloDe(t) ? { texto } : {}),
        momentos: momentosDeTask(t),
        completado: t.status === 'completed',
      };
    });
}

/** Los pasos agrupados por su primer momento, en el orden del material. */
export function seccionesMaterial(pasos: PasoMaterial[]): SeccionMaterial[] {
  return ORDEN_MOMENTOS.map((momento) => ({
    momento,
    titulo: MOMENTO_LABEL[momento],
    pasos: pasos.filter((p) => (p.momentos[0] ?? 'continuo') === momento),
  })).filter((s) => s.pasos.length > 0);
}

/** Las metas del plan como las ve la persona ("Presión: menos de 130/80"). */
export function metasMaterial(goals: Goal[]): MetaMaterial[] {
  return goals
    .filter((g) => g.lifecycleStatus !== 'cancelled' && g.lifecycleStatus !== 'rejected' && g.lifecycleStatus !== 'entered-in-error')
    .map((g) => {
      const texto = g.description?.text ?? '';
      const [nombre, ...resto] = texto.split(': ');
      return { nombre: nombre || 'Meta', ...(resto.length ? { valor: resto.join(': ') } : {}) };
    });
}

export interface TextoWhatsAppOpciones {
  nombre: string;
  proximos: PasoMaterial[];
  dia?: number;
  urlPortal?: string;
}

/** El aviso por WhatsApp: saludo, próximos pasos y el portal. Corto, sin datos clínicos. */
export function textoWhatsAppMaterial(o: TextoWhatsAppOpciones): string {
  const lineas: string[] = [`Hola ${o.nombre.split(' ')[0] ?? o.nombre}!`];
  if (o.dia !== undefined && o.dia > 0) {
    lineas.push(`Vas por el día ${o.dia} de ${PB100D_DURACION_DIAS} de tu ${PB100D_NOMBRE}.`);
  } else {
    lineas.push(`Empezó tu ${PB100D_NOMBRE}.`);
  }
  if (o.proximos.length > 0) {
    lineas.push('Tus próximos pasos:');
    for (const p of o.proximos) lineas.push(`• ${p.titulo}`);
  }
  if (o.urlPortal) lineas.push(`Los ves completos en tu portal: ${o.urlPortal}`);
  lineas.push('Cualquier duda, escribinos por acá.');
  return lineas.join('\n');
}

function textoImprimible(m: Omit<MaterialPersona, 'textoImprimible'>): string {
  const lineas: string[] = [`${PB100D_NOMBRE} · ${m.nombre}`];
  if (m.inicio) lineas.push(`Inicio: ${m.inicio}${m.dia !== undefined ? ` · día ${m.dia} de ${PB100D_DURACION_DIAS}` : ''}`);
  if (m.controles.length) lineas.push(`Controles: ${m.controles.map((c) => `${MOMENTO_LABEL[c.momento]} ${c.fecha}`).join(' · ')}`);
  if (m.metas.length) {
    lineas.push('', 'Tus metas');
    for (const meta of m.metas) lineas.push(`- ${meta.nombre}${meta.valor ? `: ${meta.valor}` : ''}`);
  }
  for (const s of m.secciones) {
    lineas.push('', s.titulo);
    for (const p of s.pasos) {
      lineas.push(`${p.completado ? '[x]' : '[ ]'} ${p.titulo}`);
      if (p.texto) lineas.push(`    ${p.texto}`);
    }
  }
  return lineas.join('\n');
}

export interface ContextoMaterial {
  patient?: Patient;
  carePlan?: CarePlan;
  tasks?: Task[];
  goals?: Goal[];
  hoy?: string;
  /** URL del portal de la persona, para el aviso. */
  urlPortal?: string;
  /** Cuántos pasos van en el WhatsApp (default 5). */
  maximoProximos?: number;
  /** Código de país para el teléfono de WhatsApp (`telefonoWhatsApp`; default `54`, Argentina). */
  codigoPais?: string;
}

/** El material de la persona: pasos por momento, metas, controles, aviso por WhatsApp e impresión. */
export function materialParaLaPersona(ctx: ContextoMaterial): MaterialPersona {
  const hoy = ctx.hoy ?? new Date().toISOString().slice(0, 10);
  const nombre = nombreDe(ctx.patient);
  const telefono = telefonoWhatsApp(ctx.patient, ctx.codigoPais !== undefined ? { codigoPais: ctx.codigoPais } : {});
  const pasos = pasosMaterial(ctx.tasks ?? []);
  const secciones = seccionesMaterial(pasos);
  const metas = metasMaterial(ctx.goals ?? []);
  const inicio = (ctx.carePlan?.period?.start ?? ctx.carePlan?.created)?.slice(0, 10);
  const dia = inicio ? diaDelPlan(inicio, hoy) : undefined;
  const controles = inicio ? CONTROLES.filter((c) => c.momento !== 'dia-0').map((c) => ({ momento: c.momento, fecha: fechaDelControl(inicio, c.momento) })) : [];
  const actual: Momento = dia === undefined ? 'dia-0' : controlActual(dia).momento;
  const proximos = pasos
    .filter((p) => !p.completado && (p.momentos.includes(actual) || p.momentos.includes('continuo') || p.momentos.includes('semanal')))
    .slice(0, ctx.maximoProximos ?? 5);
  const textoWhatsApp = textoWhatsAppMaterial({ nombre, proximos, ...(dia !== undefined ? { dia } : {}), ...(ctx.urlPortal ? { urlPortal: ctx.urlPortal } : {}) });
  const base = {
    nombre,
    ...(telefono ? { telefono, enlaceWhatsApp: enlaceWhatsApp(telefono, textoWhatsApp) } : {}),
    textoWhatsApp,
    secciones,
    metas,
    ...(inicio ? { inicio } : {}),
    ...(dia !== undefined ? { dia } : {}),
    controles,
    proximos,
  };
  return { ...base, textoImprimible: textoImprimible(base) };
}

/**
 * Contrato PB100D — los identificadores que los cuatro repos tienen que compartir.
 *
 * El Plan Bienestar 100 Días no vive en un repo: la paciente lo ve en el portal
 * (`app`), el cardiólogo lo genera y publica en el `dashboard`, Recepción lo
 * cobra en `recepcionistas`, y el contenido clínico sale de este monorepo.
 * Los cuatro se hablan **sólo** a través de recursos FHIR, así que cada URL,
 * código y constante que aparece en esos recursos es una interfaz pública.
 *
 * Este archivo es esa interfaz, declarada una sola vez.
 *
 * POR QUÉ HACÍA FALTA
 * -------------------
 * Los mismos valores estaban escritos por separado en cada repo: la duración de
 * 100 días en seis lugares, el código del programa en cinco, la URL canónica de
 * la PlanDefinition en tres. Nada los mantenía iguales.
 *
 * Y ese desacuerdo no falla ruidosamente: falla en silencio. Si el dashboard
 * escribe `instantiatesCanonical` con una URL y el portal busca otra, el plan
 * queda activo del lado del médico y la paciente sigue viendo "todavía no
 * empezaste". No hay excepción, no hay log, nadie se entera hasta que alguien
 * reclama.
 *
 * ESCRIBIR CANÓNICO, LEER TOLERANTE
 * ---------------------------------
 * El ecosistema arrastra tres namespaces de cuando cada pieza nació por su
 * lado: `epa-bienestar.ar`, `segundaopinionmedica.org` y
 * `seguimiento.medplum.com.ar`. Los datos ya escritos con los viejos no se pueden
 * reescribir de un día para el otro.
 *
 * La salida es asimétrica y deliberada:
 *
 *   - al **escribir** se usa siempre `BASE_CANONICA` — así lo nuevo converge;
 *   - al **leer** se aceptan todos los namespaces (`coincide`, `buscarExtension`)
 *     — así lo viejo se sigue entendiendo.
 *
 * Con el tiempo la lectura tolerante deja de hacer falta, y recién ahí se puede
 * podar `BASES_ACEPTADAS`. Mientras tanto, nadie tiene que elegir entre migrar
 * todo de golpe o vivir con datos rotos.
 *
 * SIN DEPENDENCIAS A PROPÓSITO
 * ----------------------------
 * No importa nada, ni siquiera tipos de FHIR: se copia tal cual a cada repo que
 * lo consume. Cada consumidor tiene un test que compara sus constantes locales
 * contra este archivo, así una divergencia rompe el build en vez de romper el
 * circuito en producción.
 */

// ---------------------------------------------------------------------------
// El programa
// ---------------------------------------------------------------------------

/** Código de catálogo del programa. */
export const PB100D_CODIGO = 'PB100D';

/** Nombre comercial. Va en el ítem del Invoice y en el título del plan. */
export const PB100D_NOMBRE = 'Plan Bienestar 100 Días';

/** Duración del programa y de la cobertura, en días. */
export const PB100D_DURACION_DIAS = 100;

/**
 * Días del programa en que se evalúa a la paciente.
 *
 * Día 0 es el alta; día 100 el cierre. El dashboard agenda los controles con
 * estos hitos y Recepción los usa para el estado comercial del plan.
 */
export const PB100D_EVALUACION_DIAS: readonly number[] = Object.freeze([0, 30, 60, 100]);

// ---------------------------------------------------------------------------
// Namespaces
// ---------------------------------------------------------------------------

/** Namespace canónico. **Todo lo que se escribe usa este.** */
export const BASE_CANONICA = 'https://epa-bienestar.ar/fhir';

/**
 * Namespaces que hay que poder leer, en orden de preferencia.
 *
 * Los dos últimos son herencia de cuando cada pieza del ecosistema nació por su
 * cuenta. Se aceptan al leer y no se usan nunca al escribir.
 */
export const BASES_ACEPTADAS: readonly string[] = Object.freeze([
  BASE_CANONICA,
  'https://segundaopinionmedica.org/fhir',
  'https://seguimiento.medplum.com.ar/fhir',
]);

// ---------------------------------------------------------------------------
// URLs canónicas
// ---------------------------------------------------------------------------

/**
 * Sufijo de la PlanDefinition única del programa (estadíos CKM 0 a 4, catálogo
 * firmado el 27/09/2026). Sin namespace, para lectura tolerante.
 */
export const PLAN_DEFINITION_SUFIJO = 'PlanDefinition/pb100d-ckm';

/**
 * Sufijo de la PlanDefinition anterior (plan cardiovascular en menopausia). Los
 * CarePlan ya escritos con ella siguen siendo del programa: se lee, no se escribe.
 */
export const PLAN_DEFINITION_SUFIJO_MENOPAUSIA = 'PlanDefinition/menopausia-cardiovascular';

/** Sufijos de PlanDefinition que designan el programa, el vigente primero. */
export const PLAN_DEFINITION_SUFIJOS_ACEPTADOS: readonly string[] = Object.freeze([
  PLAN_DEFINITION_SUFIJO,
  PLAN_DEFINITION_SUFIJO_MENOPAUSIA,
]);

/**
 * PlanDefinition del programa.
 *
 * Es **el único vínculo** entre el plan que publica el cardiólogo y el que ve la
 * paciente: el CarePlan la lleva en `instantiatesCanonical` y el portal reconoce
 * el plan por ahí. Si esta constante se desincroniza entre repos, el circuito se
 * corta sin dar ningún error.
 */
export const PLAN_DEFINITION_URL = `${BASE_CANONICA}/${PLAN_DEFINITION_SUFIJO}`;

/** PlanDefinition anterior (menopausia). Se acepta al leer; no se escribe más. */
export const PLAN_DEFINITION_URL_MENOPAUSIA = `${BASE_CANONICA}/${PLAN_DEFINITION_SUFIJO_MENOPAUSIA}`;

/** Cuestionario del plan. */
export const QUESTIONNAIRE_URL = `${BASE_CANONICA}/Questionnaire/menopausia-cardiovascular`;

/** Sufijos de las extensiones del contrato, sin el namespace. */
export const EXT_SUFIJO = {
  /** Código del programa en el Coverage. */
  planCodigo: 'StructureDefinition/plan-codigo',
  /** `membresia` | `paquete` | `programa`. */
  tipoCobertura: 'StructureDefinition/tipo-cobertura',
  /** Cómo llegó la paciente: `self` | `reception` | `referral`. */
  patientOrigin: 'StructureDefinition/patient-origin',
  /** Estadíos CKM (`0`..`4`) en que aplica una acción de la PlanDefinition; se repite por estadío. */
  catalogoEstadios: 'StructureDefinition/catalogo-estadios',
  /** Condición del catálogo que activa la acción (`dm2`, `hta`, `toma-glp1`, ...); se repite por condición. */
  catalogoCondicion: 'StructureDefinition/catalogo-condicion',
  /** Momento del plan en que corre la acción (`dia-0`, `dia-30`, `evento`, `continuo`, ...); se repite por momento. */
  catalogoMomento: 'StructureDefinition/catalogo-momento',
  /** Código del ítem del catálogo firmado (`E2-HTA-MED-01`) en el Goal o la Task instanciados. */
  catalogoItem: 'StructureDefinition/catalogo-item',
} as const;

/** Sufijos de los CodeSystem del contrato, sin el namespace. */
export const SYS_SUFIJO = {
  /** Tipo de Task: distingue una solicitud de plan de un pedido de turno. */
  taskTipo: 'CodeSystem/task-tipo',
  /** Códigos del catálogo firmado del PB100D (`E0-META-01`, `E2-HTA-MED-01`, ...). */
  catalogo: 'CodeSystem/catalogo-pb100d',
  /** Condiciones que activan ítems del catálogo (`dm2`, `hta`, `toma-glp1`, ...). */
  catalogoCondicion: 'CodeSystem/catalogo-condicion',
  /**
   * `CarePlan.category` de los planes de cuidado de SOM. La inscripción comercial al
   * programa que hace Recepción (`plan-bienestar-100`, con las tres consultas) es otro
   * CarePlan que el clínico (`pb100d-ckm`): se lee, no se escribe desde acá.
   */
  planCuidado: 'CodeSystem/care-plans',
  /** Consultas programadas del plan (`inicial` | `mitad` | `final`), en las actividades del CarePlan de inscripción. */
  consultaPlanBienestar: 'CodeSystem/consulta-plan-bienestar',
} as const;

/** URLs canónicas de extensión. Usar **siempre estas** al escribir. */
export const EXT = {
  planCodigo: `${BASE_CANONICA}/${EXT_SUFIJO.planCodigo}`,
  tipoCobertura: `${BASE_CANONICA}/${EXT_SUFIJO.tipoCobertura}`,
  patientOrigin: `${BASE_CANONICA}/${EXT_SUFIJO.patientOrigin}`,
  catalogoEstadios: `${BASE_CANONICA}/${EXT_SUFIJO.catalogoEstadios}`,
  catalogoCondicion: `${BASE_CANONICA}/${EXT_SUFIJO.catalogoCondicion}`,
  catalogoMomento: `${BASE_CANONICA}/${EXT_SUFIJO.catalogoMomento}`,
  catalogoItem: `${BASE_CANONICA}/${EXT_SUFIJO.catalogoItem}`,
} as const;

/** URLs canónicas de CodeSystem. Usar **siempre estas** al escribir. */
export const SYS = {
  taskTipo: `${BASE_CANONICA}/${SYS_SUFIJO.taskTipo}`,
  catalogo: `${BASE_CANONICA}/${SYS_SUFIJO.catalogo}`,
  catalogoCondicion: `${BASE_CANONICA}/${SYS_SUFIJO.catalogoCondicion}`,
  planCuidado: `${BASE_CANONICA}/${SYS_SUFIJO.planCuidado}`,
  consultaPlanBienestar: `${BASE_CANONICA}/${SYS_SUFIJO.consultaPlanBienestar}`,
} as const;

/** Códigos del contrato. Estos no llevan namespace: son valores, no URLs. */
export const COD = {
  /** `Task.code` de la solicitud de alta que manda el portal. */
  solicitudPlan: 'solicitud-plan',
  /** Valor de `tipo-cobertura` para un programa por ventana de tiempo. */
  coberturaPrograma: 'programa',
  /** `CarePlan.category` (`care-plans`) de la inscripción al programa que hace Recepción. */
  planBienestar100: 'plan-bienestar-100',
  /** `Task.code` (`task-tipo`) de Recepción: agendar una consulta programada del plan (días 1, 50 y 100). */
  agendarConsultaPb100d: 'agendar-consulta-pb100d',
} as const;

// ---------------------------------------------------------------------------
// Cuestionario de ingreso del portal
// ---------------------------------------------------------------------------

/**
 * linkId del grupo «Salud de la mujer» del cuestionario de ingreso del portal.
 *
 * El portal lo agrega detrás de una constante apagada hasta que lo firmen los
 * médicos, y no lo muestra a hombres. El core lee esas respuestas por linkId y
 * no por la URL del cuestionario, que es de SOM y está fuera de los namespaces
 * del contrato. La respuesta del ingreso se reconoce porque trae el grupo
 * (`grupoSaludMujer`), y cada linkId se lee sólo dentro de él:
 * `edad-ultima-menstruacion` también existe en el cuestionario anterior de
 * menopausia, así que un linkId suelto no alcanza.
 *
 * Si el portal cambia un linkId, cambia acá, y las respuestas ya guardadas con
 * el viejo dejan de leerse.
 */
export const INGRESO_LINKIDS = {
  /** El grupo. Identifica la respuesta del ingreso. */
  grupoSaludMujer: 'salud-mujer',
  /** `choice`: en qué momento está con la menstruación. La Condition SNOMED de la etapa la escribe el portal. */
  etapaMenstrual: 'etapa-menstrual',
  /** `integer`: edad de la última menstruación, si ya no menstrúa. */
  edadUltimaMenstruacion: 'edad-ultima-menstruacion',
  /** `boolean`: preeclampsia o presión alta en algún embarazo. */
  obstPreeclampsia: 'obst-preeclampsia',
  /** `boolean`: diabetes gestacional. */
  obstDmg: 'obst-dmg',
  /** `boolean`: algún parto prematuro (antes de las 37 semanas). */
  obstPrematuro: 'obst-prematuro',
  /**
   * `choice` con los códigos de `INGRESO_ANCESTRIA`: familia de origen asiático. Hoy va
   * dentro del grupo de la mujer, así que un varón no la declara; sacarla del grupo y qué
   * hacer con la que registra el equipo está a firmar (`docs/plan-bienestar-ckm-items.md`,
   * 8.4, n.º 18). No se cambia antes: movería el estadío de pacientes actuales.
   */
  ancestriaAsiatica: 'ancestria-asiatica',
} as const;

/**
 * Códigos (`valueCoding.code`) de las opciones de `ancestria-asiatica` en el ingreso.
 * Si el portal usa `valueString` como el resto del ingreso («Sí», «No», «No sé»), se
 * leen igual, sin mirar tildes ni mayúsculas. Lo mismo vale para las preguntas de sí o
 * no, que además aceptan `valueBoolean`.
 */
export const INGRESO_ANCESTRIA = {
  si: 'si',
  no: 'no',
  noSe: 'no-se',
} as const;

// ---------------------------------------------------------------------------
// Lectura tolerante
// ---------------------------------------------------------------------------

/**
 * Todas las URLs aceptables para un sufijo, con la canónica primero.
 *
 * Útil para armar un `_filter` o un `Set` de búsqueda cuando hay que consultar
 * el servidor por cualquiera de los namespaces.
 */
export function urlsDe(sufijo: string): string[] {
  return BASES_ACEPTADAS.map((base) => `${base}/${sufijo}`);
}

/** ¿Esta URL designa el concepto, en cualquiera de los namespaces aceptados? */
export function coincide(url: string | undefined, sufijo: string): boolean {
  if (!url) {
    return false;
  }
  return BASES_ACEPTADAS.some((base) => url === `${base}/${sufijo}`);
}

/**
 * Busca una extensión por sufijo, sin importar el namespace en que se escribió.
 *
 * Tipado estructural para no depender de `@medplum/fhirtypes`: sirve para
 * cualquier objeto con `url`, que es lo que son las extensiones de FHIR.
 */
export function buscarExtension<T extends { url?: string }>(
  extensiones: readonly T[] | undefined,
  sufijo: string
): T | undefined {
  return extensiones?.find((e) => coincide(e.url, sufijo));
}

/**
 * ¿Este CarePlan es del Plan Bienestar 100 Días?
 *
 * Mira `instantiatesCanonical` tolerando el namespace, las versiones con `|`
 * (FHIR permite `url|version` en una referencia canónica) y las dos
 * PlanDefinition del programa: la vigente (`pb100d-ckm`) y la anterior
 * (`menopausia-cardiovascular`), con la que ya hay planes escritos.
 */
export function esCarePlanDelPrograma(instantiatesCanonical: readonly string[] | undefined): boolean {
  return (instantiatesCanonical ?? []).some((ref) => {
    const url = ref.split('|')[0];
    return PLAN_DEFINITION_SUFIJOS_ACEPTADOS.some((sufijo) => coincide(url, sufijo));
  });
}

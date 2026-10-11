// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// La «puerta» del hero de la Home D: un solo próximo paso, el que elige `paraHoy` (la regla fija
// que comparte con la Home E). Acá solo se escriben el H1 y la bajada para el estilo D: neutros
// (los lee cualquier persona), con el nombre si lo hay y sin prometer nada que el paso no diga.
import { LE8_DOMINIO_LABEL, LE8_DOMINIOS } from '@epa/careplan-menopausia';
import { mayuscula, minusculaNatural } from './formato';
import type { DatosHomeE, Le8Domain, ParaHoy, PuertaHomeD } from './tipos';

export const OVERLINE_PUERTA = 'Tu próximo paso';

/** Lo que se suma a la bajada cuando queda natural: el tablero está justo abajo. */
export const ABAJO_VES = 'Abajo ves lo que mandaste y lo que vuelve a vos.';

export const BAJADA_AL_DIA = 'Todo lo que mandaste está en marcha. Abajo ves cada salida y cada llegada.';

/** Un perfil que no es Patient no tiene datos propios: la puerta no le pide nada. */
export const TITULO_NO_PACIENTE = 'Inicio';
export const BAJADA_NO_PACIENTE = 'Desde acá llegás a las secciones del portal.';

/** El H1 por regla de `paraHoy`, sin el vocativo y en minúscula (el nombre va adelante). */
const TITULOS: Readonly<Record<string, string>> = {
  consentimiento: 'tu ruta empieza con tu firma.',
  'consentimiento-actualizado': 'actualizamos tu consentimiento.',
  ingreso: 'contanos tus antecedentes.',
  informe: 'llegó tu informe.',
  teleconsulta: 'tus datos ya llegaron. Revisémoslos juntos.',
  'al-dia': 'hoy estás al día.',
};
const TITULO_UN_PASO = 'hoy te queda un paso.';

function esDominio(valor: string): valor is Le8Domain {
  return (LE8_DOMINIOS as readonly string[]).includes(valor);
}

function tituloDe(clave: string): string {
  return TITULOS[clave] ?? TITULO_UN_PASO;
}

/** La bajada: el detalle del paso, salvo donde el de la Home E no le sirve a D. */
function bajadaDe(paso: ParaHoy): string {
  const { clave } = paso;
  if (clave === 'al-dia') {
    return BAJADA_AL_DIA;
  }
  if (clave.startsWith('hito-')) {
    return `${paso.titulo}. ${paso.detalle}`;
  }
  if (clave.startsWith('le8-')) {
    // La de E habla de «pétalos», que D no tiene.
    const dominio = clave.slice('le8-'.length);
    const habito = esDominio(dominio) ? minusculaNatural(LE8_DOMINIO_LABEL[dominio]) : undefined;
    return habito
      ? `${paso.titulo}: con ese dato, tu hábito de ${habito} entra en tu puntaje de 8 hábitos.`
      : `${paso.titulo}: con ese dato, completás tu puntaje de 8 hábitos.`;
  }
  // El consentimiento va solo: es el primer paso y no hay nada que mirar abajo todavía.
  if (clave === 'consentimiento' || clave === 'consentimiento-actualizado') {
    return paso.detalle;
  }
  return `${paso.detalle} ${ABAJO_VES}`;
}

/** La puerta del hero para el próximo paso `paso` (el de `paraHoy`). Función pura. */
export function puertaDe(datos: DatosHomeE, paso: ParaHoy): PuertaHomeD {
  if (!datos.esPaciente) {
    return { overline: OVERLINE_PUERTA, titulo: TITULO_NO_PACIENTE, bajada: BAJADA_NO_PACIENTE, paso };
  }
  const frase = tituloDe(paso.clave);
  const nombre = datos.nombre?.trim();
  return {
    overline: OVERLINE_PUERTA,
    titulo: nombre ? `${nombre}, ${frase}` : mayuscula(frase),
    bajada: bajadaDe(paso),
    paso,
  };
}

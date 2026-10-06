// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Inicio de "Salud" en smartphone: cada sección de la Historia Clínica, en el mismo orden
// que el menú lateral de web. Las secciones con sub-opciones (cuestionarios, mediciones,
// paneles) van con su título; las de una sola opción (Cuestionario de ingreso,
// Consentimiento) van como una tarjeta suelta. En web, Salud abre el Cuestionario de ingreso.
import type { JSX } from 'react';
import { InicioDeSeccion } from '../../components/InicioDeSeccion';
import type { GrupoDeOpciones } from '../../components/InicioDeSeccion';
import { RUTA_CUESTIONARIO_INGRESO, SECCIONES_SALUD, TITULO_SALUD } from './Salud.data';

export const INICIO_SALUD_WEB = RUTA_CUESTIONARIO_INGRESO;

const GRUPOS: GrupoDeOpciones[] = SECCIONES_SALUD.map((s) =>
  s.opciones?.length
    ? { titulo: s.titulo, opciones: s.opciones.map((o) => ({ ...o, icon: s.icon })) }
    : { opciones: [{ icon: s.icon, titulo: s.titulo, descripcion: s.descripcion, href: s.href }] }
);

export function SaludInicio(): JSX.Element {
  return <InicioDeSeccion titulo={TITULO_SALUD} grupos={GRUPOS} inicioWeb={INICIO_SALUD_WEB} />;
}

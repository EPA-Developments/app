// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Tiempo real por WebSocket (Subscriptions de Medplum): apagado salvo MEDPLUM_TIEMPO_REAL=true,
// para no dejar reconexiones fallidas en cada navegador mientras el server no esté listo
// (checklist en docs/medplum/notificaciones.md). Sin él, las pantallas refrescan solas.
export function tiempoRealHabilitado(): boolean {
  return import.meta.env.MEDPLUM_TIEMPO_REAL === 'true';
}

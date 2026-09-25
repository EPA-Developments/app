import type { RolTeleconsulta } from './turno.js';

export interface DatosTokenJitsi {
  /** JWT `iss`: the app id configured on the Jitsi server. */
  appId: string;
  /** Jitsi host, e.g. `meet.example.org`. JWT `sub`. */
  dominio: string;
  /** Room name (`tc-<uuid>`). JWT `room`: the token only opens this room. */
  sala: string;
  /** Display name (from the FHIR resource, never from client input). */
  nombre: string;
  /** Stable user id, e.g. `Patient/123`. */
  idUsuario: string;
  rol: RolTeleconsulta;
  emitido: Date;
  /** Expiry: the end of the appointment's access window. */
  vence: Date;
}

/**
 * JWT claims for a self-hosted Jitsi with token auth. The professional is
 * moderator (`affiliation: owner` for mod_token_affiliation and
 * `moderator: true` for token-role setups such as
 * ENABLE_USER_ROLES_BASED_ON_TOKEN); the patient is a plain member and cannot
 * mute or kick the professional.
 */
export function claimsJitsi(d: DatosTokenJitsi): Record<string, unknown> {
  const esProfesional = d.rol === 'profesional';
  const iat = Math.floor(d.emitido.getTime() / 1000);
  return {
    aud: 'jitsi',
    iss: d.appId,
    sub: d.dominio,
    room: d.sala,
    iat,
    nbf: iat - 30,
    exp: Math.floor(d.vence.getTime() / 1000),
    context: {
      user: {
        id: d.idUsuario,
        name: d.nombre,
        affiliation: esProfesional ? 'owner' : 'member',
        moderator: esProfesional,
      },
    },
  };
}

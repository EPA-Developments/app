# Handoff para `recepcionistas` — el Jitsi no reconoce al médico como moderador

> **Qué es:** el diagnóstico de una teleconsulta de prueba en la que la paciente se quedó en
> «Esperando al anfitrión» aunque el médico había abierto la sala. Y lo que hay que revisar
> en el Jitsi de SOM, que es de este repo de Recepción (el servidor, sus secretos y los bots
> de la sala).
>
> **De dónde viene:** del portal (`EPA-Developments/app`), probando la teleconsulta de punta a
> punta con el dashboard. Fecha: 14.10.2026.
>
> **Qué no es:** no hace falta cambiar el portal ni el dashboard para esto. Los dos hicieron
> su parte (abajo).

## Qué pasó

Una teleconsulta de prueba del 13.10.2026 a las 19:30 (hora de Argentina):

1. La paciente tocó «Entrar a la videollamada» en el portal. `som-teleconsulta-entrar` le
   devolvió el link de la sala, sin token, y pasó el turno a `arrived`. El dashboard mostró
   que ya estaba esperando.
2. El médico tocó «Abrir la sala» en el dashboard. El turno pasó a `checked-in` («En curso»,
   con `som-estado-turno`) y la sala se abrió en otra pestaña, con el token que firma
   `som-teleconsulta-token`.
3. El portal vio `checked-in` y le abrió la sala a la paciente.
4. **A la paciente el Jitsi le mostró «Esperando al anfitrión… La conferencia aún no ha
   comenzado porque no ha llegado ningún moderador. Si quiere ser moderador, por favor inicie
   sesión».** Es decir: para el Jitsi, en esa sala no había ningún moderador.

En otra prueba, del 12.10.2026, la paciente vio «Error de conexión: no fue posible
conectarnos a la conferencia». No hay logs de esa vez.

## Lo que está descartado

- **Salas distintas.** El link de la paciente y el del médico van al mismo servidor (el
  Jitsi de la marca, el `dominio` que devuelve `som-teleconsulta-token`) y a la misma sala
  (`som-<id>`).
- **El portal y el dashboard.** Los pasos 1 a 3 salieron como dice el contrato
  (`docs/medplum/bot-som-interface.md` del portal y `docs/TELECONSULTA-SOM.md` §3 del
  dashboard).
- **El token del médico.** Se leyó (sin la firma, que no se puede validar sin el secreto):

  | Campo                                    | Valor                                                                    |
  | ---------------------------------------- | ------------------------------------------------------------------------ |
  | `aud`                                    | `jitsi`                                                                  |
  | `iss`                                    | `epa-teleconsulta`                                                       |
  | `sub`                                    | el dominio del Jitsi de la marca                                         |
  | `room`                                   | el de la sala del turno                                                  |
  | `nbf` / `exp`                            | 19:15 a 21:00 del 13.10 (de 15 minutos antes a una hora después del fin) |
  | `context.user.moderator` / `affiliation` | `true` / `owner`                                                         |

  Está bien armado: el bot hace lo que tiene que hacer.

## Confirmado: el médico estaba adentro

**El médico tocó «Entrar a la reunión» en su pestaña, y la paciente siguió esperando**
(confirmado el 14.10.2026). No es que le faltara un paso: entró y el Jitsi no lo tomó como
moderador.

## El Jitsi no está usando el token

El médico entró como invitado, igual que la paciente, y los dos esperan a un anfitrión que
no existe. Lo que estaba pendiente según `docs/TELECONSULTA-SOM.md` §8 del
dashboard («configurar el Jitsi de SOM para que valide esos tokens y dé moderador a quien
trae `moderator: true`») tiene que estar hecho. Hay que revisar, según cómo esté instalado:

| Qué                                        | Con `docker-jitsi-meet` (`.env`)                                                                  | Instalado a mano                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Autenticación por token                    | `ENABLE_AUTH=1`, `AUTH_TYPE=jwt`                                                                  | Prosody: `authentication = "token"` en el host principal                                          |
| App ID igual al `iss` del token            | `JWT_APP_ID=epa-teleconsulta`                                                                     | Prosody: `app_id = "epa-teleconsulta"`                                                            |
| El mismo secreto que el bot                | `JWT_APP_SECRET` = el Project Secret `JITSI_APP_SECRET` de Medplum                                | Prosody: `app_secret`                                                                             |
| Emisor y audiencia aceptados               | `JWT_ACCEPTED_ISSUERS` con `epa-teleconsulta` y `JWT_ACCEPTED_AUDIENCES` con `jitsi` (si se usan) | `asap_accepted_issuers` / `asap_accepted_audiences` (si se usan)                                  |
| La paciente entra sin token, como invitada | `ENABLE_GUESTS=1`                                                                                 | Un host de invitados con `authentication = "anonymous"`, y en `config.js` `hosts.anonymousdomain` |

**La causa más probable**: el servidor tiene activada la autenticación de usuario y
contraseña de Jitsi («secure domain») y no la de token: por eso a los dos les pide un
moderador que «inicie sesión» y no toma el token del médico. Se puede ver sin tocar la
configuración: si en «Esperando al anfitrión» el botón «Iniciar sesión» abre un formulario de
usuario y contraseña, el servidor está en ese modo.

**Mientras tanto, para no frenar las consultas** (lo decide Recepción): darle al médico un
usuario y contraseña del Jitsi (con `prosodyctl register`, o el equivalente de su instalación),
para que inicie sesión en ese diálogo y la consulta arranque. Es provisorio: el contrato es
que el médico entra con el token que firma `som-teleconsulta-token`.

Dos controles rápidos:

- **El `config.js` del Jitsi** (`https://<dominio del Jitsi>/config.js`, es público): si tiene
  `anonymousdomain`, hay un lugar para invitados, y eso indica que la autenticación está
  activada.
- **Los logs de Prosody y de Jicofo** de alrededor de las 19:30 del 13.10.2026: un token que
  no valida deja un error de verificación; un médico que entra como invitado no deja ninguno.

## Cómo saber que quedó

Con una paciente de prueba, sin datos reales, y un turno de prueba:

- [ ] El médico abre la sala desde el dashboard y toca «Entrar a la reunión»: está adentro,
      con las opciones de moderador, y no ve «Esperando al anfitrión».
- [ ] La paciente entra desde el portal y queda en la reunión con el médico, sin ver
      «Esperando al anfitrión» ni «Iniciar sesión».
- [ ] Si la paciente entra antes que el médico (con «Entrar igual»), ve «Esperando al
      anfitrión», y al entrar el médico la reunión arranca sola.
- [ ] Un link con un token vencido o firmado con otro secreto no entra como moderador.

## Una regla

Un link de la sala con `?jwt=` entra como moderador mientras el token está vigente. No se
pega en chats, tickets ni capturas: se corta en `?jwt=`.

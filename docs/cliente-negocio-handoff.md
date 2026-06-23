# Handoff — Capa Cliente/negocio (Sesiones, Pagos, Reservar por bots)

Contexto para la **sesión nueva con ambos repos** (`portal` + `recepcionistas`).
Objetivo: cablear en el portal las **Sesiones** y **Pagos** del eje Cliente, y la
**reserva de turnos por bots** de recepción.

> Abrir esa sesión scopeada a **ambos** repos: `recepcionistas` (leer el modelo) y
> `portal` (donde se hacen los cambios de código).

## Estado actual del portal (ya hecho)

- **3 ejes navegables**: Usuario → *Cuenta* (`/account`), Cliente → *Membresía*
  (`/membership`), Paciente → *Salud* (`/health-record`).
- **Membresía** (`src/pages/membership/index.tsx`): hoy muestra
  - **Mis turnos** — real (`<MyAppointments>`, `Appointment?patient=…`).
  - **Sesiones** — *placeholder* (texto "lo estamos conectando").
  - **Cobertura** — real (`Coverage?beneficiary=…`).
  - **Pagos** — *placeholder*.
- **Reservar**: el botón "+" del menú inferior (`src/components/BottomNav.tsx`) y
  el Header desktop llevan a `/get-care` (`src/pages/GetCarePage.tsx`), que hoy usa
  las ops nativas `Appointment/$find` y `$hold`, **deshabilitado** con un guard
  ("Reserva en preparación") hasta que haya agenda.
- **AccessPolicy** del paciente: `docs/medplum/access-policy-paciente-portal.json`.

## Lo que hay que extraer de `recepcionistas`

### A. Sesiones (saldo y consumo)
1. Recurso del paquete comprado (`Account` / `ChargeItem` / `Contract` / custom) + **JSON de ejemplo real**.
2. Vínculo al paciente (campo + search param).
3. Modelo del saldo: total / consumidas / restantes (¿campo, extensión, o se cuenta?).
4. Cómo se distingue la terapia (HBOT/IHHT/Recovery…): código / `serviceType` / `ActivityDefinition`.
5. Cómo se descuenta una sesión al usarse (¿`Appointment` fulfilled? ¿`ChargeItem`? ¿update de `Account`?).

### B. Pagos / seña
1. Recurso(s) de pago (`Invoice` / `PaymentNotice` / `ChargeItem` / `Account.balance`) + ejemplo.
2. Cómo se marca "seña pagada".
3. Search param por paciente.

### C. Membresía / tipo de socio
- `Coverage` / `Account` / `Contract`; qué campo define el tipo de socio + ejemplo.

### D. Reservar por bots
1. IDs reales de los bots (`bw-reservar-turno`, `bw-reservar-combo`).
2. **Input exacto** + cómo se invoca (`medplum.executeBot(id, input)` o endpoint).
3. **Output** (Appointment creado / errores de regla).
4. Cómo se descubre lo reservable y su disponibilidad (`HealthcareService` / `Schedule`+`Slot` / un bot `$find`).
5. Reglas que valida el bot (orden HBOT primero, capacidad/desfasaje, ventana, seña) — para reflejarlas en la UI.

### E. AccessPolicy
- Confirmar que "Paciente — Portal" da `read` de los recursos de A/B acotado al paciente; si falta alguno, agregarlo a `docs/medplum/access-policy-paciente-portal.json`.

## Puntos de integración en el portal

| Qué | Dónde | Acción |
|---|---|---|
| Sesiones (saldo/consumo) | `src/pages/membership/index.tsx` (sección *Sesiones*) | Reemplazar placeholder por fetch real (nuevo módulo `src/fhir/membership.ts`). |
| Pagos / seña | `src/pages/membership/index.tsx` (sección *Pagos*) | Reemplazar placeholder por fetch real. |
| Tipo de socio | `src/pages/membership/index.tsx` (encabezado) | Mostrar tipo de socio según C. |
| Reservar por bots | `src/pages/GetCarePage.tsx` | Cambiar `$find`/`$hold` por `medplum.executeBot(...)`; manejar errores de regla con `normalizeErrorString`. |
| Descubrir disponibilidad | nuevo `src/fhir/booking.ts` | Listar terapias reservables + slots según D. |
| Permisos | `docs/medplum/access-policy-paciente-portal.json` | Sumar recursos de A/B; aplicar en el server. |

## Checklist sesión nueva
- [ ] Leer el modelo en `recepcionistas` y completar A–E (con JSON de ejemplo).
- [ ] `src/fhir/membership.ts`: fetch de sesiones y pagos por paciente.
- [ ] Cablear secciones *Sesiones* y *Pagos* en `/membership`.
- [ ] `src/fhir/booking.ts` + `GetCarePage`: reservar por bots, reflejar reglas.
- [ ] Actualizar AccessPolicy y aplicarla en el server.
- [ ] `npm run build` verde.

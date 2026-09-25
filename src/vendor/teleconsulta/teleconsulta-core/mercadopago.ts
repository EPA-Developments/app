/** Checkout Pro preference for paying one teleconsulta appointment. */
export interface PreferenciaContext {
  appointmentId: string;
  titulo: string;
  precio: { valor: number; moneda: string };
  urls: {
    /** Where the patient returns after paying (approved / failure / pending). */
    exito: string;
    error: string;
    pendiente: string;
    /** The public webhook of the payments bot. */
    notificacion: string;
  };
  /** The preference stops accepting payments at the appointment start. */
  venceISO?: string;
  /** Max 22 chars shown on the card statement. */
  descriptor?: string;
}

/** Body for `POST https://api.mercadopago.com/checkout/preferences`. */
export function preferenciaTeleconsulta(ctx: PreferenciaContext): Record<string, unknown> {
  const body: Record<string, unknown> = {
    items: [
      {
        id: ctx.appointmentId,
        title: ctx.titulo,
        quantity: 1,
        currency_id: ctx.precio.moneda,
        unit_price: ctx.precio.valor,
      },
    ],
    external_reference: referenciaExterna(ctx.appointmentId),
    metadata: { appointment_id: ctx.appointmentId },
    back_urls: { success: ctx.urls.exito, failure: ctx.urls.error, pending: ctx.urls.pendiente },
    auto_return: 'approved',
    notification_url: ctx.urls.notificacion,
  };
  if (ctx.venceISO) {
    body.expires = true;
    body.expiration_date_to = ctx.venceISO;
  }
  if (ctx.descriptor) body.statement_descriptor = ctx.descriptor.slice(0, 22);
  return body;
}

/** `external_reference` that ties a payment to its appointment. */
export function referenciaExterna(appointmentId: string): string {
  return `Appointment/${appointmentId}`;
}

/** Appointment id from an `external_reference`, or undefined if it is not ours. */
export function turnoDeReferenciaExterna(ref: string | undefined): string | undefined {
  const m = /^Appointment\/([A-Za-z0-9\-.]{1,64})$/.exec(ref ?? '');
  return m?.[1];
}

/** Parses `x-signature: ts=...,v1=...`. */
export function parsearFirmaMp(header: string | undefined): { ts?: string; v1?: string } {
  const out: { ts?: string; v1?: string } = {};
  for (const parte of (header ?? '').split(',')) {
    const [k, v] = parte.split('=').map((s) => s.trim());
    if (k === 'ts' && v) out.ts = v;
    if (k === 'v1' && v) out.v1 = v;
  }
  return out;
}

/**
 * The string Mercado Pago signs: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`.
 * Alphanumeric ids are lowercased; absent parts are omitted (per MP docs).
 */
export function manifiestoFirmaMp(p: { dataId?: string; requestId?: string; ts?: string }): string {
  let m = '';
  if (p.dataId) m += `id:${p.dataId.toLowerCase()};`;
  if (p.requestId) m += `request-id:${p.requestId};`;
  if (p.ts) m += `ts:${p.ts};`;
  return m;
}

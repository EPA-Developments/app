import { useEffect, useRef, useState, type RefObject } from 'react';

/** Minimal surface of the Jitsi IFrame API used here. */
export interface ApiJitsi {
  addListener(evento: string, fn: (...args: unknown[]) => void): void;
  dispose(): void;
  getNumberOfParticipants(): number;
}

type ConstructorJitsi = new (dominio: string, opciones: Record<string, unknown>) => ApiJitsi;

declare global {
  interface Window {
    JitsiMeetExternalAPI?: ConstructorJitsi;
  }
}

export interface DatosSala {
  dominio: string;
  sala: string;
  jwt: string;
}

const HOST_VALIDO = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d{1,5})?$/i;
const cargas = new Map<string, Promise<void>>();

/**
 * Loads `https://<dominio>/external_api.js` once. The domain comes from the
 * token bot; it is validated as a bare host so a bad value can never inject
 * a script from somewhere else.
 */
export function cargarApiJitsi(dominio: string): Promise<void> {
  if (window.JitsiMeetExternalAPI) return Promise.resolve();
  if (!HOST_VALIDO.test(dominio)) return Promise.reject(new Error('Dominio de videollamada inválido.'));
  const existente = cargas.get(dominio);
  if (existente) return existente;
  const promesa = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://${dominio}/external_api.js`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      cargas.delete(dominio);
      reject(new Error('No se pudo cargar la videollamada.'));
    };
    document.head.appendChild(script);
  });
  cargas.set(dominio, promesa);
  return promesa;
}

export interface OpcionesSala {
  datos?: DatosSala;
  contenedor: RefObject<HTMLDivElement | null>;
  /** `videoConferenceJoined`: the user is in the room. */
  onUnido?: () => void;
  /** `readyToClose`: the user hung up. */
  onCerrar?: () => void;
}

/**
 * Embeds the Jitsi room with the IFrame API: prejoin screen (camera and
 * microphone test), Spanish UI, no app-store promos. The display name comes
 * from the JWT, never from here. Always disposes on unmount — otherwise the
 * microphone would stay open.
 */
export function useSalaJitsi(opciones: OpcionesSala): { participantes: number; error?: string } {
  const { datos, contenedor } = opciones;
  const [participantes, setParticipantes] = useState(0);
  const [error, setError] = useState<string | undefined>(undefined);
  const callbacks = useRef(opciones);
  callbacks.current = opciones;

  useEffect(() => {
    if (!datos || !contenedor.current) return undefined;
    let api: ApiJitsi | undefined;
    let cancelado = false;

    cargarApiJitsi(datos.dominio)
      .then(() => {
        const Api = window.JitsiMeetExternalAPI;
        if (cancelado || !Api || !contenedor.current) return;
        api = new Api(datos.dominio, {
          roomName: datos.sala,
          jwt: datos.jwt,
          parentNode: contenedor.current,
          width: '100%',
          height: '100%',
          lang: 'es',
          configOverwrite: { prejoinConfig: { enabled: true }, disableDeepLinking: true },
          interfaceConfigOverwrite: { MOBILE_APP_PROMO: false },
        });
        const contar = (): void => setParticipantes(api?.getNumberOfParticipants() ?? 0);
        api.addListener('videoConferenceJoined', () => {
          contar();
          callbacks.current.onUnido?.();
        });
        api.addListener('participantJoined', contar);
        api.addListener('participantLeft', contar);
        api.addListener('readyToClose', () => callbacks.current.onCerrar?.());
      })
      .catch((e: Error) => {
        if (!cancelado) setError(e.message);
      });

    return () => {
      cancelado = true;
      api?.dispose();
    };
  }, [datos, contenedor]);

  return { participantes, error };
}

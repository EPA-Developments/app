// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// «Estudios para esta consulta»: lo que la persona adjunta a un turno para que el
// profesional lo vea antes de la consulta (capa FHIR: src/fhir/adjuntosTurno.ts). Puede subir
// un PDF o una foto, o elegir uno de los PDFs que ya mandó, y quitarlos mientras el turno no
// pasó. Va en la sala de la teleconsulta y en los turnos próximos de «Mis turnos» (ahí,
// plegado: `AdjuntosDelTurnoPlegables`).
//
// Honestidad: lo adjunto NO lo lee la IA ni se suma a los biomarcadores (no es la categoría
// de laboratorio y no dispara al bot); para eso está «Enviar estudios en PDF», y la bajada lo
// dice con un link. Tampoco se promete lo que el dashboard no hace (docs/adjuntos-turno.md):
//  - En la teleconsulta muestra los adjuntos al lado de la sala: la bajada dice que el
//    profesional los ve antes.
//  - En un turno en el centro, solo arriba de la ficha que el profesional abre desde la
//    «Agenda de hoy» de su tablero (el mismo día, y no siempre: la tarjeta muestra los
//    primeros turnos). La bajada dice que los puede ver el día de la consulta y pide llevarlos.
//  - De la persona lee solo lo vigente, al abrir la pantalla: lo quitado deja de aparecerle
//    la próxima vez que abre la ficha. Salvo una cosa, que el diálogo de quitar dice: si se
//    quita la copia de un PDF que ya mandó («Elegir de los que ya mandaste»), el envío original
//    sigue vigente y el profesional lo puede seguir viendo. Una foto nunca es una copia (esa
//    lista ofrece solo PDFs), así que con una foto la salvedad no se muestra.
//
// Teclado: después de cada escritura el foco vuelve a un lugar que existe (el botón que se
// usó, o el título de la sección si ese botón ya no está), nunca queda en <body>.
import { Box, Button, FileButton, Group, Loader, Modal, Stack, Text, Title, VisuallyHidden } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { Appointment, Attachment, DocumentReference, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconChevronDown, IconFileTypePdf, IconPaperclip, IconPhoto, IconUpload } from '@tabler/icons-react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { Link } from 'react-router';
import { TZ } from '../../fhir/agenda';
import {
  ACCEPT_ADJUNTO,
  adjuntarArchivo,
  adjuntarDeMisEstudios,
  cargarAdjuntosDelTurno,
  claveDeArchivo,
  esAdjuntoDeTurno,
  MENSAJE_SIN_CONSENTIMIENTO_ADJUNTO,
  porQueNoSeAdjunta,
  quitarAdjunto,
  sePuedeElegir,
} from '../../fhir/adjuntosTurno';
import type { MotivoSinAdjuntos } from '../../fhir/adjuntosTurno';
import { buscarConsentimiento, RUTA_CONSENTIMIENTO } from '../../fhir/consentimiento';
import { cargarEstudiosEnviados, MAX_MB, PDF } from '../../fhir/estudios';
import type { ResultadoEnvioEstudio } from '../../fhir/estudios';
import { esTeleconsulta } from '../../fhir/teleconsulta';
import { RUTA_ENVIAR_ESTUDIOS } from '../AccionesRapidas';
import classes from './AdjuntosDelTurno.module.css';

export const TITULO_ADJUNTOS = 'Estudios para esta consulta';
const RUTA_MENSAJES = '/Communication';
const MENSAJE_ESPERAR = 'Esperá a que termine de adjuntarse el otro estudio y probá de nuevo.';

const TURNO_CERRADO: Record<MotivoSinAdjuntos, string> = {
  cancelado: 'Este turno se canceló: no se pueden sumar más estudios.',
  'reserva-vencida': 'Venció la reserva de este turno: no se pueden sumar estudios.',
  terminado: 'Este turno ya pasó: no se pueden sumar más estudios.',
};

/** Lo último que pasó con una escritura (para mostrarlo junto al botón si la sección se plegó). */
export interface AvisoAdjuntos {
  readonly texto: string;
  readonly tipo: 'en-curso' | 'listo' | 'error';
}

const fmtFecha = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ });
const fmtFechaSinAnio = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', timeZone: TZ });
const fmtAnio = new Intl.DateTimeFormat('es-AR', { year: 'numeric', timeZone: TZ });

/** «12 de octubre» (con el año solo si no es el actual), en hora de Argentina. */
function fecha(iso: string | undefined): string | undefined {
  const d = iso ? new Date(iso) : undefined;
  if (!d || Number.isNaN(d.getTime())) {
    return undefined;
  }
  return fmtAnio.format(d) === fmtAnio.format(new Date()) ? fmtFechaSinAnio.format(d) : fmtFecha.format(d);
}

/** El nombre que ve la persona (el mismo que muestra el dashboard: título o descripción). */
function tituloDe(doc: DocumentReference): string {
  return doc.content?.[0]?.attachment?.title ?? doc.description ?? 'Estudio';
}

/** Solo se linkea un archivo servido por https (el server firma la URL del Binary). */
function urlSegura(a: Attachment | undefined): string | undefined {
  if (!a?.url) {
    return undefined;
  }
  try {
    const url = new URL(a.url);
    return url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === 'localhost') ? a.url : undefined;
  } catch {
    return undefined;
  }
}

function IconoArchivo({ a }: { a: Attachment | undefined }): JSX.Element {
  return a?.contentType?.startsWith('image/') ? (
    <IconPhoto size={22} className={classes.icono} aria-hidden />
  ) : (
    <IconFileTypePdf size={22} className={classes.icono} aria-hidden />
  );
}

/** El nombre del archivo: link (en otra pestaña) si hay URL; si viaja embebido, texto. */
function NombreDelArchivo({ doc }: { doc: DocumentReference }): JSX.Element {
  const url = urlSegura(doc.content?.[0]?.attachment);
  const titulo = tituloDe(doc);
  return url ? (
    <a className={classes.archivo} href={url} target="_blank" rel="noopener noreferrer">
      {titulo}
      <VisuallyHidden> (se abre en otra pestaña)</VisuallyHidden>
    </a>
  ) : (
    <span className={classes.nombre}>{titulo}</span>
  );
}

export interface AdjuntosDelTurnoProps {
  readonly appointment: WithId<Appointment>;
  /** Por defecto, el perfil de la sesión. */
  readonly patient?: Patient;
  /** Nivel del título: 3 debajo del h2 de la página (sala, «Mis turnos»); 2 si va suelto. */
  readonly nivel?: 2 | 3;
  /** Cada vez que cambia cuántos estudios hay adjuntos (el contador del botón plegable). */
  readonly onCambio?: (cantidad: number) => void;
  /** La hora de referencia (tests; por defecto, ahora). */
  readonly ahora?: Date;
  /** Dentro de una tarjeta (plegado): el título, más chico. */
  readonly compacto?: boolean;
  /**
   * Qué turno es («Consulta de Cardiología, 14 de octubre…»): se suma, oculto, al título,
   * para que con varios turnos en pantalla un lector de pantalla diga de cuál es la sección.
   */
  readonly contexto?: string;
  /** Cada vez que cambia lo que se está haciendo o cómo terminó (lo usa el plegable). */
  readonly onAviso?: (aviso: AvisoAdjuntos | undefined) => void;
}

type EstadoConsentimiento = 'cargando' | 'firmado' | 'falta' | 'no-se-pudo-revisar';

export function AdjuntosDelTurno({
  appointment,
  patient,
  nivel = 3,
  onCambio,
  ahora,
  compacto = false,
  contexto,
  onAviso,
}: AdjuntosDelTurnoProps): JSX.Element {
  const medplum = useMedplum();
  const persona = patient ?? (medplum.getProfile() as Patient);
  const motivo = porQueNoSeAdjunta(appointment, ahora);
  const abierto = motivo === undefined;
  // En el centro, el dashboard los muestra solo desde la agenda del día (docs/adjuntos-turno.md).
  const loVeAntes = esTeleconsulta(appointment);
  const idTitulo = useId();
  const idEnviados = useId();

  const [adjuntos, setAdjuntos] = useState<WithId<DocumentReference>[]>();
  const [errorLista, setErrorLista] = useState(false);
  const [consentimiento, setConsentimiento] = useState<EstadoConsentimiento>('cargando');
  const [verEnviados, setVerEnviados] = useState(false);
  const [enviados, setEnviados] = useState<WithId<DocumentReference>[]>();
  const [errorEnviados, setErrorEnviados] = useState(false);
  /** Qué se está haciendo: 'subir' o el id del estudio que se adjunta. */
  const [ocupado, setOcupado] = useState<string>();
  const [progreso, setProgreso] = useState<string>();
  const [error, setError] = useState<string>();
  const [aQuitar, setAQuitar] = useState<WithId<DocumentReference>>();
  const [quitando, setQuitando] = useState(false);
  const [errorQuitar, setErrorQuitar] = useState<string>();
  /** A dónde vuelve el foco después de una escritura: el `data-foco` de un elemento. */
  const [foco, setFoco] = useState<string>();
  const seccion = useRef<HTMLElement>(null);
  const confirmar = useRef<HTMLButtonElement>(null);
  const resetArchivo = useRef<() => void>(null);
  /**
   * Hay una escritura en curso (adjuntar o quitar). Es una ref y no estado: dos toques
   * seguidos llegan antes de que el botón se vea deshabilitado, y cada uno crearía su copia.
   */
  const enCurso = useRef(false);
  const avisar = useRef(onCambio);
  useEffect(() => {
    avisar.current = onCambio;
  });
  useEffect(() => {
    if (adjuntos) {
      avisar.current?.(adjuntos.length);
    }
  }, [adjuntos]);

  const textoAviso = error ?? progreso;
  const tipoAviso: AvisoAdjuntos['tipo'] = error ? 'error' : ocupado !== undefined || quitando ? 'en-curso' : 'listo';
  const avisarAviso = useRef(onAviso);
  useEffect(() => {
    avisarAviso.current = onAviso;
  });
  useEffect(() => {
    avisarAviso.current?.(textoAviso ? { texto: textoAviso, tipo: tipoAviso } : undefined);
  }, [textoAviso, tipoAviso]);

  // El foco, después de que la pantalla ya se actualizó (el botón dejó de estar deshabilitado,
  // o la fila ya no está). Si el destino no existe, al título de la sección.
  useEffect(() => {
    if (foco === undefined) {
      return;
    }
    setFoco(undefined);
    if (foco === 'confirmar-quitar') {
      confirmar.current?.focus();
      return;
    }
    const buscar = (clave: string): HTMLElement | null | undefined =>
      seccion.current?.querySelector<HTMLElement>(`[data-foco="${clave}"]`);
    const destino = buscar(foco);
    // Uno deshabilitado no recibe el foco (p. ej. «Quitar» mientras se sube otro estudio).
    (destino && !destino.matches(':disabled') ? destino : buscar('titulo'))?.focus();
  }, [foco]);

  const cargarLista = useCallback(async (): Promise<void> => {
    try {
      setAdjuntos(await cargarAdjuntosDelTurno(medplum, appointment.id));
      setErrorLista(false);
    } catch (err) {
      console.error('Estudios del turno:', err);
      setErrorLista(true);
    }
  }, [medplum, appointment.id]);

  useEffect(() => {
    void cargarLista();
  }, [cargarLista]);

  useEffect(() => {
    if (!abierto) {
      return undefined;
    }
    let vigente = true;
    buscarConsentimiento(medplum, persona)
      .then((doc) => vigente && setConsentimiento(doc ? 'firmado' : 'falta'))
      // Si no se pudo revisar, se ofrece igual: al adjuntar se vuelve a verificar.
      .catch(() => vigente && setConsentimiento('no-se-pudo-revisar'));
    return () => {
      vigente = false;
    };
  }, [medplum, persona, abierto]);

  const cargarEnviados = useCallback((): void => {
    setErrorEnviados(false);
    cargarEstudiosEnviados(medplum, persona)
      .then(setEnviados)
      .catch(() => setErrorEnviados(true));
  }, [medplum, persona]);

  const alTerminar = (r: ResultadoEnvioEstudio, nombre: string): void => {
    if (r.ok && r.documento) {
      const doc = r.documento;
      setAdjuntos((antes) => [doc, ...(antes ?? []).filter((d) => d.id !== doc.id)]);
      setProgreso(`Listo: «${nombre}» quedó adjunto a esta consulta.`);
      return;
    }
    setProgreso(undefined);
    if (r.mensaje === MENSAJE_SIN_CONSENTIMIENTO_ADJUNTO) {
      setConsentimiento('falta');
    }
    setError(r.mensaje ?? 'No pudimos adjuntar el estudio. Probá de nuevo en unos segundos.');
  };

  const subir = async (file: File | null): Promise<void> => {
    if (!file || enCurso.current) {
      resetArchivo.current?.();
      return;
    }
    enCurso.current = true;
    setOcupado('subir');
    setError(undefined);
    setProgreso(`Subiendo «${file.name}»…`);
    const r = await adjuntarArchivo(medplum, persona, appointment, file).finally(() => {
      enCurso.current = false;
    });
    resetArchivo.current?.();
    setOcupado(undefined);
    alTerminar(r, file.name);
    // Mientras subía, el botón estuvo deshabilitado y el navegador le sacó el foco.
    setFoco('subir');
  };

  const elegir = async (doc: WithId<DocumentReference>): Promise<void> => {
    if (enCurso.current) {
      return;
    }
    enCurso.current = true;
    setOcupado(doc.id);
    setError(undefined);
    setProgreso(`Adjuntando «${tituloDe(doc)}»…`);
    const r = await adjuntarDeMisEstudios(medplum, persona, appointment, doc).finally(() => {
      enCurso.current = false;
    });
    setOcupado(undefined);
    alTerminar(r, tituloDe(doc));
    // Adjuntado, su fila desaparece: el foco vuelve a «Elegir de los que ya mandaste».
    setFoco(r.ok ? 'elegir' : `adjuntar-${doc.id}`);
  };

  const confirmarQuitar = async (): Promise<void> => {
    if (!aQuitar) {
      return;
    }
    if (enCurso.current) {
      setErrorQuitar(MENSAJE_ESPERAR);
      return;
    }
    enCurso.current = true;
    setQuitando(true);
    setErrorQuitar(undefined);
    const r = await quitarAdjunto(medplum, aQuitar, appointment.id).finally(() => {
      enCurso.current = false;
    });
    setQuitando(false);
    if (!r.ok) {
      setErrorQuitar(r.mensaje);
      setFoco('confirmar-quitar');
      return;
    }
    const quitado = aQuitar.id;
    setAdjuntos((antes) => (antes ?? []).filter((d) => d.id !== quitado));
    setError(undefined);
    setProgreso(`Quitamos «${tituloDe(aQuitar)}» de esta consulta.`);
    setAQuitar(undefined);
    // Su «Quitar» ya no existe: el foco va al título de la sección (el aviso lo lee el lector).
    setFoco('titulo');
  };

  /** Cerrar el diálogo sin quitar: el foco vuelve al «Quitar» que lo abrió. */
  const cancelarQuitar = (): void => {
    if (quitando || !aQuitar) {
      return;
    }
    setFoco(`quitar-${aQuitar.id}`);
    setAQuitar(undefined);
  };

  const yaAdjuntos = new Set((adjuntos ?? []).map((d) => claveDeArchivo(d.content?.[0]?.attachment)));
  // Los PDFs que mandó que se pueden elegir (vigentes y con archivo que el profesional abre),
  // los que se mandaron embebidos (no se ofrecen, y se dice por qué) y, de los elegibles, los
  // que todavía no están en esta consulta.
  const elegibles = (enviados ?? []).filter(sePuedeElegir);
  const embebidos = (enviados ?? []).filter(
    (d) => d.status !== 'entered-in-error' && !d.content?.[0]?.attachment?.url && !!d.content?.[0]?.attachment?.data
  ).length;
  const disponibles = elegibles.filter((d) => !yaAdjuntos.has(claveDeArchivo(d.content?.[0]?.attachment)));

  return (
    <Box component="section" ref={seccion} aria-labelledby={idTitulo} className={classes.seccion}>
      <Stack gap="sm">
        <Title
          order={nivel}
          id={idTitulo}
          fz={compacto ? 'lg' : 'h4'}
          tabIndex={-1}
          data-foco="titulo"
          className={classes.titulo}
        >
          {TITULO_ADJUNTOS}
          {contexto && <VisuallyHidden>: {contexto}</VisuallyHidden>}
        </Title>

        {abierto ? (
          <Text size="sm">
            {loVeAntes
              ? 'Lo que adjuntes lo ve el profesional que te atiende, antes de la consulta. No lo lee nuestra IA ni se suma a tus biomarcadores: para eso está '
              : 'Quedan guardados con este turno y el profesional los puede ver el día de la consulta. Llevalos igual, por las dudas. No los lee nuestra IA ni se suman a tus biomarcadores: para eso está '}
            <Link to={RUTA_ENVIAR_ESTUDIOS} className={classes.enLinea}>
              Enviar estudios en PDF
            </Link>
            .
          </Text>
        ) : (
          <Text size="sm">{TURNO_CERRADO[motivo]}</Text>
        )}

        {/* La lista: lo que ya está adjunto (y ve el profesional). */}
        {adjuntos === undefined && !errorLista && (
          <Group gap="xs">
            <Loader size="xs" />
            <Text size="sm" className={classes.secundario}>
              Buscando los estudios de esta consulta…
            </Text>
          </Group>
        )}
        {errorLista && (
          <Group gap="xs" wrap="wrap">
            <Text size="sm" role="alert">
              {adjuntos === undefined
                ? 'No pudimos traer los estudios adjuntos a esta consulta.'
                : 'No pudimos actualizar la lista de estudios.'}
            </Text>
            <Button variant="subtle" size="sm" className={classes.tactil} onClick={() => void cargarLista()}>
              Reintentar
            </Button>
          </Group>
        )}
        {adjuntos?.length === 0 && (
          <Text size="sm" className={classes.secundario}>
            {abierto ? 'Todavía no adjuntaste estudios a esta consulta.' : 'No se adjuntaron estudios a esta consulta.'}
          </Text>
        )}
        {adjuntos && adjuntos.length > 0 && (
          <ul className={classes.lista} aria-label="Estudios adjuntos">
            {adjuntos.map((doc) => (
              <li key={doc.id} className={classes.fila}>
                <IconoArchivo a={doc.content?.[0]?.attachment} />
                <div className={classes.texto}>
                  <NombreDelArchivo doc={doc} />
                  {fecha(doc.date) && (
                    <Text size="sm" className={classes.secundario}>
                      Adjuntado el {fecha(doc.date)}
                    </Text>
                  )}
                </div>
                {abierto && esAdjuntoDeTurno(doc) && (
                  <Button
                    variant="subtle"
                    color="red"
                    c="red.9"
                    size="sm"
                    className={classes.tactil}
                    aria-label={`Quitar ${tituloDe(doc)}`}
                    data-foco={`quitar-${doc.id}`}
                    // Mientras se sube o se adjunta otro, no se quita (una escritura por vez).
                    disabled={ocupado !== undefined}
                    onClick={() => {
                      setErrorQuitar(undefined);
                      setAQuitar(doc);
                    }}
                  >
                    Quitar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {abierto && consentimiento === 'falta' && (
          <Stack gap="xs" align="flex-start">
            <Text size="sm">{MENSAJE_SIN_CONSENTIMIENTO_ADJUNTO} Es un paso único.</Text>
            <Button component={Link} to={RUTA_CONSENTIMIENTO} className={classes.tactil}>
              Firmar el consentimiento
            </Button>
          </Stack>
        )}

        {abierto && consentimiento !== 'falta' && consentimiento !== 'cargando' && (
          <Stack gap="xs">
            <div className={classes.acciones}>
              <FileButton onChange={(f) => void subir(f)} accept={ACCEPT_ADJUNTO} resetRef={resetArchivo}>
                {(props) => (
                  <Button
                    {...props}
                    className={classes.tactil}
                    data-foco="subir"
                    loading={ocupado === 'subir'}
                    disabled={ocupado !== undefined && ocupado !== 'subir'}
                    leftSection={<IconUpload size={18} aria-hidden />}
                  >
                    Subir un PDF o una foto
                  </Button>
                )}
              </FileButton>
              <Button
                variant="default"
                className={classes.tactil}
                data-foco="elegir"
                aria-expanded={verEnviados}
                aria-controls={idEnviados}
                rightSection={
                  <IconChevronDown
                    size={16}
                    aria-hidden
                    style={{ transform: verEnviados ? 'rotate(180deg)' : undefined }}
                  />
                }
                onClick={() => {
                  if (!verEnviados && enviados === undefined) {
                    cargarEnviados();
                  }
                  setVerEnviados((v) => !v);
                }}
              >
                Elegir de los que ya mandaste
              </Button>
            </div>
            <Text size="sm" className={classes.secundario}>
              PDF o foto (JPG o PNG), de hasta {MAX_MB} MB.
            </Text>

            <div id={idEnviados} hidden={!verEnviados} className={classes.panel}>
              {verEnviados && (
                <EstudiosEnviados
                  enviados={enviados}
                  elegibles={elegibles.length}
                  embebidos={embebidos}
                  disponibles={disponibles}
                  error={errorEnviados}
                  ocupado={ocupado}
                  onReintentar={cargarEnviados}
                  onAdjuntar={(doc) => void elegir(doc)}
                />
              )}
            </div>
          </Stack>
        )}

        {/* Lo que pasa con cada acción, para todos (también para lectores de pantalla). */}
        <Text size="sm" role="status" aria-live="polite">
          {progreso}
        </Text>
        {error && (
          <Text size="sm" c="red.9" role="alert">
            {error}
          </Text>
        )}
      </Stack>

      <Modal
        opened={aQuitar !== undefined}
        onClose={cancelarQuitar}
        // El foco lo devolvemos nosotros: si se quitó, el botón que abrió el diálogo ya no existe.
        returnFocus={false}
        title="¿Quitar este estudio de la consulta?"
        centered
        classNames={{ title: classes.tituloDialogo }}
        closeButtonProps={{ size: 'xl', 'aria-label': 'Cerrar sin quitar' }}
      >
        <Stack>
          <Text size="sm">
            «{aQuitar ? tituloDe(aQuitar) : ''}» deja de estar entre los estudios de esta consulta: cuando el
            profesional abra tu ficha, ya no le va a aparecer. El archivo no se borra: si lo subiste por error, avisanos
            por{' '}
            <Link to={RUTA_MENSAJES} className={classes.enLinea}>
              Mensajes
            </Link>
            .
          </Text>
          {/* Puede ser la copia de un PDF que ya mandó: ese envío sigue vigente y el dashboard lo sigue mostrando. */}
          {aQuitar?.content?.[0]?.attachment?.contentType === PDF && (
            <Text size="sm">
              Si lo sumaste con «Elegir de los que ya mandaste», el PDF que mandaste antes queda como estaba y el
              profesional lo puede seguir viendo entre tus estudios.
            </Text>
          )}
          {errorQuitar && (
            <Text size="sm" c="red.9" role="alert">
              {errorQuitar}
            </Text>
          )}
          <Group justify="flex-end" gap="sm">
            <Button variant="default" className={classes.tactil} onClick={cancelarQuitar} disabled={quitando}>
              No, dejarlo
            </Button>
            <Button
              ref={confirmar}
              color="red.9"
              className={classes.tactil}
              onClick={() => void confirmarQuitar()}
              loading={quitando}
            >
              Sí, quitarlo
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Box>
  );
}

function EstudiosEnviados(props: {
  enviados: WithId<DocumentReference>[] | undefined;
  /** Cuántos se pueden elegir (vigentes y con archivo que el profesional abre). */
  elegibles: number;
  /** Cuántos vigentes se mandaron embebidos: no se ofrecen. */
  embebidos: number;
  disponibles: WithId<DocumentReference>[];
  error: boolean;
  ocupado: string | undefined;
  onReintentar: () => void;
  onAdjuntar: (doc: WithId<DocumentReference>) => void;
}): JSX.Element {
  const { enviados, elegibles, embebidos, disponibles, error, ocupado } = props;
  if (error) {
    return (
      <Group gap="xs" wrap="wrap">
        <Text size="sm" role="alert">
          No pudimos traer los estudios que mandaste.
        </Text>
        <Button variant="subtle" size="sm" className={classes.tactil} onClick={props.onReintentar}>
          Reintentar
        </Button>
      </Group>
    );
  }
  if (enviados === undefined) {
    return (
      <Group gap="xs">
        <Loader size="xs" />
        <Text size="sm" className={classes.secundario}>
          Buscando los estudios que mandaste…
        </Text>
      </Group>
    );
  }
  if (elegibles === 0 && embebidos === 0) {
    // Ninguno para elegir: no mandó, o los que mandó están anulados.
    return (
      <Text size="sm" className={classes.secundario}>
        {enviados.length === 0 ? 'Todavía no mandaste estudios en PDF.' : 'No tenés estudios enviados para elegir.'}
      </Text>
    );
  }
  const notaEmbebidos =
    embebidos > 0 ? (
      <Text size="sm" className={classes.secundario}>
        {elegibles === 0 ? 'Los PDFs que mandaste' : 'Algunos PDFs que mandaste'} no se pueden elegir acá: el
        profesional no podría abrirlos. Si hacen falta, subilos de nuevo con «Subir un PDF o una foto».
      </Text>
    ) : null;
  if (disponibles.length === 0) {
    return (
      <Stack gap="xs">
        {elegibles > 0 && (
          <Text size="sm" className={classes.secundario}>
            Los estudios que mandaste ya están adjuntos a esta consulta.
          </Text>
        )}
        {notaEmbebidos}
      </Stack>
    );
  }
  return (
    <Stack gap="xs">
      <ul className={classes.lista} aria-label="Estudios que ya mandaste">
        {disponibles.map((doc) => (
          <li key={doc.id} className={classes.fila}>
            <IconoArchivo a={doc.content?.[0]?.attachment} />
            <div className={classes.texto}>
              <span className={classes.nombre}>{tituloDe(doc)}</span>
              {fecha(doc.date) && (
                <Text size="sm" className={classes.secundario}>
                  Enviado el {fecha(doc.date)}
                </Text>
              )}
            </div>
            <Button
              variant="default"
              size="sm"
              className={classes.tactil}
              aria-label={`Adjuntar ${tituloDe(doc)}`}
              data-foco={`adjuntar-${doc.id}`}
              loading={ocupado === doc.id}
              disabled={ocupado !== undefined && ocupado !== doc.id}
              leftSection={<IconPaperclip size={16} aria-hidden />}
              onClick={() => props.onAdjuntar(doc)}
            >
              Adjuntar
            </Button>
          </li>
        ))}
      </ul>
      {notaEmbebidos}
    </Stack>
  );
}

export interface AdjuntosDelTurnoPlegablesProps {
  readonly appointment: WithId<Appointment>;
  readonly patient?: Patient;
  readonly nivel?: 2 | 3;
  /**
   * Con `false` la sección se muestra abierta y sin botón (la sala de espera). Puede cambiar en
   * vivo (al abrirse la videollamada): la sección no se desmonta, así no se pierde una subida
   * en curso ni su resultado.
   */
  readonly plegable?: boolean;
  /** Qué turno es: describe el botón y se suma, oculto, al título (ver `AdjuntosDelTurnoProps`). */
  readonly contexto?: string;
}

/**
 * Los estudios del turno detrás de un botón «Adjuntar estudios (N)»: para no alargar la
 * lista de «Mis turnos» ni estorbar la videollamada abierta. El contador se lee al montar
 * (una búsqueda por turno) y se actualiza con lo que se adjunta o se quita.
 *
 * Plegar solo OCULTA la sección (`hidden`): una vez abierta queda montada, con su escritura en
 * curso, su traba contra dos toques y el contador al día. Si algo termina (o está en curso, o
 * falló) con la sección plegada, el aviso aparece junto al botón.
 */
export function AdjuntosDelTurnoPlegables({
  appointment,
  patient,
  nivel,
  plegable = true,
  contexto,
}: AdjuntosDelTurnoPlegablesProps): JSX.Element {
  const medplum = useMedplum();
  const [abierto, setAbierto] = useState(false);
  const visible = !plegable || abierto;
  /** Se monta la primera vez que se muestra (no antes: una búsqueda menos por turno) y queda. */
  const [montada, setMontada] = useState(visible);
  const [cantidad, setCantidad] = useState<number>();
  const [aviso, setAviso] = useState<AvisoAdjuntos>();
  /** El aviso llegó con la sección plegada (un «Listo» de antes de plegar no se repite). */
  const [llegoPlegado, setLlegoPlegado] = useState(false);
  const visibleAhora = useRef(visible);
  const idPanel = useId();
  const idContexto = useId();

  // Antes que los efectos de la sección (que avisan), para saber si el aviso llega plegado.
  useLayoutEffect(() => {
    visibleAhora.current = visible;
    if (visible) {
      setMontada(true);
      setLlegoPlegado(false);
    }
  }, [visible]);

  const recibirAviso = useCallback((nuevo: AvisoAdjuntos | undefined) => {
    setAviso(nuevo);
    setLlegoPlegado(!visibleAhora.current);
  }, []);

  useEffect(() => {
    let vigente = true;
    cargarAdjuntosDelTurno(medplum, appointment.id)
      // Si la sección ya contó (está abierta), su número es el más nuevo.
      .then((docs) => vigente && setCantidad((c) => c ?? docs.length))
      // Sin el número, el botón dice «Adjuntar estudios» y el panel muestra el error.
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, [medplum, appointment.id]);

  const avisoPlegado = !visible && aviso && (aviso.tipo !== 'listo' || llegoPlegado) ? aviso : undefined;

  return (
    <Stack gap="sm">
      {plegable && (
        <Stack gap={4}>
          <Group>
            <Button
              variant="default"
              className={classes.tactil}
              aria-expanded={abierto}
              aria-controls={idPanel}
              aria-describedby={contexto ? idContexto : undefined}
              leftSection={<IconPaperclip size={18} aria-hidden />}
              rightSection={
                <IconChevronDown size={16} aria-hidden style={{ transform: abierto ? 'rotate(180deg)' : undefined }} />
              }
              onClick={() => setAbierto((a) => !a)}
            >
              {cantidad ? `Adjuntar estudios (${cantidad})` : 'Adjuntar estudios'}
            </Button>
          </Group>
          {contexto && (
            <span id={idContexto} hidden>
              {contexto}
            </span>
          )}
          <Text size="sm" role="status" aria-live="polite">
            {avisoPlegado && avisoPlegado.tipo !== 'error' ? avisoPlegado.texto : null}
          </Text>
          {avisoPlegado?.tipo === 'error' && (
            <Text size="sm" c="red.9" role="alert">
              {avisoPlegado.texto}
            </Text>
          )}
        </Stack>
      )}
      <div id={idPanel} hidden={!visible}>
        {(montada || visible) && (
          <AdjuntosDelTurno
            appointment={appointment}
            patient={patient}
            nivel={nivel}
            onCambio={setCantidad}
            onAviso={recibirAviso}
            compacto={plegable}
            contexto={contexto}
          />
        )}
      </div>
    </Stack>
  );
}

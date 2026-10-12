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
// dice con un link.
import { Box, Button, FileButton, Group, Loader, Modal, Stack, Text, Title, VisuallyHidden } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { Appointment, Attachment, DocumentReference, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconChevronDown, IconFileTypePdf, IconPaperclip, IconPhoto, IconUpload } from '@tabler/icons-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
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
  puedeAdjuntar,
  quitarAdjunto,
} from '../../fhir/adjuntosTurno';
import { buscarConsentimiento, RUTA_CONSENTIMIENTO } from '../../fhir/consentimiento';
import { cargarEstudiosEnviados, MAX_MB } from '../../fhir/estudios';
import type { ResultadoEnvioEstudio } from '../../fhir/estudios';
import { RUTA_ENVIAR_ESTUDIOS } from '../AccionesRapidas';
import classes from './AdjuntosDelTurno.module.css';

export const TITULO_ADJUNTOS = 'Estudios para esta consulta';

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
}

type EstadoConsentimiento = 'cargando' | 'firmado' | 'falta' | 'no-se-pudo-revisar';

export function AdjuntosDelTurno({
  appointment,
  patient,
  nivel = 3,
  onCambio,
  ahora,
  compacto = false,
}: AdjuntosDelTurnoProps): JSX.Element {
  const medplum = useMedplum();
  const persona = patient ?? (medplum.getProfile() as Patient);
  const abierto = puedeAdjuntar(appointment, ahora);
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
  const resetArchivo = useRef<() => void>(null);
  const avisar = useRef(onCambio);
  useEffect(() => {
    avisar.current = onCambio;
  });
  useEffect(() => {
    if (adjuntos) {
      avisar.current?.(adjuntos.length);
    }
  }, [adjuntos]);

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
    if (!file) {
      return;
    }
    setOcupado('subir');
    setError(undefined);
    setProgreso(`Subiendo «${file.name}»…`);
    const r = await adjuntarArchivo(medplum, persona, appointment, file);
    resetArchivo.current?.();
    setOcupado(undefined);
    alTerminar(r, file.name);
  };

  const elegir = async (doc: WithId<DocumentReference>): Promise<void> => {
    setOcupado(doc.id);
    setError(undefined);
    setProgreso(`Adjuntando «${tituloDe(doc)}»…`);
    const r = await adjuntarDeMisEstudios(medplum, persona, appointment, doc);
    setOcupado(undefined);
    alTerminar(r, tituloDe(doc));
  };

  const confirmarQuitar = async (): Promise<void> => {
    if (!aQuitar) {
      return;
    }
    setQuitando(true);
    setErrorQuitar(undefined);
    const r = await quitarAdjunto(medplum, aQuitar, appointment.id);
    setQuitando(false);
    if (!r.ok) {
      setErrorQuitar(r.mensaje);
      return;
    }
    const quitado = aQuitar.id;
    setAdjuntos((antes) => (antes ?? []).filter((d) => d.id !== quitado));
    setError(undefined);
    setProgreso(`Quitamos «${tituloDe(aQuitar)}» de esta consulta.`);
    setAQuitar(undefined);
  };

  const yaAdjuntos = new Set((adjuntos ?? []).map((d) => claveDeArchivo(d.content?.[0]?.attachment)));
  const disponibles = (enviados ?? []).filter((d) => {
    const clave = claveDeArchivo(d.content?.[0]?.attachment);
    return clave !== undefined && !yaAdjuntos.has(clave);
  });
  const cancelado = appointment.status === 'cancelled' || appointment.status === 'entered-in-error';

  return (
    <Box component="section" aria-labelledby={idTitulo} className={classes.seccion}>
      <Stack gap="sm">
        <Title order={nivel} id={idTitulo} fz={compacto ? 'lg' : 'h4'}>
          {TITULO_ADJUNTOS}
        </Title>

        {abierto ? (
          <Text size="sm">
            Lo que adjuntes lo ve el profesional que te atiende, antes de la consulta. No lo lee nuestra IA ni se suma a
            tus biomarcadores: para eso está{' '}
            <Link to={RUTA_ENVIAR_ESTUDIOS} className={classes.enLinea}>
              Enviar estudios en PDF
            </Link>
            .
          </Text>
        ) : (
          <Text size="sm">
            {cancelado
              ? 'Este turno se canceló: no se pueden sumar más estudios.'
              : 'Este turno ya pasó: no se pueden sumar más estudios.'}
          </Text>
        )}

        {/* La lista: lo que ya está adjunto (y ve el profesional). */}
        {adjuntos === undefined && !errorLista && (
          <Group gap="xs">
            <Loader size="xs" />
            <Text size="sm" c="dimmed">
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
          <Text size="sm" c="dimmed">
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
                    <Text size="xs" c="dimmed">
                      Adjuntado el {fecha(doc.date)}
                    </Text>
                  )}
                </div>
                {abierto && esAdjuntoDeTurno(doc) && (
                  <Button
                    variant="subtle"
                    color="red"
                    size="sm"
                    className={classes.tactil}
                    aria-label={`Quitar ${tituloDe(doc)}`}
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
            <Button component={Link} to={RUTA_CONSENTIMIENTO} variant="light" className={classes.tactil}>
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
            <Text size="xs" c="dimmed">
              PDF o foto (JPG o PNG), de hasta {MAX_MB} MB.
            </Text>

            <div id={idEnviados} hidden={!verEnviados} className={classes.panel}>
              {verEnviados && (
                <EstudiosEnviados
                  enviados={enviados}
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
          <Text size="sm" c="red.8" role="alert">
            {error}
          </Text>
        )}
      </Stack>

      <Modal
        opened={aQuitar !== undefined}
        onClose={() => !quitando && setAQuitar(undefined)}
        title="¿Quitar este estudio de la consulta?"
        centered
      >
        <Stack>
          <Text size="sm">
            «{aQuitar ? tituloDe(aQuitar) : ''}» deja de estar entre los estudios de esta consulta y el profesional ya
            no lo ve en su ficha.
          </Text>
          {errorQuitar && (
            <Text size="sm" c="red.8" role="alert">
              {errorQuitar}
            </Text>
          )}
          <Group justify="flex-end" gap="sm">
            <Button
              variant="default"
              className={classes.tactil}
              onClick={() => setAQuitar(undefined)}
              disabled={quitando}
            >
              No, dejarlo
            </Button>
            <Button color="red" className={classes.tactil} onClick={() => void confirmarQuitar()} loading={quitando}>
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
  disponibles: WithId<DocumentReference>[];
  error: boolean;
  ocupado: string | undefined;
  onReintentar: () => void;
  onAdjuntar: (doc: WithId<DocumentReference>) => void;
}): JSX.Element {
  const { enviados, disponibles, error, ocupado } = props;
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
        <Text size="sm" c="dimmed">
          Buscando los estudios que mandaste…
        </Text>
      </Group>
    );
  }
  if (disponibles.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        {enviados.length === 0
          ? 'Todavía no mandaste estudios en PDF.'
          : 'Los estudios que mandaste ya están adjuntos a esta consulta.'}
      </Text>
    );
  }
  return (
    <ul className={classes.lista} aria-label="Estudios que ya mandaste">
      {disponibles.map((doc) => (
        <li key={doc.id} className={classes.fila}>
          <IconoArchivo a={doc.content?.[0]?.attachment} />
          <div className={classes.texto}>
            <span className={classes.nombre}>{tituloDe(doc)}</span>
            {fecha(doc.date) && (
              <Text size="xs" c="dimmed">
                Enviado el {fecha(doc.date)}
              </Text>
            )}
          </div>
          <Button
            variant="light"
            size="sm"
            className={classes.tactil}
            aria-label={`Adjuntar ${tituloDe(doc)}`}
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
  );
}

export interface AdjuntosDelTurnoPlegablesProps {
  readonly appointment: WithId<Appointment>;
  readonly patient?: Patient;
  readonly nivel?: 2 | 3;
}

/**
 * Los estudios del turno detrás de un botón «Adjuntar estudios (N)»: para no alargar la
 * lista de «Mis turnos» ni estorbar la videollamada abierta. El contador se lee al montar
 * (una búsqueda por turno) y se actualiza con lo que se adjunta o se quita.
 */
export function AdjuntosDelTurnoPlegables({
  appointment,
  patient,
  nivel,
}: AdjuntosDelTurnoPlegablesProps): JSX.Element {
  const medplum = useMedplum();
  const [abierto, setAbierto] = useState(false);
  const [cantidad, setCantidad] = useState<number>();
  const idPanel = useId();

  useEffect(() => {
    let vigente = true;
    cargarAdjuntosDelTurno(medplum, appointment.id)
      .then((docs) => vigente && setCantidad(docs.length))
      // Sin el número, el botón dice «Adjuntar estudios» y el panel muestra el error.
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, [medplum, appointment.id]);

  return (
    <Stack gap="sm">
      <Group>
        <Button
          variant="default"
          className={classes.tactil}
          aria-expanded={abierto}
          aria-controls={idPanel}
          leftSection={<IconPaperclip size={18} aria-hidden />}
          rightSection={
            <IconChevronDown size={16} aria-hidden style={{ transform: abierto ? 'rotate(180deg)' : undefined }} />
          }
          onClick={() => setAbierto((a) => !a)}
        >
          {cantidad ? `Adjuntar estudios (${cantidad})` : 'Adjuntar estudios'}
        </Button>
      </Group>
      <div id={idPanel} hidden={!abierto}>
        {abierto && (
          <AdjuntosDelTurno appointment={appointment} patient={patient} nivel={nivel} onCambio={setCantidad} compacto />
        )}
      </div>
    </Stack>
  );
}

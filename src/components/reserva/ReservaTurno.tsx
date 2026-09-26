// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Reservar un turno desde el portal (R-23): Modalidad → Consulta → Profesional → Horario →
// Confirmar. Todo sale de FHIR (catálogo, profesionales, horarios libres) y la reserva la
// hace el bot `som-reservar-portal` de recepcionistas, que aplica las reglas del lado del
// servidor. Con cargo, el turno queda tentativo con el link de MercadoPago de la seña
// (horario retenido 30 minutos); la consulta del Plan Bienestar 100 Días® queda confirmada
// sin seña. Reemplaza a la "preferencia de horario" en texto libre.
import { Alert, Badge, Button, Card, Checkbox, Group, Loader, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import type { Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import {
  IconArrowLeft,
  IconBuildingHospital,
  IconCalendarCheck,
  IconCircleCheck,
  IconClockHour4,
  IconCreditCard,
  IconInfoCircle,
  IconVideo,
} from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import {
  aceptarConsentimientoTeleconsulta,
  agruparPorDia,
  agruparPorEspecialidad,
  cargarCatalogo,
  cargarConsultasPlan,
  cargarHorarios,
  cargarProfesionales,
  DIAS_AGENDA,
  ETIQUETA_MODALIDAD,
  fmtDiaArg,
  fmtHoraArg,
  MODALIDADES,
  nombreSegunModalidad,
  pesos,
  reservarHorario,
  TEXTO_CONSENTIMIENTO_TELECONSULTA,
  tieneConsentimientoTeleconsulta,
  type ConsultaCatalogo,
  type ConsultaPlan,
  type Horario,
  type Modalidad,
  type Profesional,
  type ResultadoReserva,
} from '../../fhir/agenda';
import { showErrorNotification } from '../../utils/notifications';

type Paso = 'modalidad' | 'consulta' | 'profesional' | 'horario' | 'confirmar' | 'resultado';

interface Seleccion {
  modalidad?: Modalidad;
  consulta?: ConsultaCatalogo;
  /** Si es una consulta del plan: cuál (su tarea). */
  consultaPlan?: ConsultaPlan;
  profesional?: Profesional;
  horario?: Horario;
}

const PASOS: Paso[] = ['modalidad', 'consulta', 'profesional', 'horario', 'confirmar'];
const ICONO_MODALIDAD: Record<Modalidad, JSX.Element> = {
  teleconsulta: <IconVideo size={28} />,
  presencial: <IconBuildingHospital size={28} />,
};
const DESCRIPCION_MODALIDAD: Record<Modalidad, string> = {
  teleconsulta: 'Desde donde estés, con el link de la videollamada en tu turno.',
  presencial: 'En nuestros consultorios, con el profesional que elijas.',
};

const capitalizar = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const fmtFecha = (d: Date): string => `${capitalizar(fmtDiaArg.format(d))}, ${fmtHoraArg.format(d)} h`;
const fmtDia = (ymd: string): string => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long' }).format(new Date(y!, (m ?? 1) - 1, d ?? 1));
};

function textoVentana(v: ConsultaPlan['ventana']): string {
  if (v.desde && v.hasta) {
    return `Entre el ${fmtDia(v.desde)} y el ${fmtDia(v.hasta)}`;
  }
  return v.desde ? `Desde el ${fmtDia(v.desde)}` : 'Cuando quieras';
}

/** Tarjeta clickeable (un botón con aspecto de tarjeta). */
function Opcion({ onClick, children, ariaLabel }: { onClick: () => void; children: React.ReactNode; ariaLabel: string }): JSX.Element {
  return (
    <Card
      component="button"
      type="button"
      withBorder
      radius="md"
      p="md"
      onClick={onClick}
      aria-label={ariaLabel}
      style={{ cursor: 'pointer', textAlign: 'left', width: '100%' }}
    >
      {children}
    </Card>
  );
}

export function ReservaTurno({ patient, onReservado }: { patient: Patient; onReservado?: () => void }): JSX.Element {
  const medplum = useMedplum();
  const [paso, setPaso] = useState<Paso>('modalidad');
  const [sel, setSel] = useState<Seleccion>({});
  const [catalogo, setCatalogo] = useState<ConsultaCatalogo[]>();
  const [consultasPlan, setConsultasPlan] = useState<ConsultaPlan[]>([]);
  const [tieneConsent, setTieneConsent] = useState<boolean>();
  const [aceptaConsent, setAceptaConsent] = useState(false);
  const [profesionales, setProfesionales] = useState<Profesional[]>();
  const [horarios, setHorarios] = useState<Horario[]>();
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoReserva>();

  // Catálogo, consultas del plan y consentimiento: una vez.
  useEffect(() => {
    let vigente = true;
    Promise.all([
      cargarCatalogo(medplum),
      cargarConsultasPlan(medplum, patient).catch(() => []),
      tieneConsentimientoTeleconsulta(medplum, patient).catch(() => false),
    ])
      .then(([c, p, t]) => {
        if (vigente) {
          setCatalogo(c);
          setConsultasPlan(p);
          setTieneConsent(t);
        }
      })
      .catch((err) => {
        showErrorNotification(err);
        if (vigente) {
          setCatalogo([]);
        }
      });
    return () => {
      vigente = false;
    };
  }, [medplum, patient]);

  // Profesionales de la consulta elegida, en esa modalidad.
  useEffect(() => {
    if (paso !== 'profesional' || !sel.consulta || !sel.modalidad) {
      return;
    }
    setProfesionales(undefined);
    cargarProfesionales(medplum, sel.consulta.codigo, sel.modalidad)
      .then(setProfesionales)
      .catch((err) => {
        showErrorNotification(err);
        setProfesionales([]);
      });
  }, [paso, sel.consulta, sel.modalidad, medplum]);

  // Horarios libres del profesional (solo los de la ventana, si es una consulta del plan).
  useEffect(() => {
    if (paso !== 'horario' || !sel.profesional || !sel.modalidad) {
      return;
    }
    setHorarios(undefined);
    cargarHorarios(medplum, sel.profesional, sel.modalidad, { ventana: sel.consultaPlan?.ventana })
      .then(setHorarios)
      .catch((err) => {
        showErrorNotification(err);
        setHorarios([]);
      });
  }, [paso, sel.profesional, sel.modalidad, sel.consultaPlan, medplum]);

  const reiniciar = (): void => {
    setSel({});
    setResultado(undefined);
    setAceptaConsent(false);
    setPaso('modalidad');
  };

  const volver = (): void => {
    const i = PASOS.indexOf(paso);
    setPaso(PASOS[Math.max(0, i - 1)] ?? 'modalidad');
  };

  const reservar = async (): Promise<void> => {
    if (!sel.modalidad || !sel.consulta || !sel.horario) {
      return;
    }
    setEnviando(true);
    try {
      if (sel.modalidad === 'teleconsulta' && !tieneConsent) {
        await aceptarConsentimientoTeleconsulta(medplum, patient);
        setTieneConsent(true);
      }
      const r = await reservarHorario(medplum, patient, {
        servicioCodigo: sel.consulta.codigo,
        slotId: sel.horario.slotId,
        modalidad: sel.modalidad,
        ...(sel.consultaPlan ? { tareaId: sel.consultaPlan.taskId } : {}),
      });
      setResultado(r);
      setPaso('resultado');
      if (r.ok) {
        onReservado?.();
      }
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setEnviando(false);
    }
  };

  if (catalogo === undefined) {
    return <Loader size="sm" />;
  }

  const nombreConsulta = sel.consulta && sel.modalidad ? nombreSegunModalidad(sel.consulta.nombre, sel.modalidad) : '';
  const resumen = [
    sel.modalidad && ETIQUETA_MODALIDAD[sel.modalidad],
    sel.consultaPlan?.titulo ?? (nombreConsulta || undefined),
    sel.profesional?.nombre,
    sel.horario && fmtFecha(sel.horario.inicio),
  ].filter(Boolean);

  const encabezado =
    paso !== 'modalidad' && paso !== 'resultado' ? (
      <Group justify="space-between" wrap="nowrap">
        <Button variant="subtle" size="xs" leftSection={<IconArrowLeft size={14} />} onClick={volver}>
          Volver
        </Button>
        <Text size="xs" c="dimmed" ta="right">
          Paso {PASOS.indexOf(paso) + 1} de {PASOS.length} · {resumen.join(' · ')}
        </Text>
      </Group>
    ) : null;

  return (
    <Stack gap="md" data-testid="reserva-turno">
      {encabezado}

      {paso === 'modalidad' && (
        <>
          <Title order={4}>¿Cómo querés atenderte?</Title>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            {MODALIDADES.map((m) => (
              <Opcion
                key={m}
                ariaLabel={m === 'teleconsulta' ? 'Consulta por videollamada' : 'Consulta en el centro'}
                onClick={() => {
                  setSel({ modalidad: m });
                  setPaso('consulta');
                }}
              >
                <Group wrap="nowrap" align="flex-start">
                  {ICONO_MODALIDAD[m]}
                  <div>
                    <Text fw={600}>{m === 'teleconsulta' ? 'Consulta por videollamada' : 'Consulta en el centro'}</Text>
                    <Text size="sm" c="dimmed">
                      {DESCRIPCION_MODALIDAD[m]}
                    </Text>
                  </div>
                </Group>
              </Opcion>
            ))}
          </SimpleGrid>
        </>
      )}

      {paso === 'consulta' && sel.modalidad && (
        <PasoConsulta
          modalidad={sel.modalidad}
          catalogo={catalogo}
          consultasPlan={consultasPlan}
          onElegir={(consulta, consultaPlan) => {
            setSel((s) => ({ ...s, consulta, consultaPlan, profesional: undefined, horario: undefined }));
            setPaso('profesional');
          }}
        />
      )}

      {paso === 'profesional' && (
        <>
          <Title order={4}>¿Con quién?</Title>
          {profesionales === undefined ? (
            <Loader size="sm" />
          ) : profesionales.length === 0 ? (
            <Alert color="yellow" variant="light" icon={<IconInfoCircle />}>
              Por ahora ningún profesional atiende esta consulta {sel.modalidad === 'teleconsulta' ? 'por videollamada' : 'en el centro'}.
              Probá con la otra modalidad o escribinos por Mensajes.
            </Alert>
          ) : (
            <Stack gap="sm">
              {profesionales.map((p) => (
                <Opcion
                  key={p.codigo}
                  ariaLabel={p.nombre}
                  onClick={() => {
                    setSel((s) => ({ ...s, profesional: p, horario: undefined }));
                    setPaso('horario');
                  }}
                >
                  <Text fw={600}>{p.nombre}</Text>
                  {p.especialidad && (
                    <Text size="sm" c="dimmed">
                      {p.especialidad}
                    </Text>
                  )}
                </Opcion>
              ))}
            </Stack>
          )}
        </>
      )}

      {paso === 'horario' && (
        <>
          <Title order={4}>¿Cuándo?</Title>
          {horarios === undefined ? (
            <Loader size="sm" />
          ) : horarios.length === 0 ? (
            <Alert color="yellow" variant="light" icon={<IconInfoCircle />}>
              {sel.consultaPlan
                ? `No hay horarios libres de ${sel.profesional?.nombre ?? 'este profesional'} dentro de la ventana de tu consulta (${textoVentana(sel.consultaPlan.ventana).toLowerCase()}).`
                : `No hay horarios libres de ${sel.profesional?.nombre ?? 'este profesional'} en los próximos ${DIAS_AGENDA} días.`}{' '}
              Probá con otro profesional o escribinos por Mensajes.
            </Alert>
          ) : (
            <Stack gap="md">
              {agruparPorDia(horarios).map((d) => (
                <div key={d.dia}>
                  <Text fw={600} size="sm" mb={6}>
                    {capitalizar(fmtDiaArg.format(d.horarios[0]!.inicio))}
                  </Text>
                  <Group gap="xs">
                    {d.horarios.map((h) => (
                      <Button
                        key={h.slotId}
                        variant="light"
                        size="sm"
                        leftSection={<IconClockHour4 size={14} />}
                        onClick={() => {
                          setSel((s) => ({ ...s, horario: h }));
                          setPaso('confirmar');
                        }}
                      >
                        {fmtHoraArg.format(h.inicio)}
                      </Button>
                    ))}
                  </Group>
                </div>
              ))}
            </Stack>
          )}
        </>
      )}

      {paso === 'confirmar' && sel.modalidad && sel.consulta && sel.profesional && sel.horario && (
        <>
          <Title order={4}>Confirmá tu turno</Title>
          <Card withBorder radius="md" p="md">
            <Stack gap={4}>
              <Text fw={600}>{sel.consultaPlan ? `${sel.consultaPlan.titulo} · ${nombreConsulta}` : nombreConsulta}</Text>
              <Text size="sm">{sel.profesional.nombre}</Text>
              <Text size="sm">{fmtFecha(sel.horario.inicio)}</Text>
              <Text size="sm" c="dimmed">
                {ETIQUETA_MODALIDAD[sel.modalidad]}
              </Text>
              {sel.consulta.incluidaEnPlan ? (
                <Badge color="segundaOpinion" variant="light" w="fit-content" mt={4}>
                  Incluida en tu plan · sin seña
                </Badge>
              ) : (
                <Text size="sm" mt={4}>
                  Precio {pesos(sel.consulta.precioARS)}. Para confirmar el turno se paga una seña del 50 % (
                  {pesos(sel.consulta.precioARS / 2)}) con Mercado Pago; te guardamos el horario 30 minutos.
                </Text>
              )}
            </Stack>
          </Card>
          {sel.modalidad === 'teleconsulta' && tieneConsent === false && (
            <Card withBorder radius="md" p="md">
              <Text size="sm" mb="sm">
                {TEXTO_CONSENTIMIENTO_TELECONSULTA}
              </Text>
              <Checkbox
                label="Leí y acepto el consentimiento de teleconsulta"
                checked={aceptaConsent}
                onChange={(e) => setAceptaConsent(e.currentTarget.checked)}
              />
            </Card>
          )}
          <Group>
            <Button
              leftSection={<IconCalendarCheck size={16} />}
              loading={enviando}
              disabled={sel.modalidad === 'teleconsulta' && tieneConsent === false && !aceptaConsent}
              onClick={reservar}
            >
              Reservar
            </Button>
          </Group>
        </>
      )}

      {paso === 'resultado' && resultado && <Resultado r={resultado} onOtro={reiniciar} onOtroHorario={() => setPaso('horario')} />}
    </Stack>
  );
}

function PasoConsulta({
  modalidad,
  catalogo,
  consultasPlan,
  onElegir,
}: {
  modalidad: Modalidad;
  catalogo: ConsultaCatalogo[];
  consultasPlan: ConsultaPlan[];
  onElegir: (consulta: ConsultaCatalogo, consultaPlan?: ConsultaPlan) => void;
}): JSX.Element {
  const consultaPlan = catalogo.find((c) => c.incluidaEnPlan && c.modalidades.includes(modalidad));
  const delPlan = consultaPlan ? consultasPlan : [];
  const grupos = agruparPorEspecialidad(catalogo, modalidad);

  if (delPlan.length === 0 && grupos.length === 0) {
    return (
      <Alert color="yellow" variant="light" icon={<IconInfoCircle />}>
        Todavía no hay consultas para reservar online. Escribinos por Mensajes y coordinamos tu turno.
      </Alert>
    );
  }

  return (
    <Stack gap="lg">
      <Title order={4}>¿Qué consulta?</Title>
      {delPlan.length > 0 && consultaPlan && (
        <Card withBorder radius="md" p="md">
          <Text fw={600} mb="xs">
            Tu Plan Bienestar 100 Días®
          </Text>
          <Stack gap="xs">
            {delPlan.map((c) => (
              <Group key={c.taskId} justify="space-between" wrap="nowrap">
                <div>
                  <Text size="sm" fw={500}>
                    {c.titulo}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {c.estado === 'agendada' ? 'Ya está agendada' : textoVentana(c.ventana)} · Incluida en tu plan
                  </Text>
                </div>
                {c.estado === 'por-agendar' ? (
                  <Button size="xs" variant="light" onClick={() => onElegir(consultaPlan, c)} aria-label={`Elegir ${c.titulo}`}>
                    Elegir
                  </Button>
                ) : (
                  <Badge color="gray" variant="light">
                    Agendada
                  </Badge>
                )}
              </Group>
            ))}
          </Stack>
        </Card>
      )}
      {grupos.length > 0 && (
        <Stack gap="md">
          <Text fw={600}>Consultas por especialidad</Text>
          {grupos.map((g) => (
            <div key={g.grupo}>
              <Text size="sm" c="dimmed" mb={6}>
                {g.nombre}
              </Text>
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                {g.consultas.map((c) => (
                  <Opcion key={c.codigo} ariaLabel={nombreSegunModalidad(c.nombre, modalidad)} onClick={() => onElegir(c)}>
                    <Group justify="space-between" wrap="nowrap">
                      <Text size="sm" fw={500}>
                        {nombreSegunModalidad(c.nombre, modalidad)}
                      </Text>
                      <Text size="sm" c="dimmed">
                        {c.precioARS > 0 ? pesos(c.precioARS) : 'con cargo'}
                      </Text>
                    </Group>
                  </Opcion>
                ))}
              </SimpleGrid>
            </div>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function Resultado({ r, onOtro, onOtroHorario }: { r: ResultadoReserva; onOtro: () => void; onOtroHorario: () => void }): JSX.Element {
  if (!r.ok) {
    return (
      <Stack gap="sm">
        <Alert color="red" variant="light" title="No pudimos reservar ese horario" icon={<IconInfoCircle />}>
          {r.mensaje ?? 'Probá con otro horario.'}
        </Alert>
        <Group>
          <Button variant="light" onClick={onOtroHorario}>
            Elegir otro horario
          </Button>
          <Button variant="subtle" onClick={onOtro}>
            Empezar de nuevo
          </Button>
        </Group>
      </Stack>
    );
  }
  const cuando = r.inicio ? fmtFecha(new Date(r.inicio)) : '';
  return (
    <Stack gap="sm">
      {r.estado === 'confirmado' ? (
        <Alert color="segundaOpinion" variant="light" title="¡Consulta confirmada!" icon={<IconCircleCheck />}>
          {r.descripcion} · {cuando}. Está incluida en tu plan: no lleva seña. La vas a ver en "Mis turnos"
          {r.modalidad === 'teleconsulta' ? ', con el link de la videollamada' : ''}.
        </Alert>
      ) : r.linkPago ? (
        <Alert color="yellow" variant="light" title="Reservado: falta la seña para confirmarlo" icon={<IconClockHour4 />}>
          <Stack gap="xs">
            <Text size="sm">
              {r.descripcion} · {cuando}.
              {r.expira ? ` Te guardamos el horario hasta las ${fmtHoraArg.format(new Date(r.expira))} h.` : ''}
              {r.senaARS ? ` La seña es de ${pesos(r.senaARS)} (el 50 %).` : ''} Cuando se acredite, el turno queda confirmado solo.
            </Text>
            <Button component="a" href={r.linkPago} target="_blank" rel="noopener noreferrer" leftSection={<IconCreditCard size={16} />} w="fit-content">
              Pagar la seña con Mercado Pago
            </Button>
          </Stack>
        </Alert>
      ) : (
        <Alert color="yellow" variant="light" title="Reservado" icon={<IconInfoCircle />}>
          {r.descripcion} · {cuando}. Recepción te va a contactar para coordinar la seña; el horario queda reservado.
        </Alert>
      )}
      {r.advertencias && r.advertencias.length > 0 && (
        <Text size="xs" c="dimmed">
          {r.advertencias.join(' ')}
        </Text>
      )}
      <Group>
        <Button variant="subtle" onClick={onOtro}>
          Reservar otro turno
        </Button>
      </Group>
    </Stack>
  );
}

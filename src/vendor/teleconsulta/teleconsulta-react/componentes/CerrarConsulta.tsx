import {
  BOTS,
  TC,
  buildInformeConsulta,
  buildOrdenEstudio,
  buildReceta,
  buildTareaAgendarControl,
  claveAgendarControl,
  docDefinitionInforme,
  formatearFecha,
  referenciaPaciente,
  type CategoriaOrden,
} from '@epa/teleconsulta-core';
import { formatHumanName, type CreatePdfOptions } from '@medplum/core';
import type { Encounter, Identifier, Patient, Practitioner, Reference } from '@medplum/fhirtypes';
import {
  ActionIcon,
  Alert,
  Button,
  Card,
  Checkbox,
  Group,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core';
import { useMedplum, useMedplumProfile } from '@medplum/react';
import { useRef, useState, type ReactElement } from 'react';
import { llamarBot, type RespuestaBot } from '../bots';
import type { TurnoVirtual } from '../hooks/useTurnosPaciente';
import { useTeleconsultaConfig } from '../TeleconsultaContext';

interface Orden {
  descripcion: string;
  categoria: CategoriaOrden;
}

interface Receta {
  medicamento: string;
  indicacion: string;
}

const PLAZOS = ['7 días', '15 días', '30 días', '3 meses', '6 meses', '1 año'];

function porSistema(ids: Identifier[] | undefined, patron: RegExp): string | undefined {
  return ids?.find((i) => patron.test(i.system ?? '') || patron.test(i.type?.text ?? ''))?.value;
}

function nombre(recurso: Patient | Practitioner | undefined, porDefecto: string): string {
  const n = recurso?.name?.[0];
  return n ? formatHumanName(n) : porDefecto;
}

export interface CerrarConsultaProps {
  turno: TurnoVirtual;
  /** Called once the appointment is `fulfilled`. */
  onCerrada?: () => void;
}

/**
 * The professional closes the consultation: report (PDF), study orders,
 * prescriptions and an optional "schedule a follow-up" notice for the care
 * team, then the cerrar bot marks it finished. Each step runs once: a retry
 * after an error resumes where it stopped instead of duplicating documents.
 */
export function CerrarConsulta(props: CerrarConsultaProps): ReactElement {
  const medplum = useMedplum();
  const perfil = useMedplumProfile() as Practitioner | undefined;
  const { institucion, zonaHoraria } = useTeleconsultaConfig();
  const { turno } = props;
  const [motivo, setMotivo] = useState(turno.comment ?? turno.reasonCode?.[0]?.text ?? '');
  const [evolucion, setEvolucion] = useState('');
  const [indicaciones, setIndicaciones] = useState('');
  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [recetas, setRecetas] = useState<Receta[]>([]);
  const [control, setControl] = useState(false);
  const [plazo, setPlazo] = useState<string | null>('30 días');
  const [modalidad, setModalidad] = useState<'virtual' | 'presencial'>('virtual');
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<string | undefined>(undefined);
  const hecho = useRef<{ informe?: boolean; ordenes?: boolean; recetas?: boolean; tarea?: boolean }>({});

  const enCurso = turno.status === 'arrived' || turno.status === 'checked-in';

  const finalizar = async (): Promise<void> => {
    const pacienteRef = referenciaPaciente(turno) as Reference<Patient> | undefined;
    if (!pacienteRef?.reference || !perfil?.id) {
      setMensaje('No encontramos al paciente o al profesional de este turno.');
      return;
    }
    if (!evolucion.trim()) {
      setMensaje('Escribí la evolución antes de finalizar.');
      return;
    }
    setEnviando(true);
    setMensaje(undefined);
    const profesional: Reference<Practitioner> = { reference: `Practitioner/${perfil.id}` };
    const turnoRef = { reference: `Appointment/${turno.id}` };
    const ahora = new Date();
    const fecha = ahora.toISOString();
    const ordenesValidas = ordenes.filter((o) => o.descripcion.trim());
    const recetasValidas = recetas.filter((r) => r.medicamento.trim());

    try {
      const encounter = (await medplum
        .searchOne('Encounter', { appointment: `Appointment/${turno.id}` }, { cache: 'no-cache' })
        .catch(() => undefined)) as (Encounter & { id: string }) | undefined;
      const encounterRef = encounter ? { reference: `Encounter/${encounter.id}` } : undefined;
      const clinico = { paciente: pacienteRef, profesional, encounter: encounterRef, fecha };

      if (!hecho.current.informe) {
        const paciente = await medplum.readReference(pacienteRef).catch(() => undefined);
        const docDefinition = docDefinitionInforme({
          institucion,
          profesional: nombre(perfil, 'Profesional'),
          matricula:
            perfil.qualification?.[0]?.identifier?.[0]?.value ?? porSistema(perfil.identifier, /matr[ií]cula/i),
          paciente: nombre(paciente, 'Paciente'),
          documentoPaciente: porSistema(paciente?.identifier, /dni/i),
          fecha: ahora,
          motivo: motivo.trim() || undefined,
          evolucion: evolucion.trim(),
          indicaciones: indicaciones.trim() || undefined,
          ordenes: ordenesValidas.map((o) => o.descripcion.trim()),
          recetas: recetasValidas.map((r) => ({ medicamento: r.medicamento.trim(), indicacion: r.indicacion.trim() })),
          zona: zonaHoraria,
        }) as CreatePdfOptions['docDefinition'];
        const binario = await medplum.createPdf({ docDefinition, filename: `informe-${turno.id}.pdf` });
        await medplum.createResource(
          buildInformeConsulta({
            ...clinico,
            turno: turnoRef,
            binario: { reference: `Binary/${binario.id}` },
            titulo: `Informe de teleconsulta del ${formatearFecha(ahora, zonaHoraria)}`,
          }),
        );
        hecho.current.informe = true;
      }

      if (!hecho.current.ordenes) {
        for (const o of ordenesValidas) {
          await medplum.createResource(
            buildOrdenEstudio({ ...clinico, descripcion: o.descripcion.trim(), categoria: o.categoria }),
          );
        }
        hecho.current.ordenes = true;
      }

      if (!hecho.current.recetas) {
        for (const r of recetasValidas) {
          await medplum.createResource(
            buildReceta({ ...clinico, medicamento: r.medicamento.trim(), indicacion: r.indicacion.trim() }),
          );
        }
        hecho.current.recetas = true;
      }

      if (control && !hecho.current.tarea) {
        const clave = claveAgendarControl(turnoRef.reference);
        const existente = await medplum.searchOne('Task', { identifier: `${TC.identificadorTask}|${clave}` });
        if (!existente) {
          await medplum.createResource(
            buildTareaAgendarControl({
              paciente: pacienteRef,
              turno: turnoRef,
              plazo: plazo ?? '30 días',
              modalidad,
              fecha,
            }),
          );
        }
        hecho.current.tarea = true;
      }
    } catch {
      setEnviando(false);
      setMensaje('No pudimos guardar el cierre. Revisá la conexión y probá de nuevo: no se va a duplicar lo ya guardado.');
      return;
    }

    const r = await llamarBot<RespuestaBot>(medplum, BOTS.cerrar, { appointmentId: turno.id, estado: 'fulfilled' });
    setEnviando(false);
    if (r.ok) {
      props.onCerrada?.();
    } else {
      setMensaje(r.mensaje ?? 'No pudimos finalizar la consulta.');
    }
  };

  return (
    <Card withBorder radius="lg" padding="lg">
      <Stack gap="md">
        <Title order={4}>Cierre de la consulta</Title>
        <TextInput label="Motivo de consulta" value={motivo} onChange={(e) => setMotivo(e.currentTarget.value)} />
        <Textarea
          label="Evolución"
          required
          autosize
          minRows={4}
          value={evolucion}
          onChange={(e) => setEvolucion(e.currentTarget.value)}
        />
        <Textarea
          label="Indicaciones para el paciente"
          autosize
          minRows={2}
          value={indicaciones}
          onChange={(e) => setIndicaciones(e.currentTarget.value)}
        />

        <Stack gap="xs">
          <Text fw={600} size="sm">
            Estudios
          </Text>
          {ordenes.map((o, i) => (
            <Group key={i} gap="xs" wrap="nowrap" align="flex-end">
              <TextInput
                style={{ flex: 1 }}
                aria-label={`Estudio ${i + 1}`}
                placeholder="Ej.: Perfil lipídico completo"
                value={o.descripcion}
                onChange={(e) => {
                  const v = e.currentTarget.value;
                  setOrdenes((l) => l.map((x, j) => (j === i ? { ...x, descripcion: v } : x)));
                }}
              />
              <Select
                w={150}
                aria-label={`Tipo de estudio ${i + 1}`}
                value={o.categoria}
                data={[
                  { value: 'laboratorio', label: 'Laboratorio' },
                  { value: 'imagenes', label: 'Imágenes' },
                  { value: 'otro', label: 'Otro' },
                ]}
                onChange={(v) =>
                  setOrdenes((l) => l.map((x, j) => (j === i ? { ...x, categoria: (v ?? 'otro') as CategoriaOrden } : x)))
                }
                allowDeselect={false}
              />
              <ActionIcon variant="subtle" color="red" aria-label={`Quitar estudio ${i + 1}`} onClick={() => setOrdenes((l) => l.filter((_, j) => j !== i))}>
                ×
              </ActionIcon>
            </Group>
          ))}
          <Button
            variant="subtle"
            size="xs"
            w="fit-content"
            onClick={() => setOrdenes((l) => [...l, { descripcion: '', categoria: 'laboratorio' }])}
          >
            + Agregar estudio
          </Button>
        </Stack>

        <Stack gap="xs">
          <Text fw={600} size="sm">
            Recetas
          </Text>
          {recetas.map((r, i) => (
            <Group key={i} gap="xs" wrap="nowrap" align="flex-end">
              <TextInput
                style={{ flex: 1 }}
                aria-label={`Medicamento ${i + 1}`}
                placeholder="Ej.: Enalapril 10 mg"
                value={r.medicamento}
                onChange={(e) => {
                  const v = e.currentTarget.value;
                  setRecetas((l) => l.map((x, j) => (j === i ? { ...x, medicamento: v } : x)));
                }}
              />
              <TextInput
                style={{ flex: 1 }}
                aria-label={`Indicación ${i + 1}`}
                placeholder="Ej.: 1 comprimido cada 12 horas"
                value={r.indicacion}
                onChange={(e) => {
                  const v = e.currentTarget.value;
                  setRecetas((l) => l.map((x, j) => (j === i ? { ...x, indicacion: v } : x)));
                }}
              />
              <ActionIcon variant="subtle" color="red" aria-label={`Quitar receta ${i + 1}`} onClick={() => setRecetas((l) => l.filter((_, j) => j !== i))}>
                ×
              </ActionIcon>
            </Group>
          ))}
          <Button
            variant="subtle"
            size="xs"
            w="fit-content"
            onClick={() => setRecetas((l) => [...l, { medicamento: '', indicacion: '' }])}
          >
            + Agregar receta
          </Button>
        </Stack>

        <Stack gap="xs">
          <Checkbox
            label="Avisar al equipo que agende un control"
            checked={control}
            onChange={(e) => setControl(e.currentTarget.checked)}
          />
          {control && (
            <Group gap="sm">
              <Select w={140} aria-label="Plazo del control" data={PLAZOS} value={plazo} onChange={setPlazo} allowDeselect={false} />
              <SegmentedControl
                value={modalidad}
                onChange={(v) => setModalidad(v as 'virtual' | 'presencial')}
                data={[
                  { value: 'virtual', label: 'Por videollamada' },
                  { value: 'presencial', label: 'Presencial' },
                ]}
              />
            </Group>
          )}
        </Stack>

        {!enCurso && (
          <Alert variant="light" color="gray" radius="md">
            Entrá a la videollamada para poder finalizar la consulta.
          </Alert>
        )}
        {mensaje && (
          <Alert variant="light" color="red" radius="md">
            {mensaje}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button radius="xl" onClick={finalizar} loading={enviando} disabled={!enCurso}>
            Finalizar consulta
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

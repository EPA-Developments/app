// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Plan Bienestar · paso 5 de 5: "Tus datos de salud". Dos cosas y un solo Guardar:
//  1. Lo que se mide en casa: peso, altura, cintura y presión (el IMC se calcula solo).
//  2. El último laboratorio: el PDF (lo lee el bot som-procesar-laboratorio) o, si la
//     paciente prefiere, sus valores a mano (el no-HDL y el eGFR se calculan solos).
// Al guardar, el recorrido de la Bienvenida termina: "Tu Plan Bienestar está listo".
import {
  Alert,
  Anchor,
  Box,
  Button,
  Card,
  Checkbox,
  Collapse,
  Divider,
  FileInput,
  Group,
  NumberInput,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import type { DiagnosticReport, Observation, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import {
  IconCalculator,
  IconCheck,
  IconCircleCheck,
  IconFileUpload,
  IconHourglass,
  IconRuler2,
  IconTestPipe,
} from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import type { JSX, ReactNode } from 'react';
import { useNavigate } from 'react-router';
import type { CampoSalud, ValoresSalud } from '../../fhir/datosDeSalud';
import {
  CAMPOS_CASA,
  CAMPOS_LABORATORIO,
  CODIGOS_CASA,
  calcularImc,
  egfrDeLaCreatinina,
  hayDatos,
  observacionesDeCasa,
  observacionesDeLaboratorio,
  ultimoValor,
  validarDatosSalud,
} from '../../fhir/datosDeSalud';
import {
  cargarEstudiosEnviados,
  enviarLaboratorioPdf,
  estadoEstudio,
  TEXTO_AUTORIZACION,
  validarPdf,
} from '../../fhir/estudios';
import { showErrorNotification } from '../../utils/notifications';

const RUTA_PLAN = '/care-plan/plan-100-dias';
const RUTA_TABLERO = `${RUTA_PLAN}/tablero`;

type Laboratorio =
  | { estado: 'procesado'; fecha?: string; valores: number; informeId: string }
  | { estado: 'en-proceso'; fecha?: string };

const hoyISO = (): string => new Date().toISOString().slice(0, 10);
/** dd/mm/aaaa, sin depender del idioma del navegador. */
const fechaCorta = (f?: string): string => (f ? f.slice(0, 10).split('-').reverse().join('/') : '');

function Seccion({ icono, titulo, children }: { icono: ReactNode; titulo: string; children: ReactNode }): JSX.Element {
  return (
    <Card withBorder radius="lg" p="md">
      <Group gap="xs" mb="sm" wrap="nowrap">
        <ThemeIcon variant="light" radius="xl">
          {icono}
        </ThemeIcon>
        <Text fw={700}>{titulo}</Text>
      </Group>
      <Stack gap="sm">{children}</Stack>
    </Card>
  );
}

function Calculado({ children }: { children: ReactNode }): JSX.Element {
  return (
    <Group gap={6} wrap="nowrap">
      <ThemeIcon size={20} radius="xl" variant="light" color="teal">
        <IconCalculator size={12} />
      </ThemeIcon>
      <Text size="xs" c="teal.8">
        {children}
      </Text>
    </Group>
  );
}

function Campo(props: {
  campo: CampoSalud;
  valor: number | string | undefined;
  error?: string;
  anterior?: { valor: number; fecha?: string };
  onChange: (v: number | string) => void;
}): JSX.Element {
  const { campo, valor, error, anterior, onChange } = props;
  return (
    <NumberInput
      label={campo.etiqueta}
      description={
        anterior
          ? `Último: ${anterior.valor} ${campo.unidad}${anterior.fecha ? ` (${fechaCorta(anterior.fecha)})` : ''}`
          : campo.ayuda
      }
      placeholder="—"
      hideControls
      decimalScale={campo.decimales ?? 0}
      decimalSeparator=","
      allowNegative={false}
      value={valor ?? ''}
      onChange={onChange}
      error={error}
      rightSection={
        <Text size="xs" c="dimmed" pr={6}>
          {campo.unidad}
        </Text>
      }
      rightSectionWidth={campo.unidad.length > 3 ? 52 : 40}
    />
  );
}

export function DatosDeSalud(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const patient = medplum.getProfile() as Patient;

  const [valores, setValores] = useState<ValoresSalud>({});
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [manual, setManual] = useState(false);
  const [fechaLaboratorio, setFechaLaboratorio] = useState(hoyISO());
  const [pdf, setPdf] = useState<File | null>(null);
  const [autorizado, setAutorizado] = useState(false);
  const [anteriores, setAnteriores] = useState<Observation[]>([]);
  const [laboratorio, setLaboratorio] = useState<Laboratorio>();
  const [guardando, setGuardando] = useState(false);
  const [listo, setListo] = useState<{ guardados: number; pdf: boolean }>();

  useEffect(() => {
    medplum
      .searchResources('Observation', {
        subject: getReferenceString(patient),
        code: CODIGOS_CASA.join(','),
        _sort: '-date',
        _count: '50',
      })
      .then(setAnteriores)
      .catch(() => setAnteriores([]));
    cargarEstudiosEnviados(medplum, patient)
      .then(async (docs) => {
        const doc = docs.find((d) => d.status === 'current');
        if (!doc) {
          return;
        }
        const estado = estadoEstudio(doc);
        if (estado.estado === 'en-proceso') {
          setLaboratorio({ estado: 'en-proceso', fecha: doc.date });
          return;
        }
        const informe = await medplum
          .readResource('DiagnosticReport', estado.informeId)
          .catch(() => undefined as DiagnosticReport | undefined);
        setLaboratorio({
          estado: 'procesado',
          informeId: estado.informeId,
          fecha: informe?.effectiveDateTime ?? doc.date,
          valores: informe?.result?.length ?? 0,
        });
      })
      .catch(() => undefined);
  }, [medplum, patient]);

  const anterior = useMemo(
    () => Object.fromEntries(CAMPOS_CASA.map((c) => [c.key, ultimoValor(anteriores, c.loinc.code as string)])),
    [anteriores]
  );

  const setValor = (key: string, v: number | string): void => {
    setValores((x) => ({ ...x, [key]: v }));
    setErrores((e) => ({ ...e, [key]: '', general: '' }));
  };

  const num = (v: number | string | undefined): number | undefined =>
    v === undefined || v === '' || Number.isNaN(Number(v)) ? undefined : Number(v);
  const peso = num(valores.peso);
  const altura = num(valores.altura) ?? anterior.altura?.valor;
  const imc = peso !== undefined && altura ? calcularImc(peso, altura) : undefined;

  async function guardar(): Promise<void> {
    const errs = validarDatosSalud(valores, { manual, fechaLaboratorio });
    if (pdf && !autorizado) {
      errs.autorizacion = 'Marcá la autorización para que podamos leer tu PDF.';
    }
    if (pdf) {
      const invalido = await validarPdf(pdf);
      if (invalido) {
        errs.pdf = invalido;
      }
    }
    if (!pdf && !hayDatos(valores, manual)) {
      errs.general = 'Cargá al menos un dato o subí el PDF de tu laboratorio.';
    }
    setErrores(errs);
    if (Object.values(errs).some(Boolean)) {
      return;
    }

    setGuardando(true);
    try {
      const ahora = new Date().toISOString();
      let guardados = 0;
      for (const o of observacionesDeCasa(valores, patient, ahora, anterior.altura?.valor)) {
        await medplum.createResource(o);
        guardados += 1;
      }
      if (manual) {
        for (const o of observacionesDeLaboratorio(valores, patient, fechaLaboratorio)) {
          const creada = await medplum.createResource(o);
          guardados += 1;
          // Con la creatinina, la edad y el sexo, también el filtrado glomerular.
          const egfr = o.code?.coding?.some((c) => c.code === '2160-0')
            ? egfrDeLaCreatinina(creada, patient)
            : undefined;
          if (egfr) {
            await medplum.createResource(egfr);
            guardados += 1;
          }
        }
      }
      let pdfEnviado = false;
      if (pdf) {
        const r = await enviarLaboratorioPdf(medplum, patient, pdf);
        pdfEnviado = r.ok;
        if (!r.ok) {
          showErrorNotification(
            r.mensaje ?? 'No pudimos enviar el PDF. Probá de nuevo desde "Enviar estudios en PDF".'
          );
        }
      }
      medplum.invalidateSearches('Observation');
      setListo({ guardados, pdf: pdfEnviado });
      window.scrollTo(0, 0);
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setGuardando(false);
    }
  }

  if (listo) {
    return (
      <Box maw={640}>
        <Stack align="center" gap="md" py="xl">
          <ThemeIcon size={64} radius="xl" color="teal" variant="light">
            <IconCircleCheck size={36} stroke={1.5} />
          </ThemeIcon>
          <Title order={2} ta="center">
            Tu Plan Bienestar está listo
          </Title>
          <Text c="dimmed" ta="center" maw={460}>
            {listo.guardados > 0 && `Guardamos ${listo.guardados === 1 ? '1 dato' : `${listo.guardados} datos`}. `}
            {listo.pdf && 'Recibimos tu laboratorio: lo leemos y sumamos los valores a tus biomarcadores. '}
            Con tus datos, tus hábitos y tus resultados armamos tu tablero de 8 hábitos y tu plan de 100 días.
          </Text>
          <Group justify="center">
            <Button radius="xl" size="md" onClick={() => navigate(RUTA_TABLERO)?.catch(console.error)}>
              Ver mi tablero de 8 hábitos
            </Button>
            <Button radius="xl" size="md" variant="light" onClick={() => navigate(RUTA_PLAN)?.catch(console.error)}>
              Ir a mi plan
            </Button>
          </Group>
        </Stack>
      </Box>
    );
  }

  const casa = CAMPOS_CASA.map((c) => (
    <Campo
      key={c.key}
      campo={c}
      valor={valores[c.key]}
      error={errores[c.key]}
      anterior={anterior[c.key]}
      onChange={(v) => setValor(c.key, v)}
    />
  ));

  return (
    <Box maw={640}>
      <Stack gap={4} mb="md">
        <Text size="xs" fw={700} c="dimmed" tt="uppercase">
          Plan Bienestar · paso 5 de 5
        </Text>
        <Title order={2}>Tus datos de salud</Title>
        <Text c="dimmed">Dos cosas y listo: lo que medís en casa y tu último laboratorio.</Text>
      </Stack>

      <Stack gap="md">
        <Seccion icono={<IconRuler2 size={18} />} titulo="1. Lo que medís en casa">
          <SimpleGrid cols={2} spacing="sm">
            {casa}
          </SimpleGrid>
          {imc !== undefined && (
            <Calculado>Índice de masa corporal: {imc.toLocaleString('es-AR')} · se calcula solo</Calculado>
          )}
        </Seccion>

        <Seccion icono={<IconTestPipe size={18} />} titulo="2. Tu último laboratorio">
          {laboratorio?.estado === 'procesado' && (
            <Group gap={6} wrap="nowrap">
              <ThemeIcon size={20} radius="xl" color="teal">
                <IconCheck size={12} />
              </ThemeIcon>
              <Text size="sm" c="teal.8">
                Ya tenemos tu laboratorio{laboratorio.fecha ? ` del ${fechaCorta(laboratorio.fecha)}` : ''}
                {laboratorio.valores ? ` (${laboratorio.valores} valores)` : ''}.{' '}
                <Anchor
                  size="sm"
                  onClick={() => navigate(`/health-record/lab-results/${laboratorio.informeId}`)?.catch(console.error)}
                >
                  Ver resultados
                </Anchor>
              </Text>
            </Group>
          )}
          {laboratorio?.estado === 'en-proceso' && (
            <Group gap={6} wrap="nowrap">
              <ThemeIcon size={20} radius="xl" color="gray" variant="light">
                <IconHourglass size={12} />
              </ThemeIcon>
              <Text size="sm" c="dimmed">
                Recibimos tu PDF{laboratorio.fecha ? ` del ${fechaCorta(laboratorio.fecha)}` : ''}: lo estamos leyendo.
              </Text>
            </Group>
          )}
          <Text size="sm" c="dimmed">
            {laboratorio
              ? '¿Tenés uno más nuevo? Subilo y lo leemos por vos.'
              : 'Subí el PDF y lo leemos por vos: colesterol, glucemia, hemoglobina glicosilada, creatinina y filtrado glomerular.'}
          </Text>
          <FileInput
            aria-label="PDF del laboratorio"
            placeholder="Subir el PDF del laboratorio"
            accept="application/pdf"
            leftSection={<IconFileUpload size={18} />}
            clearable
            value={pdf}
            onChange={(f) => {
              setPdf(f);
              setErrores((e) => ({ ...e, pdf: '', general: '' }));
            }}
            error={errores.pdf}
            radius="xl"
            size="md"
          />
          {pdf && (
            <Checkbox
              label={TEXTO_AUTORIZACION}
              checked={autorizado}
              onChange={(e) => {
                setAutorizado(e.currentTarget.checked);
                setErrores((x) => ({ ...x, autorizacion: '' }));
              }}
              error={errores.autorizacion}
            />
          )}
          <Divider label="o" labelPosition="center" />
          <Anchor size="sm" ta="center" onClick={() => setManual((m) => !m)}>
            {manual ? 'Mejor no lo cargo a mano' : 'Prefiero cargarlo a mano'}
          </Anchor>
          <Collapse in={manual}>
            <Stack gap="sm" pt="xs">
              <TextInput
                type="date"
                label="Fecha del laboratorio"
                max={hoyISO()}
                value={fechaLaboratorio}
                onChange={(e) => setFechaLaboratorio(e.currentTarget.value)}
                error={errores.fechaLaboratorio}
              />
              <SimpleGrid cols={2} spacing="sm">
                {CAMPOS_LABORATORIO.map((c) => (
                  <Campo
                    key={c.key}
                    campo={c}
                    valor={valores[c.key]}
                    error={errores[c.key]}
                    onChange={(v) => setValor(c.key, v)}
                  />
                ))}
              </SimpleGrid>
              <Calculado>El colesterol no-HDL y el filtrado glomerular (eGFR) se calculan solos.</Calculado>
            </Stack>
          </Collapse>
        </Seccion>

        {errores.general && (
          <Alert color="yellow" variant="light">
            {errores.general}
          </Alert>
        )}

        <Button
          fullWidth
          size="md"
          radius="xl"
          leftSection={<IconCheck size={18} />}
          loading={guardando}
          onClick={guardar}
        >
          Guardar
        </Button>
        <Anchor size="sm" ta="center" c="dimmed" onClick={() => navigate(RUTA_PLAN)?.catch(console.error)}>
          Lo completo después
        </Anchor>
      </Stack>
    </Box>
  );
}

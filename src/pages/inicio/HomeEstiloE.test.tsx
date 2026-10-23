// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import { categoriaLe8, LE8_DOMINIOS } from '@epa/careplan-menopausia';
import { MantineProvider } from '@mantine/core';
import type { Observation, Patient, Practitioner } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { indexarDefinicionesFhir } from '../../fhir/__fixtures__/glp1';
import type { PlanBienestar } from '../../fhir/bienestar';
import { hoyArgentina } from '../../fhir/glp1';
import { MARCA } from '../../marca';
import { simularPantalla } from '../../testing/pantalla';
import { HomePage } from '../HomePage';
import { HomeEstiloE, modoColorDe, URL_FUENTES_HOME_E, VistaHomeE } from './HomeEstiloE';
import { TEXTO_VALORES_SIN_LEER } from './HGraphPaciente';
import { modeloHgraph } from './hgraph';
import { paraHoy } from './paraHoy';
import { COLORES_PETALOS } from './rosa';
import type { DatosHomeE, ModoColorPetalos, ResultadoLe8 } from './tipos';
import { TEXTO_SIN_ESTADIO } from './useDatosHomeE';

const HOY = '2026-10-10'; // un sábado
const ESPERA = { timeout: 10000 };

/** Los puntajes del diseño aprobado (promedio 64) y los del día 0 (promedio 58). */
const PUNTAJES_HOY = [60, 62, 100, 45, 58, 60, 70, 57];
const PUNTAJES_DIA0 = [48, 50, 100, 42, 55, 56, 66, 47];

function le8(puntajes: readonly (number | undefined)[], total?: number): ResultadoLe8 {
  const dominios = LE8_DOMINIOS.map((dominio, i) => ({ dominio, puntaje: puntajes[i] }));
  const conDato = dominios.filter((d) => d.puntaje !== undefined).length;
  return {
    dominios,
    total,
    categoria: total === undefined ? undefined : categoriaLe8(total),
    conDato,
    completo: conDato === LE8_DOMINIOS.length,
    faltantes: [],
    dominiosBajos: [],
  };
}

const PLAN: PlanBienestar = {
  dia: 63,
  totalDias: 100,
  inicio: '2026-08-09',
  fin: '2026-11-17',
  terminado: false,
  hitos: [
    { id: 'consentimiento', label: 'Firmá el consentimiento', descripcion: 'Listo.', href: '/c', cumplido: true },
    { id: 'biomarcadores', label: 'Cargá tus biomarcadores', descripcion: 'Listo.', href: '/b', cumplido: true },
    { id: 'signos', label: 'Registrá tus signos vitales', descripcion: 'Listo.', href: '/s', cumplido: true },
    { id: 'habitos', label: 'Respondé tus cuestionarios', descripcion: 'Listo.', href: '/h', cumplido: true },
    {
      id: 'turno',
      label: 'Reservá tu consulta',
      descripcion: 'Con tu equipo revisás cómo vas.',
      href: '/get-care',
      cumplido: false,
    },
  ],
  semanasActivas: 9,
  rachaActual: 4,
};

/** Laura: día 63 del plan, LE8 64 (día 0: 58), CKM 2, laboratorio leído y Segunda Opinión en análisis. */
function laura(cambios: Partial<DatosHomeE> = {}): DatosHomeE {
  return {
    cargando: false,
    esPaciente: true,
    nombre: 'Laura',
    hoy: HOY,
    le8: le8(PUNTAJES_HOY, 64),
    le8Inicial: le8(PUNTAJES_DIA0, 58),
    plan: PLAN,
    ckm: { estadio: 2, origen: 'serie', fecha: '2026-09-15', provisorio: false },
    laboratorio: {
      estado: 'procesado',
      fecha: '2026-10-03',
      valores: 14,
      informeId: 'informe-lab-1',
      revisionMedica: false,
    },
    segundaOpinion: {
      id: 'som-1',
      estado: 'en-analisis',
      etiqueta: 'En análisis',
      pedida: '2026-09-28T13:00:00.000Z',
      actualizada: '2026-10-01T13:00:00.000Z',
      firmada: false,
    },
    equipo: { equipoPlan: [], segundaOpinion: [] },
    consentimiento: 'firmado',
    fechaConsentimiento: '2026-08-08T15:00:00.000Z',
    ingresoPendiente: false,
    novedadesSinLeer: 2,
    ...cambios,
  };
}

async function mostrar(
  datos: DatosHomeE,
  modoColor?: ModoColorPetalos,
  medplum: MockClient = new MockClient(),
  mostrarHgraph = false
): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <VistaHomeE datos={datos} modoColor={modoColor} mostrarHgraph={mostrarHgraph} />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  });
}

function hrefDe(nombre: string | RegExp, dentro: HTMLElement = document.body): string | null {
  return within(dentro).getByRole('link', { name: nombre }).getAttribute('href');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('VistaHomeE con los datos de Laura', () => {
  test('el escenario: saludo, «Para hoy», la rosa y lo que cambió', async () => {
    const datos = laura();
    await mostrar(datos);

    expect(screen.getByRole('heading', { level: 1, name: 'Laura, estás en el centro.' })).toBeInTheDocument();
    expect(screen.getByText('Hola, Laura · sábado 10 de octubre')).toBeInTheDocument();
    expect(screen.getByText('Tu etapa CKM: 2')).toBeInTheDocument();

    // «Para hoy»: la acción que elige paraHoy (acá, el hito pendiente del plan).
    const accion = paraHoy(datos, { producto: MARCA.producto });
    expect(accion.clave).toBe('hito-turno');
    const hoy = screen.getByRole('region', { name: 'Para hoy' });
    expect(within(hoy).getByText(accion.titulo)).toBeInTheDocument();
    expect(within(hoy).getByText(accion.detalle)).toBeInTheDocument();
    expect(hrefDe(accion.cta, hoy)).toBe('/get-care');

    // La rosa, con sus puntajes en el aria-label, y la frase del hábito con más margen.
    expect(screen.getByRole('img', { name: /Sueño 45/ })).toBeInTheDocument();
    expect(
      screen.getByText('El sueño es tu hábito con más margen. En tu plan tenés pasos para mejorar ese puntaje.')
    ).toBeInTheDocument();

    const cambio = screen.getByRole('region', { name: 'Lo que cambió' });
    expect(within(cambio).getByText('Resultados listos')).toBeInTheDocument();
    expect(within(cambio).getByText('Laboratorio del 3 de octubre · 14 valores')).toBeInTheDocument();
    expect(
      within(cambio).getByText('Un agente de IA leyó tu PDF y pasó los valores a tus biomarcadores.')
    ).toBeInTheDocument();
    expect(within(cambio).getByText('Sin revisión médica todavía')).toBeInTheDocument();
    expect(hrefDe('Ver mis resultados', cambio)).toBe('/health-record/lab-results/informe-lab-1');
    expect(within(cambio).getByRole('heading', { name: `Tu ${MARCA.producto}` })).toBeInTheDocument();
    expect(within(cambio).getByText('En análisis')).toBeInTheDocument();
    expect(within(cambio).getByText('Pedida el 28 de septiembre')).toBeInTheDocument();
    expect(within(cambio).getByText(/te avisamos en Novedades cuando esté lista/)).toBeInTheDocument();
    expect(hrefDe(`Ver mi ${MARCA.producto}`, cambio)).toBe('/mi-segunda-opinion');
    expect(within(cambio).getByText('Tenés 2 novedades sin leer en la campanita.')).toBeInTheDocument();
    expect(within(cambio).getByText('Cómo se lee')).toBeInTheDocument();
  });

  test('la zona clara: tres lecturas, la tabla, el plan, el equipo y los accesos', async () => {
    await mostrar(laura());

    // LE8
    const lecturaLe8 = screen.getByRole('article', { name: 'Respuesta a 100 días' });
    expect(within(lecturaLe8).getByText('Banda moderada')).toBeInTheDocument();
    expect(within(lecturaLe8).getByText('+6 desde el día 0 (58)')).toBeInTheDocument();
    expect(within(lecturaLe8).getByText('Hoy, día 63')).toBeInTheDocument();
    expect(within(lecturaLe8).getByText('Más margen')).toBeInTheDocument();

    // CKM: la etapa actual marcada en la escala.
    const ckm = screen.getByRole('article', { name: 'Estadio 2: factores de riesgo activos' });
    const actual = within(ckm)
      .getAllByRole('listitem')
      .find((li) => li.getAttribute('aria-current') === 'step');
    expect(actual).toHaveTextContent('Estadio 2: Factores de riesgo activos');
    expect(hrefDe('Entendé tu salud CKM', ckm)).toBe('/ckm');

    // PREVENT: sin informe firmado ni estimación, dice qué falta y lleva a mandar el laboratorio;
    // como su Segunda Opinión está en análisis, avisa que va a traer el riesgo firmado.
    const prevent = screen.getByRole('article', { name: 'Tu riesgo cardiovascular' });
    expect(within(prevent).getByText('Todavía no podemos estimar tu riesgo.')).toBeInTheDocument();
    expect(within(prevent).getByText(`Tu ${MARCA.producto} va a traer tu riesgo en su informe.`)).toBeInTheDocument();
    expect(hrefDe('Enviar mi laboratorio en PDF', prevent)).toBe('/enviar-estudios');

    // La tabla equivalente, enfocable y con el cambio de cada hábito.
    const tabla = screen.getByRole('region', { name: 'Tus 8 hábitos en números' });
    expect(tabla).toHaveAttribute('tabindex', '0');
    const sueno = within(tabla).getByRole('rowheader', { name: 'Sueño' }).closest('tr') as HTMLElement;
    expect(
      within(sueno)
        .getAllByRole('cell')
        .map((c) => c.textContent)
    ).toEqual(['42', '45', '+3', 'Baja', 'Cuestionario de sueño']);
    const total = within(tabla).getByRole('rowheader', { name: 'Total LE8' }).closest('tr') as HTMLElement;
    expect(
      within(total)
        .getAllByRole('cell')
        .map((c) => c.textContent)
    ).toEqual(['58', '64', '+6', 'Moderada', 'Promedio de los 8']);

    // Plan Bienestar · 100 días
    const seccionPlan = screen.getByRole('region', { name: 'Plan Bienestar · 100 días' });
    expect(within(seccionPlan).getByText('Día 63 de 100')).toBeInTheDocument();
    expect(within(seccionPlan).getByText('faltan 37')).toBeInTheDocument();
    expect(within(seccionPlan).getByText('Racha de 4 semanas')).toBeInTheDocument();
    expect(within(seccionPlan).getByText('Hitos · 4 de 5')).toBeInTheDocument();
    expect(hrefDe('Hacerlo ahora: Reservá tu consulta')).toBe('/get-care');
    expect(hrefDe('Ver mi plan')).toBe('/care-plan/plan-100-dias');

    // Tu equipo
    expect(screen.getByText(MARCA.responsable)).toBeInTheDocument();
    expect(screen.getByText('Cuando tengas un equipo asignado, lo vas a ver acá.')).toBeInTheDocument();
    expect(hrefDe('Ver mi equipo de salud')).toBe('/account/equipo');

    // Links reales a las pantallas del portal.
    for (const link of screen.getAllByRole('link', { name: /^Ver mis 8 hábitos/ })) {
      expect(link).toHaveAttribute('href', '/care-plan/plan-100-dias/tablero');
    }
    const accesos = screen.getByRole('region', { name: 'Tus accesos' });
    expect(hrefDe(/^Mi Plan Bienestar/, accesos)).toBe('/care-plan/plan-100-dias');
    expect(hrefDe(/^Cuestionarios de hábitos/, accesos)).toBe('/health-record/cuestionarios');
    expect(hrefDe(/^Enviar estudios en PDF/, accesos)).toBe('/enviar-estudios');
    expect(hrefDe(new RegExp(`^Mi ${MARCA.producto}`), accesos)).toBe('/mi-segunda-opinion');
    expect(hrefDe(/^Reservar una teleconsulta/, accesos)).toBe('/get-care?modalidad=teleconsulta');
    expect(hrefDe(/^Consentimiento informado Firmado el 8 de agosto/, accesos)).toBe('/health-record/consent');
    expect(within(accesos).getAllByRole('link')).toHaveLength(12);

    // Pie de seguridad
    expect(
      screen.getByText(
        'Sin tu consentimiento firmado, tus datos clínicos no pasan por nuestros agentes de IA. ' +
          'Lo firmaste el 8 de agosto.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Esta página resume tus datos; no reemplaza la consulta médica.')).toBeInTheDocument();
  });

  test('el equipo muestra a cada profesional con su nombre y su rol', async () => {
    const medplum = new MockClient();
    const medica = await medplum.createResource<Practitioner>({
      resourceType: 'Practitioner',
      name: [{ given: ['Marta'], family: 'Ruiz' }],
    });
    const ref = { reference: `Practitioner/${medica.id}` };
    await mostrar(laura({ equipo: { cabecera: ref, equipoPlan: [], segundaOpinion: [ref] } }), undefined, medplum);
    const equipo = screen.getByRole('region', { name: 'Tu equipo' });
    expect(await within(equipo).findAllByText('Marta Ruiz', {}, ESPERA)).toHaveLength(2);
    expect(within(equipo).getByText('Cabecera')).toBeInTheDocument();
    expect(within(equipo).getByText('En análisis')).toBeInTheDocument();
    expect(within(equipo).queryByText('Cuando tengas un equipo asignado, lo vas a ver acá.')).not.toBeInTheDocument();
  });

  test('en escritorio la tabla abre desplegada; en el celular, plegada', async () => {
    simularPantalla(true);
    await mostrar(laura());
    const abierta = screen.getByText('Tus 8 hábitos en números', { selector: 'summary' });
    expect(abierta.closest('details')).toHaveAttribute('open');
  });

  test('en el celular la tabla va plegada en un <details>', async () => {
    simularPantalla(false);
    await mostrar(laura());
    const plegada = screen.getByText('Ver tus 8 hábitos en números', { selector: 'summary' });
    expect(plegada.closest('details')).not.toHaveAttribute('open');
  });
});

describe('VistaHomeE: los tres caminos', () => {
  function tarjetasDeCaminos(): HTMLElement[] {
    const seccion = screen.getByRole('region', { name: 'Tres caminos para cuidar tu corazón' });
    return within(seccion).getAllByRole('article');
  }

  test('en orden: Plan Bienestar, Segunda Opinión y teleconsulta, con el estado de Laura en cada uno', async () => {
    await mostrar(laura());
    const [plan, som, tele] = tarjetasDeCaminos();
    expect(within(plan).getByRole('heading', { name: 'Plan Bienestar · 100 días' })).toBeInTheDocument();
    expect(within(plan).getByText('Día 63 de 100')).toBeInTheDocument();
    expect(hrefDe('Seguir mi plan', plan)).toBe('/care-plan/plan-100-dias');
    expect(within(som).getByRole('heading', { name: `Tu ${MARCA.producto}` })).toBeInTheDocument();
    expect(within(som).getByText(/^En análisis desde el 28 de septiembre/)).toBeInTheDocument();
    expect(hrefDe(`Ver mi ${MARCA.producto}`, som)).toBe('/mi-segunda-opinion');
    expect(within(tele).getByRole('heading', { name: 'Teleconsulta por videollamada' })).toBeInTheDocument();
    expect(hrefDe('Reservar mi teleconsulta', tele)).toBe('/get-care?modalidad=teleconsulta');
    // Lo que se paga, dicho antes de reservar.
    expect(
      within(tele).getByText('Las consultas del Plan Bienestar están incluidas; las demás se confirman con una seña.')
    ).toBeInTheDocument();
  });

  test('con la Segunda Opinión en análisis, no se empuja la teleconsulta (la devolución llega con su informe)', async () => {
    await mostrar(laura());
    const tele = tarjetasDeCaminos()[2];
    expect(within(tele).queryByText('Recomendado para vos')).not.toBeInTheDocument();
    const cambio = screen.getByRole('region', { name: 'Lo que cambió' });
    expect(within(cambio).queryByRole('link', { name: /Revisarlos en una teleconsulta/ })).not.toBeInTheDocument();
  });

  test('quien subió datos y no tiene turno: la teleconsulta va como «Recomendado para vos»', async () => {
    await mostrar(laura({ segundaOpinion: undefined }));
    const [plan, som, tele] = tarjetasDeCaminos();
    expect(within(tele).getByText('Recomendado para vos')).toBeInTheDocument();
    expect(within(plan).queryByText('Recomendado para vos')).not.toBeInTheDocument();
    expect(within(som).queryByText('Recomendado para vos')).not.toBeInTheDocument();
  });

  test('sin datos ni plan: se recomienda empezar el plan y se ofrece pedir la Segunda Opinión', async () => {
    await mostrar({
      cargando: false,
      esPaciente: true,
      hoy: HOY,
      consentimiento: 'firmado',
      ingresoPendiente: false,
      novedadesSinLeer: 0,
    });
    const [plan, som] = tarjetasDeCaminos();
    expect(within(plan).getByText('Recomendado para vos')).toBeInTheDocument();
    expect(hrefDe('Empezar mi Plan Bienestar', plan)).toBe('/care-plan/plan-100-dias');
    expect(hrefDe(`Pedir mi ${MARCA.producto}`, som)).toBe('/solicitar-som');
  });

  test('con un turno reservado, la teleconsulta muestra la fecha y no la recomienda', async () => {
    await mostrar(laura({ proximoTurno: { id: 'appt-1', inicio: '2026-10-17T13:30:00.000Z', teleconsulta: true } }));
    const tele = tarjetasDeCaminos()[2];
    expect(within(tele).getByText(/^Tu turno: sábado, 17 de octubre, 10:30/)).toBeInTheDocument();
    expect(hrefDe('Ver mi teleconsulta', tele)).toBe('/teleconsulta/appt-1');
    expect(within(tele).queryByText('Recomendado para vos')).not.toBeInTheDocument();
  });

  test('el laboratorio leído por IA sin revisión médica ofrece revisarlo en una teleconsulta', async () => {
    await mostrar(laura({ segundaOpinion: undefined }));
    const cambio = screen.getByRole('region', { name: 'Lo que cambió' });
    expect(hrefDe(/^Revisarlos en una teleconsulta/, cambio)).toBe('/get-care?modalidad=teleconsulta');
  });

  test('mientras carga, los caminos no recomiendan nada', async () => {
    await mostrar(laura({ cargando: true }));
    const seccion = screen.getByRole('region', { name: 'Tres caminos para cuidar tu corazón' });
    expect(within(seccion).queryByText('Recomendado para vos')).not.toBeInTheDocument();
  });
});

describe('VistaHomeE: lo que encontró la revisión', () => {
  test('AC-8: en revisión por el cardiólogo, la Home E lo dice igual que Mi Segunda Opinión', async () => {
    await mostrar(
      laura({
        segundaOpinion: {
          id: 's1',
          estado: 'en-revision',
          etiqueta: 'En revisión por el cardiólogo',
          pedida: '2026-09-28T13:00:00.000Z',
          firmada: false,
        },
      })
    );
    expect(screen.getAllByText('En revisión por el cardiólogo').length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        'Un cardiólogo de nuestro equipo está revisando tu informe; te avisamos en Novedades cuando lo firme.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('en revisión')).toBeInTheDocument();
    // La devolución llega con su informe: no se empuja la teleconsulta.
    const cambio = screen.getByRole('region', { name: 'Lo que cambió' });
    expect(within(cambio).queryByRole('link', { name: /Revisarlos en una teleconsulta/ })).not.toBeInTheDocument();
  });

  test('una Segunda Opinión completada sin firma médica registrada nunca dice «firmado»', async () => {
    await mostrar(
      laura({
        segundaOpinion: {
          id: 's1',
          estado: 'completada',
          etiqueta: 'Completada',
          pedida: '2026-09-01',
          firmada: false,
        },
        prevent: { ascvd10: 0.042, hf10: 0.031, total30: 0.187, fecha: '2026-10-05' },
      })
    );
    expect(document.body).not.toHaveTextContent(/firmad[oa] por tu equipo/);
    expect(screen.queryByText('Tu informe está firmado.')).not.toBeInTheDocument();
    expect(screen.getAllByText(/Tu informe está listo/).length).toBeGreaterThan(0);
    const prevent = screen.getByRole('article', { name: 'Tu riesgo cardiovascular' });
    expect(within(prevent).getByText(`Del informe de tu ${MARCA.producto} · preparado con IA`)).toBeInTheDocument();
  });

  test('con la firma médica registrada, el PREVENT dice que es del informe firmado y su fecha', async () => {
    await mostrar(
      laura({
        segundaOpinion: { id: 's1', estado: 'completada', etiqueta: 'Completada', pedida: '2026-09-01', firmada: true },
        prevent: { ascvd10: 0.042, fecha: '2026-10-05' },
      })
    );
    const prevent = screen.getByRole('article', { name: 'Tu riesgo cardiovascular' });
    expect(within(prevent).getByText('Del informe firmado por tu equipo médico el 5 de octubre.')).toBeInTheDocument();
  });

  test('un LE8 parcial dice con cuántos hábitos se calculó, sin banda en la rosa', async () => {
    await mostrar(laura({ le8: le8([60, 62, undefined, 45, undefined, undefined, undefined, undefined], 56) }));
    const lectura = screen.getByRole('article', { name: /Respuesta a 100 días|Tus 8 hábitos/ });
    expect(within(lectura).getByText('Con 3 de 8 hábitos')).toBeInTheDocument();
    expect(screen.getByText('3 de 8 hábitos')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /tu total con 3 de 8 hábitos con dato: 56/ })).toBeInTheDocument();
  });

  test('un PDF que el bot no pudo leer no queda «leyendo»: dice que lo estamos revisando', async () => {
    await mostrar(
      laura({ laboratorio: { estado: 'demorado', fecha: '2026-10-03T12:00:00.000Z', revisionMedica: false } })
    );
    expect(screen.getByRole('heading', { name: 'Tu PDF necesita una revisión' })).toBeInTheDocument();
    expect(
      screen.getByText('Lo estamos revisando. Si no pudimos leerlo, te escribimos por Mensajes.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/está leyendo tu PDF/)).not.toBeInTheDocument();
  });

  test('la etapa CKM es la del equipo, y dice de dónde sale', async () => {
    await mostrar(laura({ ckm: { estadio: 3, origen: 'serie', fecha: '2026-09-15', provisorio: false } }));
    expect(screen.getByText('Tu etapa CKM: 3')).toBeInTheDocument();
    expect(screen.queryByText(/estimad/)).not.toBeInTheDocument();
    expect(screen.getByText('Según tu equipo, con tus datos del 15 de septiembre.')).toBeInTheDocument();
  });

  test('la etapa que validó un médico lo dice', async () => {
    await mostrar(laura({ ckm: { estadio: 1, origen: 'validado', fecha: '2026-08-02', provisorio: false } }));
    expect(screen.getByText('Tu etapa CKM: 1')).toBeInTheDocument();
    expect(screen.getByText('La validó tu médico el 2 de agosto.')).toBeInTheDocument();
  });

  test('sin estadio del equipo no hay etapa en el escenario', async () => {
    await mostrar(laura({ ckm: undefined }));
    expect(screen.queryByText(/^Tu etapa CKM: /)).not.toBeInTheDocument();
    expect(screen.getByText(TEXTO_SIN_ESTADIO)).toBeInTheDocument();
  });
});

describe('VistaHomeE: otros estados', () => {
  test('con el PREVENT del informe firmado muestra los porcentajes con coma', async () => {
    await mostrar(
      laura({
        segundaOpinion: {
          id: 'som-1',
          estado: 'completada',
          etiqueta: 'Completada',
          pedida: '2026-08-20',
          firmada: true,
        },
        prevent: { ascvd10: 0.042, hf10: 0.031, total30: 0.187 },
      })
    );
    const prevent = screen.getByRole('article', { name: 'Tu riesgo cardiovascular' });
    expect(within(prevent).getByText('4,2%')).toBeInTheDocument();
    expect(within(prevent).getByText('3,1%')).toBeInTheDocument();
    expect(within(prevent).getByText('18,7%')).toBeInTheDocument();
    expect(within(prevent).getByText('Riesgo bajo')).toBeInTheDocument();
    expect(within(prevent).getByText('Del informe firmado por tu equipo médico.')).toBeInTheDocument();
    expect(within(prevent).queryByText('Llega con tu informe firmado')).not.toBeInTheDocument();
    expect(within(prevent).queryByText(/llega con tu informe firmado\./)).not.toBeInTheDocument();
    expect(screen.getByText('Tu informe está firmado.')).toBeInTheDocument();
  });

  test('sin informe firmado, el PREVENT estimado va rotulado como estimación sin revisión médica', async () => {
    await mostrar(
      laura({
        segundaOpinion: undefined,
        preventEstimado: { ascvd10: 0.081, hf10: 0.052, total30: 0.24, faltantes: ['presión arterial'] },
      })
    );
    const prevent = screen.getByRole('article', { name: 'Tu riesgo cardiovascular' });
    expect(within(prevent).getByText('Estimado con tus datos · sin revisión médica')).toBeInTheDocument();
    expect(within(prevent).getByText('8,1%')).toBeInTheDocument();
    expect(within(prevent).getByText('Riesgo intermedio')).toBeInTheDocument();
    expect(within(prevent).getByText('Para afinarlo nos falta: presión arterial.')).toBeInTheDocument();
    expect(within(prevent).queryByText('Del informe firmado por tu equipo médico.')).not.toBeInTheDocument();
    // Oportunidad de venta: un cálculo automático se revisa con un médico.
    expect(within(prevent).getByText('Es un cálculo automático')).toBeInTheDocument();
    expect(hrefDe('Reservar mi teleconsulta', prevent)).toBe('/get-care?modalidad=teleconsulta');
    expect(hrefDe(`Pedir mi ${MARCA.producto}: un informe de tu caso y tu riesgo`, prevent)).toBe('/solicitar-som');
  });

  test('con un turno reservado, el PREVENT estimado se revisa ahí y no ofrece reservar otro', async () => {
    await mostrar(
      laura({
        segundaOpinion: undefined,
        preventEstimado: { ascvd10: 0.081, hf10: 0.052, total30: 0.24, faltantes: [] },
        proximoTurno: { id: 'appt-1', inicio: '2026-10-17T13:30:00.000Z', teleconsulta: true },
      })
    );
    const prevent = screen.getByRole('article', { name: 'Tu riesgo cardiovascular' });
    expect(within(prevent).getByText(/^Podés llevarlo a tu turno del sábado, 17 de octubre/)).toBeInTheDocument();
    expect(within(prevent).queryByRole('link', { name: 'Reservar mi teleconsulta' })).not.toBeInTheDocument();
  });

  test('sin datos para PREVENT, dice qué falta y lleva a cargarlos', async () => {
    await mostrar(laura({ segundaOpinion: undefined, preventFaltantes: ['colesterol total y HDL'] }));
    const prevent = screen.getByRole('article', { name: 'Tu riesgo cardiovascular' });
    expect(
      within(prevent).getByText('Para calcularlo nos falta: colesterol total y HDL.', { exact: false })
    ).toBeInTheDocument();
    expect(hrefDe('Cargar mis datos de salud', prevent)).toBe('/care-plan/plan-100-dias/mis-datos');
  });

  test('mientras carga: skeletons, y nunca «Falta» ni «sin datos»', async () => {
    await mostrar(laura({ cargando: true, le8: le8([60, undefined, 100]), plan: undefined, ckm: undefined }));
    expect(screen.getByRole('heading', { level: 1, name: 'Laura, estás en el centro.' })).toBeInTheDocument();
    expect(document.querySelectorAll('.mantine-Skeleton-root').length).toBeGreaterThan(0);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByText('Falta')).not.toBeInTheDocument();
    expect(screen.queryByText(/sin dato/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/faltan datos/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/todavía no hay novedades/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no está completa/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Cuando tengas un equipo/)).not.toBeInTheDocument();
  });

  test('con los mismos datos ya cargados, los pétalos sin dato dicen «Falta»', async () => {
    await mostrar(laura({ le8: le8([60, undefined, 100]), plan: undefined, ckm: undefined }));
    expect(screen.getAllByText('Falta').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sin dato').length).toBeGreaterThan(0);
    expect(screen.getByText(TEXTO_SIN_ESTADIO)).toBeInTheDocument();
  });

  test('sin novedades, sin plan, sin equipo y sin LE8: estados vacíos con su link', async () => {
    await mostrar({
      cargando: false,
      esPaciente: true,
      hoy: HOY,
      consentimiento: 'falta',
      ingresoPendiente: true,
      novedadesSinLeer: 0,
    });
    expect(screen.getByRole('heading', { level: 1, name: 'Estás en el centro.' })).toBeInTheDocument();
    expect(screen.getByText('Hola · sábado 10 de octubre')).toBeInTheDocument();
    expect(screen.queryByText(/Ordenado para tu etapa/)).not.toBeInTheDocument();
    const hoy = screen.getByRole('region', { name: 'Para hoy' });
    expect(within(hoy).getByText('Firmá tu consentimiento informado')).toBeInTheDocument();
    expect(hrefDe('Leer y firmar', hoy)).toBe('/health-record/consent');
    expect(screen.getByText(/^Todavía no hay novedades de tus datos/)).toBeInTheDocument();
    // Sin novedades: mandar el laboratorio o pedir la Segunda Opinión (el camino 2).
    const cambio = screen.getByRole('region', { name: 'Lo que cambió' });
    expect(hrefDe('Enviar mi laboratorio en PDF', cambio)).toBe('/enviar-estudios');
    expect(hrefDe(`Pedir mi ${MARCA.producto}`, cambio)).toBe('/solicitar-som');
    expect(
      screen.getByText(
        'Tu forma todavía no está completa. Respondé tus cuestionarios de hábitos y la vas a ver crecer.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText(TEXTO_SIN_ESTADIO)).toBeInTheDocument();
    const seccionPlan = screen.getByRole('region', { name: 'Plan Bienestar · 100 días' });
    expect(hrefDe(/^Empezar mi Plan Bienestar/, seccionPlan)).toBe('/care-plan/plan-100-dias');
    expect(hrefDe(/Escribir a mi equipo/, seccionPlan)).toBe('/Communication/nuevo');
    expect(screen.getByText('Cuando tengas un equipo asignado, lo vas a ver acá.')).toBeInTheDocument();
    expect(screen.getByText(/^Consentimiento informado/).closest('a')).toHaveTextContent('Leelo y firmalo');
  });

  test('un PDF en proceso y un laboratorio revisado por el equipo', async () => {
    await mostrar(laura({ laboratorio: { estado: 'en-proceso', fecha: '2026-10-09', revisionMedica: false } }));
    expect(screen.getByText('Procesando tu PDF')).toBeInTheDocument();
    expect(screen.getByText('Laboratorio del 9 de octubre')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ver mis resultados' })).not.toBeInTheDocument();
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/está trabajando con tus datos/);
  });

  test('con revisión médica, el chip es sólido', async () => {
    await mostrar(
      laura({
        laboratorio: { estado: 'procesado', fecha: '2026-10-03', valores: 1, informeId: 'dr', revisionMedica: true },
      })
    );
    expect(screen.getByText('Revisado por tu equipo médico')).toBeInTheDocument();
    expect(screen.getByText('Laboratorio del 3 de octubre · 1 valor')).toBeInTheDocument();
    expect(screen.queryByText('Sin revisión médica todavía')).not.toBeInTheDocument();
  });

  test('el modo de color de los pétalos llega a la rosa', async () => {
    await mostrar(laura(), 'dominio');
    const sueno = screen.getByRole('img').querySelector('[data-petalo="sueno"]');
    expect(sueno).toHaveAttribute('fill', COLORES_PETALOS.porDominio.sueno);
  });
});

describe('modoColorDe (?petalos= en la URL)', () => {
  test('acepta tinta, dominio y banda; cualquier otro valor no fuerza nada', () => {
    expect(modoColorDe('dominio')).toBe('dominio');
    expect(modoColorDe(' BANDA ')).toBe('banda');
    expect(modoColorDe('tinta')).toBe('tinta');
    expect(modoColorDe('rojo')).toBeUndefined();
    expect(modoColorDe(null)).toBeUndefined();
  });
});

// ─── Integración: el Inicio elige la Home según la paciente ──────────────────────────

/** Una fecha de nacimiento con `edad` años cumplidos hoy (en Argentina), lejos del cumpleaños. */
function nacimientoCon(edad: number): string {
  const [anio, mes, dia] = hoyArgentina().split('-').map(Number);
  return new Date(Date.UTC(anio - edad, mes - 1, dia - 30)).toISOString().slice(0, 10);
}

async function conPaciente(gender: Patient['gender'], edad: number): Promise<MockClient> {
  const medplum = new MockClient();
  const patient = await medplum.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Ana'], family: 'García' }],
    gender,
    birthDate: nacimientoCon(edad),
  });
  medplum.setProfile(patient);
  return medplum;
}

async function enElInicio(medplum: MockClient, ruta = '/'): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[ruta]}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Routes>
              <Route path="/" element={<HomePage />} />
            </Routes>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  });
}

describe('HomePage elige la Home E', () => {
  beforeAll(() => {
    indexarDefinicionesFhir();
  });

  test('una mujer de 55 años ve la Home E, con sus datos reales y las fuentes cargadas', async () => {
    await enElInicio(await conPaciente('female', 55));
    expect(await screen.findByRole('heading', { level: 1, name: 'Ana, estás en el centro.' })).toBeInTheDocument();
    // Cuando termina de cargar, «Para hoy» le pide el consentimiento (todavía no lo firmó).
    const hoy = screen.getByRole('region', { name: 'Para hoy' });
    expect(await within(hoy).findByText('Firmá tu consentimiento informado', {}, ESPERA)).toBeInTheDocument();
    // La otra Home (la D, con su tablero) no se monta.
    expect(screen.queryByRole('heading', { name: 'Salidas y llegadas de tus datos' })).not.toBeInTheDocument();
    const fuentes = document.head.querySelectorAll('link#fuentes-home-e');
    expect(fuentes).toHaveLength(1);
    expect(fuentes[0]).toHaveAttribute('href', URL_FUENTES_HOME_E);
  });

  // La Home clásica ya no está: quien no ve la E ve la D («Salidas y llegadas», HomeEstiloD).
  test('un hombre de 55 años ve la Home D', async () => {
    await enElInicio(await conPaciente('male', 55));
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Salidas y llegadas de tus datos' }, ESPERA)
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: /estás en el centro/ })).not.toBeInTheDocument();
  });

  test('una mujer de 55 años con ?estilo=d ve la Home D', async () => {
    await enElInicio(await conPaciente('female', 55), '/?estilo=d');
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Salidas y llegadas de tus datos' }, ESPERA)
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: /estás en el centro/ })).not.toBeInTheDocument();
  });

  test('un profesional con ?estilo=e ve la Home E sin datos de nadie', async () => {
    await enElInicio(new MockClient(), '/?estilo=e'); // el perfil por defecto es un Practitioner
    expect(await screen.findByRole('heading', { level: 1, name: 'Estás en el centro.' })).toBeInTheDocument();
    expect(screen.getByText('Esta Home es la de una paciente')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Tu forma de hoy/ })).toBeInTheDocument();
  });

  test('las fuentes se agregan a <head> una sola vez', async () => {
    const medplum = new MockClient();
    await act(async () => {
      render(
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>
            <MantineProvider>
              <HomeEstiloE />
              <HomeEstiloE />
            </MantineProvider>
          </MedplumProvider>
        </MemoryRouter>
      );
    });
    expect(document.head.querySelectorAll('link#fuentes-home-e')).toHaveLength(1);
  });
});

describe('VistaHomeE: «Tus valores» (el hGraph)', () => {
  const lectura = (code: string, value: number, unit: string): Observation => ({
    resourceType: 'Observation',
    status: 'final',
    code: { coding: [{ system: 'http://loinc.org', code }] },
    effectiveDateTime: '2026-09-15',
    valueQuantity: { value, unit },
    meta: { author: { reference: 'Patient/laura' } },
  });
  const valores = modeloHgraph([lectura('2085-9', 58, 'mg/dL'), lectura('1558-6', 104, 'mg/dL')], {
    sexo: 'female',
    hoy: HOY,
  });

  test('apagado (sin mostrarHgraph), no está', async () => {
    await mostrar(laura({ hgraph: valores }));
    expect(screen.queryByRole('region', { name: 'Tus valores' })).not.toBeInTheDocument();
  });

  test('pedido, va antes de las tres lecturas, con el gráfico y la lista', async () => {
    await mostrar(laura({ hgraph: valores }), undefined, new MockClient(), true);
    const seccion = screen.getByRole('region', { name: 'Tus valores' });
    const lecturas = screen.getByRole('region', { name: 'Tus tres lecturas' });
    expect(seccion.compareDocumentPosition(lecturas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(seccion).getByRole('img', { name: /^Tus valores: 1 en rango, 1 para mirar\./ })).toBeInTheDocument();
    expect(within(seccion).getByText('Azúcar en ayunas')).toBeInTheDocument();
    expect(within(seccion).getAllByText('Falta').length).toBeGreaterThan(0);
  });

  test('si las lecturas no se pudieron leer, lo dice (y no queda cargando)', async () => {
    await mostrar(laura({ hgraph: undefined }), undefined, new MockClient(), true);
    const seccion = screen.getByRole('region', { name: 'Tus valores' });
    expect(within(seccion).getByText(TEXTO_VALORES_SIN_LEER)).toBeInTheDocument();
  });
});

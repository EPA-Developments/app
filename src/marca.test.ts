// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import { armarMarca, MARCA } from './marca';
import { consentFooter, consentSections, consentSubtitle } from './pages/health-record/InformedConsent.data';

test('marca por defecto: Segunda Opinión Médica', () => {
  expect(MARCA).toEqual({
    nombre: 'Segunda Opinión Médica',
    logoPrincipal: 'Segunda Opinión',
    logoSecundario: 'Médica',
    nombreConsentimiento: 'SEGUNDA OPINIÓN MÉDICA',
    responsable: 'Dr. Alejandro Barbagelata',
    dirigidoPor: 'el Dr. Alejandro Barbagelata',
    direccion: 'Húsares 2248 6° E, C1428 CABA (Bajo Belgrano), Argentina',
    email: 'info@segundaopinionmedica.org',
  });
});

test('las variables MARCA_* pisan a marca.json', () => {
  const marca = armarMarca({
    MARCA_NOMBRE: 'Clínica del Sur',
    MARCA_RESPONSABLE: 'Dra. Ana Pérez',
    MARCA_EMAIL: 'hola@clinicadelsur.com.ar',
    MARCA_DIRECCION: '  ',
  });
  expect(marca.nombre).toBe('Clínica del Sur');
  expect(marca.logoPrincipal).toBe('Clínica del');
  expect(marca.logoSecundario).toBe('Sur');
  expect(marca.nombreConsentimiento).toBe('CLÍNICA DEL SUR');
  expect(marca.responsable).toBe('Dra. Ana Pérez');
  expect(marca.dirigidoPor).toBe('Dra. Ana Pérez');
  expect(armarMarca({ MARCA_RESPONSABLE: 'Dra. Ana Pérez', MARCA_DIRIGIDO_POR: 'la Dra. Ana Pérez' }).dirigidoPor).toBe(
    'la Dra. Ana Pérez'
  );
  expect(marca.email).toBe('hola@clinicadelsur.com.ar');
  // Vacía = se ignora y queda la de marca.json.
  expect(marca.direccion).toBe(MARCA.direccion);
});

test('el nombre del consentimiento se puede fijar aparte', () => {
  expect(armarMarca({ MARCA_NOMBRE: 'Cardio', MARCA_NOMBRE_CONSENTIMIENTO: 'CARDIO SRL' })).toMatchObject({
    logoPrincipal: 'Cardio',
    logoSecundario: '',
    nombreConsentimiento: 'CARDIO SRL',
  });
});

test('con la marca por defecto, el consentimiento dice lo mismo que antes', () => {
  expect(consentSubtitle).toBe('Servicio de Segunda Opinión Médica cardiovascular');
  expect(consentFooter).toBe(
    'Segunda Opinión Médica · Dr. Alejandro Barbagelata  |  Húsares 2248 6° E, C1428 CABA (Bajo Belgrano), Argentina  |  info@segundaopinionmedica.org  ·  Powered by EPA Bienestar IA'
  );
  const texto = JSON.stringify(consentSections);
  expect(texto).toContain(
    'Segunda Opinión Médica es un servicio de segunda opinión médica cardiovascular dirigido por el Dr. Alejandro Barbagelata.'
  );
  expect(texto).toContain('mediante solicitud a info@segundaopinionmedica.org.');
});

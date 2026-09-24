// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import react from '@vitejs/plugin-react';
import { copyFileSync, existsSync } from 'fs';
import path from 'path';
import type { Plugin } from 'vite';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import marcaBase from './src/marca.json';

if (!existsSync(path.join(__dirname, '.env'))) {
  copyFileSync(path.join(__dirname, '.env.defaults'), path.join(__dirname, '.env'));
}

// Marca blanca: el <title> de index.html sale del mismo lugar que el resto de la marca
// (MARCA_NOMBRE del entorno, o src/marca.json).
function tituloDeMarca(mode: string): Plugin {
  const nombre = loadEnv(mode, __dirname, 'MARCA_').MARCA_NOMBRE?.trim() || marcaBase.nombre;
  const escapado = nombre.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return {
    name: 'titulo-de-marca',
    transformIndexHtml: (html) => html.replace('__MARCA_NOMBRE__', escapado),
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  envPrefix: ['MEDPLUM_', 'GOOGLE_', 'RECAPTCHA_', 'MARCA_'],
  plugins: [react(), tituloDeMarca(mode)],
  resolve: {
    // Módulo Plan Bienestar vendorizado (ver src/vendor/plan-bienestar/README.md).
    alias: {
      '@epa/careplan-menopausia': path.resolve(__dirname, 'src/vendor/plan-bienestar/careplan-menopausia/index.ts'),
      '@epa/plan-bienestar-react': path.resolve(__dirname, 'src/vendor/plan-bienestar/plan-bienestar-react/index.ts'),
    },
  },
  preview: {
    port: 3000,
    allowedHosts: true,
    host: 'app.segundaopinionmedica.org',
  },
  server: {
    port: 3000,
    host: 'localhost',
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test.setup.ts'],
    globals: true,
    testTimeout: 120000,
    // Las fechas 'AAAA-MM-DD' se prueban en la zona horaria real de los pacientes (UTC-3),
    // donde `new Date('AAAA-MM-DD')` corre la fecha un día.
    env: { TZ: 'America/Argentina/Buenos_Aires' },
  },
}));

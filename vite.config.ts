// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import react from '@vitejs/plugin-react';
import { copyFileSync, existsSync } from 'fs';
import path from 'path';
import { defineConfig } from 'vitest/config';

if (!existsSync(path.join(__dirname, '.env'))) {
  copyFileSync(path.join(__dirname, '.env.defaults'), path.join(__dirname, '.env'));
}

// https://vitejs.dev/config/
export default defineConfig({
  envPrefix: ['MEDPLUM_', 'GOOGLE_', 'RECAPTCHA_'],
  plugins: [react()],
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
  },
});

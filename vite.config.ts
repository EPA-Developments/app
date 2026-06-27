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
  preview: {
    port: 3006,
    allowedHosts: true,
    host: 'app.segundaopinion.org',
  },
  server: {
    port: 3006,
    host: 'localhost',
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test.setup.ts'],
    globals: true,
    testTimeout: 120000,
  },
});

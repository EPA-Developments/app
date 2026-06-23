// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { AppShell, Box } from '@mantine/core';
import { ErrorBoundary, useMedplum } from '@medplum/react';
import { Suspense } from 'react';
import type { JSX } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { Router } from './Router';
import { BottomNav } from './components/BottomNav';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { Loading } from './components/Loading';
import { RegisterPage } from './pages/RegisterPage';
import { SetPasswordPage } from './pages/SetPasswordPage';
import { SignInPage } from './pages/SignInPage';
import { LandingPage } from './pages/landing';

export function App(): JSX.Element | null {
  const medplum = useMedplum();

  if (medplum.isLoading()) {
    return null;
  }

  if (!medplum.getProfile()) {
    return (
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="signin" element={<SignInPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="setpassword/:id/:secret" element={<SetPasswordPage />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    );
  }

  return (
    <AppShell header={{ height: 60 }}>
      <Header />
      <AppShell.Main pb={{ base: 80, sm: 0 }}>
        <ErrorBoundary>
          <Suspense fallback={<Loading />}>
            <Router />
          </Suspense>
        </ErrorBoundary>
        {/* El pie es ruidoso en mobile; en smartphone manda el menú inferior. */}
        <Box visibleFrom="sm">
          <Footer />
        </Box>
      </AppShell.Main>
      {/* Menú inferior fijo (solo mobile). */}
      <BottomNav />
    </AppShell>
  );
}

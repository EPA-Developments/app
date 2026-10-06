// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// iOS Safari: a veces el área visible (visual viewport) se desfasa del área con la que se
// ubican los elementos `position: fixed` (al colapsar la barra de Safari al hacer scroll, o
// después de cerrar el teclado). Se ve como el menú inferior "flotando" a mitad de pantalla
// y el encabezado desaparecido arriba. Este hook mide el desfase real y lo corrige con un
// `translateY`; donde no hay desfase (Chrome, Android, desktop) la corrección es 0.
//
// No corrige: con zoom (pinch), mientras se edita un campo (con el teclado abierto el
// comportamiento nativo es el esperado) ni si el elemento está oculto. Solo mueve hacia
// adentro de la pantalla: la barra inferior hacia abajo y el encabezado hacia abajo.
import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

export type Borde = 'top' | 'bottom';

function editando(): boolean {
  const el = document.activeElement as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)));
}

/**
 * Corrección (px, hacia abajo) para que el borde del elemento coincida con el del área
 * visible. 0 si no hace falta. `rect` es la posición sin la corrección aplicada.
 */
export function correccionViewport(
  borde: Borde,
  rect: { top: number; bottom: number; height: number },
  vv: { offsetTop: number; height: number; scale: number }
): number {
  if (rect.height === 0 || Math.abs(vv.scale - 1) > 0.01) {
    return 0;
  }
  const objetivo = borde === 'bottom' ? vv.offsetTop + vv.height : vv.offsetTop;
  const actual = borde === 'bottom' ? rect.bottom : rect.top;
  const dy = Math.round(objetivo - actual);
  return dy > 1 ? dy : 0;
}

export function useAnclaViewport<T extends HTMLElement>(borde: Borde): RefObject<T | null> {
  const ref = useRef<T>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    const el = ref.current;
    if (!vv || !el) {
      return undefined;
    }
    let aplicado = 0;
    let frame = 0;

    const ajustar = (): void => {
      frame = 0;
      const r = el.getBoundingClientRect();
      const sinCorreccion = { top: r.top - aplicado, bottom: r.bottom - aplicado, height: r.height };
      const dy = editando() ? 0 : correccionViewport(borde, sinCorreccion, vv);
      if (dy !== aplicado) {
        aplicado = dy;
        el.style.transform = dy ? `translateY(${dy}px)` : '';
      }
    };
    const programar = (): void => {
      if (!frame) {
        frame = requestAnimationFrame(ajustar);
      }
    };

    vv.addEventListener('resize', programar);
    vv.addEventListener('scroll', programar);
    window.addEventListener('scroll', programar, { passive: true });
    window.addEventListener('resize', programar);
    document.addEventListener('focusout', programar);
    programar();
    return () => {
      if (frame) {
        cancelAnimationFrame(frame);
      }
      vv.removeEventListener('resize', programar);
      vv.removeEventListener('scroll', programar);
      window.removeEventListener('scroll', programar);
      window.removeEventListener('resize', programar);
      document.removeEventListener('focusout', programar);
      el.style.transform = '';
    };
  }, [borde]);

  return ref;
}

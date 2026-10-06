// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import { act, render } from '@testing-library/react';
import type { JSX } from 'react';
import { correccionViewport, useAnclaViewport } from './useAnclaViewport';

const sinZoom = { scale: 1 };

describe('correccionViewport', () => {
  test('sin desfase (Chrome, Android, desktop): 0', () => {
    expect(correccionViewport('bottom', { top: 600, bottom: 664, height: 64 }, { offsetTop: 0, height: 664, ...sinZoom })).toBe(0);
    expect(correccionViewport('top', { top: 0, bottom: 60, height: 60 }, { offsetTop: 0, height: 664, ...sinZoom })).toBe(0);
  });

  test('iOS desfasado (la captura): la barra baja hasta el borde visible y el encabezado vuelve arriba', () => {
    // El área de los fijos quedó 250px más arriba que el área visible.
    const vv = { offsetTop: 250, height: 664, ...sinZoom };
    expect(correccionViewport('bottom', { top: 600, bottom: 664, height: 64 }, vv)).toBe(250);
    expect(correccionViewport('top', { top: 0, bottom: 60, height: 60 }, vv)).toBe(250);
  });

  test('no sube la barra (teclado abierto: queda donde la deja el navegador)', () => {
    expect(correccionViewport('bottom', { top: 600, bottom: 664, height: 64 }, { offsetTop: 0, height: 380, ...sinZoom })).toBe(0);
  });

  test('con zoom o elemento oculto: no corrige', () => {
    expect(correccionViewport('bottom', { top: 600, bottom: 664, height: 64 }, { offsetTop: 250, height: 500, scale: 1.4 })).toBe(0);
    expect(correccionViewport('bottom', { top: 0, bottom: 0, height: 0 }, { offsetTop: 0, height: 664, ...sinZoom })).toBe(0);
  });
});

describe('useAnclaViewport', () => {
  const vv = Object.assign(new EventTarget(), { offsetTop: 0, height: 664, scale: 1 });

  beforeEach(() => {
    vv.offsetTop = 0;
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
    // Cuadro inmediato (en el navegador es asíncrono): devuelve 0 para que no quede "pendiente".
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });
  });
  afterEach(() => vi.restoreAllMocks());

  function Barra(): JSX.Element {
    const ref = useAnclaViewport<HTMLElement>('bottom');
    return (
      <nav ref={ref} aria-label="barra">
        <input aria-label="campo" />
      </nav>
    );
  }

  function montar(): HTMLElement {
    const { getByLabelText } = render(<Barra />);
    const nav = getByLabelText('barra');
    // La barra fija, pegada al fondo del área de los fijos (664px). Al leer la posición se
    // descuenta la corrección ya aplicada, como hace el navegador.
    vi.spyOn(nav, 'getBoundingClientRect').mockImplementation(() => {
      const dy = Number(/translateY\((-?\d+)px\)/.exec(nav.style.transform)?.[1] ?? 0);
      return { top: 600 + dy, bottom: 664 + dy, height: 64 } as DOMRect;
    });
    return nav;
  }

  test('corrige cuando iOS se desfasa y vuelve a 0 cuando se acomoda', () => {
    const nav = montar();
    expect(nav.style.transform).toBe('');

    vv.offsetTop = 250;
    act(() => {
      vv.dispatchEvent(new Event('scroll'));
    });
    expect(nav.style.transform).toBe('translateY(250px)');

    vv.offsetTop = 0;
    act(() => {
      vv.dispatchEvent(new Event('scroll'));
    });
    expect(nav.style.transform).toBe('');
  });

  test('mientras se edita un campo no toca la barra', () => {
    const nav = montar();
    const campo = nav.querySelector('input') as HTMLInputElement;
    campo.focus();
    vv.offsetTop = 250;
    act(() => {
      vv.dispatchEvent(new Event('scroll'));
    });
    expect(nav.style.transform).toBe('');
  });
});

/**
 * A function that returns a fresh UUID (without the `urn:uuid:` prefix).
 * Injectable so callers can supply a deterministic generator in tests.
 */
export type IdGenerator = () => string;

/**
 * Default generator backed by Web Crypto (available in Node >= 20 and browsers).
 * Falls back to a non-cryptographic UUID only if `crypto.randomUUID` is missing.
 */
export const defaultIdGenerator: IdGenerator = () => {
  const cryptoObj = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  return fallbackUuid();
};

function fallbackUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = Math.floor(Math.random() * 16);
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}

/** Wraps a bare UUID as a Bundle-internal `urn:uuid:` reference. */
export function urn(uuid: string): string {
  return `urn:uuid:${uuid}`;
}

/**
 * Creates a deterministic, counter-based id generator. Intended for tests and
 * reproducible fixtures — never for production data.
 */
export function sequentialIdGenerator(prefix = '00000000-0000-4000-8000'): IdGenerator {
  let counter = 0;
  return () => {
    counter += 1;
    return `${prefix}-${counter.toString().padStart(12, '0')}`;
  };
}

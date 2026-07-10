import type { CodeableConcept, Coding, Quantity, Range, Reference, Resource } from '@medplum/fhirtypes';
import { SYSTEM } from '../terminology/systems.js';

/** Builds a CodeableConcept from a single Coding, defaulting `text` to its display. */
export function concept(coding: Coding, text?: string): CodeableConcept {
  return { coding: [coding], text: text ?? coding.display };
}

/** Builds a plain-text CodeableConcept (no coding). */
export function textConcept(text: string): CodeableConcept {
  return { text };
}

export type QuantityComparator = '<' | '<=' | '>=' | '>';

/** Builds a UCUM-coded Quantity. */
export function quantity(
  value: number,
  unit: string,
  ucumCode?: string,
  comparator?: QuantityComparator,
): Quantity {
  const q: Quantity = { value, unit };
  if (ucumCode !== undefined) {
    q.system = SYSTEM.ucum;
    q.code = ucumCode;
  }
  if (comparator !== undefined) {
    q.comparator = comparator;
  }
  return q;
}

/** Builds a Range from optional low/high Quantities. */
export function range(low?: Quantity, high?: Quantity): Range {
  const r: Range = {};
  if (low !== undefined) r.low = low;
  if (high !== undefined) r.high = high;
  return r;
}

/** Normalises a string like `Patient/123` or a Reference into a typed Reference. */
export function toReference<T extends Resource = Resource>(
  reference: Reference<T> | string,
): Reference<T> {
  if (typeof reference === 'string') {
    return { reference } as Reference<T>;
  }
  return reference;
}

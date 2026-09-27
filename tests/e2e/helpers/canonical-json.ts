import { createHash } from 'node:crypto';

/**
 * Deterministically serialize a JavaScript value to canonical JSON.
 * - Object keys are sorted lexicographically at all nesting levels.
 * - Undefined object values are omitted (matching JSON.stringify behavior).
 * - Arrays preserve their element order.
 * - Numbers, booleans, and strings serialize according to standard JSON format.
 */
export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    const serializedElements = value.map((elem) => canonicalStringify(elem));
    return `[${serializedElements.join(',')}]`;
  }

  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const serializedEntries: string[] = [];

  for (const key of sortedKeys) {
    const val = obj[key];
    if (val !== undefined) {
      serializedEntries.push(`${JSON.stringify(key)}:${canonicalStringify(val)}`);
    }
  }

  return `{${serializedEntries.join(',')}}`;
}

/**
 * Computes SHA-256 hexadecimal hash over the canonical JSON representation of the payload.
 */
export function computeContentHash(payload: unknown): string {
  const canonicalJson = canonicalStringify(payload);
  return createHash('sha256').update(canonicalJson, 'utf8').digest('hex');
}

/**
 * Validates that an envelope's content_hash matches the SHA-256 hash of its payload.
 */
export function verifyContentHash(envelope: { payload: unknown; content_hash: string }): boolean {
  if (!envelope || !envelope.content_hash || envelope.payload === undefined) {
    return false;
  }
  const expectedHash = computeContentHash(envelope.payload);
  return envelope.content_hash.toLowerCase() === expectedHash.toLowerCase();
}

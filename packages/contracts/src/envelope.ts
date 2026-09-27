import { z } from 'zod';
import crypto from 'node:crypto';

/**
 * Artifact lifecycle status enum according to PRD Section 4.4 / AGENT.md §3.2
 */
export const ArtifactStatusSchema = z.enum([
  'DRAFT',
  'VALID',
  'PARTIAL',
  'INVALID',
  'SUPERSEDED',
]);
export type ArtifactStatus = z.infer<typeof ArtifactStatusSchema>;

/**
 * Supported artifact types across the 6-agent core pipeline and external dynamic agents
 */
export const ArtifactTypeSchema = z.enum([
  'dataset',
  'metric',
  'comparison',
  'insight',
  'chart_spec',
  'report',
  'finance_plan',
]);
export type ArtifactType = z.infer<typeof ArtifactTypeSchema>;

/**
 * Standard Artifact Envelope Schema validating all outputs emitted by sub-agents
 */
export const ArtifactEnvelopeSchema = z.object({
  artifact_id: z.string().uuid({ message: 'artifact_id must be a valid UUID' }),
  run_id: z.string().uuid({ message: 'run_id must be a valid UUID' }),
  task_id: z.string().trim().min(1, { message: 'task_id must be a non-empty string' }),
  artifact_type: ArtifactTypeSchema,
  schema_version: z.string().default('1.0.0'),
  status: ArtifactStatusSchema.default('VALID'),
  producer: z.string().trim().min(1, { message: 'producer must be a non-empty string' }),
  content_hash: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, { message: 'content_hash must be a 64-character SHA-256 hexadecimal string' }),
  payload: z.record(z.unknown()),
  evidence_refs: z.array(z.string()).default([]),
  input_artifact_refs: z.array(z.string()).default([]),
  limitations: z.array(z.string()).optional(),
  created_at: z
    .string()
    .datetime({ offset: true, message: 'created_at must be an ISO 8601 timestamp' }),
});
export type ArtifactEnvelope = z.infer<typeof ArtifactEnvelopeSchema>;

/**
 * Deterministic JSON stringifier: sorts object keys recursively to ensure consistent hashing
 * - Object keys are sorted lexicographically at all nesting levels.
 * - Undefined object values are omitted (matching standard JSON.stringify behavior).
 * - Arrays preserve their element order.
 * - Numbers, booleans, and strings serialize according to standard JSON format.
 * - Date instances are serialized as ISO 8601 strings.
 */
export function canonicalStringify(val: unknown): string {
  if (val === null || val === undefined) {
    return 'null';
  }
  if (val instanceof Date) {
    return JSON.stringify(val.toISOString());
  }
  if (typeof val === 'number' || typeof val === 'boolean' || typeof val === 'string') {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    return '[' + val.map(canonicalStringify).join(',') + ']';
  }
  if (typeof val === 'object') {
    const keys = Object.keys(val as Record<string, unknown>).sort();
    const parts: string[] = [];
    for (const key of keys) {
      const v = (val as Record<string, unknown>)[key];
      if (v !== undefined) {
        parts.push(JSON.stringify(key) + ':' + canonicalStringify(v));
      }
    }
    return '{' + parts.join(',') + '}';
  }
  return JSON.stringify(val);
}

/**
 * Computes deterministic SHA-256 hexadecimal hash over the canonical JSON representation of the payload.
 */
export function computeContentHash(payload: unknown): string {
  const canonical = canonicalStringify(payload);
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Verifies if an envelope's content_hash matches the SHA-256 hash of its payload.
 */
export function verifyContentHash(envelope: { payload: unknown; content_hash: string }): boolean {
  if (!envelope || !envelope.content_hash || envelope.payload === undefined) {
    return false;
  }
  const expectedHash = computeContentHash(envelope.payload);
  return envelope.content_hash.toLowerCase() === expectedHash.toLowerCase();
}

/**
 * Parameters for building an artifact envelope
 */
export interface CreateArtifactEnvelopeParams<T = Record<string, unknown>> {
  artifact_id?: string;
  run_id: string;
  task_id: string;
  artifact_type: ArtifactType;
  schema_version?: string;
  status?: ArtifactStatus;
  producer: string;
  payload: T;
  content_hash?: string;
  evidence_refs?: string[];
  input_artifact_refs?: string[];
  limitations?: string[];
  created_at?: string;
}

/**
 * Factory helper: constructs and validates an ArtifactEnvelope with defaults and auto-calculated hash
 */
export function createArtifactEnvelope<T = Record<string, unknown>>(
  params: CreateArtifactEnvelopeParams<T>
): ArtifactEnvelope {
  const payloadObj = (params.payload && typeof params.payload === 'object' ? params.payload : {}) as Record<string, unknown>;
  const computedHash = params.content_hash ?? computeContentHash(payloadObj);

  const rawEnvelope: ArtifactEnvelope = {
    artifact_id: params.artifact_id ?? crypto.randomUUID(),
    run_id: params.run_id,
    task_id: params.task_id,
    artifact_type: params.artifact_type,
    schema_version: params.schema_version ?? '1.0.0',
    status: params.status ?? 'VALID',
    producer: params.producer,
    content_hash: computedHash,
    payload: payloadObj,
    evidence_refs: params.evidence_refs ?? [],
    input_artifact_refs: params.input_artifact_refs ?? [],
    limitations: params.limitations,
    created_at: params.created_at ?? new Date().toISOString(),
  };

  return ArtifactEnvelopeSchema.parse(rawEnvelope);
}

/**
 * Validates an unknown object against ArtifactEnvelopeSchema, throwing ZodError on failure
 */
export function validateEnvelope(data: unknown): ArtifactEnvelope {
  return ArtifactEnvelopeSchema.parse(data);
}

/**
 * Safe, non-throwing validation returning Zod SafeParseReturnType
 */
export function safeValidateEnvelope(data: unknown): z.SafeParseReturnType<unknown, ArtifactEnvelope> {
  return ArtifactEnvelopeSchema.safeParse(data);
}

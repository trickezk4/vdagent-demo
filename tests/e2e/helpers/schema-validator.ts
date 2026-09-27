export const VALID_ARTIFACT_TYPES = [
  'dataset',
  'metric',
  'comparison',
  'insight',
  'chart_spec',
  'report',
  'finance_plan',
] as const;

export type ArtifactType = (typeof VALID_ARTIFACT_TYPES)[number];

export const VALID_ARTIFACT_STATUSES = [
  'DRAFT',
  'VALID',
  'PARTIAL',
  'INVALID',
  'SUPERSEDED',
] as const;

export type ArtifactStatus = (typeof VALID_ARTIFACT_STATUSES)[number];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const SHA256_HEX_REGEX = /^[0-9a-f]{64}$/i;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates that an envelope adheres to the ArtifactEnvelope specification.
 */
export function validateEnvelope(envelope: unknown): ValidationResult {
  const errors: string[] = [];

  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    return { valid: false, errors: ['Envelope must be a non-null object'] };
  }

  const env = envelope as Record<string, unknown>;

  // artifact_id
  if (typeof env.artifact_id !== 'string' || !UUID_REGEX.test(env.artifact_id)) {
    errors.push(`artifact_id must be a valid UUID string (got: ${JSON.stringify(env.artifact_id)})`);
  }

  // run_id
  if (typeof env.run_id !== 'string' || !UUID_REGEX.test(env.run_id)) {
    errors.push(`run_id must be a valid UUID string (got: ${JSON.stringify(env.run_id)})`);
  }

  // task_id
  if (typeof env.task_id !== 'string' || env.task_id.trim().length === 0) {
    errors.push('task_id must be a non-empty string');
  }

  // artifact_type
  if (
    typeof env.artifact_type !== 'string' ||
    !VALID_ARTIFACT_TYPES.includes(env.artifact_type as ArtifactType)
  ) {
    errors.push(
      `artifact_type must be one of [${VALID_ARTIFACT_TYPES.join(', ')}] (got: ${JSON.stringify(
        env.artifact_type
      )})`
    );
  }

  // schema_version
  if (env.schema_version !== undefined && typeof env.schema_version !== 'string') {
    errors.push('schema_version must be a string if provided');
  }

  // status
  if (
    typeof env.status !== 'string' ||
    !VALID_ARTIFACT_STATUSES.includes(env.status as ArtifactStatus)
  ) {
    errors.push(
      `status must be one of [${VALID_ARTIFACT_STATUSES.join(', ')}] (got: ${JSON.stringify(
        env.status
      )})`
    );
  }

  // producer
  if (typeof env.producer !== 'string' || env.producer.trim().length === 0) {
    errors.push('producer must be a non-empty string identifying the producing agent');
  }

  // content_hash
  if (typeof env.content_hash !== 'string' || !SHA256_HEX_REGEX.test(env.content_hash)) {
    errors.push(
      `content_hash must be a 64-character SHA-256 hexadecimal string (got: ${JSON.stringify(
        env.content_hash
      )})`
    );
  }

  // payload
  if (!env.payload || typeof env.payload !== 'object' || Array.isArray(env.payload)) {
    errors.push('payload must be a non-null object containing domain data');
  }

  // evidence_refs
  if (env.evidence_refs !== undefined) {
    if (!Array.isArray(env.evidence_refs)) {
      errors.push('evidence_refs must be an array of string identifiers');
    } else {
      for (let i = 0; i < env.evidence_refs.length; i++) {
        if (typeof env.evidence_refs[i] !== 'string') {
          errors.push(`evidence_refs[${i}] must be a string`);
        }
      }
    }
  }

  // input_artifact_refs
  if (env.input_artifact_refs !== undefined) {
    if (!Array.isArray(env.input_artifact_refs)) {
      errors.push('input_artifact_refs must be an array of string identifiers');
    } else {
      for (let i = 0; i < env.input_artifact_refs.length; i++) {
        if (typeof env.input_artifact_refs[i] !== 'string') {
          errors.push(`input_artifact_refs[${i}] must be a string`);
        }
      }
    }
  }

  // created_at
  if (typeof env.created_at !== 'string' || !ISO_DATE_REGEX.test(env.created_at)) {
    errors.push(
      `created_at must be an ISO-8601 formatted timestamp string (got: ${JSON.stringify(
        env.created_at
      )})`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates domain payload for 'dataset' artifact.
 */
export function validateDatasetPayload(payload: unknown): ValidationResult {
  const errors: string[] = [];
  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Dataset payload must be an object'] };
  }
  const p = payload as Record<string, unknown>;

  if (!Array.isArray(p.units)) {
    errors.push('Dataset payload must contain a units array');
  }

  if (!p.summary_metrics || typeof p.summary_metrics !== 'object') {
    errors.push('Dataset payload must contain summary_metrics object');
  } else {
    const sm = p.summary_metrics as Record<string, unknown>;
    if (typeof sm.avg_dom !== 'number' || isNaN(sm.avg_dom)) {
      errors.push('summary_metrics.avg_dom must be a valid number');
    }
    if (typeof sm.absorption_rate !== 'number' || isNaN(sm.absorption_rate)) {
      errors.push('summary_metrics.absorption_rate must be a valid number');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates domain payload for 'comparison' artifact.
 */
export function validateComparisonPayload(payload: unknown): ValidationResult {
  const errors: string[] = [];
  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Comparison payload must be an object'] };
  }
  const p = payload as Record<string, unknown>;

  if (!p.peer_benchmark || typeof p.peer_benchmark !== 'object') {
    errors.push('Comparison payload must contain peer_benchmark object');
  } else {
    const pb = p.peer_benchmark as Record<string, unknown>;
    if (typeof pb.target_dom !== 'number') {
      errors.push('peer_benchmark.target_dom must be a number');
    }
    if (typeof pb.peer_avg_dom !== 'number') {
      errors.push('peer_benchmark.peer_avg_dom must be a number');
    }
    if (typeof pb.price_variance_pct !== 'number') {
      errors.push('peer_benchmark.price_variance_pct must be a number');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates domain payload for 'insight' artifact.
 */
export function validateInsightPayload(payload: unknown): ValidationResult {
  const errors: string[] = [];
  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Insight payload must be an object'] };
  }
  const p = payload as Record<string, unknown>;

  if (!Array.isArray(p.findings) || p.findings.length === 0) {
    errors.push('Insight payload must contain a non-empty findings array');
  } else {
    for (let i = 0; i < p.findings.length; i++) {
      const f = p.findings[i];
      if (!f || typeof f !== 'object') {
        errors.push(`findings[${i}] must be an object`);
        continue;
      }
      if (typeof f.claim !== 'string' || f.claim.trim().length === 0) {
        errors.push(`findings[${i}].claim must be a non-empty string`);
      }
      if (typeof f.evidence_id !== 'string' || f.evidence_id.trim().length === 0) {
        errors.push(`findings[${i}].evidence_id must be a non-empty string link to evidence`);
      }
      if (typeof f.confidence !== 'number' || f.confidence < 0 || f.confidence > 1) {
        errors.push(`findings[${i}].confidence must be a number between 0 and 1`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates domain payload for 'chart_spec' artifact.
 */
export function validateChartSpecPayload(payload: unknown): ValidationResult {
  const errors: string[] = [];
  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['ChartSpec payload must be an object'] };
  }
  const p = payload as Record<string, unknown>;

  if (p.chart_type !== 'bar' && p.chart_type !== 'scatter') {
    errors.push("chart_type must be either 'bar' or 'scatter'");
  }
  if (!Array.isArray(p.chart_data)) {
    errors.push('chart_data must be an array');
  }
  if (typeof p.x_axis !== 'string' || p.x_axis.length === 0) {
    errors.push('x_axis must be a non-empty string');
  }
  if (typeof p.y_axis !== 'string' || p.y_axis.length === 0) {
    errors.push('y_axis must be a non-empty string');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates domain payload for 'report' artifact (must contain 6 PRD sections).
 */
export function validateReportPayload(payload: unknown): ValidationResult {
  const errors: string[] = [];
  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Report payload must be an object'] };
  }
  const p = payload as Record<string, unknown>;

  const markdown = typeof p.markdown === 'string' ? p.markdown : '';
  if (!markdown || markdown.trim().length === 0) {
    errors.push('Report payload must contain non-empty markdown string');
    return { valid: false, errors };
  }

  // 6 Required PRD Sections:
  // 1. Executive Summary
  // 2. Scope & Target Definition
  // 3. Data Quality & Snapshot Context
  // 4. Root-cause Insights & Peer Comparison
  // 5. Visual Charts
  // 6. Sales Action Recommendations
  const requiredSections = [
    /executive\s+summary/i,
    /scope.*target/i,
    /data\s+quality/i,
    /root-cause|insight/i,
    /visual\s+charts?|biểu\s+đồ/i,
    /sales\s+action|recommendation|khuyến\s+nghị/i,
  ];

  for (const pattern of requiredSections) {
    if (!pattern.test(markdown)) {
      errors.push(`Report markdown is missing required section matching: ${pattern.toString()}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates domain payload for 'finance_plan' artifact.
 */
export function validateFinancePlanPayload(payload: unknown): ValidationResult {
  const errors: string[] = [];
  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['FinancePlan payload must be an object'] };
  }
  const p = payload as Record<string, unknown>;

  if (typeof p.property_price !== 'number' || p.property_price <= 0) {
    errors.push('property_price must be a positive number');
  }
  if (typeof p.loan_amount !== 'number' || p.loan_amount <= 0) {
    errors.push('loan_amount must be a positive number');
  }
  const monthlyPayment = p.monthly_installment ?? p.monthly_payment_estimate;
  if (typeof monthlyPayment !== 'number' || monthlyPayment <= 0) {
    errors.push('monthly_installment or monthly_payment_estimate must be a positive number');
  }
  const rate = p.interest_rate ?? p.interest_rate_pct;
  if (typeof rate !== 'number' || rate <= 0) {
    errors.push('interest_rate must be a positive number');
  }
  if (typeof p.term_years !== 'number' || p.term_years <= 0) {
    errors.push('term_years must be a positive integer');
  }

  return { valid: errors.length === 0, errors };
}

import { z } from 'zod';
import { ArtifactEnvelopeSchema } from './envelope.js';

/**
 * Individual Real Estate Unit Record Schema
 */
export const UnitRecordSchema = z
  .object({
    unit_id: z.string().min(1),
    unit_code: z.string().min(1),
    dom: z.number().int().nonnegative(),
    project_name: z.string().optional(),
    zone_name: z.string().optional(),
    bedroom_count: z.number().int().nonnegative().optional(),
    bathroom_count: z.number().int().nonnegative().optional(),
    area_sqm: z.number().positive().optional(),
    area: z.number().positive().optional(),
    floor_level: z.number().int().optional(),
    floor_number: z.number().int().optional(),
    view_direction: z.string().optional(),
    orientation: z.string().optional(),
    launch_price_vnd: z.number().positive().optional(),
    net_price_vnd: z.number().positive().optional(),
    list_price: z.number().positive().optional(),
    net_price: z.number().positive().optional(),
    price: z.number().positive().optional(),
    status: z.string().default('Available').optional(),
    views_count: z.number().int().nonnegative().optional(),
    inquiries_count: z.number().int().nonnegative().optional(),
  })
  .passthrough();
export type UnitRecord = z.infer<typeof UnitRecordSchema>;

/**
 * DatasetPayload Schema (data-agent)
 */
export const DatasetPayloadSchema = z
  .object({
    units: z.array(UnitRecordSchema),
    summary_metrics: z
      .object({
        avg_dom: z.number().nonnegative(),
        absorption_rate: z.number(),
        total_slow_moving: z.number().int().nonnegative().optional(),
        slow_moving_count: z.number().int().nonnegative().optional(),
        total_units: z.number().int().nonnegative().optional(),
      })
      .passthrough(),
    project_id: z.string().optional(),
    project_name: z.string().optional(),
    zone_code: z.string().optional(),
    filters_applied: z
      .object({
        dom_threshold: z.number().default(90),
        project: z.string().optional(),
        zone: z.string().optional(),
      })
      .optional(),
    query_timestamp: z.string().optional(),
  })
  .passthrough();
export type DatasetPayload = z.infer<typeof DatasetPayloadSchema>;

/**
 * ComparisonPayload Schema (compare-agent)
 */
export const ComparisonPayloadSchema = z
  .object({
    peer_benchmark: z
      .object({
        target_dom: z.number(),
        peer_avg_dom: z.number(),
        price_variance_pct: z.number(),
        area_band: z.string().optional(),
        target_price_vnd: z.number().optional(),
        peer_avg_price_vnd: z.number().optional(),
        target_price_per_sqm: z.number().optional(),
        peer_avg_price_per_sqm: z.number().optional(),
      })
      .passthrough(),
    observations: z.array(z.string()).optional(),
    peer_criteria: z
      .object({
        area_tolerance_pct: z.number().default(10),
        same_zone: z.boolean().default(true),
        price_band_vnd: z.tuple([z.number(), z.number()]).optional(),
      })
      .optional(),
    target_units: z.array(z.string()).optional(),
    peer_units: z.array(z.string()).optional(),
    comparison_summary: z.string().optional(),
  })
  .passthrough();
export type ComparisonPayload = z.infer<typeof ComparisonPayloadSchema>;

/**
 * FindingRecord Schema (insight-agent)
 */
export const FindingRecordSchema = z
  .object({
    claim: z.string().trim().min(1, { message: 'claim must be a non-empty string' }),
    evidence_id: z.string().trim().min(1, { message: 'evidence_id must be a non-empty string link to evidence' }),
    confidence: z.number().min(0).max(1, { message: 'confidence must be a number between 0 and 1' }),
    category: z
      .enum(['pricing', 'design_layout', 'policy_financing', 'market_competition', 'general'])
      .default('general')
      .optional(),
    detail: z.string().optional(),
    impact_assessment: z.string().optional(),
  })
  .passthrough();
export type FindingRecord = z.infer<typeof FindingRecordSchema>;

/**
 * InsightPayload Schema (insight-agent)
 */
export const InsightPayloadSchema = z
  .object({
    findings: z.array(FindingRecordSchema).min(1, { message: 'Insight payload must contain a non-empty findings array' }),
    overall_root_cause: z.string().optional(),
    recommended_focus: z.string().optional(),
  })
  .passthrough();
export type InsightPayload = z.infer<typeof InsightPayloadSchema>;

/**
 * ChartSpecPayload Schema (chart-agent)
 */
export const ChartSpecPayloadSchema = z
  .object({
    chart_type: z.enum(['bar', 'scatter'], { message: "chart_type must be either 'bar' or 'scatter'" }),
    title: z.string().optional(),
    description: z.string().optional(),
    chart_data: z.array(z.record(z.unknown())),
    x_axis: z.union([z.string().min(1, { message: 'x_axis must be a non-empty string' }), z.object({ key: z.string(), label: z.string().optional() })]),
    y_axis: z.union([z.string().min(1, { message: 'y_axis must be a non-empty string' }), z.object({ key: z.string(), label: z.string().optional() })]),
    series: z
      .array(
        z.object({
          key: z.string(),
          name: z.string(),
          color: z.string().optional(),
        })
      )
      .optional(),
    benchmark_line: z
      .object({
        value: z.number(),
        label: z.string(),
        color: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();
export type ChartSpecPayload = z.infer<typeof ChartSpecPayloadSchema>;

/**
 * Report Section Definition
 */
export const ReportSectionSchema = z.object({
  id: z.string(),
  heading: z.string(),
  content: z.string(),
  evidence_refs: z.array(z.string()).default([]),
});
export type ReportSection = z.infer<typeof ReportSectionSchema>;

/**
 * Mandatory 6 PRD Report Section Headings
 */
export const MANDATORY_REPORT_SECTIONS = [
  'Executive Summary',
  'Scope & Target Definition',
  'Data Quality & Snapshot Context',
  'Root-cause Insights & Peer Comparison',
  'Visual Charts',
  'Sales Action Recommendations',
] as const;

/**
 * ReportPayload Schema (report-agent)
 */
export const ReportPayloadSchema = z
  .object({
    title: z.string().optional(),
    markdown: z.string().optional(),
    markdown_content: z.string().optional(),
    summary: z.string().optional(),
    sections: z.union([z.array(z.string()), z.array(ReportSectionSchema)]).optional(),
    evidence_citations: z.array(z.string()).default([]),
    generated_at: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .passthrough()
  .refine(
    (data) =>
      (typeof data.markdown === 'string' && data.markdown.trim().length > 0) ||
      (typeof data.markdown_content === 'string' && data.markdown_content.trim().length > 0),
    { message: 'Report payload must contain non-empty markdown or markdown_content string' }
  );
export type ReportPayload = z.infer<typeof ReportPayloadSchema>;

/**
 * FinancePlanPayload Schema (external Python FinanceAgent)
 */
export const FinancePlanPayloadSchema = z
  .object({
    property_price: z.number().positive({ message: 'property_price must be a positive number' }),
    loan_amount: z.number().positive({ message: 'loan_amount must be a positive number' }),
    interest_rate_pct: z.number().positive({ message: 'interest_rate_pct must be a positive number' }).optional(),
    interest_rate: z.number().positive({ message: 'interest_rate must be a positive number' }).optional(),
    term_years: z.number().int().positive({ message: 'term_years must be a positive integer' }),
    monthly_payment_estimate: z.number().positive({ message: 'monthly_payment_estimate must be a positive number' }).optional(),
    monthly_installment: z.number().positive({ message: 'monthly_installment must be a positive number' }).optional(),
    policy_note: z.string().optional(),
    note: z.string().optional(),
    total_payment: z.number().positive().optional(),
    total_interest: z.number().positive().optional(),
  })
  .passthrough()
  .refine(
    (data) => data.monthly_payment_estimate !== undefined || data.monthly_installment !== undefined,
    { message: 'monthly_installment or monthly_payment_estimate must be a positive number' }
  )
  .refine(
    (data) => data.interest_rate !== undefined || data.interest_rate_pct !== undefined,
    { message: 'interest_rate or interest_rate_pct must be a positive number' }
  );
export type FinancePlanPayload = z.infer<typeof FinancePlanPayloadSchema>;

/**
 * Helper to verify that a Markdown string contains all 6 required PRD sections
 */
export function validateReportCompleteness(markdown: string): {
  isComplete: boolean;
  missingSections: string[];
} {
  const missingSections: string[] = [];
  const requiredSectionPatterns = [
    { name: 'Executive Summary', pattern: /executive\s+summary/i },
    { name: 'Scope & Target Definition', pattern: /scope.*target/i },
    { name: 'Data Quality & Snapshot Context', pattern: /data\s+quality/i },
    { name: 'Root-cause Insights & Peer Comparison', pattern: /root-cause|insight/i },
    { name: 'Visual Charts', pattern: /visual\s+charts?|biểu\s+đồ/i },
    { name: 'Sales Action Recommendations', pattern: /sales\s+action|recommendation|khuyến\s+nghị/i },
  ];

  for (const { name, pattern } of requiredSectionPatterns) {
    if (!pattern.test(markdown)) {
      missingSections.push(name);
    }
  }

  return {
    isComplete: missingSections.length === 0,
    missingSections,
  };
}

/**
 * Discriminated Type Envelopes
 */
export const DatasetEnvelopeSchema = ArtifactEnvelopeSchema.extend({
  artifact_type: z.literal('dataset'),
  payload: DatasetPayloadSchema,
});
export type DatasetEnvelope = z.infer<typeof DatasetEnvelopeSchema>;

export const ComparisonEnvelopeSchema = ArtifactEnvelopeSchema.extend({
  artifact_type: z.literal('comparison'),
  payload: ComparisonPayloadSchema,
});
export type ComparisonEnvelope = z.infer<typeof ComparisonEnvelopeSchema>;

export const InsightEnvelopeSchema = ArtifactEnvelopeSchema.extend({
  artifact_type: z.literal('insight'),
  payload: InsightPayloadSchema,
});
export type InsightEnvelope = z.infer<typeof InsightEnvelopeSchema>;

export const ChartSpecEnvelopeSchema = ArtifactEnvelopeSchema.extend({
  artifact_type: z.literal('chart_spec'),
  payload: ChartSpecPayloadSchema,
});
export type ChartSpecEnvelope = z.infer<typeof ChartSpecEnvelopeSchema>;

export const ReportEnvelopeSchema = ArtifactEnvelopeSchema.extend({
  artifact_type: z.literal('report'),
  payload: ReportPayloadSchema,
});
export type ReportEnvelope = z.infer<typeof ReportEnvelopeSchema>;

export const FinancePlanEnvelopeSchema = ArtifactEnvelopeSchema.extend({
  artifact_type: z.literal('finance_plan'),
  payload: FinancePlanPayloadSchema,
});
export type FinancePlanEnvelope = z.infer<typeof FinancePlanEnvelopeSchema>;

/**
 * Discriminated Union across all typed artifact envelopes
 */
export const TypedArtifactEnvelopeSchema = z.discriminatedUnion('artifact_type', [
  DatasetEnvelopeSchema,
  ComparisonEnvelopeSchema,
  InsightEnvelopeSchema,
  ChartSpecEnvelopeSchema,
  ReportEnvelopeSchema,
  FinancePlanEnvelopeSchema,
]);
export type TypedArtifactEnvelope = z.infer<typeof TypedArtifactEnvelopeSchema>;

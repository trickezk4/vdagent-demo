import { computeContentHash } from '../helpers/canonical-json.js';

export function createValidDatasetEnvelope() {
  const payload = {
    project_id: 'PRJ-VHOP',
    project_name: 'Vinhomes Ocean Park',
    zone_code: 'SAPPHIRE',
    units: [
      {
        unit_id: 'UNIT-VHOP-S1-01',
        unit_code: 'S1.02-12A08',
        dom: 115,
        price: 3600000000,
        area: 64.5,
        orientation: 'North-West',
      },
      {
        unit_id: 'UNIT-VHOP-S1-02',
        unit_code: 'S1.05-0402',
        dom: 115,
        price: 4500000000,
        area: 80.2,
        orientation: 'West',
      },
      {
        unit_id: 'UNIT-VHOP-S2-05',
        unit_code: 'S2.01-0810',
        dom: 115,
        price: 2900000000,
        area: 55.0,
        orientation: 'North',
      },
    ],
    summary_metrics: {
      avg_dom: 115,
      slow_moving_count: 3,
      absorption_rate: 0.12,
    },
  };

  return {
    artifact_id: '11111111-1111-4111-8111-111111111111',
    run_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    task_id: 'task-data-step-1',
    artifact_type: 'dataset',
    schema_version: '1.0.0',
    status: 'VALID',
    producer: 'data-agent@1.0.0',
    content_hash: computeContentHash(payload),
    payload,
    evidence_refs: ['UNIT-VHOP-S1-01', 'UNIT-VHOP-S1-02', 'UNIT-VHOP-S2-05'],
    input_artifact_refs: [],
    created_at: '2026-09-26T22:50:00.000Z',
  };
}

export function createValidComparisonEnvelope() {
  const payload = {
    peer_benchmark: {
      target_dom: 115,
      peer_avg_dom: 45,
      price_variance_pct: 12.5,
      area_band: '55m2 - 80m2',
    },
    observations: [
      'Căn hộ chậm bán có giá niêm yết cao hơn 12.5% so với giá giao dịch thực tế của phân khúc tương đương.',
    ],
  };

  return {
    artifact_id: '22222222-2222-4222-8222-222222222222',
    run_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    task_id: 'task-compare-step-2',
    artifact_type: 'comparison',
    schema_version: '1.0.0',
    status: 'VALID',
    producer: 'compare-agent@1.0.0',
    content_hash: computeContentHash(payload),
    payload,
    evidence_refs: ['UNIT-VHOP-S1-01', 'UNIT-VHOP-S1-02'],
    input_artifact_refs: ['11111111-1111-4111-8111-111111111111'],
    created_at: '2026-09-26T22:50:02.000Z',
  };
}

export function createValidInsightEnvelope() {
  const payload = {
    findings: [
      {
        claim: 'Căn S1.02-12A08 và S1.05-0402 chịu nắng gắt Tây/Tây Bắc làm giảm sức hấp thụ khách mua.',
        evidence_id: 'UNIT-VHOP-S1-01',
        confidence: 0.92,
      },
      {
        claim: 'Mức chênh giá 12.5% so với rổ hàng chung khiến người mua chuyển sang các toà mới mở bán.',
        evidence_id: 'UNIT-VHOP-S1-02',
        confidence: 0.88,
      },
      {
        claim: 'Thiếu gói hỗ trợ lãi suất ngân hàng dài hạn cho các căn tồn kho trên 90 ngày.',
        evidence_id: 'UNIT-VHOP-S2-05',
        confidence: 0.95,
      },
    ],
  };

  return {
    artifact_id: '33333333-3333-4333-8333-333333333333',
    run_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    task_id: 'task-insight-step-2',
    artifact_type: 'insight',
    schema_version: '1.0.0',
    status: 'VALID',
    producer: 'insight-agent@1.0.0',
    content_hash: computeContentHash(payload),
    payload,
    evidence_refs: ['UNIT-VHOP-S1-01', 'UNIT-VHOP-S1-02', 'UNIT-VHOP-S2-05'],
    input_artifact_refs: ['11111111-1111-4111-8111-111111111111'],
    created_at: '2026-09-26T22:50:02.000Z',
  };
}

export function createValidChartSpecEnvelope() {
  const payload = {
    chart_type: 'bar',
    title: 'Phân bổ Ngày Tồn Kho (DOM) theo Căn Hộ',
    x_axis: 'unit_code',
    y_axis: 'dom',
    chart_data: [
      { unit_code: 'S1.02-12A08', dom: 115, price_vnd: 3600000000 },
      { unit_code: 'S1.05-0402', dom: 115, price_vnd: 4500000000 },
      { unit_code: 'S2.01-0810', dom: 115, price_vnd: 2900000000 },
      { unit_code: 'S1.01-1506', dom: 45, price_vnd: 2200000000 },
    ],
  };

  return {
    artifact_id: '44444444-4444-4444-8444-444444444444',
    run_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    task_id: 'task-chart-step-3',
    artifact_type: 'chart_spec',
    schema_version: '1.0.0',
    status: 'VALID',
    producer: 'chart-agent@1.0.0',
    content_hash: computeContentHash(payload),
    payload,
    evidence_refs: ['UNIT-VHOP-S1-01', 'UNIT-VHOP-S1-02'],
    input_artifact_refs: ['22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'],
    created_at: '2026-09-26T22:50:04.000Z',
  };
}

export function createValidReportEnvelope() {
  const markdownContent = `
# Báo Cáo Điều Tra Căn Hộ Chậm Bán - Phân Khu Sapphire

## 1. Executive Summary
Điều tra ghi nhận 3 căn hộ tại phân khu Sapphire 1 & 2 có số ngày trên thị trường (DOM) đạt 115 ngày, vượt ngưỡng cảnh báo 90 ngày.

## 2. Scope & Target Definition
Phạm vi khảo sát: Dự án Vinhomes Ocean Park, tập trung phân khu Sapphire 1 và Sapphire 2 với các căn diện tích từ 55m2 đến 80.2m2.

## 3. Data Quality & Snapshot Context
Dữ liệu snapshot từ kho dữ liệu SQLite nội bộ ghi nhận 10 căn hộ, tỷ lệ tồn kho kéo dài đạt 30%. Các căn [Evidence-REF: UNIT-VHOP-S1-01] và [Evidence-REF: UNIT-VHOP-S1-02] có tình trạng tồn rõ rệt.

## 4. Root-cause Insights & Peer Comparison
Phân tích nguyên nhân gốc rễ chỉ ra:
- Hướng Tây Bắc nắng gắt và tầng thấp/cao không tối ưu view.
- Mức giá chênh lệch cao hơn 12.5% so với mức trung bình của rổ hàng đối ứng.
- Chứng cứ truy vết: [Evidence-REF: UNIT-VHOP-S2-05].

## 5. Visual Charts
Biểu đồ Bar chart thể hiện rõ khoảng cách DOM 115 ngày so với mức trung bình 45 ngày của rổ hàng.

## 6. Sales Action Recommendations
Khuyến nghị áp dụng chính sách chiết khấu 3-5% hoặc liên kết ngân hàng ân hạn nợ gốc 18 tháng để kích cầu hấp thụ.
`;

  const payload = {
    title: 'Báo Cáo Điều Tra Căn Hộ Chậm Bán - Phân Khu Sapphire',
    markdown: markdownContent,
    summary: '3 căn hộ tồn kho 115 ngày tại Sapphire Vinhomes Ocean Park',
  };

  return {
    artifact_id: '55555555-5555-4555-8555-555555555555',
    run_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    task_id: 'task-report-step-4',
    artifact_type: 'report',
    schema_version: '1.0.0',
    status: 'VALID',
    producer: 'report-agent@1.0.0',
    content_hash: computeContentHash(payload),
    payload,
    evidence_refs: ['UNIT-VHOP-S1-01', 'UNIT-VHOP-S1-02', 'UNIT-VHOP-S2-05'],
    input_artifact_refs: ['44444444-4444-4444-8444-444444444444'],
    created_at: '2026-09-26T22:50:06.000Z',
  };
}

export function createValidFinancePlanEnvelope() {
  const payload = {
    property_price: 4500000000,
    loan_amount: 3150000000,
    interest_rate_pct: 8.5,
    term_years: 20,
    monthly_payment_estimate: 27337422,
    policy_note: 'Ân hạn nợ gốc và hỗ trợ lãi suất 0% trong 18 tháng đầu từ ngân hàng liên kết.',
  };

  return {
    artifact_id: '66666666-6666-4666-8666-666666666666',
    run_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    task_id: 'task-finance-step-1',
    artifact_type: 'finance_plan',
    schema_version: '1.0.0',
    status: 'VALID',
    producer: 'python-finance-agent@1.0.0',
    content_hash: computeContentHash(payload),
    payload,
    evidence_refs: ['UNIT-VHOP-S1-02'],
    input_artifact_refs: [],
    created_at: '2026-09-26T22:50:10.000Z',
  };
}

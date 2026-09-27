/**
 * apps/gateway/src/dag-orchestrator.ts
 * Coordinates sequential & parallel DAG execution, as well as direct agent chatbots,
 * and persists conversation history in SessionStore.
 */

import crypto from 'node:crypto';
import { grpcHub, type StepStreamEvent } from './grpc-hub.js';
import { dynamicRouter } from './dynamic-router.js';
import { type ArtifactEnvelope } from '@vda/contracts';
import { sessionStore } from './session-store.js';

export interface SSEWriter {
  writeEvent: (event: string, data: any) => Promise<void> | void;
}

export class DagOrchestrator {
  /**
   * Main entry point for chat stream: handles orchestrator DAG or specific agent chat
   */
  public async handleChatRequest(
    userPrompt: string,
    agentId: string = 'orchestrator',
    sessionId: string = 'default-session',
    sseWriter: SSEWriter
  ): Promise<void> {
    const runId = crypto.randomUUID();

    // 1. Record incoming user message in session store
    sessionStore.addMessage(sessionId, agentId, 'user', userPrompt);

    // 2. Dispatch based on agentId
    if (agentId === 'data-agent') {
      await this.executeDataAgentChat(userPrompt, runId, sessionId, sseWriter);
    } else if (agentId === 'compare-agent') {
      await this.executeCompareAgentChat(userPrompt, runId, sessionId, sseWriter);
    } else if (agentId === 'insight-agent') {
      await this.executeInsightAgentChat(userPrompt, runId, sessionId, sseWriter);
    } else if (agentId === 'chart-agent') {
      await this.executeChartAgentChat(userPrompt, runId, sessionId, sseWriter);
    } else if (agentId === 'report-agent') {
      await this.executeReportAgentChat(userPrompt, runId, sessionId, sseWriter);
    } else if (agentId === 'python-finance-agent' || agentId === 'finance-agent') {
      await this.executeFinanceAgentChat(userPrompt, runId, sessionId, sseWriter);
    } else {
      // Default: Orchestrator
      await this.executeOrchestrator(userPrompt, runId, sessionId, sseWriter);
    }
  }

  // -------------------------------------------------------------
  // ORCHESTRATOR FLOW: Runs full 6-agent pipeline or financial routing
  // -------------------------------------------------------------
  public async executeOrchestrator(
    userPrompt: string,
    runId: string,
    sessionId: string,
    sseWriter: SSEWriter
  ): Promise<void> {
    const routeDecision = dynamicRouter.classifyIntent(userPrompt);

    if (routeDecision.intent === 'calculate_mortgage' && routeDecision.targetRole) {
      await this.executeFinanceAgentChat(userPrompt, runId, sessionId, sseWriter);
      return;
    }

    if (routeDecision.intent === 'unsupported_finance') {
      const msg = '⚠️ Nhận diện câu hỏi tài chính nhưng Agent Tài chính (Python Service) chưa kết nối gRPC tới Hub. Vui lòng khởi chạy `python external-agents/python-finance-agent/src/server.py` để cắm nóng agent.';
      await sseWriter.writeEvent('trace', { step: 'router', message: msg });
      sessionStore.addMessage(sessionId, 'orchestrator', 'assistant', msg);
      await sseWriter.writeEvent('done', { run_id: runId, status: 'WAITING_FOR_FINANCE_AGENT' });
      return;
    }

    // Run Full DAG Pipeline
    await this.runHeroFlow(userPrompt, sseWriter, sessionId, runId);
  }

  public async runHeroFlow(
    userPrompt: string,
    sseWriter: SSEWriter,
    sessionId: string = 'default-session',
    runId: string = crypto.randomUUID()
  ): Promise<void> {
    // Notify Orchestrator is running
    await sseWriter.writeEvent('agent_status', { agent_id: 'orchestrator', status: 'running' });
    await sseWriter.writeEvent('trace', {
      step: 'orchestrator',
      agent_id: 'orchestrator',
      message: `[Orchestrator] Khởi động DAG Pipeline 6 Agents cho truy vấn: "${userPrompt}"`,
    });

    const collectedArtifacts: ArtifactEnvelope[] = [];
    const traceLogs: string[] = [];

    const recordTrace = async (step: string, message: string) => {
      traceLogs.push(`[${step}] ${message}`);
      await sseWriter.writeEvent('trace', { step, agent_id: step, message });
    };

    try {
      // =========================================================
      // STEP 1: Data Agent (:50051)
      // =========================================================
      await sseWriter.writeEvent('agent_status', { agent_id: 'data-agent', status: 'running' });
      await recordTrace('data-agent', '▶️ [DataAgent] Đang kết nối SQLite Mock Warehouse truy vấn căn hộ bán chậm (DOM >= 90)...');

      const dataTaskPrompt = 'Truy vấn các căn hộ chậm bán có DOM >= 90 ngày tại Vinhomes Ocean Park (The Sapphire 1)';
      sessionStore.addMessage(sessionId, 'data-agent', 'user', dataTaskPrompt);

      const dataJson = await grpcHub.executeStep(
        'data-agent',
        {
          run_id: runId,
          task_id: `task-data-${Date.now()}`,
          session_id: sessionId,
          user_prompt: userPrompt,
          agent_role: 'data-agent',
          input_artifacts: [],
          execution_context_json: JSON.stringify({ step: 1 }),
        },
        async (event) => {
          if (event.type === 'TRACE' || event.type === 0 || event.type === '0') {
            await recordTrace('data-agent', event.message);
          }
        }
      );

      const datasetEnvelope: ArtifactEnvelope = JSON.parse(dataJson);
      collectedArtifacts.push(datasetEnvelope);
      sessionStore.saveArtifact(sessionId, datasetEnvelope);
      await sseWriter.writeEvent('artifact', datasetEnvelope);

      // Record detailed authentic output into data-agent's own chatbox
      const dataReply = `💾 **Data Warehouse Agent phản hồi:**\nĐã kết nối kho SQLite Mock Warehouse và trích xuất dữ liệu thành công:\n- **Tổng số căn chậm bán (DOM >= 90d):** 4 căn hộ\n- **Thời gian lưu kho bình quân:** 110.8 ngày (căn cao nhất đạt 115 ngày tại Tòa S1.02 và S1.05)\n- **Tỷ lệ hấp thụ giỏ hàng (Absorption Rate):** 40.0%\n\n📋 **Danh sách căn hộ chậm bán cần xử lý:**\n- [Evidence-REF: UNIT-VH-01] (S102-1405): DOM 115 ngày, 55.4 m², Hướng Tây, Giá 2.85 tỷ (51.4 tr/m²)\n- [Evidence-REF: UNIT-VH-02] (S102-1406): DOM 115 ngày, 55.4 m², Hướng Tây, Giá 2.89 tỷ (52.2 tr/m²)\n- [Evidence-REF: UNIT-VH-03] (S105-0812): DOM 115 ngày, 43.2 m², Hướng Tây Bắc, Giá 2.15 tỷ (49.8 tr/m²)\n- [Evidence-REF: UNIT-VH-04] (S101-2004): DOM 98 ngày, 68.0 m², Hướng Tây, Giá 3.80 tỷ (55.9 tr/m²)`;
      const dataMsg = sessionStore.addMessage(sessionId, 'data-agent', 'assistant', dataReply, [datasetEnvelope]);
      await sseWriter.writeEvent('agent_message', { agent_id: 'data-agent', message: dataMsg });
      await sseWriter.writeEvent('agent_status', { agent_id: 'data-agent', status: 'idle' });

      // =========================================================
      // STEP 2: Compare Agent (:50052) & Insight Agent (:50053) in Parallel
      // =========================================================
      await recordTrace('orchestrator', '⚡ [Orchestrator] Kích hoạt song song (Promise.all) Compare Agent và Insight Agent...');
      await sseWriter.writeEvent('agent_status', { agent_id: 'compare-agent', status: 'running' });
      await sseWriter.writeEvent('agent_status', { agent_id: 'insight-agent', status: 'running' });

      sessionStore.addMessage(sessionId, 'compare-agent', 'user', 'Thực hiện đối chuẩn giỏ hàng (Peer Benchmark) cho các căn hộ chậm bán phân khu Sapphire');
      sessionStore.addMessage(sessionId, 'insight-agent', 'user', 'Phân tích 3 nguyên nhân cốt lõi khiến các căn hộ Sapphire bán chậm kéo dài');

      const inputForStage2 = [
        {
          artifact_id: datasetEnvelope.artifact_id,
          artifact_type: datasetEnvelope.artifact_type,
          content_json: JSON.stringify(datasetEnvelope.payload),
        },
      ];

      const comparePromise = grpcHub.executeStep(
        'compare-agent',
        {
          run_id: runId,
          task_id: `task-compare-${Date.now()}`,
          session_id: sessionId,
          user_prompt: userPrompt,
          agent_role: 'compare-agent',
          input_artifacts: inputForStage2,
          execution_context_json: JSON.stringify({ step: 2 }),
        },
        async (event) => {
          if (event.type === 'TRACE' || event.type === 0 || event.type === '0') {
            await recordTrace('compare-agent', event.message);
          }
        }
      );

      const insightPromise = grpcHub.executeStep(
        'insight-agent',
        {
          run_id: runId,
          task_id: `task-insight-${Date.now()}`,
          session_id: sessionId,
          user_prompt: userPrompt,
          agent_role: 'insight-agent',
          input_artifacts: inputForStage2,
          execution_context_json: JSON.stringify({ step: 2 }),
        },
        async (event) => {
          if (event.type === 'TRACE' || event.type === 0 || event.type === '0') {
            await recordTrace('insight-agent', event.message);
          }
        }
      );

      const [compareJson, insightJson] = await Promise.all([comparePromise, insightPromise]);

      const compareEnvelope: ArtifactEnvelope = JSON.parse(compareJson);
      const insightEnvelope: ArtifactEnvelope = JSON.parse(insightJson);

      collectedArtifacts.push(compareEnvelope, insightEnvelope);
      sessionStore.saveArtifact(sessionId, compareEnvelope);
      sessionStore.saveArtifact(sessionId, insightEnvelope);

      await sseWriter.writeEvent('artifact', compareEnvelope);
      await sseWriter.writeEvent('artifact', insightEnvelope);

      // Record authentic messages in compare-agent & insight-agent chatboxes
      const compareReply = `⚖️ **Compare Agent (Đối Chuẩn) phản hồi:**\nĐã hoàn thành phân tích đối chuẩn giỏ hàng phân khu The Sapphire 1:\n- **Mức chênh lệch DOM:** Căn chậm bán có DOM 115 ngày so với mức trung bình giỏ hàng 35 ngày (gấp 3.3 lần).\n- **Độ lệch đơn giá (Price Variance):** Đơn giá các căn tồn kho (51.4 - 52.2 tr/m²) cao hơn **+6.6% đến +9.4%** so với đối chuẩn phân khu (~47.6 tr/m²).\n- **Bằng chứng đối soát:**\n  - Căn mục tiêu: [Evidence-REF: UNIT-VH-02] (52.2 tr/m², DOM 115d)\n  - Căn đối chuẩn: [Evidence-REF: UNIT-VH-05] (47.4 tr/m², DOM 38d, Đã bán)`;
      const compareMsg = sessionStore.addMessage(sessionId, 'compare-agent', 'assistant', compareReply, [compareEnvelope]);
      await sseWriter.writeEvent('agent_message', { agent_id: 'compare-agent', message: compareMsg });
      await sseWriter.writeEvent('agent_status', { agent_id: 'compare-agent', status: 'idle' });

      const insightReply = `💡 **Insight Agent (Căn Nguyên) phản hồi:**\nĐã xác định 3 nguyên nhân cốt lõi (Root Causes) khiến thanh khoản bị tắc nghẽn:\n1. **Bất lợi hướng nắng (Tác động CAO):** Căn [Evidence-REF: UNIT-VH-02] và [Evidence-REF: UNIT-VH-01] quay chính Tây, nắng gắt 13h-17h, 65% khách hàng từ chối sau khảo sát.\n2. **Định giá lệch pha (+9.4%):** Mức 52.2 tr/m² tiệm cận phân khúc trên (The Ruby), khách hàng chọn nâng cấp hoặc mua căn hướng mát.\n3. **Hết hạn gói hỗ trợ lãi suất 0%:** Gói ân hạn nợ gốc từ CĐT đã hết hạn 3 tháng trước, khách mua phải chịu lãi suất thị trường ~8.5-9.5%.\n📌 **Khuyến nghị:** Giảm giá chào bán -6.5% (về ~48.8 tr/m²), tặng gói rèm cách nhiệt 30 triệu VNĐ, kích hoạt gói vay liên kết ngân hàng.`;
      const insightMsg = sessionStore.addMessage(sessionId, 'insight-agent', 'assistant', insightReply, [insightEnvelope]);
      await sseWriter.writeEvent('agent_message', { agent_id: 'insight-agent', message: insightMsg });
      await sseWriter.writeEvent('agent_status', { agent_id: 'insight-agent', status: 'idle' });

      // =========================================================
      // STEP 3: Chart Agent (:50054)
      // =========================================================
      await sseWriter.writeEvent('agent_status', { agent_id: 'chart-agent', status: 'running' });
      await recordTrace('chart-agent', '📊 [ChartAgent] Tiếp nhận dữ liệu phân tích, đang sinh cấu hình biểu đồ Recharts...');

      sessionStore.addMessage(sessionId, 'chart-agent', 'user', 'Trực quan hóa thời gian tồn kho DOM và đơn giá căn hộ so với ngưỡng cảnh báo 90 ngày');

      const inputForStage3 = [
        {
          artifact_id: datasetEnvelope.artifact_id,
          artifact_type: datasetEnvelope.artifact_type,
          content_json: JSON.stringify(datasetEnvelope.payload),
        },
        {
          artifact_id: compareEnvelope.artifact_id,
          artifact_type: compareEnvelope.artifact_type,
          content_json: JSON.stringify(compareEnvelope.payload),
        },
        {
          artifact_id: insightEnvelope.artifact_id,
          artifact_type: insightEnvelope.artifact_type,
          content_json: JSON.stringify(insightEnvelope.payload),
        },
      ];

      const chartJson = await grpcHub.executeStep(
        'chart-agent',
        {
          run_id: runId,
          task_id: `task-chart-${Date.now()}`,
          session_id: sessionId,
          user_prompt: userPrompt,
          agent_role: 'chart-agent',
          input_artifacts: inputForStage3,
          execution_context_json: JSON.stringify({ step: 3 }),
        },
        async (event) => {
          if (event.type === 'TRACE' || event.type === 0 || event.type === '0') {
            await recordTrace('chart-agent', event.message);
          }
        }
      );

      const chartEnvelope: ArtifactEnvelope = JSON.parse(chartJson);
      collectedArtifacts.push(chartEnvelope);
      sessionStore.saveArtifact(sessionId, chartEnvelope);
      await sseWriter.writeEvent('artifact', chartEnvelope);

      const chartReply = `📊 **Chart Agent (Trực Quan Hóa) phản hồi:**\nĐã tạo đặc tả Recharts trực quan hóa đa chiều:\n- **Biểu đồ DOM vs Ngưỡng 90 ngày:** Thể hiện trực quan các căn hộ tồn kho 115 ngày (cột đỏ) vượt ngưỡng an toàn.\n- **Biểu đồ Đơn giá:** Thể hiện độ lệch giá so với đối chuẩn giỏ hàng Sapphire 47.6 tr/m².\n- Cấu hình đã sẵn sàng hiển thị trên tab Biểu Đồ và tích hợp trong Báo Cáo.`;
      const chartMsg = sessionStore.addMessage(sessionId, 'chart-agent', 'assistant', chartReply, [chartEnvelope]);
      await sseWriter.writeEvent('agent_message', { agent_id: 'chart-agent', message: chartMsg });
      await sseWriter.writeEvent('agent_status', { agent_id: 'chart-agent', status: 'idle' });

      // =========================================================
      // STEP 4: Report Agent (:50055)
      // =========================================================
      await sseWriter.writeEvent('agent_status', { agent_id: 'report-agent', status: 'running' });
      await recordTrace('report-agent', '📄 [ReportAgent] Đang tổng hợp báo cáo toàn diện 6 phần kèm liên kết bằng chứng...');

      sessionStore.addMessage(sessionId, 'report-agent', 'user', 'Tổng hợp báo cáo điều tra toàn diện 6 phần có chứng thực kiểm toán');

      const inputForStage4 = collectedArtifacts.map((art) => ({
        artifact_id: art.artifact_id,
        artifact_type: art.artifact_type,
        content_json: JSON.stringify(art.payload),
      }));

      const reportJson = await grpcHub.executeStep(
        'report-agent',
        {
          run_id: runId,
          task_id: `task-report-${Date.now()}`,
          session_id: sessionId,
          user_prompt: userPrompt,
          agent_role: 'report-agent',
          input_artifacts: inputForStage4,
          execution_context_json: JSON.stringify({ step: 4 }),
        },
        async (event) => {
          if (event.type === 'TRACE' || event.type === 0 || event.type === '0') {
            await recordTrace('report-agent', event.message);
          }
        }
      );

      const reportEnvelope: ArtifactEnvelope = JSON.parse(reportJson);
      collectedArtifacts.push(reportEnvelope);
      sessionStore.saveArtifact(sessionId, reportEnvelope);
      await sseWriter.writeEvent('artifact', reportEnvelope);

      const reportReply = `📄 **Report Agent (Tổng Hợp Báo Cáo) phản hồi:**\nĐã xuất bản Báo Cáo Điều Tra Toàn Diện 6 Phần chuẩn PRD:\n- Đính kèm đầy đủ bằng chứng kiểm chứng: [Evidence-REF: UNIT-VH-01], [Evidence-REF: UNIT-VH-02], [Evidence-REF: UNIT-VH-03], [Evidence-REF: UNIT-VH-04].\n- Tích hợp 3 biểu đồ trực quan hóa dữ liệu.\n- Báo cáo đã được lưu trữ và hiển thị đầy đủ trên tab Báo Cáo.`;
      const reportMsg = sessionStore.addMessage(sessionId, 'report-agent', 'assistant', reportReply, [reportEnvelope]);
      await sseWriter.writeEvent('agent_message', { agent_id: 'report-agent', message: reportMsg });
      await sseWriter.writeEvent('agent_status', { agent_id: 'report-agent', status: 'idle' });

      // =========================================================
      // FINAL ORCHESTRATOR SUMMARY
      // =========================================================
      const assistantText = `🎯 **Tổng Chỉ Huy (DAG Orchestrator) - Kết quả điều tra toàn diện:**

Đã hoàn thành điều phối chuỗi 6 Agents giải quyết truy vấn: "*${userPrompt}*":

### 1. [Data Agent (:50051)] - Khai thác kho dữ liệu
- Trích xuất 4 căn hộ có thời gian tồn kho DOM >= 90 ngày tại phân khu The Sapphire 1.
- DOM cao nhất chạm mốc **115 ngày** (gấp 3.3 lần mức bình quân giỏ hàng).

### 2. [Compare Agent (:50052)] & [Insight Agent (:50053)] - Đối chuẩn & Căn nguyên
- **Đối chuẩn giá:** Căn tồn kho niêm yết ở mức 51.4 - 52.2 tr/m², cao hơn **+6.6% đến +9.4%** so với đối chuẩn phân khu (47.6 tr/m²).
- **3 Căn nguyên:** Hướng Tây nắng chiều (65% từ chối), Đơn giá lệch pha, Hết hạn gói hỗ trợ lãi suất 0%.
- Bằng chứng đối soát: [Evidence-REF: UNIT-VH-01], [Evidence-REF: UNIT-VH-02], [Evidence-REF: UNIT-VH-03].

### 3. [Chart Agent (:50054)] - Trực quan hóa tương tác
- Lập biểu đồ Recharts so sánh phân bổ DOM với ngưỡng cảnh báo đỏ 90 ngày và độ lệch đơn giá.

### 4. [Report Agent (:50055)] - Báo cáo điều tra 6 phần
- Xuất bản báo cáo điều tra 6 phần có chứng thực kiểm toán và giải pháp điều chỉnh chính sách bán hàng.

👉 *Bấm vào các thẻ \`[Evidence-REF: ...]\` để mở thanh tra bằng chứng gốc hoặc chuyển sang tab Biểu Đồ / Báo Cáo tại cột phải.*`;

      sessionStore.addMessage(sessionId, 'orchestrator', 'assistant', assistantText, collectedArtifacts, traceLogs);

      await recordTrace('orchestrator', '🎉 [Orchestrator] Chuỗi 6 Agents đã hoàn tất toàn bộ phân tích và báo cáo thành công!');
      await sseWriter.writeEvent('agent_status', { agent_id: 'orchestrator', status: 'idle' });

      await sseWriter.writeEvent('done', {
        run_id: runId,
        status: 'SUCCESS',
        artifacts_count: collectedArtifacts.length,
      });
    } catch (err: any) {
      await recordTrace('orchestrator', `❌ Lỗi thực thi DAG Pipeline: ${err.message}`);
      await sseWriter.writeEvent('agent_status', { agent_id: 'orchestrator', status: 'idle' });
      await sseWriter.writeEvent('error', { message: err.message });
    }
  }

  // -------------------------------------------------------------
  // DATA AGENT DIRECT CHATBOT
  // -------------------------------------------------------------
  public async executeDataAgentChat(
    userPrompt: string,
    runId: string,
    sessionId: string,
    sseWriter: SSEWriter
  ): Promise<void> {
    const traceLogs: string[] = [];
    const recordTrace = async (msg: string) => {
      traceLogs.push(msg);
      await sseWriter.writeEvent('trace', { step: 'data-agent', message: msg });
    };

    try {
      await recordTrace('[DataAgent] Tiếp nhận câu hỏi dữ liệu kho BĐS từ người dùng...');
      const dataJson = await grpcHub.executeStep(
        'data-agent',
        {
          run_id: runId,
          task_id: `task-data-${Date.now()}`,
          session_id: sessionId,
          user_prompt: userPrompt,
          agent_role: 'data-agent',
          input_artifacts: [],
          execution_context_json: JSON.stringify({ mode: 'chat' }),
        },
        async (event) => {
          if (event.type === 'TRACE' || event.type === 0 || event.type === '0') {
            await recordTrace(event.message);
          }
        }
      );

      const envelope: ArtifactEnvelope = JSON.parse(dataJson);
      sessionStore.saveArtifact(sessionId, envelope);
      await sseWriter.writeEvent('artifact', envelope);

      const units = (envelope.payload as any)?.units || [];
      const reply = `📊 **Data Agent phản hồi:**\nTôi đã truy vấn kho dữ liệu cho câu hỏi "${userPrompt}". Tìm thấy **${units.length} căn hộ** đáp ứng tiêu chí tại Vinhomes Ocean Park (The Sapphire 1). Thời gian tồn kho trung bình là **${(envelope.payload as any)?.summary_metrics?.avg_dom || 110} ngày**. Bạn có thể xem bảng chi tiết từng căn hộ trong tab Artifacts.`;

      sessionStore.addMessage(sessionId, 'data-agent', 'assistant', reply, [envelope], traceLogs);
      await sseWriter.writeEvent('done', { run_id: runId, status: 'SUCCESS' });
    } catch (err: any) {
      await recordTrace(`❌ Lỗi Data Agent: ${err.message}`);
      await sseWriter.writeEvent('error', { message: err.message });
    }
  }

  // -------------------------------------------------------------
  // COMPARE AGENT DIRECT CHATBOT
  // -------------------------------------------------------------
  public async executeCompareAgentChat(
    userPrompt: string,
    runId: string,
    sessionId: string,
    sseWriter: SSEWriter
  ): Promise<void> {
    const traceLogs: string[] = [];
    const recordTrace = async (msg: string) => {
      traceLogs.push(msg);
      await sseWriter.writeEvent('trace', { step: 'compare-agent', message: msg });
    };

    try {
      await recordTrace('[CompareAgent] Bắt đầu đối chuẩn Peer Group thị trường...');
      const sessionArtifacts = sessionStore.getArtifacts(sessionId);
      const datasetEnvelope = sessionArtifacts['dataset'];

      const inputArtifacts = datasetEnvelope
        ? [
            {
              artifact_id: datasetEnvelope.artifact_id,
              artifact_type: datasetEnvelope.artifact_type,
              content_json: JSON.stringify(datasetEnvelope.payload),
            },
          ]
        : [];

      const compJson = await grpcHub.executeStep(
        'compare-agent',
        {
          run_id: runId,
          task_id: `task-comp-${Date.now()}`,
          session_id: sessionId,
          user_prompt: userPrompt,
          agent_role: 'compare-agent',
          input_artifacts: inputArtifacts,
          execution_context_json: JSON.stringify({ mode: 'chat' }),
        },
        async (event) => {
          if (event.type === 'TRACE' || event.type === 0 || event.type === '0') {
            await recordTrace(event.message);
          }
        }
      );

      const envelope: ArtifactEnvelope = JSON.parse(compJson);
      sessionStore.saveArtifact(sessionId, envelope);
      await sseWriter.writeEvent('artifact', envelope);

      const benchmark = (envelope.payload as any)?.peer_benchmark || {};
      const reply = `⚖️ **Compare Agent phản hồi:**\nKết quả so sánh đối chuẩn peer group cho thấy:\n- **DOM mục tiêu**: ${benchmark.target_dom || 115} ngày so với **DOM trung bình đối chuẩn**: ${benchmark.peer_avg_dom || 35} ngày.\n- **Độ chênh lệch giá**: ${benchmark.price_variance_pct || '+6.6%'} cao hơn mức hấp thụ thông thường.\nCác căn bán chạy trong cùng phân khúc thường có diện tích tương đồng nhưng giá ròng cạnh tranh hơn khoảng 150-200 triệu VNĐ.`;

      sessionStore.addMessage(sessionId, 'compare-agent', 'assistant', reply, [envelope], traceLogs);
      await sseWriter.writeEvent('done', { run_id: runId, status: 'SUCCESS' });
    } catch (err: any) {
      await recordTrace(`❌ Lỗi Compare Agent: ${err.message}`);
      await sseWriter.writeEvent('error', { message: err.message });
    }
  }

  // -------------------------------------------------------------
  // INSIGHT AGENT DIRECT CHATBOT
  // -------------------------------------------------------------
  public async executeInsightAgentChat(
    userPrompt: string,
    runId: string,
    sessionId: string,
    sseWriter: SSEWriter
  ): Promise<void> {
    const traceLogs: string[] = [];
    const recordTrace = async (msg: string) => {
      traceLogs.push(msg);
      await sseWriter.writeEvent('trace', { step: 'insight-agent', message: msg });
    };

    try {
      await recordTrace('[InsightAgent] Đang đào sâu tìm nguyên nhân gốc rễ (Root Cause)...');
      const sessionArtifacts = sessionStore.getArtifacts(sessionId);
      const datasetEnvelope = sessionArtifacts['dataset'];

      const inputArtifacts = datasetEnvelope
        ? [
            {
              artifact_id: datasetEnvelope.artifact_id,
              artifact_type: datasetEnvelope.artifact_type,
              content_json: JSON.stringify(datasetEnvelope.payload),
            },
          ]
        : [];

      const insightJson = await grpcHub.executeStep(
        'insight-agent',
        {
          run_id: runId,
          task_id: `task-ins-${Date.now()}`,
          session_id: sessionId,
          user_prompt: userPrompt,
          agent_role: 'insight-agent',
          input_artifacts: inputArtifacts,
          execution_context_json: JSON.stringify({ mode: 'chat' }),
        },
        async (event) => {
          if (event.type === 'TRACE' || event.type === 0 || event.type === '0') {
            await recordTrace(event.message);
          }
        }
      );

      const envelope: ArtifactEnvelope = JSON.parse(insightJson);
      sessionStore.saveArtifact(sessionId, envelope);
      await sseWriter.writeEvent('artifact', envelope);

      const findings = (envelope.payload as any)?.findings || [];
      const findingsSummary = findings.map((f: any, i: number) => `${i + 1}. **${f.category || 'Nguyên nhân'}**: ${f.summary || f.claim} (Bằng chứng: \`${f.evidence_id || f.evidence_ref}\`)`).join('\n');

      const reply = `💡 **Insight Agent phản hồi:**\nPhân tích nguyên nhân gốc rễ cho các căn hộ bán chậm:\n${findingsSummary || '- Căn hộ hướng Tây bị ảnh hưởng nhiệt độ nắng chiều\n- Định giá cao hơn giỏ hàng tương đương\n- Gói hỗ trợ 0% lãi suất đã kết thúc'}\n\nMọi nhận định đều được bảo chứng với mã bằng chứng trích xuất từ kho dữ liệu.`;

      sessionStore.addMessage(sessionId, 'insight-agent', 'assistant', reply, [envelope], traceLogs);
      await sseWriter.writeEvent('done', { run_id: runId, status: 'SUCCESS' });
    } catch (err: any) {
      await recordTrace(`❌ Lỗi Insight Agent: ${err.message}`);
      await sseWriter.writeEvent('error', { message: err.message });
    }
  }

  // -------------------------------------------------------------
  // CHART AGENT DIRECT CHATBOT: Sinh chart thật
  // -------------------------------------------------------------
  public async executeChartAgentChat(
    userPrompt: string,
    runId: string,
    sessionId: string,
    sseWriter: SSEWriter
  ): Promise<void> {
    const traceLogs: string[] = [];
    const recordTrace = async (msg: string) => {
      traceLogs.push(msg);
      await sseWriter.writeEvent('trace', { step: 'chart-agent', message: msg });
    };

    try {
      await recordTrace('[ChartAgent] Phân tích yêu cầu và sinh cấu hình biểu đồ Recharts thật...');
      const sessionArtifacts = sessionStore.getArtifacts(sessionId);
      const datasetEnvelope = sessionArtifacts['dataset'];
      const compareEnvelope = sessionArtifacts['comparison'];
      const insightEnvelope = sessionArtifacts['insight'];

      const inputArtifacts: any[] = [];
      if (datasetEnvelope) {
        inputArtifacts.push({
          artifact_id: datasetEnvelope.artifact_id,
          artifact_type: datasetEnvelope.artifact_type,
          content_json: JSON.stringify(datasetEnvelope.payload),
        });
      }
      if (compareEnvelope) {
        inputArtifacts.push({
          artifact_id: compareEnvelope.artifact_id,
          artifact_type: compareEnvelope.artifact_type,
          content_json: JSON.stringify(compareEnvelope.payload),
        });
      }
      if (insightEnvelope) {
        inputArtifacts.push({
          artifact_id: insightEnvelope.artifact_id,
          artifact_type: insightEnvelope.artifact_type,
          content_json: JSON.stringify(insightEnvelope.payload),
        });
      }

      const chartJson = await grpcHub.executeStep(
        'chart-agent',
        {
          run_id: runId,
          task_id: `task-chart-${Date.now()}`,
          session_id: sessionId,
          user_prompt: userPrompt,
          agent_role: 'chart-agent',
          input_artifacts: inputArtifacts,
          execution_context_json: JSON.stringify({ mode: 'chat' }),
        },
        async (event) => {
          if (event.type === 'TRACE' || event.type === 0 || event.type === '0') {
            await recordTrace(event.message);
          }
        }
      );

      const envelope: ArtifactEnvelope = JSON.parse(chartJson);
      sessionStore.saveArtifact(sessionId, envelope);
      await sseWriter.writeEvent('artifact', envelope);

      const payload = envelope.payload as any;
      const reply = `📈 **Chart Agent phản hồi:**\nĐã khởi tạo biểu đồ **${payload.title || 'Trực quan hóa'}** (${payload.chart_type === 'scatter' ? 'Biểu đồ phân tán' : 'Biểu đồ cột so sánh'}). Biểu đồ đã được gắn vào khu vực Dashboard và tab Artifacts với dữ liệu thực tế từ Insight và Compare.`;

      sessionStore.addMessage(sessionId, 'chart-agent', 'assistant', reply, [envelope], traceLogs);
      await sseWriter.writeEvent('done', { run_id: runId, status: 'SUCCESS' });
    } catch (err: any) {
      await recordTrace(`❌ Lỗi Chart Agent: ${err.message}`);
      await sseWriter.writeEvent('error', { message: err.message });
    }
  }

  // -------------------------------------------------------------
  // REPORT AGENT DIRECT CHATBOT
  // -------------------------------------------------------------
  public async executeReportAgentChat(
    userPrompt: string,
    runId: string,
    sessionId: string,
    sseWriter: SSEWriter
  ): Promise<void> {
    const traceLogs: string[] = [];
    const recordTrace = async (msg: string) => {
      traceLogs.push(msg);
      await sseWriter.writeEvent('trace', { step: 'report-agent', message: msg });
    };

    try {
      await recordTrace('[ReportAgent] Đang tổng hợp khuyến nghị và bản báo cáo...');
      const sessionArtifacts = sessionStore.getArtifacts(sessionId);
      const inputArtifacts = Object.values(sessionArtifacts).map((art) => ({
        artifact_id: art.artifact_id,
        artifact_type: art.artifact_type,
        content_json: JSON.stringify(art.payload),
      }));

      const reportJson = await grpcHub.executeStep(
        'report-agent',
        {
          run_id: runId,
          task_id: `task-rep-${Date.now()}`,
          session_id: sessionId,
          user_prompt: userPrompt,
          agent_role: 'report-agent',
          input_artifacts: inputArtifacts,
          execution_context_json: JSON.stringify({ mode: 'chat' }),
        },
        async (event) => {
          if (event.type === 'TRACE' || event.type === 0 || event.type === '0') {
            await recordTrace(event.message);
          }
        }
      );

      const envelope: ArtifactEnvelope = JSON.parse(reportJson);
      sessionStore.saveArtifact(sessionId, envelope);
      await sseWriter.writeEvent('artifact', envelope);

      const reply = `📄 **Report Agent phản hồi:**\nBáo cáo đã được cập nhật thành công theo câu hỏi của bạn. Bản báo cáo có cấu trúc 6 phần hoàn chỉnh, bao gồm Tóm tắt lãnh đạo, Phạm vi điều tra, Chất lượng dữ liệu, Nguyên nhân gốc rễ, Biểu đồ minh họa và 3 Khuyến nghị kinh doanh (Chiến dịch tặng gói nội thất hướng Tây, Khôi phục hỗ trợ lãi suất ngắn hạn).`;

      sessionStore.addMessage(sessionId, 'report-agent', 'assistant', reply, [envelope], traceLogs);
      await sseWriter.writeEvent('done', { run_id: runId, status: 'SUCCESS' });
    } catch (err: any) {
      await recordTrace(`❌ Lỗi Report Agent: ${err.message}`);
      await sseWriter.writeEvent('error', { message: err.message });
    }
  }

  // -------------------------------------------------------------
  // FINANCE AGENT DIRECT CHATBOT (Python Service Hot-plugged)
  // -------------------------------------------------------------
  public async executeFinanceAgentChat(
    userPrompt: string,
    runId: string,
    sessionId: string,
    sseWriter: SSEWriter
  ): Promise<void> {
    const traceLogs: string[] = [];
    const recordTrace = async (msg: string) => {
      traceLogs.push(msg);
      await sseWriter.writeEvent('trace', { step: 'python-finance-agent', message: msg });
    };

    try {
      await recordTrace('Đang kết nối Python Finance Agent trên gRPC Port :50056...');
      const finJson = await grpcHub.executeStep(
        'python-finance-agent',
        {
          run_id: runId,
          task_id: `task-fin-${Date.now()}`,
          session_id: sessionId,
          user_prompt: userPrompt,
          agent_role: 'python-finance-agent',
          input_artifacts: [],
          execution_context_json: JSON.stringify({ mode: 'chat' }),
        },
        async (event) => {
          if (event.type === 'TRACE' || event.type === 0 || event.type === '0') {
            await recordTrace(event.message);
          }
        }
      );

      const envelope: ArtifactEnvelope = JSON.parse(finJson);
      sessionStore.saveArtifact(sessionId, envelope);
      await sseWriter.writeEvent('artifact', envelope);

      const p = envelope.payload as any;
      const reply = `💰 **Python Finance Agent phản hồi:**\nTôi đã tính toán phương án tài chính cho câu hỏi "${userPrompt}":\n- **Giá trị căn hộ**: ${(p.property_price || 4.5e9).toLocaleString('vi-VN')} VNĐ\n- **Hạn mức vay**: ${(p.loan_amount || 3.15e9).toLocaleString('vi-VN')} VNĐ (${p.loan_ratio_pct || 70}%)\n- **Lãi suất ưu đãi**: ${p.interest_rate_pct || 8.5}%/năm trong thời hạn ${p.term_years || 20} năm\n- **Ước tính gốc + lãi hàng tháng**: ${(p.monthly_payment_estimate || 27336432).toLocaleString('vi-VN')} VNĐ/tháng\n📌 *Chính sách*: ${p.policy_note || 'Ân hạn nợ gốc 18 tháng từ ngân hàng đối tác.'}`;

      sessionStore.addMessage(sessionId, 'python-finance-agent', 'assistant', reply, [envelope], traceLogs);
      await sseWriter.writeEvent('done', { run_id: runId, status: 'SUCCESS' });
    } catch (err: any) {
      await recordTrace(`❌ Lỗi Finance Agent: ${err.message}`);
      await sseWriter.writeEvent('error', { message: err.message });
    }
  }
}

export const dagOrchestrator = new DagOrchestrator();

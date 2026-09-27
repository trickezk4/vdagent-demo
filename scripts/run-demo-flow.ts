import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import net from 'net';
import { fileURLToPath } from 'url';
import { startCoreAgents } from './start-core-agents.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3000';

// Helper delay
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let agentCleanup: (() => void) | null = null;
let gatewayProcess: ChildProcess | null = null;

async function ensureServicesRunning(): Promise<void> {
  let isGatewayUp = false;
  try {
    const res = await fetch(`${GATEWAY_URL}/health`);
    if (res.ok) isGatewayUp = true;
  } catch {
    isGatewayUp = false;
  }

  if (!isGatewayUp) {
    console.log('⚡ Phát hiện Gateway chưa khởi chạy. Đang tự động kích hoạt 5 Core Agents và Gateway...');
    const runner = await startCoreAgents({ blocking: false, autoKill: true });
    agentCleanup = runner.cleanup;

    const gatewayScript = path.resolve(rootDir, 'apps/gateway/src/index.ts');

    gatewayProcess = spawn('npx', ['tsx', gatewayScript], {
      cwd: rootDir,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    gatewayProcess.stdout?.on('data', (d) => {
      console.log(`[Gateway] ${d.toString().trim()}`);
    });
    gatewayProcess.stderr?.on('data', (d) => {
      console.error(`[Gateway-Err] ${d.toString().trim()}`);
    });

    let ready = false;
    for (let i = 0; i < 25; i++) {
      await sleep(1000);
      try {
        const res = await fetch(`${GATEWAY_URL}/health`);
        if (res.ok) {
          ready = true;
          console.log('✅ Gateway và 5 Core Agents đã khởi động và sẵn sàng!\n');
          break;
        }
      } catch {
        // waiting
      }
    }

    if (!ready) {
      throw new Error('Không thể khởi động Gateway trên port 3000');
    }
  } else {
    console.log('✅ Đã kết nối tới Gateway đang chạy trên http://localhost:3000\n');
  }
}

// Helper lắng nghe Server-Sent Events (SSE) qua HTTP GET
async function streamSSE(endpoint: string, onEvent: (type: string, data: any) => void): Promise<void> {
  const response = await fetch(`${GATEWAY_URL}${endpoint}`);
  if (!response.body) throw new Error('Response body is empty');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    let currentEvent = 'message';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.replace('event: ', '').trim();
      } else if (line.startsWith('data: ')) {
        const dataStr = line.replace('data: ', '').trim();
        try {
          const parsed = JSON.parse(dataStr);
          onEvent(currentEvent, parsed);
        } catch {
          onEvent(currentEvent, dataStr);
        }
      }
    }
  }
}

async function runDemo() {
  console.log('===============================================================');
  console.log('🚀 BẮT ĐẦU KIỂM THỬ TỰ ĐỘNG VDAAGENT MULTI-AGENT PLATFORM DEMO');
  console.log('===============================================================\n');

  await ensureServicesRunning();

  // -----------------------------------------------------------------
  // GIAI ĐOẠN 1: Kiểm thử Pipeline 6 LLM Agents Bất động sản
  // -----------------------------------------------------------------
  console.log('▶️ [GIAI ĐOẠN 1] Gửi yêu cầu điều tra căn hộ bán chậm (6 Core Agents)...');
  const queryBds = encodeURIComponent('Tại sao phân khu Sapphire có căn hộ bán chậm hơn 90 ngày?');

  let reportReceived = false;
  let chartReceived = false;

  await streamSSE(`/api/v1/chat/stream?prompt=${queryBds}`, (event, data) => {
    if (event === 'trace') {
      console.log(`  🔍 [TRACE] ${data.message}`);
    } else if (event === 'artifact') {
      console.log(`  📦 [ARTIFACT-GENERATED] [${data.artifact_type?.toUpperCase()}] ID: ${data.artifact_id}`);
      if (data.artifact_type === 'chart_spec') {
        chartReceived = true;
      }
      if (data.artifact_type === 'report') {
        reportReceived = true;
        console.log('\n  📄 --- NỘI DUNG REPORT HOÀN CHỈNH TỪ REPORT-AGENT ---');
        console.log(`  Tiêu đề: ${data.payload?.title || 'Báo cáo điều tra'}`);
        console.log(`  Bằng chứng kiểm chứng: ${JSON.stringify(data.evidence_refs)}`);
        console.log('  ----------------------------------------------------\n');
      }
    }
  });

  if (!reportReceived) {
    throw new Error('Giai đoạn 1 thất bại: Không nhận được ReportArtifact từ pipeline!');
  }

  console.log('✅ Giai đoạn 1 thành công: Chuỗi 6 agents đã phối hợp hoàn tất báo cáo!\n');
  await sleep(2000);

  // -----------------------------------------------------------------
  // GIAI ĐOẠN 2: Khởi động Agent thứ 7 (Python) và Cắm nóng vào Gateway
  // -----------------------------------------------------------------
  console.log('▶️ [GIAI ĐOẠN 2] Mô phỏng cắm nóng: Khởi chạy Agent 7 (Python Service)...');

  const pythonScriptPath = path.resolve(__dirname, '../external-agents/python-finance-agent/src/server.py');
  
  let pythonCmd = 'python';
  const venvCandidates = [
    path.resolve(__dirname, '../external-agents/python-finance-agent/venv/Scripts/python.exe'),
    path.resolve(__dirname, '../external-agents/python-finance-agent/venv/bin/python'),
  ];
  for (const c of venvCandidates) {
    if (fs.existsSync(c)) {
      pythonCmd = c;
      break;
    }
  }

  // Kiểm tra xem port 50056 đã mở chưa
  const isPort50056Open = await new Promise<boolean>((resolve) => {
    const s = new net.Socket();
    s.setTimeout(500);
    s.on('connect', () => { s.destroy(); resolve(true); });
    s.on('error', () => { s.destroy(); resolve(false); });
    s.on('timeout', () => { s.destroy(); resolve(false); });
    s.connect(50056, '127.0.0.1');
  });

  let pythonProcess: ChildProcess | null = null;
  if (!isPort50056Open) {
    // Spawn tiến trình Python gRPC server
    pythonProcess = spawn(pythonCmd, [pythonScriptPath], {
      shell: true,
      stdio: 'inherit',
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
      },
    });
    // Chờ server Python gRPC khởi động
    await sleep(2500);
  } else {
    console.log('  ⚡ Agent Python (Port 50056) đã đang chạy sẵn, tiếp tục kiểm tra cắm nóng...');
  }

  console.log('  🔌 Gửi request đăng ký (Hot-plugging) lên Gateway qua POST /register...');
  const registerPayload = {
    agent_id: 'python-finance-agent',
    grpc_target: 'localhost:50056',
    domain: 'banking_and_finance',
    description: 'Chuyên gia tính toán tài chính ngân hàng (Python): Gói vay mua nhà, lịch trả nợ gốc lãi hàng tháng.',
    supported_intents: ['calculate_mortgage', 'compare_loan_packages'],
  };

  const regResponse = await fetch(`${GATEWAY_URL}/api/v1/agents/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(registerPayload),
  });

  const regResult = await regResponse.json();
  console.log('  📬 Gateway phản hồi:', regResult);

  if (!regResponse.ok || !regResult.success) {
    if (pythonProcess?.pid) {
      spawn('taskkill', ['/pid', pythonProcess.pid.toString(), '/f', '/t'], { stdio: 'ignore' });
    }
    throw new Error('Giai đoạn 2 thất bại: Đăng ký cắm nóng không thành công!');
  }

  console.log('✅ Giai đoạn 2 thành công: Agent Python đã cắm nóng mà Gateway không hề restart!\n');
  await sleep(2000);

  // -----------------------------------------------------------------
  // GIAI ĐOẠN 3: Kiểm tra Dynamic Routing sang Agent Python qua gRPC
  // -----------------------------------------------------------------
  console.log('▶️ [GIAI ĐOẠN 3] Đặt câu hỏi tài chính để Gateway tự động route sang Python Agent...');
  const queryFin = encodeURIComponent('Tính giúp tôi phương án vay ngân hàng cho căn hộ giá 4.5 tỷ');

  let pythonArtifactReceived = false;

  await streamSSE(`/api/v1/chat/stream?prompt=${queryFin}`, (event, data) => {
    if (event === 'trace') {
      console.log(`  🔍 [TRACE] ${data.message}`);
    } else if (event === 'artifact') {
      console.log(`  🎉 [PYTHON-ARTIFACT] ID: ${data.artifact_id} | Producer: ${data.producer}`);
      console.log('  💰 [KẾT QUẢ TÍNH TOÁN]:', JSON.stringify(data.payload, null, 2));
      if (data.artifact_type === 'finance_plan' || data.producer?.includes('python')) {
        pythonArtifactReceived = true;
      }
    }
  });

  if (!pythonArtifactReceived) {
    if (pythonProcess?.pid) {
      spawn('taskkill', ['/pid', pythonProcess.pid.toString(), '/f', '/t'], { stdio: 'ignore' });
    }
    throw new Error('Giai đoạn 3 thất bại: Không nhận được kết quả tính toán từ Python Finance Agent!');
  }

  console.log('\n===============================================================');
  console.log('🎉 TẤT CẢ KIỂM THỬ ĐÃ PASS: KIẾN TRÚC STANDALONE GRPC HOẠT ĐỘNG HOÀN HẢO!');
  console.log('===============================================================');

  // Dọn dẹp tiến trình Python sau khi test xong nếu do script spawn
  if (pythonProcess?.pid) {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', pythonProcess.pid.toString(), '/f', '/t'], { stdio: 'ignore' });
    } else {
      pythonProcess.kill();
    }
  }

  // Dọn dẹp Gateway nếu được sinh ra bởi script
  if (gatewayProcess && gatewayProcess.pid) {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', gatewayProcess.pid.toString(), '/f', '/t'], { stdio: 'ignore' });
    } else {
      gatewayProcess.kill();
    }
  }

  if (agentCleanup) {
    agentCleanup();
  }

  process.exit(0);
}

runDemo().catch((err) => {
  console.error('❌ Lỗi kiểm thử:', err);
  if (gatewayProcess && gatewayProcess.pid) {
    spawn('taskkill', ['/pid', gatewayProcess.pid.toString(), '/f', '/t'], { stdio: 'ignore' });
  }
  if (agentCleanup) {
    agentCleanup();
  }
  process.exit(1);
});

/**
 * scripts/start-all.ts
 * Starts the complete VDaAgent Platform demo:
 * 1. 5 Core gRPC Sub-agents (Ports 50051-50055)
 * 2. API Gateway & DAG Orchestrator (Port 3000)
 * 3. React Web UI (Port 5173)
 */

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { startCoreAgents } from './start-core-agents.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const children: ChildProcess[] = [];

function cleanup() {
  console.log('\n🛑 Đang dừng toàn bộ các dịch vụ VDaAgent...');
  for (const child of children) {
    try {
      if (child.pid) {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', child.pid.toString(), '/f', '/t'], { stdio: 'ignore' });
        } else {
          child.kill('SIGTERM');
        }
      }
    } catch {
      // ignore
    }
  }
}

process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});
process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});

async function main() {
  console.log('===============================================================');
  console.log('🌟 KHỞI CHẠY HỆ THỐNG VDAAGENT MULTI-AGENT PLATFORM DEMO');
  console.log('===============================================================\n');

  // 1. Khởi động 5 Core gRPC Sub-Agents
  console.log('▶️ [1/3] Khởi động 5 Core Sub-Agents (Ports 50051-50055)...');
  const agentRunner = await startCoreAgents({ blocking: false });
  console.log('✅ 5 Core Agents đã sẵn sàng tiếp nhận kết nối gRPC!\n');

  // 2. Khởi động Gateway (:3000)
  console.log('▶️ [2/3] Khởi động API Gateway & DAG Orchestrator (Port 3000)...');
  const isWin = process.platform === 'win32';
  const pnpmCmd = isWin ? 'pnpm.cmd' : 'pnpm';

  const gatewayProc = spawn(pnpmCmd, ['--filter', '@vda/gateway', 'run', 'start'], {
    cwd: rootDir,
    shell: true,
    stdio: 'inherit',
  });
  children.push(gatewayProc);

  // 3. Khởi động Web UI (:5173)
  console.log('▶️ [3/3] Khởi động Web Dashboard (Port 5173)...');
  const webProc = spawn(pnpmCmd, ['--filter', '@vda/web', 'run', 'dev'], {
    cwd: rootDir,
    shell: true,
    stdio: 'inherit',
  });
  children.push(webProc);

  console.log('\n===============================================================');
  console.log('🎉 TOÀN BỘ HỆ THỐNG ĐÃ SẴN SÀNG:');
  console.log('🌐 Web UI:        http://localhost:5173');
  console.log('🚀 API Gateway:   http://localhost:3000');
  console.log('🔌 gRPC Backbone: Ports 50051, 50052, 50053, 50054, 50055');
  console.log('⚡ Agent thứ 7:    Sẵn sàng cắm nóng tại Port 50056');
  console.log('===============================================================\n');
  console.log('Nhấn Ctrl+C để dừng toàn bộ hệ thống.\n');

  // Giữ tiến trình chạy
  await new Promise(() => {});
}

main().catch((err) => {
  console.error('❌ Lỗi khởi động hệ thống:', err);
  cleanup();
  process.exit(1);
});

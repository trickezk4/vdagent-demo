/**
 * scripts/start-core-agents.ts
 * Concurrently boots and monitors the Core 5-Agent gRPC Services (Ports 50051 - 50055)
 */

import { spawn, spawnSync, execSync, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

export interface AgentConfig {
  name: string;
  port: number;
  scriptPath: string;
  color: string;
}

export const CORE_AGENTS: AgentConfig[] = [
  {
    name: 'data-agent',
    port: 50051,
    scriptPath: path.resolve(PROJECT_ROOT, 'apps/agents/data-agent/src/index.ts'),
    color: '\x1b[36m', // Cyan
  },
  {
    name: 'compare-agent',
    port: 50052,
    scriptPath: path.resolve(PROJECT_ROOT, 'apps/agents/compare-agent/src/index.ts'),
    color: '\x1b[32m', // Green
  },
  {
    name: 'insight-agent',
    port: 50053,
    scriptPath: path.resolve(PROJECT_ROOT, 'apps/agents/insight-agent/src/index.ts'),
    color: '\x1b[35m', // Magenta
  },
  {
    name: 'chart-agent',
    port: 50054,
    scriptPath: path.resolve(PROJECT_ROOT, 'apps/agents/chart-agent/src/index.ts'),
    color: '\x1b[33m', // Yellow
  },
  {
    name: 'report-agent',
    port: 50055,
    scriptPath: path.resolve(PROJECT_ROOT, 'apps/agents/report-agent/src/index.ts'),
    color: '\x1b[34m', // Blue
  },
];

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

export function checkPortOpen(port: number, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);

    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, '127.0.0.1');
  });
}

/**
 * Checks whether a given TCP port is available for binding.
 * Uses a momentary server bind on 0.0.0.0 for accurate OS socket testing.
 */
export function isPortAvailable(port: number, host = '0.0.0.0'): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => {
        tester.once('close', () => resolve(true)).close();
      })
      .listen(port, host);
  });
}

/**
 * Discovers the Process ID (PID) currently listening on a given port.
 * Works on Windows via netstat and POSIX via lsof.
 */
export function getProcessHoldingPort(port: number): number | null {
  try {
    if (process.platform === 'win32') {
      const stdout = execSync('netstat -ano -p tcp', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const regex = new RegExp(`[:.]${port}\\s+.*?LISTENING\\s+(\\d+)`, 'i');
      const match = stdout.match(regex);
      return match ? Number(match[1]) : null;
    } else {
      const stdout = execSync(`lsof -ti :${port}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      return stdout ? Number(stdout.split('\n')[0]) : null;
    }
  } catch {
    return null;
  }
}

/**
 * Forcibly terminates the process holding a specific port.
 */
export function terminateProcessHoldingPort(port: number): boolean {
  const pid = getProcessHoldingPort(port);
  if (!pid || pid <= 4) return false;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(pid), '/f', '/t'], { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGKILL');
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Pre-flight check: Confirms all agent ports are free prior to spawning processes.
 * Throws a detailed diagnostic error if ports are occupied.
 */
export async function assertPortsAvailable(
  agents: AgentConfig[],
  options: { autoKill?: boolean } = {}
): Promise<void> {
  const autoKill = options.autoKill ?? (process.env.VDA_AUTO_CLEAN_PORTS === 'true');
  const busyPorts: { port: number; name: string; pid: number | null }[] = [];

  for (const agent of agents) {
    const free = await isPortAvailable(agent.port);
    if (!free) {
      const pid = getProcessHoldingPort(agent.port);
      if (autoKill && pid) {
        console.warn(`⚠️ [PRE-FLIGHT] Port ${agent.port} (${agent.name}) is occupied by PID ${pid}. Auto-terminating...`);
        terminateProcessHoldingPort(agent.port);
        await new Promise((r) => setTimeout(r, 250));
        const nowFree = await isPortAvailable(agent.port);
        if (nowFree) continue;
      }
      busyPorts.push({ port: agent.port, name: agent.name, pid });
    }
  }

  if (busyPorts.length > 0) {
    const details = busyPorts
      .map((b) => `  - Port ${b.port} (${b.name}): occupied by PID ${b.pid ?? 'unknown'}`)
      .join('\n');
    const killCmds = busyPorts
      .filter((b) => b.pid)
      .map((b) => (process.platform === 'win32'
        ? `taskkill /pid ${b.pid} /f /t`
        : `kill -9 ${b.pid}`))
      .join('\n');

    throw new Error(
      `\n❌ [PRE-FLIGHT CHECK FAILED] One or more required ports are already in use:\n${details}\n` +
      `Startup aborted to prevent EADDRINUSE collisions.\n` +
      `To terminate the offending processes, run:\n${killCmds}\n`
    );
  }
}

/**
 * Waits for all specified ports to be completely released by the OS network stack.
 */
export async function waitForPortsReleased(
  portsOrAgents: number[] | AgentConfig[] = CORE_AGENTS,
  maxWaitMs = 10000
): Promise<boolean> {
  const ports = portsOrAgents.map((item) => (typeof item === 'number' ? item : item.port));
  const startTime = Date.now();
  console.log(`${BOLD}⏳ Waiting for ports [${ports.join(', ')}] to be fully released...${RESET}`);

  while (Date.now() - startTime < maxWaitMs) {
    const statuses = await Promise.all(ports.map((p) => isPortAvailable(p)));
    if (statuses.every(Boolean)) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

export async function waitForAgentsReady(agents: AgentConfig[], maxWaitMs = 20000): Promise<boolean> {
  const startTime = Date.now();
  console.log(`${BOLD}⏳ Verifying health and port readiness of all 5 core sub-agents...${RESET}`);

  while (Date.now() - startTime < maxWaitMs) {
    const statuses = await Promise.all(agents.map((a) => checkPortOpen(a.port)));
    if (statuses.every(Boolean)) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

export async function startCoreAgents(options: { blocking?: boolean; autoKill?: boolean } = { blocking: true }) {
  console.log(`${BOLD}======================================================================${RESET}`);
  console.log(`${BOLD}🚀 STARTING VDAAGENT CORE 5 SUB-AGENTS CONCURRENTLY (PORTS 50051-50055)${RESET}`);
  console.log(`${BOLD}======================================================================${RESET}\n`);

  // [PRE-FLIGHT CHECK] Confirm all ports are free BEFORE spawning child processes
  console.log(`${BOLD}🔍 Running pre-flight port availability checks (50051-50055)...${RESET}`);
  await assertPortsAvailable(CORE_AGENTS, { autoKill: options.autoKill });
  console.log(`✅ All ports are free.\n`);

  const processes: { name: string; proc: ChildProcess }[] = [];

  let isShuttingDown = false;
  const cleanup = () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n${BOLD}🛑 Shutting down all core sub-agents...${RESET}`);
    for (const { name, proc } of processes) {
      try {
        if (process.platform === 'win32') {
          // On Windows, taskkill synchronously kills the process tree reliably
          if (proc.pid) {
            spawnSync('taskkill', ['/pid', String(proc.pid), '/f', '/t'], { stdio: 'ignore' });
          }
        } else {
          if (proc.pid && proc.exitCode === null) {
            proc.kill('SIGTERM');
          }
        }
      } catch {
        // ignore
      }
    }
  };

  process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(0);
  });

  // Spawn each agent concurrently
  for (const agent of CORE_AGENTS) {
    console.log(`${agent.color}[${agent.name}] Launching on port :${agent.port}...${RESET}`);

    const proc = spawn('npx', ['tsx', agent.scriptPath], {
      cwd: PROJECT_ROOT,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        [`${agent.name.toUpperCase().replace('-', '_')}_PORT`]: String(agent.port),
      },
    });

    proc.stdout?.on('data', (data) => {
      const lines = data.toString().trim().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          console.log(`${agent.color}[${agent.name}:${agent.port}]${RESET} ${line}`);
        }
      }
    });

    proc.stderr?.on('data', (data) => {
      const lines = data.toString().trim().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          console.error(`${agent.color}[${agent.name}:${agent.port} ERROR]${RESET} ${line}`);
        }
      }
    });

    proc.on('close', (code) => {
      if (!isShuttingDown && code !== null && code !== 0) {
        console.warn(`${agent.color}[${agent.name}] Process exited with code ${code}${RESET}`);
      }
    });

    processes.push({ name: agent.name, proc });
  }

  // Wait for all agents to open ports
  const ready = await waitForAgentsReady(CORE_AGENTS);

  if (ready) {
    console.log(`\n${BOLD}======================================================================${RESET}`);
    console.log(`🎉 ${BOLD}\x1b[32mALL 5 CORE AGENTS ARE ONLINE AND HEALTHY!${RESET}`);
    console.log(`  - Data Agent:     localhost:50051 (HEALTHY)`);
    console.log(`  - Compare Agent:  localhost:50052 (HEALTHY)`);
    console.log(`  - Insight Agent:  localhost:50053 (HEALTHY)`);
    console.log(`  - Chart Agent:    localhost:50054 (HEALTHY)`);
    console.log(`  - Report Agent:   localhost:50055 (HEALTHY)`);
    console.log(`${BOLD}======================================================================${RESET}\n`);
    if (options.blocking) {
      console.log(`Press Ctrl+C to terminate all services.`);
    }
  } else {
    console.error(`\n❌ Timed out waiting for all sub-agents to start. Check logs above.`);
    cleanup();
    process.exit(1);
  }

  return {
    processes,
    cleanup,
    waitForPortsReleased: () => waitForPortsReleased(CORE_AGENTS),
  };
}

// Auto-run if executed directly
const isDirectRun =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  startCoreAgents().catch((err) => {
    console.error('Fatal startup error:', err);
    process.exit(1);
  });
}

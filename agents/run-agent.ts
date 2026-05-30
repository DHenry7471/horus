/**
 * Horus Agent Runner
 *
 * Thin MCP client that calls the claude_agents MCP server.
 * Used by CI workflows and npm scripts to invoke agents
 * (Felix, Greta, Iris, Percy, Saxon, Tessa, Clint, etc.)
 * without any agent-specific logic living in Horus itself.
 *
 * Usage (CLI):
 *   tsx agents/run-agent.ts <agent-name> "<task>"
 *
 * Usage (programmatic):
 *   import { runAgent } from './agents/run-agent.js';
 *   const result = await runAgent('felix-failure-triage', task);
 *
 * Environment variables:
 *   CLAUDE_AGENTS_MCP_URL  — MCP server base URL (default: http://localhost:3000)
 *   CLAUDE_AGENTS_TIMEOUT  — request timeout ms (default: 120000)
 */

const MCP_URL = process.env.CLAUDE_AGENTS_MCP_URL ?? 'http://localhost:3000';
const TIMEOUT_MS = parseInt(process.env.CLAUDE_AGENTS_TIMEOUT ?? '120000', 10);

export interface AgentResult {
  agent: string;
  output: string;
  exitCode: number;
}

/**
 * Call an agent on the MCP server.
 *
 * @param agentName  - Agent slug (e.g. 'felix', 'percy', 'iris')
 * @param task       - Task payload string (free text or JSON)
 * @returns          - AgentResult with output string and exit code
 */
export async function runAgent(agentName: string, task: string): Promise<AgentResult> {
  const url = `${MCP_URL}/${agentName}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task }),
      signal: controller.signal,
    });
  } catch (err: unknown) {
    clearTimeout(timer);
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('abort') || message.includes('signal')) {
      throw new Error(
        `Agent "${agentName}" timed out after ${TIMEOUT_MS}ms. ` +
        `Increase CLAUDE_AGENTS_TIMEOUT or check MCP server health.`
      );
    }
    throw new Error(`Failed to reach MCP server at ${url}: ${message}`);
  } finally {
    clearTimeout(timer);
  }

  const body = await response.text();

  if (!response.ok) {
    throw new Error(
      `MCP server returned ${response.status} for agent "${agentName}":\n${body}`
    );
  }

  // The server may return JSON { output: string } or plain text — handle both.
  let output: string;
  try {
    const parsed = JSON.parse(body) as { output?: string; result?: string };
    output = parsed.output ?? parsed.result ?? body;
  } catch {
    output = body;
  }

  return { agent: agentName, output, exitCode: 0 };
}

// ── CLI entrypoint ──────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].endsWith('run-agent.ts')) {
  const [, , agentArg, ...taskParts] = process.argv;

  if (!agentArg || taskParts.length === 0) {
    console.error('Usage: tsx agents/run-agent.ts <agent-name> "<task>"');
    process.exit(1);
  }

  const task = taskParts.join(' ');

  runAgent(agentArg, task)
    .then(({ output }) => {
      process.stdout.write(output);
      if (!output.endsWith('\n')) process.stdout.write('\n');
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[run-agent] ERROR: ${msg}`);
      process.exit(1);
    });
}

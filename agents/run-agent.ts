/**
 * Horus Agent Runner
 *
 * Calls agents from the claude_agents repo directly via the Anthropic API.
 * Reads the agent's system prompt from its markdown file, then sends the task
 * to the API — no MCP server required.
 *
 * Usage (CLI):
 *   tsx agents/run-agent.ts <agent-name> "<task>"
 *
 * Usage (programmatic):
 *   import { runAgent } from './agents/run-agent.js';
 *   const result = await runAgent('felix-failure-triage', task);
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY      — required
 *   CLAUDE_AGENTS_DIR      — path to claude_agents/agents/ (default: /tmp/claude_agents/agents)
 *   CLAUDE_AGENTS_MODEL    — model override (default: claude-sonnet-4-6)
 *   CLAUDE_AGENTS_TIMEOUT  — request timeout ms (default: 180000)
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const AGENTS_DIR = process.env.CLAUDE_AGENTS_DIR ?? '/tmp/claude_agents/agents';
const MODEL = process.env.CLAUDE_AGENTS_MODEL ?? 'claude-sonnet-4-6';
const TIMEOUT_MS = parseInt(process.env.CLAUDE_AGENTS_TIMEOUT ?? '180000', 10);
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Agent slug aliases (short names used in CI → full filename)
const SLUG_ALIASES: Record<string, string> = {
  felix: 'felix-failure-triage',
  greta: 'greta-coverage-analyst',
  iris: 'iris-insight-reporter',
  percy: 'percy-pr-reviewer',
  saxon: 'saxon-spec-to-test',
  tessa: 'tessa-test-strategist',
  clint: 'clint-ci-gatekeeper',
  ambrosine: 'ambrosine-api-tester',
  ernie: 'ernie-e2e-test-writer',
};

export interface AgentResult {
  agent: string;
  output: string;
  exitCode: number;
}

/**
 * Parse the system prompt from an agent markdown file.
 * The file has YAML frontmatter (--- ... ---) followed by the prompt body.
 */
function loadSystemPrompt(agentSlug: string): string {
  const resolved = SLUG_ALIASES[agentSlug] ?? agentSlug;

  const candidates = [
    join(AGENTS_DIR, `${resolved}.md`),
    join(AGENTS_DIR, `${agentSlug}.md`),
    join(AGENTS_DIR, resolved),
  ];

  const filepath = candidates.find(existsSync);
  if (!filepath) {
    throw new Error(
      `Agent "${agentSlug}" not found. Looked for:\n${candidates.join('\n')}\n` +
      `Set CLAUDE_AGENTS_DIR to point to the agents/ directory.`
    );
  }

  const content = readFileSync(filepath, 'utf8');

  // Strip YAML frontmatter (--- ... ---)
  const frontmatterMatch = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  return frontmatterMatch ? frontmatterMatch[1].trim() : content.trim();
}

/**
 * Run an agent by calling the Anthropic API directly.
 */
export async function runAgent(agentName: string, task: string): Promise<AgentResult> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set.');
  }

  const systemPrompt = loadSystemPrompt(agentName);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: 'user', content: task }],
      }),
      signal: controller.signal,
    });
  } catch (err: unknown) {
    clearTimeout(timer);
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('abort') || message.includes('signal')) {
      throw new Error(`Agent "${agentName}" timed out after ${TIMEOUT_MS}ms.`);
    }
    throw new Error(`Failed to call Anthropic API: ${message}`);
  } finally {
    clearTimeout(timer);
  }

  const body = await response.text();

  if (!response.ok) {
    throw new Error(`Anthropic API returned ${response.status} for agent "${agentName}":\n${body}`);
  }

  const parsed = JSON.parse(body) as {
    content: Array<{ type: string; text?: string }>;
  };

  const output = parsed.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('\n\n');

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

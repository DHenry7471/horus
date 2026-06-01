/**
 * CLI wrapper around the claude-agents package.
 *
 * Usage:
 *   tsx agents/run-agent.ts <agent-name> "<task>"
 *
 * Programmatic usage:
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY      — required
 *   CLAUDE_AGENTS_MODEL    — optional model override
 *   HORUS_REPORTS_DIR      — path to reports/ directory (default: ./reports)
 */

import { runAgent, AgentInsightStore } from '@wutangbanger/horus-insight-store';
import { AgentInsight, AgentInsightCategory, AgentInsightSeverity } from '@wutangbanger/horus-contracts';
import crypto from 'node:crypto';
import path from 'node:path';

// ── Agent → category mapping ──────────────────────────────────────────────

const AGENT_CATEGORIES: Record<string, AgentInsightCategory> = {
  felix: 'failure',
  percy: 'diff',
  iris: 'dashboard',
  greta: 'flakiness',
  saxon: 'coverage',
};

// ── Severity extraction ───────────────────────────────────────────────────
// A lightweight heuristic: look for severity keywords in the agent's output.
// Agents can override this by prefixing their output with [CRITICAL] / [WARNING].

function extractSeverity(output: string): AgentInsightSeverity {
  const upper = output.toUpperCase();
  if (upper.includes('[CRITICAL]') || upper.includes('CRITICAL:')) return 'critical';
  if (upper.includes('[WARNING]') || upper.includes('WARNING:')) return 'warning';
  return 'info';
}

// ── Summary extraction ────────────────────────────────────────────────────
// Use the first non-empty line of output as the summary (≤120 chars).

function extractSummary(output: string): string {
  const firstLine = output
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0) ?? 'No summary';
  return firstLine.length > 120 ? firstLine.slice(0, 117) + '...' : firstLine;
}

// ── Main ──────────────────────────────────────────────────────────────────

const [, , agentArg, ...taskParts] = process.argv;

if (!agentArg || taskParts.length === 0) {
  console.error('Usage: tsx agents/run-agent.ts <agent-name> "<task>"');
  process.exit(1);
}

const reportsDir = path.resolve(process.env.HORUS_REPORTS_DIR ?? './reports');
const store = new AgentInsightStore(reportsDir);

runAgent(agentArg, taskParts.join(' '))
  .then(async ({ output, model, stopReason, usage }) => {
    process.stdout.write(output);
    if (!output.endsWith('\n')) process.stdout.write('\n');

    const cacheInfo = usage.cacheReadTokens > 0
      ? ` | cache_read=${usage.cacheReadTokens}`
      : ` | cache_write=${usage.cacheCreationTokens}`;
    console.error(`[run-agent] model=${model} stop=${stopReason} in=${usage.inputTokens} out=${usage.outputTokens}${cacheInfo}`);

    // Persist insight — always, even for unknown agents
    const category: AgentInsightCategory = AGENT_CATEGORIES[agentArg] ?? 'dashboard';
    const insight: AgentInsight = {
      id: crypto.randomUUID(),
      agentId: agentArg,
      runAt: new Date().toISOString(),
      category,
      severity: extractSeverity(output),
      summary: extractSummary(output),
      details: { output, model, stopReason, usage },
    };

    await store.append(insight);
    console.error(`[run-agent] insight persisted → reports/agent-insights/${agentArg}.jsonl`);
  })
  .catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[run-agent] ERROR: ${msg}`);
    process.exit(1);
  });

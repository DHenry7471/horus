/**
 * CLI wrapper for Horus API agents.
 *
 * Unlike run-agent.ts (which passes freeform text), Horus agents receive a
 * typed JSON input object and always return structured JSON output.
 * The caller is responsible for pre-assembling the input before invoking this script.
 *
 * Usage:
 *   tsx agents/run-horus-agent.ts <agent-name> --input-file <path-to-json>
 *   tsx agents/run-horus-agent.ts <agent-name> --input-json '<json-string>'
 *
 * Agent names (short aliases accepted):
 *   horus-felix  / horus-felix-failure-triage
 *   horus-greta  / horus-greta-coverage-analyst
 *   horus-iris   / horus-iris-insight-reporter
 *   horus-percy  / horus-percy-pr-reviewer
 *   horus-kurt   / horus-kurt-striker-mutation-analyst
 *
 * Output:
 *   stdout — the structured JSON output from the agent (pipe to jq for pretty-printing)
 *   stderr — model/token diagnostics and persistence confirmation
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY      — required
 *   CLAUDE_AGENTS_MODEL    — optional model override
 *   HORUS_REPORTS_DIR      — path to reports/ directory (default: ./reports)
 */

import { runHorusAgent, AgentInsightStore } from '@wutangbanger/horus-insight-store';
import type {
  AgentInsight,
  AgentInsightCategory,
  AgentInsightSeverity,
  FelixOutput,
  GretaOutput,
  IrisOutput,
  PercyOutput,
  KurtOutput,
  MergeRecommendation,
  PercyVerdict,
} from '@wutangbanger/horus-contracts';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

// ── Arg parsing ───────────────────────────────────────────────────────────

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    'input-file': { type: 'string' },
    'input-json': { type: 'string' },
  },
});

const agentArg = positionals[0];

if (!agentArg) {
  console.error('Usage: tsx agents/run-horus-agent.ts <agent-name> [--input-file <path>] [--input-json <json>]');
  process.exit(1);
}

if (!values['input-file'] && !values['input-json']) {
  console.error('Error: provide --input-file <path> or --input-json <json-string>');
  process.exit(1);
}

let inputObject: unknown;
if (values['input-file']) {
  const raw = fs.readFileSync(path.resolve(values['input-file']), 'utf8');
  inputObject = JSON.parse(raw);
} else {
  inputObject = JSON.parse(values['input-json']!);
}

// ── Agent → category mapping ──────────────────────────────────────────────

const AGENT_CATEGORIES: Record<string, AgentInsightCategory> = {
  'horus-felix-failure-triage':          'failure',
  'horus-felix':                          'failure',
  'horus-greta-coverage-analyst':        'coverage',
  'horus-greta':                          'coverage',
  'horus-iris-insight-reporter':         'dashboard',
  'horus-iris':                           'dashboard',
  'horus-percy-pr-reviewer':             'diff',
  'horus-percy':                          'diff',
  'horus-kurt-striker-mutation-analyst': 'mutation',
  'horus-kurt':                           'mutation',
};

// ── Severity extraction from typed output ─────────────────────────────────

function extractSeverity(agentName: string, data: unknown): AgentInsightSeverity {
  const name = agentName.replace('horus-', '');

  if (name.startsWith('felix')) {
    const f = data as FelixOutput;
    if (f.mergeRecommendation === ('BLOCK' as MergeRecommendation)) return 'critical';
    return f.totalFailures > 0 ? 'warning' : 'info';
  }

  if (name.startsWith('greta')) {
    const g = data as GretaOutput;
    const hasCritical = g.gaps?.some(gap => gap.riskLevel === 'CRITICAL');
    const hasHigh = g.gaps?.some(gap => gap.riskLevel === 'HIGH');
    if (hasCritical) return 'critical';
    if (hasHigh) return 'warning';
    return 'info';
  }

  if (name.startsWith('iris')) {
    const i = data as IrisOutput;
    const highAnomalies = i.anomalies?.some(a => a.severity === 'HIGH');
    if (highAnomalies) return 'critical';
    if (i.anomalies?.length > 0) return 'warning';
    return 'info';
  }

  if (name.startsWith('percy')) {
    const p = data as PercyOutput;
    if (p.overallVerdict === ('REQUEST_CHANGES' as PercyVerdict)) return 'critical';
    if (p.overallVerdict === ('COMMENT' as PercyVerdict)) return 'warning';
    return 'info';
  }

  if (name.startsWith('kurt')) {
    const k = data as KurtOutput;
    const criticalKills = k.kills?.filter(kill => kill.riskLevel === 'CRITICAL').length ?? 0;
    if (criticalKills > 0) return 'critical';
    if (k.kills?.length > 0) return 'warning';
    return 'info';
  }

  return 'info';
}

// ── Summary extraction from typed output ─────────────────────────────────

function extractSummary(agentName: string, data: unknown): string {
  const name = agentName.replace('horus-', '');

  if (name.startsWith('felix')) {
    const f = data as FelixOutput;
    return `${f.mergeRecommendation}: ${f.mergeReason}`.slice(0, 120);
  }
  if (name.startsWith('greta')) {
    return ((data as GretaOutput).summary ?? 'Coverage analysis complete').slice(0, 120);
  }
  if (name.startsWith('iris')) {
    return ((data as IrisOutput).topInsight ?? 'Quality report generated').slice(0, 120);
  }
  if (name.startsWith('percy')) {
    const p = data as PercyOutput;
    return `${p.overallVerdict}: ${p.summary}`.slice(0, 120);
  }
  if (name.startsWith('kurt')) {
    return ((data as KurtOutput).summary ?? 'Mutation analysis complete').slice(0, 120);
  }
  return 'Horus agent run complete';
}

// ── Main ──────────────────────────────────────────────────────────────────

const reportsDir = path.resolve(process.env.HORUS_REPORTS_DIR ?? './reports');
const store = new AgentInsightStore(reportsDir);

runHorusAgent(agentArg, inputObject)
  .then(async ({ data, model, stopReason, usage }) => {
    // Output structured JSON to stdout for workflow consumption
    process.stdout.write(JSON.stringify(data, null, 2));
    process.stdout.write('\n');

    const cacheInfo = usage.cacheReadTokens > 0
      ? ` | cache_read=${usage.cacheReadTokens}`
      : ` | cache_write=${usage.cacheCreationTokens}`;
    console.error(
      `[run-horus-agent] agent=${agentArg} model=${model} stop=${stopReason}` +
      ` in=${usage.inputTokens} out=${usage.outputTokens}${cacheInfo}`
    );

    const category: AgentInsightCategory = AGENT_CATEGORIES[agentArg] ?? 'dashboard';
    const insight: AgentInsight = {
      id:       crypto.randomUUID(),
      agentId:  agentArg,
      runAt:    new Date().toISOString(),
      category,
      severity: extractSeverity(agentArg, data),
      summary:  extractSummary(agentArg, data),
      // Store the typed structured output directly — no text wrapping
      details:  data,
    };

    await store.append(insight);
    console.error(`[run-horus-agent] insight persisted → reports/agent-insights/${agentArg}.jsonl`);
  })
  .catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[run-horus-agent] ERROR: ${msg}`);
    process.exit(1);
  });

/**
 * CLI wrapper around the claude-agents package.
 *
 * Usage:
 *   tsx agents/run-agent.ts <agent-name> "<task>"
 *
 * Programmatic usage:
 *   import { runAgent } from '@wutangbanger/claude-agents';
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY      — required
 *   CLAUDE_AGENTS_MODEL    — optional model override
 */

import { runAgent } from '@wutangbanger/claude-agents';

const [, , agentArg, ...taskParts] = process.argv;

if (!agentArg || taskParts.length === 0) {
  console.error('Usage: tsx agents/run-agent.ts <agent-name> "<task>"');
  process.exit(1);
}

runAgent(agentArg, taskParts.join(' '))
  .then(({ output, model, stopReason, usage }) => {
    process.stdout.write(output);
    if (!output.endsWith('\n')) process.stdout.write('\n');
    const cacheInfo = usage.cacheReadTokens > 0
      ? ` | cache_read=${usage.cacheReadTokens}`
      : ` | cache_write=${usage.cacheCreationTokens}`;
    console.error(`[run-agent] model=${model} stop=${stopReason} in=${usage.inputTokens} out=${usage.outputTokens}${cacheInfo}`);
  })
  .catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[run-agent] ERROR: ${msg}`);
    process.exit(1);
  });

/**
 * Event Contract Coverage CLI
 *
 * Analyzes all event topics declared in source files and reports which
 * topics lack test coverage on the publish or subscribe side.
 *
 * Usage:
 *   tsx agents/check-event-contracts.ts
 *   tsx agents/check-event-contracts.ts --json          # machine-readable output
 *   tsx agents/check-event-contracts.ts --persist       # write result to AgentInsightStore
 *
 * Exit code 1 if any fully-uncovered topics are found (for CI gates).
 */

import path from 'node:path';
import { analyzeEventContracts } from '@wutangbanger/horus-insight-store';
import { AgentInsightStore } from '@wutangbanger/horus-insight-store';
import crypto from 'node:crypto';

const ROOT = path.resolve(process.cwd());
const REPORTS_DIR = path.resolve(process.env.HORUS_REPORTS_DIR ?? './reports');

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const persist = args.includes('--persist');

const report = await analyzeEventContracts(ROOT);

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`\n🔎 Event Contract Coverage — ${report.analyzedAt}`);
  console.log(`   Topics found:     ${report.totalTopics}`);
  console.log(`   Fully covered:    ${report.fullyCovered}`);
  console.log(`   Publish only:     ${report.publishOnly}`);
  console.log(`   Subscribe only:   ${report.subscribeOnly}`);
  console.log(`   Fully uncovered:  ${report.fullyUncovered}`);

  if (report.gaps.length > 0) {
    console.log('\n   Topic breakdown:');
    for (const gap of report.gaps) {
      const pub = gap.publishCovered ? '✅' : '❌';
      const sub = gap.subscribeCovered ? '✅' : '❌';
      console.log(`   ${pub} publish  ${sub} subscribe  →  ${gap.topic}`);
      if (!gap.publishCovered && gap.publishCoveredBy.length === 0) {
        console.log(`      ⚠  No test asserts publish of "${gap.topic}"`);
      }
      if (!gap.subscribeCovered && gap.subscribeCoveredBy.length === 0) {
        console.log(`      ⚠  No test exercises handler for "${gap.topic}"`);
      }
    }
  }
}

if (persist) {
  const store = new AgentInsightStore(REPORTS_DIR);
  const severity =
    report.fullyUncovered > 0 ? 'critical'
    : report.publishOnly + report.subscribeOnly > 0 ? 'warning'
    : 'info';

  await store.append({
    id: crypto.randomUUID(),
    agentId: 'event-contracts',
    runAt: report.analyzedAt,
    category: 'coverage',
    severity,
    summary: `${report.fullyCovered}/${report.totalTopics} event topics fully covered · ${report.fullyUncovered} uncovered`,
    details: report,
  });

  console.log(`\n   Insight persisted → reports/agent-insights/event-contracts.jsonl`);
}

if (report.fullyUncovered > 0) {
  process.exit(1);
}

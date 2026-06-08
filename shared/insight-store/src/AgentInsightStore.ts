/**
 * AgentInsightStore
 *
 * JSONL-backed persistence for AI agent insights. Each agent gets its own
 * file: reports/agent-insights/<agentId>.jsonl — one JSON record per line.
 *
 * JSONL (newline-delimited JSON) is used because:
 *   - Appends are O(1) — no need to parse and rewrite the whole file
 *   - Each line is a valid JSON object, easy to stream or tail
 *   - Human-readable and grep-friendly
 *
 * Implements IAgentInsightStore from @wutangbanger/horus-contracts.
 */

import fs from 'node:fs';
import path from 'node:path';
import { AgentInsight, AgentInsightCategory, IAgentInsightStore, HorusConfig } from '@wutangbanger/horus-contracts';

export class AgentInsightStore implements IAgentInsightStore {
  private readonly dir: string;

  constructor(config: HorusConfig | string) {
    const reportsDir = typeof config === 'string' ? config : config.reportsDir;
    this.dir = path.resolve(reportsDir, 'agent-insights');
    fs.mkdirSync(this.dir, { recursive: true });
  }

  async append(insight: AgentInsight): Promise<void> {
    const filePath = this.filePathFor(insight.agentId);
    const line = JSON.stringify(insight) + '\n';
    fs.appendFileSync(filePath, line, 'utf8');
  }

  async readAll(): Promise<AgentInsight[]> {
    const files = fs.existsSync(this.dir)
      ? fs.readdirSync(this.dir).filter((f) => f.endsWith('.jsonl'))
      : [];

    const all: AgentInsight[] = [];
    for (const file of files) {
      all.push(...this.readFile(path.join(this.dir, file)));
    }

    return all.sort((a, b) => a.runAt.localeCompare(b.runAt));
  }

  async readSince(isoTimestamp: string): Promise<AgentInsight[]> {
    const all = await this.readAll();
    return all.filter((insight) => insight.runAt >= isoTimestamp);
  }

  async readByAgent(agentId: string): Promise<AgentInsight[]> {
    const filePath = this.filePathFor(agentId);
    if (!fs.existsSync(filePath)) return [];
    return this.readFile(filePath);
  }

  async readByCategory(category: AgentInsightCategory): Promise<AgentInsight[]> {
    const all = await this.readAll();
    return all.filter((insight) => insight.category === category);
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private filePathFor(agentId: string): string {
    return path.join(this.dir, `${agentId}.jsonl`);
  }

  private readFile(filePath: string): AgentInsight[] {
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as AgentInsight);
  }
}

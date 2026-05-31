/**
 * EventContractAnalyzer
 *
 * Static analyzer for event contract coverage gaps.
 *
 * For each topic declared in ORDER_EVENTS (or any `const X = { ... }` pattern
 * matching event topic strings), it checks:
 *
 *   1. PUBLISH side  — is there a test that asserts this topic was published?
 *                      (looks for assertPublished / assertPublishedCount / mockEventBus calls)
 *   2. SUBSCRIBE side — is there a test that exercises the handler for this topic?
 *                       (looks for handler registrations and tests that trigger them)
 *
 * Operates entirely on source text — no imports, no execution.
 * Output is a list of EventContractGap records suitable for AgentInsightStore.
 */

import fs from 'node:fs';
import path from 'node:path';
import { glob } from './glob.js';

export interface EventContractGap {
  topic: string;
  publishCovered: boolean;
  subscribeCovered: boolean;
  /** Files where the topic is declared */
  declaredIn: string[];
  /** Test files that cover the publish side */
  publishCoveredBy: string[];
  /** Test files that cover the subscribe side */
  subscribeCoveredBy: string[];
}

export interface EventContractReport {
  analyzedAt: string;
  totalTopics: number;
  fullyUncovered: number;
  publishOnly: number;
  subscribeOnly: number;
  fullyCovered: number;
  gaps: EventContractGap[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Extract all string values from `const X = { KEY: 'value', ... }` patterns */
function extractEventTopics(src: string): string[] {
  const topics: string[] = [];
  // Match single or double quoted string values in object literals
  const valuePattern = /:\s*['"]([a-z][a-z0-9]*(?:[._][a-z0-9]+)+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = valuePattern.exec(src)) !== null) {
    topics.push(match[1]);
  }
  return [...new Set(topics)];
}

/** Check if a file's content references a topic string in a test-assertion context */
function coversPublish(src: string, topic: string): boolean {
  const escaped = topic.replace(/\./g, '\\.');
  // assertPublished / assertPublishedCount / eventBus.publish calls in test files
  const patterns = [
    new RegExp(`assertPublished(?:Count)?\\([^)]*['"]${escaped}['"]`),
    new RegExp(`publish\\([^)]*['"]${escaped}['"]`),
    new RegExp(`ORDER_EVENTS\\.\\w+.*${escaped}`),
  ];
  return patterns.some((p) => p.test(src));
}

/** Check if a file's content exercises the subscribe handler for a topic */
function coversSubscribe(src: string, topic: string): boolean {
  const escaped = topic.replace(/\./g, '\\.');
  const patterns = [
    new RegExp(`subscribe\\([^)]*['"]${escaped}['"]`),
    new RegExp(`registerEventHandlers`),  // integration tests that call this verify all handlers
    new RegExp(`handle.*${escaped.replace(/\\\./g, '.*')}`),
  ];
  return patterns.some((p) => p.test(src));
}

// ── Main analyzer ──────────────────────────────────────────────────────────

export async function analyzeEventContracts(rootDir: string): Promise<EventContractReport> {
  // 1. Find all source files that declare event topics
  const sourceFiles = await glob(rootDir, ['services/**/*.ts', 'shared/contracts/**/*.ts'], [
    'node_modules', 'dist', '**/*.test.ts', '**/*.spec.ts',
  ]);

  // 2. Find all test files
  const testFiles = await glob(rootDir, ['tests/**/*.ts'], ['node_modules', 'dist']);

  // 3. Collect topics from source files
  const topicToFiles = new Map<string, string[]>();
  for (const file of sourceFiles) {
    const src = fs.readFileSync(file, 'utf8');
    const topics = extractEventTopics(src);
    for (const topic of topics) {
      const existing = topicToFiles.get(topic) ?? [];
      existing.push(path.relative(rootDir, file));
      topicToFiles.set(topic, existing);
    }
  }

  // 4. For each topic, check test coverage
  const gaps: EventContractGap[] = [];

  // Pre-read all test files once
  const testContents = testFiles.map((f) => ({
    relPath: path.relative(rootDir, f),
    src: fs.readFileSync(f, 'utf8'),
  }));

  for (const [topic, declaredIn] of topicToFiles) {
    const publishCoveredBy = testContents
      .filter(({ src }) => coversPublish(src, topic))
      .map(({ relPath }) => relPath);

    const subscribeCoveredBy = testContents
      .filter(({ src }) => coversSubscribe(src, topic))
      .map(({ relPath }) => relPath);

    gaps.push({
      topic,
      publishCovered: publishCoveredBy.length > 0,
      subscribeCovered: subscribeCoveredBy.length > 0,
      declaredIn,
      publishCoveredBy,
      subscribeCoveredBy,
    });
  }

  // 5. Sort: fully uncovered first, then partial, then fully covered
  gaps.sort((a, b) => {
    const scoreA = (a.publishCovered ? 1 : 0) + (a.subscribeCovered ? 1 : 0);
    const scoreB = (b.publishCovered ? 1 : 0) + (b.subscribeCovered ? 1 : 0);
    return scoreA - scoreB;
  });

  return {
    analyzedAt: new Date().toISOString(),
    totalTopics: gaps.length,
    fullyUncovered: gaps.filter((g) => !g.publishCovered && !g.subscribeCovered).length,
    publishOnly: gaps.filter((g) => g.publishCovered && !g.subscribeCovered).length,
    subscribeOnly: gaps.filter((g) => !g.publishCovered && g.subscribeCovered).length,
    fullyCovered: gaps.filter((g) => g.publishCovered && g.subscribeCovered).length,
    gaps,
  };
}

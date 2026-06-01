/**
 * MockEventBus
 *
 * In-memory replacement for any real message broker (Redis pub/sub, SQS, etc.).
 * Implements IEventBus from @wutangbanger/horus-contracts — safe for injection at the
 * integration test layer with zero external dependencies.
 *
 * Design: Adapter pattern — production code depends on IEventBus (contracts);
 * tests inject MockEventBus (this file) instead of the real transport.
 */

import { IEventBus, EventPayload } from '@wutangbanger/horus-contracts';

export { IEventBus, EventPayload };

export class MockEventBus implements IEventBus {
  private handlers = new Map<string, Array<(payload: EventPayload) => void | Promise<void>>>();
  private publishedEvents: EventPayload[] = [];

  async publish(topic: string, data: unknown, correlationId = crypto.randomUUID()): Promise<void> {
    const payload: EventPayload = {
      topic,
      data,
      timestamp: Date.now(),
      correlationId,
    };

    this.publishedEvents.push(payload);

    const topicHandlers = this.handlers.get(topic) ?? [];
    for (const handler of topicHandlers) {
      await handler(payload);
    }
  }

  subscribe(topic: string, handler: (payload: EventPayload) => void | Promise<void>): void {
    const existing = this.handlers.get(topic) ?? [];
    this.handlers.set(topic, [...existing, handler]);
  }

  unsubscribeAll(): void {
    this.handlers.clear();
  }

  // ── Test assertion helpers ────────────────────────────────────────────────

  getPublishedEvents(topic?: string): EventPayload[] {
    if (!topic) return [...this.publishedEvents];
    return this.publishedEvents.filter((e) => e.topic === topic);
  }

  assertPublishedCount(topic: string, expectedCount: number): void {
    const actual = this.getPublishedEvents(topic).length;
    if (actual !== expectedCount) {
      throw new Error(
        `Expected ${expectedCount} event(s) on topic "${topic}", but got ${actual}`
      );
    }
  }

  assertPublished(topic: string, predicate: (data: unknown) => boolean): void {
    const match = this.getPublishedEvents(topic).find((e) => predicate(e.data));
    if (!match) {
      throw new Error(
        `No event on topic "${topic}" matched the given predicate.\nPublished: ${JSON.stringify(
          this.getPublishedEvents(topic),
          null,
          2
        )}`
      );
    }
  }

  reset(): void {
    this.publishedEvents = [];
    this.unsubscribeAll();
  }
}

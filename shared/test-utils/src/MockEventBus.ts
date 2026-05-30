/**
 * MockEventBus
 *
 * An in-memory replacement for any real message broker (Redis pub/sub, SQS, etc.).
 * Injected at the integration test layer so no external services are required.
 *
 * Design: Follows the Adapter pattern — production code depends on the IEventBus
 * interface; tests inject MockEventBus instead of the real transport.
 */

export interface EventPayload {
  topic: string;
  data: unknown;
  timestamp: number;
  correlationId: string;
}

export interface IEventBus {
  publish(topic: string, data: unknown, correlationId?: string): Promise<void>;
  subscribe(topic: string, handler: (payload: EventPayload) => void): void;
  unsubscribeAll(): void;
}

export class MockEventBus implements IEventBus {
  private handlers = new Map<string, Array<(payload: EventPayload) => void>>();
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
      handler(payload);
    }
  }

  subscribe(topic: string, handler: (payload: EventPayload) => void): void {
    const existing = this.handlers.get(topic) ?? [];
    this.handlers.set(topic, [...existing, handler]);
  }

  unsubscribeAll(): void {
    this.handlers.clear();
  }

  // ── Test assertion helpers ────────────────────────────────────────────────

  /** Returns all events published to a given topic */
  getPublishedEvents(topic?: string): EventPayload[] {
    if (!topic) return [...this.publishedEvents];
    return this.publishedEvents.filter((e) => e.topic === topic);
  }

  /** Assert exactly N events were published to a topic */
  assertPublishedCount(topic: string, expectedCount: number): void {
    const actual = this.getPublishedEvents(topic).length;
    if (actual !== expectedCount) {
      throw new Error(
        `Expected ${expectedCount} event(s) on topic "${topic}", but got ${actual}`
      );
    }
  }

  /** Assert at least one event was published matching a predicate */
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

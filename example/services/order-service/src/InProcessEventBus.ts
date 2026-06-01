/**
 * InProcessEventBus
 *
 * Concrete IEventBus for single-process use. Handlers run synchronously in
 * the same process as the publisher — appropriate for local development and
 * the E2E test server. In production this would be replaced by a Redis,
 * SQS, or Kafka adapter; the swap is one line in server.ts.
 *
 * This is intentionally minimal: no retry, no dead-letter, no persistence.
 * Those concerns belong in a production broker adapter, not here.
 */

import { IEventBus, EventPayload } from '@horus/contracts';
import crypto from 'node:crypto';

type Handler = (payload: EventPayload) => void | Promise<void>;

export class InProcessEventBus implements IEventBus {
  private readonly handlers = new Map<string, Handler[]>();

  async publish(topic: string, data: unknown, correlationId?: string): Promise<void> {
    const payload: EventPayload = {
      topic,
      data,
      timestamp: Date.now(),
      correlationId: correlationId ?? crypto.randomUUID(),
    };

    const subscribers = this.handlers.get(topic) ?? [];
    await Promise.all(subscribers.map((h) => h(payload)));
  }

  subscribe(topic: string, handler: Handler): void {
    const existing = this.handlers.get(topic) ?? [];
    this.handlers.set(topic, [...existing, handler]);
  }

  unsubscribeAll(): void {
    this.handlers.clear();
  }
}

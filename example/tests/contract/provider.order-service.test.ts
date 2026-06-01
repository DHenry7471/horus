/**
 * Contract Test — Provider Side
 * Provider: OrderService
 * Consumer: NotificationService
 * Topic:    order.created
 *
 * Reads the pact file produced by the consumer test and verifies that
 * OrderService actually publishes an order.created event whose payload
 * satisfies every field the consumer declared it needs.
 *
 * This test must run AFTER the consumer test has written the pact file.
 * In CI the sequence is enforced by the test:contract script.
 *
 * Pattern: AAA
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { OrderService } from '../../services/order-service/src/OrderService.js';
import { MockRepository, MockEventBus } from '@horus/test-utils';
import { Order } from '../../services/order-service/src/types.js';

// ── Load pact ─────────────────────────────────────────────────────────────

const PACT_FILE = path.resolve(
  process.cwd(),
  'reports/pacts/notification-service-order-service.json'
);

interface PactInteraction {
  description: string;
  message: {
    topic: string;
    contents: Record<string, unknown>;
  };
}

interface Pact {
  consumer: { name: string };
  provider: { name: string };
  interactions: PactInteraction[];
}

let pact: Pact;

beforeAll(() => {
  if (!fs.existsSync(PACT_FILE)) {
    throw new Error(
      `Pact file not found: ${PACT_FILE}\n` +
      `Run the consumer tests first: vitest run tests/contract/consumer.order-notification.test.ts`
    );
  }
  pact = JSON.parse(fs.readFileSync(PACT_FILE, 'utf8'));
});

// ── Provider verification ─────────────────────────────────────────────────

describe('OrderService (provider) — order.created contract verification', () => {
  it('given the notification-service pact when OrderService creates an order then the published payload satisfies all consumer requirements', async () => {
    // Arrange — provider state: a valid create order request
    const eventBus = new MockEventBus();
    const orderRepo = new MockRepository<Order>();
    const orderService = new OrderService(orderRepo, eventBus);

    // Act — trigger the interaction described in the pact
    await orderService.createOrder({
      customerId: 'pact-customer-001',
      items: [{ productId: 'product-001', quantity: 1 }],
    });

    // Assert — provider published order.created
    eventBus.assertPublishedCount('order.created', 1);

    const publishedEvents = eventBus.getPublishedEvents();
    const orderCreatedEvent = publishedEvents.find((e) => e.topic === 'order.created');
    expect(orderCreatedEvent).toBeDefined();

    const publishedPayload = orderCreatedEvent!.data as Record<string, unknown>;

    // Assert — published payload satisfies every field in the pact
    const pactContents = pact.interactions[0].message.contents;

    for (const [field, exampleValue] of Object.entries(pactContents)) {
      expect(publishedPayload).toHaveProperty(field);
      // Type-check: ensure the published type matches the contract type
      expect(typeof publishedPayload[field]).toBe(typeof exampleValue);
    }
  });

  it('given the pact file when loaded then it references the correct consumer and provider', () => {
    // Arrange / Assert — validate pact metadata
    expect(pact.consumer.name).toBe('notification-service');
    expect(pact.provider.name).toBe('order-service');
    expect(pact.interactions.length).toBeGreaterThan(0);
  });
});

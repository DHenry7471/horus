/**
 * Contract Test — Consumer Side
 * Consumer: NotificationService
 * Provider: OrderService
 * Topic:    order.created
 *
 * This test defines the minimum payload shape NotificationService needs from
 * an order.created event. It writes that definition to a pact file so the
 * provider can verify it independently.
 *
 * WHY THIS EXISTS
 * ───────────────
 * Integration tests verify that OrderService and NotificationService work
 * together when wired to the same MockEventBus. But that only catches bugs
 * at test time — if OrderService later changes the order.created payload
 * without updating NotificationService, the integration tests still pass
 * because both sides are compiled together.
 *
 * Contract tests catch interface drift by separating the verification:
 *   1. Consumer defines what it needs (this file) → produces a pact artifact
 *   2. Provider verifies it publishes a payload that satisfies the pact
 *      (see provider.order-service.test.ts)
 *
 * IN PRODUCTION
 * ─────────────
 * This pattern is what @pact-foundation/pact automates. The pact file would
 * be published to a Pact Broker (e.g. PactFlow), enabling the provider to
 * verify against the latest consumer expectations on every CI run. The
 * implementation below is the same logical flow, without the broker.
 *
 * Pattern: AAA
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  NotificationService,
  MockNotificationSender,
} from '../../services/notification-service/src/NotificationService.js';
import { MockRepository, MockEventBus } from '@horus/test-utils';
import { Notification, NotificationStatus } from '../../services/notification-service/src/types.js';

// ── Pact file location ────────────────────────────────────────────────────

const PACTS_DIR = path.resolve(process.cwd(), 'reports/pacts');
const PACT_FILE = path.join(PACTS_DIR, 'notification-service-order-service.json');

// ── Consumer contract definition ──────────────────────────────────────────

/**
 * The minimum fields NotificationService reads from an order.created payload.
 * Any additional fields OrderService publishes are allowed — the contract only
 * asserts what the consumer actually uses.
 */
const ORDER_CREATED_CONTRACT = {
  consumer: 'notification-service',
  provider: 'order-service',
  interactions: [
    {
      description: 'an order.created event',
      providerState: 'an order has been created',
      message: {
        topic: 'order.created',
        // Minimum required fields — shape matters, exact values do not
        contents: {
          orderId: expect.any(String),
          customerId: expect.any(String),
          totalAmount: expect.any(Number),
        },
      },
    },
  ],
  metadata: {
    pactSpecification: { version: '3.0.0' },
    generatedAt: new Date().toISOString(),
  },
};

// ── Write pact file ───────────────────────────────────────────────────────

beforeAll(() => {
  fs.mkdirSync(PACTS_DIR, { recursive: true });
  // Serialise the contract with actual values (not matchers) for provider verification
  const pact = {
    consumer: { name: ORDER_CREATED_CONTRACT.consumer },
    provider: { name: ORDER_CREATED_CONTRACT.provider },
    interactions: [
      {
        description: 'an order.created event',
        providerState: 'an order has been created',
        message: {
          topic: 'order.created',
          contentType: 'application/json',
          contents: {
            orderId: 'pact-order-001',
            customerId: 'pact-customer-001',
            totalAmount: 79.99,
          },
        },
      },
    ],
    metadata: ORDER_CREATED_CONTRACT.metadata,
  };
  fs.writeFileSync(PACT_FILE, JSON.stringify(pact, null, 2));
});

// ── Consumer tests ────────────────────────────────────────────────────────

describe('NotificationService (consumer) — order.created contract', () => {
  it('given a conforming order.created payload when received then NotificationService processes it without error', async () => {
    // Arrange — inject the pact payload directly into NotificationService
    const eventBus = new MockEventBus();
    const notificationRepo = new MockRepository<Notification>();
    const sender = new MockNotificationSender();
    const notificationService = new NotificationService(notificationRepo, eventBus, sender);
    notificationService.registerEventHandlers();

    const pactPayload = {
      orderId: 'pact-order-001',
      customerId: 'pact-customer-001',
      totalAmount: 79.99,
    };

    // Act — simulate the provider publishing the event
    await eventBus.publish('order.created', pactPayload);

    // Assert — consumer handled the event successfully
    const notifications = await notificationService.getNotificationsForRecipient('pact-customer-001');
    expect(notifications).toHaveLength(1);
    expect(notifications[0].status).toBe(NotificationStatus.SENT);
    expect(notifications[0].body).toContain('pact-order-001');
    expect(notifications[0].body).toContain('79.99');
  });

  it('given the pact file was written then it contains the required contract fields', () => {
    // Arrange
    const raw = fs.readFileSync(PACT_FILE, 'utf8');
    const pact = JSON.parse(raw);

    // Assert — pact structure is valid
    expect(pact.consumer.name).toBe('notification-service');
    expect(pact.provider.name).toBe('order-service');
    expect(pact.interactions).toHaveLength(1);

    const contents = pact.interactions[0].message.contents;
    expect(contents).toHaveProperty('orderId');
    expect(contents).toHaveProperty('customerId');
    expect(contents).toHaveProperty('totalAmount');
  });
});

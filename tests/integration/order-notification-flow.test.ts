/**
 * Integration Tests: Order → Notification Cross-Service Flow
 *
 * Scope: Verifies that OrderService and NotificationService interact correctly
 *        through the shared IEventBus contract.
 *
 * Key principle: ALL external dependencies are injected mocks.
 *   - No real database
 *   - No real message broker
 *   - No real email/SMS sender
 *   - No network calls
 *
 * This is the "integration" layer of the test pyramid: we test how our services
 * integrate with each other, not how they integrate with infrastructure.
 *
 * Pattern: AAA (Arrange → Act → Assert)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OrderService, ORDER_EVENTS } from '../../services/order-service/src/OrderService.js';
import {
  NotificationService,
  MockNotificationSender,
} from '../../services/notification-service/src/NotificationService.js';
import { MockRepository, MockEventBus, anOrder } from '@horus/test-utils';
import { Order, OrderStatus } from '../../services/order-service/src/types.js';
import { Notification, NotificationStatus } from '../../services/notification-service/src/types.js';

describe('Order → Notification Integration', () => {
  let orderService: OrderService;
  let notificationService: NotificationService;
  let mockEventBus: MockEventBus;
  let mockOrderRepo: MockRepository<Order>;
  let mockNotificationRepo: MockRepository<Notification>;
  let mockSender: MockNotificationSender;

  beforeEach(() => {
    // Arrange — wire the entire system with injected doubles
    mockEventBus = new MockEventBus();
    mockOrderRepo = new MockRepository<Order>();
    mockNotificationRepo = new MockRepository<Notification>();
    mockSender = new MockNotificationSender();

    orderService = new OrderService(mockOrderRepo, mockEventBus);
    notificationService = new NotificationService(mockNotificationRepo, mockEventBus, mockSender);

    // Register event handlers (simulates service startup)
    notificationService.registerEventHandlers();
  });

  // ── Order creation flow ──────────────────────────────────────────────────

  describe('order creation', () => {
    it('given new order when created then notification service sends confirmation email', async () => {
      // Arrange
      const request = {
        customerId: 'customer-001',
        items: [{ productId: 'product-001', quantity: 1 }],
      };

      // Act
      const order = await orderService.createOrder(request);

      // Assert — event was published
      mockEventBus.assertPublishedCount(ORDER_EVENTS.CREATED, 1);

      // Assert — notification was dispatched
      const sent = mockSender.getSent();
      expect(sent).toHaveLength(1);
      expect(sent[0].recipientId).toBe('customer-001');
      expect(sent[0].subject).toContain('Thank you');

      // Assert — notification was persisted with SENT status
      const persisted = await notificationService.getNotificationsForRecipient('customer-001');
      expect(persisted).toHaveLength(1);
      expect(persisted[0].status).toBe(NotificationStatus.SENT);

      // Sanity — order reference is correct
      expect(sent[0].body).toContain(order.id);
    });
  });

  // ── Order confirmation flow ──────────────────────────────────────────────

  describe('order confirmation', () => {
    it('given existing order when confirmed then customer receives processing notification', async () => {
      // Arrange
      const order = anOrder().withCustomerId('customer-002').withStatus(OrderStatus.PENDING).build();
      await mockOrderRepo.save(order);

      // Act
      await orderService.confirmOrder(order.id);

      // Assert
      mockEventBus.assertPublishedCount(ORDER_EVENTS.CONFIRMED, 1);
      const sent = mockSender.getSent();
      expect(sent).toHaveLength(1);
      expect(sent[0].subject).toContain('processed');
    });
  });

  // ── Order cancellation flow ──────────────────────────────────────────────

  describe('order cancellation', () => {
    it('given existing order when cancelled then customer receives cancellation notification with reason', async () => {
      // Arrange
      const order = anOrder().withCustomerId('customer-003').withStatus(OrderStatus.PENDING).build();
      await mockOrderRepo.save(order);
      const cancellationReason = 'Item out of stock';

      // Act
      await orderService.cancelOrder(order.id, cancellationReason);

      // Assert
      const sent = mockSender.getSent();
      expect(sent).toHaveLength(1);
      expect(sent[0].body).toContain(cancellationReason);
      expect(sent[0].subject).toContain('cancelled');
    });
  });

  // ── Notification failure resilience ─────────────────────────────────────

  describe('notification sender failure', () => {
    it('given sender failure when order is created then notification is persisted as FAILED status', async () => {
      // Arrange
      mockSender.shouldFail = true;
      const request = {
        customerId: 'customer-004',
        items: [{ productId: 'product-002', quantity: 1 }],
      };

      // Act
      await orderService.createOrder(request);

      // Assert — order still created successfully
      expect(mockOrderRepo.size()).toBe(1);

      // Assert — notification stored with FAILED status (not lost)
      const notifications = await notificationService.getNotificationsForRecipient('customer-004');
      expect(notifications).toHaveLength(1);
      expect(notifications[0].status).toBe(NotificationStatus.FAILED);
    });
  });

  // ── Full lifecycle ────────────────────────────────────────────────────────

  describe('full order lifecycle', () => {
    it('given order when progressing through lifecycle then correct notifications are sent at each stage', async () => {
      // Arrange
      const customerId = 'customer-005';
      const request = {
        customerId,
        items: [{ productId: 'product-003', quantity: 1 }],
      };

      // Act — create → confirm
      const order = await orderService.createOrder(request);
      await orderService.confirmOrder(order.id);

      // Assert — two notifications total
      const allNotifications = await notificationService.getNotificationsForRecipient(customerId);
      expect(allNotifications).toHaveLength(2);
      expect(allNotifications.every((n) => n.status === NotificationStatus.SENT)).toBe(true);

      // Assert — events in correct order
      const events = mockEventBus.getPublishedEvents();
      expect(events[0].topic).toBe(ORDER_EVENTS.CREATED);
      expect(events[1].topic).toBe(ORDER_EVENTS.CONFIRMED);
    });
  });
});

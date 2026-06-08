/**
 * Unit Tests: OrderService
 *
 * Scope: Pure business logic — validation, calculations, state transitions.
 * Dependencies: MockRepository + MockEventBus (from @wutangbanger/horus-test-utils)
 * External services: NONE. Zero network calls. Zero I/O.
 *
 * Pattern: AAA (Arrange → Act → Assert) enforced per test.
 * Naming: "given [context] when [action] then [expected outcome]"
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OrderService, ORDER_EVENTS } from '../../services/order-service/src/OrderService.js';
import { MockRepository, MockEventBus } from '@wutangbanger/horus-test-utils';
import { Order, OrderStatus } from '../../services/order-service/src/types.js';
import { anOrder } from '@wutangbanger/horus-test-utils';

describe('OrderService', () => {
  let orderService: OrderService;
  let mockRepo: MockRepository<Order>;
  let mockEventBus: MockEventBus;

  beforeEach(() => {
    // Arrange — fresh doubles for every test, no shared state
    mockRepo = new MockRepository<Order>();
    mockEventBus = new MockEventBus();
    orderService = new OrderService(mockRepo, mockEventBus);
  });

  // ── createOrder ──────────────────────────────────────────────────────────

  describe('createOrder', () => {
    it('given valid request when creating order then persists order with PENDING status', async () => {
      // Arrange
      const request = {
        customerId: 'customer-001',
        items: [{ productId: 'product-001', quantity: 2 }],
      };

      // Act
      const result = await orderService.createOrder(request);

      // Assert
      expect(result.status).toBe(OrderStatus.PENDING);
      expect(result.customerId).toBe('customer-001');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('Wireless Headphones');
      expect(mockRepo.size()).toBe(1);
    });

    it('given valid request when creating order then calculates total amount correctly', async () => {
      // Arrange
      const request = {
        customerId: 'customer-001',
        items: [
          { productId: 'product-001', quantity: 2 }, // 79.99 * 2 = 159.98
          { productId: 'product-002', quantity: 1 }, // 34.99 * 1 = 34.99
        ],
      };

      // Act
      const result = await orderService.createOrder(request);

      // Assert — 159.98 + 34.99 = 194.97
      expect(result.totalAmount).toBe(194.97);
    });

    it('given valid request when creating order then publishes order.created event', async () => {
      // Arrange
      const request = {
        customerId: 'customer-001',
        items: [{ productId: 'product-001', quantity: 1 }],
      };

      // Act
      await orderService.createOrder(request);

      // Assert
      mockEventBus.assertPublishedCount(ORDER_EVENTS.CREATED, 1);
      mockEventBus.assertPublished(ORDER_EVENTS.CREATED, (data) => {
        const d = data as { customerId: string };
        return d.customerId === 'customer-001';
      });
    });

    it('given empty customerId when creating order then throws validation error', async () => {
      // Arrange
      const request = { customerId: '  ', items: [{ productId: 'product-001', quantity: 1 }] };

      // Act & Assert
      await expect(orderService.createOrder(request)).rejects.toThrow('customerId is required');
    });

    it('given no items when creating order then throws validation error', async () => {
      // Arrange
      const request = { customerId: 'customer-001', items: [] };

      // Act & Assert
      await expect(orderService.createOrder(request)).rejects.toThrow(
        'Order must contain at least one item'
      );
    });

    it('given unknown productId when creating order then throws validation error', async () => {
      // Arrange
      const request = {
        customerId: 'customer-001',
        items: [{ productId: 'product-does-not-exist', quantity: 1 }],
      };

      // Act & Assert
      await expect(orderService.createOrder(request)).rejects.toThrow('Unknown productId');
    });

    it('given zero quantity when creating order then throws validation error', async () => {
      // Arrange
      const request = {
        customerId: 'customer-001',
        items: [{ productId: 'product-001', quantity: 0 }],
      };

      // Act & Assert
      await expect(orderService.createOrder(request)).rejects.toThrow('Invalid quantity');
    });
  });

  // ── confirmOrder ─────────────────────────────────────────────────────────

  describe('confirmOrder', () => {
    it('given PENDING order when confirming then transitions to CONFIRMED', async () => {
      // Arrange
      const order = anOrder().withStatus(OrderStatus.PENDING).build();
      await mockRepo.save(order);

      // Act
      const result = await orderService.confirmOrder(order.id);

      // Assert
      expect(result.status).toBe(OrderStatus.CONFIRMED);
    });

    it('given PENDING order when confirming then publishes order.confirmed event', async () => {
      // Arrange
      const order = anOrder().withStatus(OrderStatus.PENDING).build();
      await mockRepo.save(order);

      // Act
      await orderService.confirmOrder(order.id);

      // Assert
      mockEventBus.assertPublishedCount(ORDER_EVENTS.CONFIRMED, 1);
    });

    it('given CONFIRMED order when confirming again then throws state transition error', async () => {
      // Arrange
      const order = anOrder().withStatus(OrderStatus.CONFIRMED).build();
      await mockRepo.save(order);

      // Act & Assert
      await expect(orderService.confirmOrder(order.id)).rejects.toThrow(
        'Cannot confirm order in status "CONFIRMED"'
      );
    });

    it('given non-existent orderId when confirming then throws not found error', async () => {
      // Arrange — empty repo, no seed data

      // Act & Assert
      await expect(orderService.confirmOrder('ghost-id')).rejects.toThrow('Order not found');
    });
  });

  // ── shipOrder ────────────────────────────────────────────────────────────

  describe('shipOrder', () => {
    it('given CONFIRMED order when shipping then transitions to SHIPPED with tracking number', async () => {
      // Arrange
      const order = anOrder().withStatus(OrderStatus.CONFIRMED).build();
      await mockRepo.save(order);

      // Act
      const result = await orderService.shipOrder(order.id, 'TRACK-001');

      // Assert
      expect(result.status).toBe(OrderStatus.SHIPPED);
      expect(result.trackingNumber).toBe('TRACK-001');
    });

    it('given CONFIRMED order when shipping then publishes order.shipped event with tracking number', async () => {
      // Arrange
      const order = anOrder().withStatus(OrderStatus.CONFIRMED).build();
      await mockRepo.save(order);

      // Act
      await orderService.shipOrder(order.id, 'TRACK-002');

      // Assert
      mockEventBus.assertPublishedCount(ORDER_EVENTS.SHIPPED, 1);
      mockEventBus.assertPublished(ORDER_EVENTS.SHIPPED, (data) => {
        const d = data as { trackingNumber: string };
        return d.trackingNumber === 'TRACK-002';
      });
    });

    it('given PENDING order when shipping then throws state transition error', async () => {
      // Arrange
      const order = anOrder().withStatus(OrderStatus.PENDING).build();
      await mockRepo.save(order);

      // Act & Assert
      await expect(orderService.shipOrder(order.id, 'TRACK-003')).rejects.toThrow(
        'Cannot ship order in status "PENDING"'
      );
    });

    it('given empty tracking number when shipping then throws validation error', async () => {
      // Arrange
      const order = anOrder().withStatus(OrderStatus.CONFIRMED).build();
      await mockRepo.save(order);

      // Act & Assert
      await expect(orderService.shipOrder(order.id, '  ')).rejects.toThrow(
        'trackingNumber is required'
      );
    });

    it('given non-existent orderId when shipping then throws not found error', async () => {
      // Arrange — empty repo

      // Act & Assert
      await expect(orderService.shipOrder('ghost-id', 'TRACK-004')).rejects.toThrow('Order not found');
    });
  });

  // ── cancelOrder ──────────────────────────────────────────────────────────

  describe('cancelOrder', () => {
    it('given PENDING order when cancelling then transitions to CANCELLED', async () => {
      // Arrange
      const order = anOrder().withStatus(OrderStatus.PENDING).build();
      await mockRepo.save(order);

      // Act
      const result = await orderService.cancelOrder(order.id, 'Customer request');

      // Assert
      expect(result.status).toBe(OrderStatus.CANCELLED);
    });

    it('given SHIPPED order when cancelling then throws because cancellation is not allowed', async () => {
      // Arrange
      const order = anOrder().withStatus(OrderStatus.SHIPPED).build();
      await mockRepo.save(order);

      // Act & Assert
      await expect(orderService.cancelOrder(order.id, 'Too late')).rejects.toThrow(
        'Cannot cancel order in status "SHIPPED"'
      );
    });
  });

  // ── getOrder ─────────────────────────────────────────────────────────────

  describe('getOrder', () => {
    it('given an existing order when getOrder is called then returns the order', async () => {
      // Arrange
      const order = anOrder().build();
      await mockRepo.save(order);

      // Act
      const result = await orderService.getOrder(order.id);

      // Assert
      expect(result.id).toBe(order.id);
    });

    it('given a nonexistent id when getOrder is called then throws not found error', async () => {
      // Act & Assert
      await expect(orderService.getOrder('ghost-id')).rejects.toThrow('Order not found');
    });
  });

  // ── getOrdersByCustomer ──────────────────────────────────────────────────

  describe('getOrdersByCustomer', () => {
    it('given multiple orders when filtering by customer then returns only that customers orders', async () => {
      // Arrange
      const customerAOrders = anOrder().buildMany(3).map((o) => ({
        ...o,
        customerId: 'customer-A',
      }));
      const customerBOrder = anOrder().withCustomerId('customer-B').build();

      for (const o of [...customerAOrders, customerBOrder]) {
        await mockRepo.save(o);
      }

      // Act
      const result = await orderService.getOrdersByCustomer('customer-A');

      // Assert
      expect(result).toHaveLength(3);
      expect(result.every((o) => o.customerId === 'customer-A')).toBe(true);
    });
  });
});

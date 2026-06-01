/**
 * Test Data Builders
 *
 * Implements the Builder pattern for constructing test fixtures.
 * Provides sensible defaults so tests only declare what's relevant to their scenario.
 * Eliminates brittle fixture files and makes test intent obvious.
 */

import { Order, OrderStatus, OrderItem } from '../../../example/services/order-service/src/types.js';
import { Notification, NotificationChannel, NotificationStatus } from '../../../example/services/notification-service/src/types.js';

// ── Order Builder ──────────────────────────────────────────────────────────

export class OrderBuilder {
  private order: Order = {
    id: crypto.randomUUID(),
    customerId: 'customer-001',
    status: OrderStatus.PENDING,
    items: [
      {
        productId: 'product-001',
        name: 'Test Product',
        quantity: 1,
        unitPrice: 29.99,
      },
    ],
    totalAmount: 29.99,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  withId(id: string): this {
    this.order.id = id;
    return this;
  }

  withCustomerId(customerId: string): this {
    this.order.customerId = customerId;
    return this;
  }

  withStatus(status: OrderStatus): this {
    this.order.status = status;
    return this;
  }

  withItems(items: OrderItem[]): this {
    this.order.items = items;
    this.order.totalAmount = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
    return this;
  }

  withTotalAmount(amount: number): this {
    this.order.totalAmount = amount;
    return this;
  }

  build(): Order {
    return { ...this.order };
  }

  /** Convenience: build multiple orders with incrementing IDs */
  buildMany(count: number): Order[] {
    return Array.from({ length: count }, (_, i) =>
      new OrderBuilder().withId(`order-${String(i + 1).padStart(3, '0')}`).build()
    );
  }
}

// ── Notification Builder ───────────────────────────────────────────────────

export class NotificationBuilder {
  private notification: Notification = {
    id: crypto.randomUUID(),
    recipientId: 'customer-001',
    channel: NotificationChannel.EMAIL,
    status: NotificationStatus.PENDING,
    subject: 'Your order has been placed',
    body: 'Thank you for your order.',
    correlationId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };

  withRecipientId(recipientId: string): this {
    this.notification.recipientId = recipientId;
    return this;
  }

  withChannel(channel: NotificationChannel): this {
    this.notification.channel = channel;
    return this;
  }

  withStatus(status: NotificationStatus): this {
    this.notification.status = status;
    return this;
  }

  withSubject(subject: string): this {
    this.notification.subject = subject;
    return this;
  }

  withCorrelationId(correlationId: string): this {
    this.notification.correlationId = correlationId;
    return this;
  }

  build(): Notification {
    return { ...this.notification };
  }
}

// ── Convenience factory functions ──────────────────────────────────────────

export const anOrder = () => new OrderBuilder();
export const aNotification = () => new NotificationBuilder();

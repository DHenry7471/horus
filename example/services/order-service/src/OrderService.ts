/**
 * OrderService
 *
 * Pure business logic layer. Depends on IRepository and IEventBus interfaces
 * from @wutangbanger/horus-contracts — never on concrete implementations, and crucially
 * never on @wutangbanger/horus-test-utils (test infrastructure).
 *
 * This separation is what makes integration tests possible without real infrastructure.
 */

import { IRepository, IEventBus } from '@wutangbanger/horus-contracts';
import { Order, OrderStatus, CreateOrderRequest, OrderItem, ValidationError, NotFoundError } from './types.js';

export const ORDER_EVENTS = {
  CREATED: 'order.created',
  CONFIRMED: 'order.confirmed',
  CANCELLED: 'order.cancelled',
  SHIPPED: 'order.shipped',
} as const;

// Product catalog stub — in production this would call a Products service
const PRODUCT_CATALOG: Record<string, { name: string; unitPrice: number }> = {
  'product-001': { name: 'Wireless Headphones', unitPrice: 79.99 },
  'product-002': { name: 'USB-C Hub', unitPrice: 34.99 },
  'product-003': { name: 'Mechanical Keyboard', unitPrice: 129.99 },
};

export class OrderService {
  constructor(
    private readonly orderRepository: IRepository<Order>,
    private readonly eventBus: IEventBus
  ) {}

  async createOrder(request: CreateOrderRequest): Promise<Order> {
    this.validateCreateRequest(request);

    const items = this.enrichItems(request.items);
    const totalAmount = this.calculateTotal(items);

    const order: Order = {
      id: crypto.randomUUID(),
      customerId: request.customerId,
      status: OrderStatus.PENDING,
      items,
      totalAmount,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const saved = await this.orderRepository.save(order);

    await this.eventBus.publish(ORDER_EVENTS.CREATED, {
      orderId: saved.id,
      customerId: saved.customerId,
      totalAmount: saved.totalAmount,
    });

    return saved;
  }

  async confirmOrder(orderId: string): Promise<Order> {
    const order = await this.findOrThrow(orderId);

    if (order.status !== OrderStatus.PENDING) {
      throw new ValidationError(
        `Cannot confirm order in status "${order.status}". Expected PENDING.`
      );
    }

    const updated = await this.orderRepository.update(orderId, {
      status: OrderStatus.CONFIRMED,
      updatedAt: new Date().toISOString(),
    });

    await this.eventBus.publish(ORDER_EVENTS.CONFIRMED, {
      orderId,
      customerId: order.customerId,
    });

    return updated!;
  }

  async cancelOrder(orderId: string, reason: string): Promise<Order> {
    const order = await this.findOrThrow(orderId);

    const cancellableStatuses = [OrderStatus.PENDING, OrderStatus.CONFIRMED];
    if (!cancellableStatuses.includes(order.status)) {
      throw new ValidationError(
        `Cannot cancel order in status "${order.status}".`
      );
    }

    const updated = await this.orderRepository.update(orderId, {
      status: OrderStatus.CANCELLED,
      updatedAt: new Date().toISOString(),
    });

    await this.eventBus.publish(ORDER_EVENTS.CANCELLED, {
      orderId,
      customerId: order.customerId,
      reason,
    });

    return updated!;
  }

  async shipOrder(orderId: string, trackingNumber: string): Promise<Order> {
    const order = await this.findOrThrow(orderId);

    if (order.status !== OrderStatus.CONFIRMED) {
      throw new ValidationError(
        `Cannot ship order in status "${order.status}". Expected CONFIRMED.`
      );
    }

    if (!trackingNumber?.trim()) {
      throw new ValidationError('trackingNumber is required to ship an order');
    }

    const updated = await this.orderRepository.update(orderId, {
      status: OrderStatus.SHIPPED,
      trackingNumber,
      updatedAt: new Date().toISOString(),
    });

    await this.eventBus.publish(ORDER_EVENTS.SHIPPED, {
      orderId,
      customerId: order.customerId,
      trackingNumber,
    });

    return updated!;
  }

  async getOrder(orderId: string): Promise<Order> {
    return this.findOrThrow(orderId);
  }

  async getOrdersByCustomer(customerId: string): Promise<Order[]> {
    return this.orderRepository.findWhere((o) => o.customerId === customerId);
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private validateCreateRequest(request: CreateOrderRequest): void {
    if (!request.customerId?.trim()) {
      throw new ValidationError('customerId is required');
    }
    if (!request.items?.length) {
      throw new ValidationError('Order must contain at least one item');
    }
    for (const item of request.items) {
      if (item.quantity < 1) {
        throw new ValidationError(`Invalid quantity ${item.quantity} for product ${item.productId}`);
      }
      if (!PRODUCT_CATALOG[item.productId]) {
        throw new ValidationError(`Unknown productId: ${item.productId}`);
      }
    }
  }

  private enrichItems(items: CreateOrderRequest['items']): OrderItem[] {
    return items.map((item) => {
      const product = PRODUCT_CATALOG[item.productId];
      return {
        productId: item.productId,
        name: product.name,
        quantity: item.quantity,
        unitPrice: product.unitPrice,
      };
    });
  }

  private calculateTotal(items: OrderItem[]): number {
    const raw = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    return Math.round(raw * 100) / 100;
  }

  private async findOrThrow(orderId: string): Promise<Order> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundError(`Order not found: ${orderId}`);
    }
    return order;
  }
}

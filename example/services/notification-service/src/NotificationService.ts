/**
 * NotificationService
 *
 * Listens to order domain events via IEventBus and dispatches notifications.
 * Depends on @wutangbanger/horus-contracts for interfaces — never on @wutangbanger/horus-test-utils.
 * The INotificationSender interface allows swapping real email/SMS providers
 * with mocks at the integration test layer.
 */

import { IEventBus, IRepository, EventPayload } from '@wutangbanger/horus-contracts';
import { Notification, NotificationChannel, NotificationStatus } from './types.js';
import { ORDER_EVENTS } from '../../order-service/src/OrderService.js';

export interface INotificationSender {
  send(notification: Notification): Promise<{ success: boolean; externalId?: string }>;
}

export class MockNotificationSender implements INotificationSender {
  private sent: Notification[] = [];
  shouldFail = false;

  async send(notification: Notification): Promise<{ success: boolean }> {
    if (this.shouldFail) {
      return { success: false };
    }
    this.sent.push(notification);
    return { success: true };
  }

  getSent(): Notification[] {
    return [...this.sent];
  }

  reset(): void {
    this.sent = [];
    this.shouldFail = false;
  }
}

export class NotificationService {
  constructor(
    private readonly notificationRepository: IRepository<Notification>,
    private readonly eventBus: IEventBus,
    private readonly sender: INotificationSender
  ) {}

  /** Subscribe to all relevant domain events */
  registerEventHandlers(): void {
    this.eventBus.subscribe(ORDER_EVENTS.CREATED, (event) =>
      this.handleOrderCreated(event)
    );
    this.eventBus.subscribe(ORDER_EVENTS.CONFIRMED, (event) =>
      this.handleOrderConfirmed(event)
    );
    this.eventBus.subscribe(ORDER_EVENTS.CANCELLED, (event) =>
      this.handleOrderCancelled(event)
    );
  }

  async getNotificationsForRecipient(recipientId: string): Promise<Notification[]> {
    return this.notificationRepository.findWhere((n) => n.recipientId === recipientId);
  }

  // ── Private event handlers ──────────────────────────────────────────────

  private async handleOrderCreated(event: EventPayload): Promise<void> {
    const data = event.data as { orderId: string; customerId: string; totalAmount: number };
    await this.dispatch({
      recipientId: data.customerId,
      channel: NotificationChannel.EMAIL,
      subject: 'Order Confirmed — Thank you!',
      body: `Your order #${data.orderId} for $${data.totalAmount.toFixed(2)} has been received.`,
      correlationId: event.correlationId,
    });
  }

  private async handleOrderConfirmed(event: EventPayload): Promise<void> {
    const data = event.data as { orderId: string; customerId: string };
    await this.dispatch({
      recipientId: data.customerId,
      channel: NotificationChannel.EMAIL,
      subject: 'Your order is being processed',
      body: `Order #${data.orderId} has been confirmed and is being prepared.`,
      correlationId: event.correlationId,
    });
  }

  private async handleOrderCancelled(event: EventPayload): Promise<void> {
    const data = event.data as { orderId: string; customerId: string; reason: string };
    await this.dispatch({
      recipientId: data.customerId,
      channel: NotificationChannel.EMAIL,
      subject: 'Your order has been cancelled',
      body: `Order #${data.orderId} was cancelled. Reason: ${data.reason}.`,
      correlationId: event.correlationId,
    });
  }

  private async dispatch(params: {
    recipientId: string;
    channel: NotificationChannel;
    subject: string;
    body: string;
    correlationId: string;
  }): Promise<void> {
    const notification: Notification = {
      id: crypto.randomUUID(),
      status: NotificationStatus.PENDING,
      createdAt: new Date().toISOString(),
      ...params,
    };

    await this.notificationRepository.save(notification);

    const result = await this.sender.send(notification);

    await this.notificationRepository.update(notification.id, {
      status: result.success ? NotificationStatus.SENT : NotificationStatus.FAILED,
      sentAt: result.success ? new Date().toISOString() : undefined,
    });
  }
}

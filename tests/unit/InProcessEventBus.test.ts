import { describe, it, expect, vi } from 'vitest';
import { InProcessEventBus } from '../../services/order-service/src/InProcessEventBus.js';

describe('InProcessEventBus', () => {
  // ── publish ──────────────────────────────────────────────────────────────

  describe('publish', () => {
    it('given a subscriber when event is published then handler is called with correct payload', async () => {
      // Arrange
      const bus = new InProcessEventBus();
      const handler = vi.fn();
      bus.subscribe('order.created', handler);

      // Act
      await bus.publish('order.created', { orderId: '123' });

      // Assert
      expect(handler).toHaveBeenCalledOnce();
      const payload = handler.mock.calls[0][0];
      expect(payload.topic).toBe('order.created');
      expect(payload.data).toEqual({ orderId: '123' });
      expect(typeof payload.timestamp).toBe('number');
      expect(typeof payload.correlationId).toBe('string');
    });

    it('given a provided correlationId when event is published then payload carries it through', async () => {
      // Arrange
      const bus = new InProcessEventBus();
      const handler = vi.fn();
      bus.subscribe('order.created', handler);

      // Act
      await bus.publish('order.created', {}, 'my-correlation-id');

      // Assert
      expect(handler.mock.calls[0][0].correlationId).toBe('my-correlation-id');
    });

    it('given multiple subscribers on same topic when event is published then all handlers are called', async () => {
      // Arrange
      const bus = new InProcessEventBus();
      const handlerA = vi.fn();
      const handlerB = vi.fn();
      bus.subscribe('order.created', handlerA);
      bus.subscribe('order.created', handlerB);

      // Act
      await bus.publish('order.created', {});

      // Assert
      expect(handlerA).toHaveBeenCalledOnce();
      expect(handlerB).toHaveBeenCalledOnce();
    });

    it('given no subscribers when event is published then no error is thrown', async () => {
      // Arrange
      const bus = new InProcessEventBus();

      // Act + Assert
      await expect(bus.publish('order.created', {})).resolves.toBeUndefined();
    });

    it('given subscribers on different topics when event is published then only matching handler is called', async () => {
      // Arrange
      const bus = new InProcessEventBus();
      const createdHandler = vi.fn();
      const cancelledHandler = vi.fn();
      bus.subscribe('order.created', createdHandler);
      bus.subscribe('order.cancelled', cancelledHandler);

      // Act
      await bus.publish('order.created', {});

      // Assert
      expect(createdHandler).toHaveBeenCalledOnce();
      expect(cancelledHandler).not.toHaveBeenCalled();
    });
  });

  // ── unsubscribeAll ───────────────────────────────────────────────────────

  describe('unsubscribeAll', () => {
    it('given active subscribers when unsubscribeAll is called then no handlers are invoked on subsequent publish', async () => {
      // Arrange
      const bus = new InProcessEventBus();
      const handler = vi.fn();
      bus.subscribe('order.created', handler);

      // Act
      bus.unsubscribeAll();
      await bus.publish('order.created', {});

      // Assert
      expect(handler).not.toHaveBeenCalled();
    });
  });
});

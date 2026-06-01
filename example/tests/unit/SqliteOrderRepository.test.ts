import { describe, it, expect, beforeEach } from 'vitest';
import { SqliteOrderRepository } from '../../services/order-service/src/SqliteOrderRepository.js';
import { OrderStatus } from '../../services/order-service/src/types.js';
import { anOrder } from '@wutangbanger/horus-test-utils';

describe('SqliteOrderRepository', () => {
  let repo: SqliteOrderRepository;

  beforeEach(() => {
    repo = new SqliteOrderRepository(':memory:');
  });

  // ── findById ─────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('given a saved order when findById is called then returns the order', async () => {
      // Arrange
      const order = anOrder().build();
      await repo.save(order);

      // Act
      const result = await repo.findById(order.id);

      // Assert
      expect(result).toEqual(order);
    });

    it('given no matching order when findById is called then returns null', async () => {
      // Act
      const result = await repo.findById('nonexistent-id');

      // Assert
      expect(result).toBeNull();
    });
  });

  // ── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('given an empty repository when findAll is called then returns empty array', async () => {
      // Act
      const result = await repo.findAll();

      // Assert
      expect(result).toEqual([]);
    });

    it('given multiple saved orders when findAll is called then returns all orders', async () => {
      // Arrange
      const orderA = anOrder().build();
      const orderB = anOrder().build();
      await repo.save(orderA);
      await repo.save(orderB);

      // Act
      const result = await repo.findAll();

      // Assert
      expect(result).toHaveLength(2);
    });
  });

  // ── findWhere ────────────────────────────────────────────────────────────

  describe('findWhere', () => {
    it('given orders with different statuses when filtered by status then returns only matching orders', async () => {
      // Arrange
      const pending = anOrder().withStatus(OrderStatus.PENDING).build();
      const confirmed = anOrder().withStatus(OrderStatus.CONFIRMED).build();
      await repo.save(pending);
      await repo.save(confirmed);

      // Act
      const result = await repo.findWhere((o) => o.status === OrderStatus.CONFIRMED);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(confirmed.id);
    });
  });

  // ── save ─────────────────────────────────────────────────────────────────

  describe('save', () => {
    it('given a new order when saved then returns the same order', async () => {
      // Arrange
      const order = anOrder().build();

      // Act
      const result = await repo.save(order);

      // Assert
      expect(result).toEqual(order);
    });
  });

  // ── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('given an existing order when updated then returns the merged order', async () => {
      // Arrange
      const order = anOrder().withStatus(OrderStatus.PENDING).build();
      await repo.save(order);

      // Act
      const result = await repo.update(order.id, { status: OrderStatus.CONFIRMED });

      // Assert
      expect(result).not.toBeNull();
      expect(result!.status).toBe(OrderStatus.CONFIRMED);
      expect(result!.id).toBe(order.id);
    });

    it('given a nonexistent id when updated then returns null', async () => {
      // Act
      const result = await repo.update('nonexistent-id', { status: OrderStatus.CONFIRMED });

      // Assert
      expect(result).toBeNull();
    });
  });

  // ── delete ───────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('given an existing order when deleted then returns true and order is gone', async () => {
      // Arrange
      const order = anOrder().build();
      await repo.save(order);

      // Act
      const deleted = await repo.delete(order.id);

      // Assert
      expect(deleted).toBe(true);
      expect(await repo.findById(order.id)).toBeNull();
    });

    it('given a nonexistent id when deleted then returns false', async () => {
      // Act
      const result = await repo.delete('nonexistent-id');

      // Assert
      expect(result).toBe(false);
    });
  });

  // ── close ────────────────────────────────────────────────────────────────

  describe('close', () => {
    it('given an open connection when close is called then does not throw', () => {
      // Act + Assert
      expect(() => repo.close()).not.toThrow();
    });
  });
});

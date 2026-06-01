/**
 * MockRepository<T>
 *
 * Generic in-memory repository implementing IRepository<T> from @wutangbanger/horus-contracts.
 * Replaces any real DB adapter at the integration test layer — no DB connection needed.
 */

import { IRepository } from '@wutangbanger/horus-contracts';

export { IRepository };

export class MockRepository<T extends { id: string }> implements IRepository<T> {
  private store = new Map<string, T>();
  private callLog: Array<{ method: string; args: unknown[] }> = [];

  constructor(seed: T[] = []) {
    for (const item of seed) {
      this.store.set(item.id, item);
    }
  }

  async findById(id: string): Promise<T | null> {
    this.log('findById', [id]);
    return this.store.get(id) ?? null;
  }

  async findAll(): Promise<T[]> {
    this.log('findAll', []);
    return Array.from(this.store.values());
  }

  async findWhere(predicate: (item: T) => boolean): Promise<T[]> {
    this.log('findWhere', []);
    return Array.from(this.store.values()).filter(predicate);
  }

  async save(entity: T): Promise<T> {
    this.log('save', [entity]);
    this.store.set(entity.id, entity);
    return entity;
  }

  async update(id: string, patch: Partial<T>): Promise<T | null> {
    this.log('update', [id, patch]);
    const existing = this.store.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...patch };
    this.store.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    this.log('delete', [id]);
    return this.store.delete(id);
  }

  // ── Test assertion helpers ─────────────────────────────────────────────

  getCallLog() {
    return [...this.callLog];
  }

  assertCalledWith(method: string, expectedArgs: unknown[]) {
    const call = this.callLog.find(
      (c) => c.method === method && JSON.stringify(c.args) === JSON.stringify(expectedArgs)
    );
    if (!call) {
      throw new Error(
        `Expected method "${method}" to be called with ${JSON.stringify(expectedArgs)}.\nCall log: ${JSON.stringify(this.callLog, null, 2)}`
      );
    }
  }

  size(): number {
    return this.store.size;
  }

  reset(): void {
    this.store.clear();
    this.callLog = [];
  }

  private log(method: string, args: unknown[]) {
    this.callLog.push({ method, args });
  }
}

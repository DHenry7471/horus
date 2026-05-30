/**
 * MockRepository<T>
 *
 * Generic in-memory repository. Replaces any real DB adapter (Postgres, Mongo, etc.)
 * at the integration test layer. Production repositories implement IRepository<T>;
 * tests inject MockRepository<T> so no real DB connection is needed.
 */

export interface IRepository<T extends { id: string }> {
  findById(id: string): Promise<T | null>;
  findAll(): Promise<T[]>;
  findWhere(predicate: (item: T) => boolean): Promise<T[]>;
  save(entity: T): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T | null>;
  delete(id: string): Promise<boolean>;
}

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

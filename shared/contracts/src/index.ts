/**
 * @horus/contracts
 *
 * Pure interface definitions shared between production services and test infrastructure.
 * No implementations here — just contracts. Production code depends on this;
 * test-utils implements these interfaces.
 *
 * This separation ensures production services never depend on test code.
 */

// ── Event Bus ─────────────────────────────────────────────────────────────

export interface EventPayload {
  topic: string;
  data: unknown;
  timestamp: number;
  correlationId: string;
}

export interface IEventBus {
  publish(topic: string, data: unknown, correlationId?: string): Promise<void>;
  subscribe(topic: string, handler: (payload: EventPayload) => void): void;
  unsubscribeAll(): void;
}

// ── Repository ────────────────────────────────────────────────────────────

export interface IRepository<T extends { id: string }> {
  findById(id: string): Promise<T | null>;
  findAll(): Promise<T[]>;
  findWhere(predicate: (item: T) => boolean): Promise<T[]>;
  save(entity: T): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T | null>;
  delete(id: string): Promise<boolean>;
}

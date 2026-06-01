/**
 * SqliteOrderRepository
 *
 * Concrete IRepository<Order> backed by SQLite via Node's built-in node:sqlite.
 * This is the production implementation wired into server.ts. Tests use
 * MockRepository<Order> from @wutangbanger/horus-test-utils instead — that boundary is what
 * makes unit and integration tests infrastructure-free.
 *
 * The schema uses a single `orders` table with the Order serialised as JSON in
 * a `data` column. This keeps the implementation simple while demonstrating the
 * full DI pattern: swap this class for a PostgresOrderRepository by changing
 * one line in server.ts.
 *
 * Note: node:sqlite is available from Node 22.5+ (experimental flag not required
 * at runtime; the warning only appears when using --experimental-* flags).
 */

// @ts-expect-error — node:sqlite types are not yet in @types/node for Node 22
import { DatabaseSync } from 'node:sqlite';
import { IRepository } from '@wutangbanger/horus-contracts';
import { Order } from './types.js';

export class SqliteOrderRepository implements IRepository<Order> {
  private readonly db: InstanceType<typeof DatabaseSync>;

  constructor(dbPath: string = ':memory:') {
    this.db = new DatabaseSync(dbPath);
    this.migrate();
  }

  // ── Schema ────────────────────────────────────────────────────────────────

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS orders (
        id   TEXT PRIMARY KEY,
        data TEXT NOT NULL
      );
    `);
  }

  // ── IRepository<Order> ────────────────────────────────────────────────────

  async findById(id: string): Promise<Order | null> {
    const stmt = this.db.prepare('SELECT data FROM orders WHERE id = ?');
    const row = stmt.get(id) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : null;
  }

  async findAll(): Promise<Order[]> {
    const stmt = this.db.prepare('SELECT data FROM orders');
    const rows = stmt.all() as { data: string }[];
    return rows.map((r) => JSON.parse(r.data));
  }

  async findWhere(predicate: (item: Order) => boolean): Promise<Order[]> {
    const all = await this.findAll();
    return all.filter(predicate);
  }

  async save(entity: Order): Promise<Order> {
    const stmt = this.db.prepare(
      'INSERT INTO orders (id, data) VALUES (?, ?)'
    );
    stmt.run(entity.id, JSON.stringify(entity));
    return entity;
  }

  async update(id: string, patch: Partial<Order>): Promise<Order | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    const updated: Order = { ...existing, ...patch };
    const stmt = this.db.prepare('UPDATE orders SET data = ? WHERE id = ?');
    stmt.run(JSON.stringify(updated), id);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM orders WHERE id = ?');
    const result = stmt.run(id) as { changes: number };
    return result.changes > 0;
  }

  /** Close the database connection. Call on graceful shutdown. */
  close(): void {
    this.db.close();
  }
}

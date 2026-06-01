/**
 * Order Service — HTTP Server
 *
 * Thin Express adapter over OrderService. Translates HTTP requests into
 * domain calls and maps domain errors to appropriate HTTP status codes.
 *
 * The business logic lives entirely in OrderService — this file is just
 * the HTTP transport layer.
 */

import express, { Request, Response, NextFunction } from 'express';
import { OrderService } from './OrderService.js';
import { SqliteOrderRepository } from './SqliteOrderRepository.js';
import { InProcessEventBus } from './InProcessEventBus.js';
import { ValidationError, NotFoundError } from './types.js';

// Production wiring — real implementations injected here.
// Tests never touch this file; they construct OrderService directly with mocks.
const DB_PATH = process.env.DB_PATH ?? ':memory:';
const orderRepository = new SqliteOrderRepository(DB_PATH);
const eventBus = new InProcessEventBus();
const orderService = new OrderService(orderRepository, eventBus);

const app = express();
app.use(express.json());

// ── Health check ──────────────────────────────────────────────────────────

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'order-service', timestamp: new Date().toISOString() });
});

// ── Orders ────────────────────────────────────────────────────────────────

app.post('/api/orders', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await orderService.createOrder(req.body);
    res.status(201).json(order);
  } catch (err) {
    next(err);
  }
});

app.get('/api/orders/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await orderService.getOrder(req.params.id);
    res.json(order);
  } catch (err) {
    next(err);
  }
});

app.patch('/api/orders/:id/confirm', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await orderService.confirmOrder(req.params.id);
    res.json(order);
  } catch (err) {
    next(err);
  }
});

app.patch('/api/orders/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = req.body;
    const order = await orderService.cancelOrder(req.params.id, reason ?? 'No reason provided');
    res.json(order);
  } catch (err) {
    next(err);
  }
});

// ── Error handler ─────────────────────────────────────────────────────────

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  const message = err.message ?? 'Internal server error';

  const status =
    err instanceof ValidationError ? 400 :
    err instanceof NotFoundError   ? 404 : 500;

  res.status(status).json({ error: message });
});

// ── Start ─────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? '3000', 10);

app.listen(PORT, () => {
  console.info(`Order service listening on http://localhost:${PORT}`);
});

export { app };

/**
 * E2E Tests: Order Service API
 *
 * Scope: Critical user-facing paths only. These tests hit a real running server.
 * Kept minimal by design — the bulk of coverage lives at unit and integration layers.
 *
 * Runs against: http://localhost:3000 (or BASE_URL env var in CI)
 *
 * Pattern: Page Object Model (POM) for any UI; Request helpers for APIs.
 */

import { test, expect, APIRequestContext } from '@playwright/test';

// ── API helper (thin wrapper, not a full POM since this is REST) ──────────

class OrderApiClient {
  constructor(private readonly request: APIRequestContext) {}

  async createOrder(payload: { customerId: string; items: Array<{ productId: string; quantity: number }> }) {
    return this.request.post('/api/orders', { data: payload });
  }

  async getOrder(orderId: string) {
    return this.request.get(`/api/orders/${orderId}`);
  }

  async confirmOrder(orderId: string) {
    return this.request.patch(`/api/orders/${orderId}/confirm`);
  }

  async cancelOrder(orderId: string, reason: string) {
    return this.request.patch(`/api/orders/${orderId}/cancel`, { data: { reason } });
  }

  async healthCheck() {
    return this.request.get('/health');
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────

test.describe('Order Service API — E2E', () => {
  let api: OrderApiClient;

  test.beforeEach(({ request }) => {
    api = new OrderApiClient(request);
  });

  test('health check returns 200 OK', async () => {
    // Arrange — service is running (handled by webServer in playwright.config.ts)
    // Act
    const response = await api.healthCheck();
    // Assert
    expect(response.status()).toBe(200);
  });

  test('given valid payload when creating order then returns 201 with order id', async () => {
    // Arrange
    const payload = {
      customerId: 'e2e-customer-001',
      items: [{ productId: 'product-001', quantity: 1 }],
    };

    // Act
    const response = await api.createOrder(payload);

    // Assert
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body).toHaveProperty('id');
    expect(body.status).toBe('PENDING');
    expect(body.customerId).toBe('e2e-customer-001');
  });

  test('given created order when confirming then status transitions to CONFIRMED', async () => {
    // Arrange
    const createResponse = await api.createOrder({
      customerId: 'e2e-customer-002',
      items: [{ productId: 'product-002', quantity: 2 }],
    });
    const { id: orderId } = await createResponse.json();

    // Act
    const confirmResponse = await api.confirmOrder(orderId);

    // Assert
    expect(confirmResponse.status()).toBe(200);
    const body = await confirmResponse.json();
    expect(body.status).toBe('CONFIRMED');
  });

  test('given invalid payload when creating order then returns 400 with error message', async () => {
    // Arrange — missing items
    const payload = { customerId: 'e2e-customer-003', items: [] };

    // Act
    const response = await api.createOrder(payload);

    // Assert
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });

  test('given non-existent order id when fetching then returns 404', async () => {
    // Arrange — ID that doesn't exist
    // Act
    const response = await api.getOrder('00000000-0000-0000-0000-000000000000');
    // Assert
    expect(response.status()).toBe(404);
  });
});

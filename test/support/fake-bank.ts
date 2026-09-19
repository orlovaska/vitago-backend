import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import request from 'supertest';
import { tbankToken } from '../../src/modules/payments/gateway/tbank-token';
import { type TestApp } from './test-app';

export const TERMINAL_KEY = 'TestTerminal';
export const TERMINAL_PASSWORD = 'test-terminal-password';

interface Payment {
  paymentId: string;
  orderId: string;
  amount: number;
  status: string;
}

/**
 * A stand-in for the T-Bank API: answers Init and GetState like the bank and
 * checks request signatures, so tests exercise the real adapter.
 */
export class FakeBank {
  readonly payments = new Map<string, Payment>();
  readonly calls: { method: string; body: Record<string, unknown> }[] = [];
  private failInit = false;
  private nextId = 1000;
  private server?: Server;
  url = '';

  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk: Buffer) => (raw += chunk.toString()));
      req.on('end', () => {
        const body = JSON.parse(raw) as Record<string, unknown>;
        const method = req.url?.split('/').pop() ?? '';
        this.calls.push({ method, body });
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(this.answer(method, body)));
      });
    });
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  async stop(): Promise<void> {
    await new Promise((resolve) => this.server?.close(resolve));
  }

  /** Env for createTestApp: routes the adapter here with one terminal for the `spb` app. */
  env(): Record<string, string> {
    return {
      TBANK_API_URL: this.url,
      TBANK_TERMINALS: JSON.stringify({
        spb: { terminalKey: TERMINAL_KEY, password: TERMINAL_PASSWORD },
      }),
    };
  }

  reset(): void {
    this.payments.clear();
    this.calls.length = 0;
    this.failInit = false;
  }

  refuseNextInit(): void {
    this.failInit = true;
  }

  callsOf(method: string) {
    return this.calls.filter((call) => call.method === method);
  }

  paymentOf(orderId: string): Payment {
    const payment = [...this.payments.values()].find((p) => p.orderId === orderId);
    if (!payment) throw new Error(`No bank payment for order ${orderId}`);
    return payment;
  }

  /** Sends a signed notification, as the bank does, and returns the HTTP response. */
  notify(t: TestApp, orderId: string, status: string, overrides: Record<string, unknown> = {}) {
    const payment = this.paymentOf(orderId);
    payment.status = status;
    const body: Record<string, unknown> = {
      TerminalKey: TERMINAL_KEY,
      OrderId: orderId,
      Success: true,
      Status: status,
      PaymentId: Number(payment.paymentId),
      ErrorCode: '0',
      Amount: payment.amount,
      Pan: '430000******0777',
      ExpDate: '1230',
      ...overrides,
    };
    // A Token in the overrides is sent as is, to test forged signatures.
    if (!('Token' in overrides)) body.Token = tbankToken(body, TERMINAL_PASSWORD);
    return request(t.server).post('/v1/payments/tbank/notifications').send(body);
  }

  private answer(method: string, body: Record<string, unknown>): Record<string, unknown> {
    if (body.Token !== tbankToken(body, TERMINAL_PASSWORD)) {
      return { Success: false, ErrorCode: '204', Message: 'Invalid token' };
    }
    if (method === 'Init') {
      if (this.failInit) {
        this.failInit = false;
        return { Success: false, ErrorCode: '9999', Message: 'Refused' };
      }
      const paymentId = String(this.nextId++);
      const payment = {
        paymentId,
        orderId: String(body.OrderId),
        amount: Number(body.Amount),
        status: 'NEW',
      };
      this.payments.set(paymentId, payment);
      return {
        Success: true,
        ErrorCode: '0',
        Status: 'NEW',
        PaymentId: paymentId,
        OrderId: payment.orderId,
        Amount: payment.amount,
        PaymentURL: `https://pay.example.test/${paymentId}`,
      };
    }
    if (method === 'GetState') {
      const payment = this.payments.get(String(body.PaymentId));
      if (!payment) return { Success: false, ErrorCode: '7', Message: 'Unknown payment' };
      return {
        Success: true,
        ErrorCode: '0',
        Status: payment.status,
        PaymentId: payment.paymentId,
        OrderId: payment.orderId,
        Amount: payment.amount,
      };
    }
    return { Success: false, ErrorCode: '404' };
  }
}

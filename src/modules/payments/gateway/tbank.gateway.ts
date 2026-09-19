import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../../platform/config';
import {
  type BankStatusReport,
  GatewayError,
  type InitPaymentRequest,
  type InitPaymentResult,
  PaymentGateway,
} from './payment-gateway';
import { isValidTbankToken, tbankToken } from './tbank-token';

const REQUEST_TIMEOUT_MS = 10_000;
/** Longest description T-Bank accepts. */
const MAX_DESCRIPTION = 140;

interface TbankResponse {
  Success: boolean;
  ErrorCode: string;
  Message?: string;
  Details?: string;
  PaymentId?: string | number;
  PaymentURL?: string;
  Status?: string;
  OrderId?: string;
  Amount?: number;
}

/** String form of a scalar notification field; anything else is empty. */
const scalar = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : '';

interface Terminal {
  terminalKey: string;
  password: string;
}

/** T-Bank (Tinkoff) internet acquiring, API v2. */
@Injectable()
export class TbankGateway extends PaymentGateway {
  private readonly logger = new Logger(TbankGateway.name);
  private readonly terminals: Record<string, Terminal>;
  private readonly byTerminalKey = new Map<string, Terminal>();

  constructor(private readonly config: AppConfig) {
    super();
    this.terminals = config.env.TBANK_TERMINALS;
    for (const terminal of Object.values(this.terminals)) {
      this.byTerminalKey.set(terminal.terminalKey, terminal);
    }
  }

  hasTerminal(terminal: string): boolean {
    return Object.hasOwn(this.terminals, terminal);
  }

  async init(request: InitPaymentRequest): Promise<InitPaymentResult> {
    const terminal = this.terminal(request.terminal);
    const description = request.description.slice(0, MAX_DESCRIPTION);
    const body: Record<string, unknown> = {
      TerminalKey: terminal.terminalKey,
      Amount: request.amountKopecks,
      OrderId: request.orderId,
      Description: description,
      SuccessURL: request.successUrl,
      FailURL: request.failUrl,
      // T-Bank wants the offset spelled out: 2026-09-19T18:00:00+03:00 style.
      RedirectDueDate: request.expiresAt.toISOString().replace(/\.\d{3}Z$/, '+00:00'),
      ...(this.config.env.PAYMENT_NOTIFICATION_URL && {
        NotificationURL: this.config.env.PAYMENT_NOTIFICATION_URL,
      }),
    };
    if (request.email) {
      body.Receipt = {
        Email: request.email,
        Taxation: this.config.env.TBANK_TAXATION,
        Items: [
          {
            Name: description,
            Price: request.amountKopecks,
            Quantity: 1,
            Amount: request.amountKopecks,
            Tax: 'none',
            PaymentMethod: 'full_payment',
            PaymentObject: 'service',
          },
        ],
      };
    }
    const response = await this.call('Init', body, terminal);
    if (!response.PaymentId || !response.PaymentURL) {
      throw new GatewayError('Init answered without a payment id or URL');
    }
    return { bankPaymentId: String(response.PaymentId), paymentUrl: response.PaymentURL };
  }

  async getState(terminalSlug: string, bankPaymentId: string): Promise<BankStatusReport> {
    const terminal = this.terminal(terminalSlug);
    const response = await this.call(
      'GetState',
      { TerminalKey: terminal.terminalKey, PaymentId: bankPaymentId },
      terminal,
    );
    return {
      orderId: String(response.OrderId ?? ''),
      bankPaymentId: String(response.PaymentId ?? bankPaymentId),
      status: String(response.Status ?? ''),
      amountKopecks: Number(response.Amount ?? 0),
    };
  }

  verifyNotification(body: unknown): BankStatusReport | null {
    if (!body || typeof body !== 'object') return null;
    const fields = body as Record<string, unknown>;
    const terminal =
      typeof fields.TerminalKey === 'string'
        ? this.byTerminalKey.get(fields.TerminalKey)
        : undefined;
    if (!terminal || !isValidTbankToken(fields, terminal.password)) return null;
    return {
      orderId: scalar(fields.OrderId),
      bankPaymentId: scalar(fields.PaymentId),
      status: scalar(fields.Status),
      amountKopecks: Number(fields.Amount ?? 0),
    };
  }

  private terminal(slug: string): Terminal {
    const terminal = this.terminals[slug];
    if (!terminal) throw new GatewayError(`No acquiring terminal configured for "${slug}"`);
    return terminal;
  }

  private async call(
    method: string,
    body: Record<string, unknown>,
    terminal: Terminal,
  ): Promise<TbankResponse> {
    let response: TbankResponse;
    try {
      const http = await fetch(`${this.config.env.TBANK_API_URL}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, Token: tbankToken(body, terminal.password) }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      response = (await http.json()) as TbankResponse;
    } catch (error) {
      this.logger.warn(`T-Bank ${method} failed: ${String(error)}`);
      throw new GatewayError(`T-Bank ${method} is unreachable`);
    }
    if (!response.Success) {
      this.logger.warn(
        `T-Bank ${method} refused: ${response.ErrorCode} ${response.Message ?? ''} ${response.Details ?? ''}`,
      );
      throw new GatewayError(`T-Bank ${method} refused with code ${response.ErrorCode}`);
    }
    return response;
  }
}

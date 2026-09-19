/** A status report from the bank about one payment. */
export interface BankStatusReport {
  /** Our order id, echoed by the bank. */
  orderId: string;
  bankPaymentId: string;
  /** Bank status as sent, e.g. CONFIRMED, REJECTED, REFUNDED. */
  status: string;
  amountKopecks: number;
}

export interface InitPaymentRequest {
  /** App slug naming the acquiring terminal. */
  terminal: string;
  orderId: string;
  amountKopecks: number;
  /** Shown on the payment form and printed on the receipt. */
  description: string;
  /** Receipt e-mail; the receipt is sent only when present. */
  email: string | null;
  successUrl: string;
  failUrl: string;
  /** After this moment the bank refuses the payment link. */
  expiresAt: Date;
}

export interface InitPaymentResult {
  bankPaymentId: string;
  paymentUrl: string;
}

/** The bank could not be reached or refused the request. */
export class GatewayError extends Error {}

/**
 * Port to the acquiring bank. The app never talks to the bank: every request
 * is signed with the terminal password, which must stay on the server.
 */
export abstract class PaymentGateway {
  abstract init(request: InitPaymentRequest): Promise<InitPaymentResult>;

  /** Asks the bank for the current status of a payment. */
  abstract getState(terminal: string, bankPaymentId: string): Promise<BankStatusReport>;

  /** Verifies a notification's signature; returns null for anything not signed by the bank. */
  abstract verifyNotification(body: unknown): BankStatusReport | null;

  /** Whether a terminal is configured for the app with this slug. */
  abstract hasTerminal(terminal: string): boolean;
}

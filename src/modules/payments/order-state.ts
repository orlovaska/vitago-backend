import { type orderStatus } from './payments.tables';

export type OrderStatus = (typeof orderStatus.enumValues)[number];

/** Allowed transitions; the single source of truth next to ORDER_STATES.md. */
export const TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  created: ['awaiting_payment', 'paid', 'failed', 'expired'],
  awaiting_payment: ['paid', 'failed', 'expired'],
  // The bank may confirm after our deadline; the money was taken.
  expired: ['paid'],
  paid: ['refunded'],
  failed: [],
  refunded: [],
};

/** States an order may be in for a move to `target` to be allowed. */
export function sourcesOf(target: OrderStatus): OrderStatus[] {
  return (Object.keys(TRANSITIONS) as OrderStatus[]).filter((from) =>
    TRANSITIONS[from].includes(target),
  );
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Orders that may still become paid and are worth asking the bank about. */
export const OPEN_STATUSES: readonly OrderStatus[] = ['created', 'awaiting_payment'];

/** What a bank status means for the order; null for intermediate statuses (NEW, AUTHORIZED…). */
export function statusForBank(bankStatus: string): OrderStatus | null {
  switch (bankStatus) {
    case 'CONFIRMED':
      return 'paid';
    case 'REJECTED':
    case 'AUTH_FAIL':
    case 'CANCELED':
      return 'failed';
    case 'DEADLINE_EXPIRED':
      return 'expired';
    case 'REFUNDED':
    case 'PARTIAL_REFUNDED':
      return 'refunded';
    default:
      return null;
  }
}

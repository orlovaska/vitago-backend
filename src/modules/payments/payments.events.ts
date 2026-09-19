import { defineEvent } from '../../platform/events';

export interface PurchaseCompletedPayload {
  orderId: string;
  userId: string;
  appId: string;
  tourId: string;
  amountKopecks: number;
  currency: 'RUB';
  occurredAt: Date;
}

/** Published after the transaction that granted a paid purchase commits. */
export const PurchaseCompleted = defineEvent<PurchaseCompletedPayload>('purchase.completed');

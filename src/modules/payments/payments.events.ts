import { defineEvent } from '../../platform/events';

export interface PurchaseCompletedPayload {
  orderId: string;
  userId: string;
  appId: string;
  /** What was bought: a tour, or unlocking the points of one generated walk. */
  kind: 'tour' | 'walk_unlock';
  /** Id of the tour or of the walk, whichever the kind says. */
  subjectId: string;
  amountKopecks: number;
  currency: 'RUB';
  occurredAt: Date;
}

/** Published after the transaction that granted a paid purchase commits. */
export const PurchaseCompleted = defineEvent<PurchaseCompletedPayload>('purchase.completed');

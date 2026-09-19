# Order states

An order is one attempt to buy one tour. It is created when the user taps
“buy”, and the bank decides how it ends. This document is the contract the
code follows; change it first when the rules change.

## States

| State              | Meaning                                                                |
| ------------------ | ---------------------------------------------------------------------- |
| `created`          | Saved; the `Init` request to the bank has not succeeded yet.           |
| `awaiting_payment` | The bank returned a payment link; the user is paying.                  |
| `paid`             | The bank confirmed the payment (`CONFIRMED`); the purchase is granted. |
| `failed`           | The bank rejected or cancelled the payment, or `Init` failed.          |
| `expired`          | The payment link lifetime passed without a confirmation.               |
| `refunded`         | The bank refunded the payment; the purchase is revoked.                |

A zero-amount order (a 100 % promo code) goes from `created` straight to
`paid` without the bank.

## Transitions

```
created ──────────► awaiting_payment ──────► paid ──────► refunded
   │  │                 │      │               ▲
   │  └─► paid (0 ₽)    │      └──► expired ───┘ (late confirmation)
   │                    │
   └──────► failed ◄────┘
created ──► expired
```

| From                          | To                 | Trigger                                            |
| ----------------------------- | ------------------ | -------------------------------------------------- |
| `created`                     | `awaiting_payment` | `Init` succeeded                                   |
| `created`                     | `paid`             | amount is zero                                     |
| `created`, `awaiting_payment` | `failed`           | `Init` failed; `REJECTED`, `AUTH_FAIL`, `CANCELED` |
| `created`, `awaiting_payment` | `expired`          | expiry job; bank status `DEADLINE_EXPIRED`         |
| `awaiting_payment`, `expired` | `paid`             | bank status `CONFIRMED` (from `expired`: late)     |
| `paid`                        | `refunded`         | bank status `REFUNDED` or `PARTIAL_REFUNDED`       |

Everything else is refused. In particular `paid` never goes back, and a
`failed` order is final: a new attempt is a new order.

`expired → paid` exists because the bank may confirm after our deadline
(a slow 3-D Secure step, a late notification). The money was taken, so the
purchase is granted and a `late_confirmation` event is recorded.

## Guarantees

- **Atomic transitions.** Every change is
  `UPDATE orders SET status = … WHERE id = … AND status IN (<allowed>) RETURNING`.
  Granting or revoking the purchase happens in the same transaction. Two
  concurrent confirmations cannot both win: the second finds no row.
- **Idempotent bank notifications.** The bank sends no event id and may repeat
  a notification. Each bank status is recorded in `order_events` with a
  unique `(bank_payment_id, bank_status)`; the insert is
  `ON CONFLICT DO NOTHING`, and a repeat is answered `OK` without processing.
- **Second safety net.** `purchases` has a unique `(user_id, tour_id)` among
  non-revoked rows, so a tour is never granted twice.
- **Trust.** The notification signature is checked before anything is read,
  and the amount must match the order. The client's word about a payment is
  never trusted: status polling asks the bank itself (`GetState`), limited
  by the `payments.bankCheck*` settings.
- **Duplicate payment.** If a second order for an already bought tour is
  paid, the order becomes `paid`, a `duplicate_payment` event is recorded and
  a warning is logged; the refund is done by hand.
- **Refund.** `refunded` sets `revoked_at` on the purchase, after which the
  tour can be bought again.
- **Deleted accounts.** Orders are kept for accounting with `user_id` and
  `email` cleared; notifications find orders by id, so they still apply.

## After a confirmed payment

In the transaction: the purchase is granted and the promo code redemption
recorded. After commit: the `purchase.completed` event is published (revenue
analytics). Losing that event is acceptable; the purchase is not.

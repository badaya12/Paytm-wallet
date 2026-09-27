# Paytm wallet

A wallet built to explore how money movement stays atomic: on-ramp deposits from a bank,
peer-to-peer transfers, and a double-entry ledger that both are derived from.

## Layout

| Path | What it is |
| --- | --- |
| `apps/user-app` | Next.js app (port 3001). Auth, balance, add money, P2P transfer, history. |
| `apps/merchant-app` | Next.js app (port 3000). |
| `apps/backend-webhook` | Express service (port 3003) that receives bank payment callbacks. |
| `packages/db` | Prisma schema, migrations, and the ledger module every write path goes through. |
| `packages/ui`, `packages/store` | Shared components and client state. |

Everything shares one Postgres database, which is deliberate: a transfer is a single ACID
transaction, not a distributed saga.

## The ledger

`LedgerEntry` rows are append-only and signed, in paise. Every business event writes a
`LedgerTransaction` whose entries sum to zero — a deposit debits the external account
(`userId = null`) and credits the user; a transfer debits the sender and credits the recipient.
`Balance.amount` is a cache of `sum(entries)` maintained in the same transaction, and
`getDerivedBalance()` is the source of truth to check it against.

Two properties come from `postLedgerTransaction()` in `packages/db/ledger.ts`:

- **Atomicity**: balance rows are locked with `SELECT … FOR UPDATE` in ascending user id order
  (so concurrent opposite transfers cannot deadlock), an overdraft aborts the whole transaction,
  and callers can pass `apply` to commit their own writes in the same transaction.
- **Idempotency**: `LedgerTransaction.idempotencyKey` is unique. A replayed bank callback
  (`onramp:<token>`) or a double-submitted transfer (`p2p:<userId>:<requestId>`) returns
  `duplicate` and moves no money.

## Running it locally

```bash
docker compose up -d           # Postgres on :5432
cp .env.example packages/db/.env
cp .env.example apps/user-app/.env
cp .env.example apps/backend-webhook/.env

npm install
npm run db:migrate
npm run db:generate
npm run db:seed                # users 1111111111 / alice and 2222222222 / bob
npm run dev
```

## Tests

The ledger tests run against a real Postgres (`DATABASE_URL`) because they exercise row locks
and unique constraints:

```bash
npm test
```

## Simulating a bank callback

The webhook verifies an HMAC-SHA256 of the raw request body using `HDFC_WEBHOOK_SECRET`:

```bash
BODY='{"token":"<token from the on-ramp row>","user_identifier":1,"amount":10000}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$HDFC_WEBHOOK_SECRET" -hex | awk '{print $2}')
curl -X POST http://localhost:3003/hdfcWebhook \
  -H 'Content-Type: application/json' \
  -H "x-webhook-signature: $SIG" \
  -d "$BODY"
```

Sending it twice is safe: the second call reports `Already processed`.

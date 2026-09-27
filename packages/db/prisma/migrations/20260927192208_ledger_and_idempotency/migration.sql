-- CreateEnum
CREATE TYPE "LedgerTransactionType" AS ENUM ('OnRamp', 'P2pTransfer', 'Adjustment');

-- CreateTable
CREATE TABLE "LedgerTransaction" (
    "id" TEXT NOT NULL,
    "type" "LedgerTransactionType" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" SERIAL NOT NULL,
    "transactionId" TEXT NOT NULL,
    "userId" INTEGER,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LedgerTransaction_idempotencyKey_key" ON "LedgerTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "LedgerEntry_userId_createdAt_idx" ON "LedgerEntry"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_transactionId_idx" ON "LedgerEntry"("transactionId");

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "LedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A cached balance may never go negative.
ALTER TABLE "Balance" ADD CONSTRAINT "Balance_amount_non_negative" CHECK ("amount" >= 0);
ALTER TABLE "Balance" ADD CONSTRAINT "Balance_locked_non_negative" CHECK ("locked" >= 0);

-- Backfill: replay existing history into the ledger so derived balances mean something.
WITH txn AS (
    INSERT INTO "LedgerTransaction" ("id", "type", "idempotencyKey", "createdAt")
    SELECT gen_random_uuid(), 'OnRamp', 'onramp:' || o."token", o."startTime"
    FROM "OnRampTransaction" o
    WHERE o."status" = 'Success'
    RETURNING "id", "idempotencyKey", "createdAt"
)
INSERT INTO "LedgerEntry" ("transactionId", "userId", "amount", "createdAt")
SELECT t."id", u."userId", u."amount", t."createdAt"
FROM txn t
JOIN (
    SELECT 'onramp:' || "token" AS key, "userId", "amount" FROM "OnRampTransaction" WHERE "status" = 'Success'
    UNION ALL
    SELECT 'onramp:' || "token" AS key, NULL, -"amount" FROM "OnRampTransaction" WHERE "status" = 'Success'
) u ON u.key = t."idempotencyKey";

WITH txn AS (
    INSERT INTO "LedgerTransaction" ("id", "type", "idempotencyKey", "createdAt")
    SELECT gen_random_uuid(), 'P2pTransfer', 'p2p:legacy:' || p."id", p."timeStamp"
    FROM "P2PTransaction" p
    RETURNING "id", "idempotencyKey", "createdAt"
)
INSERT INTO "LedgerEntry" ("transactionId", "userId", "amount", "createdAt")
SELECT t."id", u."userId", u."amount", t."createdAt"
FROM txn t
JOIN (
    SELECT 'p2p:legacy:' || "id" AS key, "fromId" AS "userId", -"amount" AS "amount" FROM "P2PTransaction"
    UNION ALL
    SELECT 'p2p:legacy:' || "id" AS key, "toId", "amount" FROM "P2PTransaction"
) u ON u.key = t."idempotencyKey";

-- Legacy rows were written without a ledger, so absorb any residual difference
-- between the cached balance and the replayed history into a single adjustment.
WITH diff AS (
    SELECT b."userId", b."amount" - COALESCE(SUM(e."amount"), 0) AS delta
    FROM "Balance" b
    LEFT JOIN "LedgerEntry" e ON e."userId" = b."userId"
    GROUP BY b."userId", b."amount"
    HAVING b."amount" - COALESCE(SUM(e."amount"), 0) <> 0
), txn AS (
    INSERT INTO "LedgerTransaction" ("id", "type", "idempotencyKey")
    SELECT gen_random_uuid(), 'Adjustment', 'adjustment:backfill:' || "userId" FROM diff
    RETURNING "id", "idempotencyKey"
)
INSERT INTO "LedgerEntry" ("transactionId", "userId", "amount")
SELECT t."id", u."userId", u.delta
FROM txn t
JOIN (
    SELECT 'adjustment:backfill:' || "userId" AS key, "userId", delta FROM diff
    UNION ALL
    SELECT 'adjustment:backfill:' || "userId" AS key, NULL, -delta FROM diff
) u ON u.key = t."idempotencyKey";

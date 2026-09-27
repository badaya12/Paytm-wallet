import { Prisma, LedgerTransactionType } from "@prisma/client";
import prisma from "./index";

/// Signed amount in paise. Positive credits the account, negative debits it.
/// `userId: null` is the external account (bank / PSP).
export type LedgerLeg = {
  userId: number | null;
  amount: number;
};

export type LedgerErrorCode =
  | "INVALID_AMOUNT"
  | "UNBALANCED"
  | "INSUFFICIENT_FUNDS";

export class LedgerError extends Error {
  constructor(
    public code: LedgerErrorCode,
    message: string
  ) {
    super(message);
    this.name = "LedgerError";
  }
}

export type PostLedgerTransactionArgs = {
  idempotencyKey: string;
  type: LedgerTransactionType;
  legs: LedgerLeg[];
  /// Extra writes to commit atomically with the ledger entries.
  apply?: (tx: Prisma.TransactionClient) => Promise<void>;
};

export type PostLedgerTransactionResult = {
  status: "posted" | "duplicate";
  transactionId: string;
};

const UNIQUE_VIOLATION = "P2002";

function validate(legs: LedgerLeg[]) {
  if (legs.length < 2) {
    throw new LedgerError("UNBALANCED", "A ledger transaction needs at least two legs");
  }
  for (const leg of legs) {
    if (!Number.isSafeInteger(leg.amount) || leg.amount === 0) {
      throw new LedgerError("INVALID_AMOUNT", "Ledger amounts must be non-zero integers in paise");
    }
  }
  const sum = legs.reduce((acc, leg) => acc + leg.amount, 0);
  if (sum !== 0) {
    throw new LedgerError("UNBALANCED", `Ledger legs must sum to zero, got ${sum}`);
  }
}

/// Posts a balanced set of entries and moves the cached balances in the same
/// database transaction. Rows are locked in ascending user id order so that
/// concurrent transfers between the same pair of users cannot deadlock.
/// Replaying the same `idempotencyKey` is a no-op that reports `duplicate`.
export async function postLedgerTransaction({
  idempotencyKey,
  type,
  legs,
  apply,
}: PostLedgerTransactionArgs): Promise<PostLedgerTransactionResult> {
  validate(legs);

  const userIds = Array.from(
    new Set(legs.filter((leg) => leg.userId !== null).map((leg) => leg.userId as number))
  ).sort((a, b) => a - b);

  try {
    const transactionId = await prisma.$transaction(async (tx) => {
      const ledgerTransaction = await tx.ledgerTransaction.create({
        data: { idempotencyKey, type },
      });

      for (const userId of userIds) {
        await tx.$executeRaw`
          INSERT INTO "Balance" ("userId", "amount", "locked")
          VALUES (${userId}, 0, 0)
          ON CONFLICT ("userId") DO NOTHING
        `;
      }
      for (const userId of userIds) {
        await tx.$queryRaw`SELECT 1 FROM "Balance" WHERE "userId" = ${userId} FOR UPDATE`;
      }

      for (const userId of userIds) {
        const delta = legs
          .filter((leg) => leg.userId === userId)
          .reduce((acc, leg) => acc + leg.amount, 0);
        if (delta === 0) {
          continue;
        }
        const balance = await tx.balance.findUniqueOrThrow({ where: { userId } });
        if (balance.amount + delta < 0) {
          throw new LedgerError("INSUFFICIENT_FUNDS", "Insufficient funds");
        }
        await tx.balance.update({
          where: { userId },
          data: { amount: { increment: delta } },
        });
      }

      await tx.ledgerEntry.createMany({
        data: legs.map((leg) => ({
          transactionId: ledgerTransaction.id,
          userId: leg.userId,
          amount: leg.amount,
        })),
      });

      await apply?.(tx);

      return ledgerTransaction.id;
    });

    return { status: "posted", transactionId };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === UNIQUE_VIOLATION) {
      const existing = await prisma.ledgerTransaction.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        return { status: "duplicate", transactionId: existing.id };
      }
    }
    throw e;
  }
}

/// The balance implied by the ledger. `Balance.amount` is a cache of this and
/// the two must always agree.
export async function getDerivedBalance(userId: number): Promise<number> {
  const result = await prisma.ledgerEntry.aggregate({
    where: { userId },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0;
}

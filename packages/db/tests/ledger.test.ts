import { afterAll, beforeEach, describe, expect, it } from "vitest";
import prisma from "../index";
import { LedgerError, getDerivedBalance, postLedgerTransaction } from "../ledger";

async function createUser(number: string, openingPaise: number) {
  const user = await prisma.user.create({
    data: {
      number,
      password: "x",
      Balance: { create: { amount: 0, locked: 0 } }
    }
  });
  if (openingPaise > 0) {
    await postLedgerTransaction({
      idempotencyKey: `test:opening:${user.id}`,
      type: "Adjustment",
      legs: [
        { userId: null, amount: -openingPaise },
        { userId: user.id, amount: openingPaise }
      ]
    });
  }
  return user;
}

async function reset() {
  await prisma.ledgerEntry.deleteMany();
  await prisma.ledgerTransaction.deleteMany();
  await prisma.p2PTransaction.deleteMany();
  await prisma.onRampTransaction.deleteMany();
  await prisma.balance.deleteMany();
  await prisma.user.deleteMany();
}

beforeEach(reset);
afterAll(async () => {
  await reset();
  await prisma.$disconnect();
});

describe("postLedgerTransaction", () => {
  it("moves money and keeps the cached balance equal to the derived balance", async () => {
    const alice = await createUser("9000000001", 10_000);
    const bob = await createUser("9000000002", 0);

    await postLedgerTransaction({
      idempotencyKey: "test:transfer:1",
      type: "P2pTransfer",
      legs: [
        { userId: alice.id, amount: -2_500 },
        { userId: bob.id, amount: 2_500 }
      ]
    });

    const [aliceBalance, bobBalance] = await Promise.all([
      prisma.balance.findUniqueOrThrow({ where: { userId: alice.id } }),
      prisma.balance.findUniqueOrThrow({ where: { userId: bob.id } })
    ]);
    expect(aliceBalance.amount).toBe(7_500);
    expect(bobBalance.amount).toBe(2_500);
    expect(await getDerivedBalance(alice.id)).toBe(7_500);
    expect(await getDerivedBalance(bob.id)).toBe(2_500);
  });

  it("is idempotent: replaying the same key does not move money twice", async () => {
    const alice = await createUser("9000000003", 10_000);
    const bob = await createUser("9000000004", 0);
    const legs = [
      { userId: alice.id, amount: -1_000 },
      { userId: bob.id, amount: 1_000 }
    ];

    const first = await postLedgerTransaction({ idempotencyKey: "test:replay", type: "P2pTransfer", legs });
    const second = await postLedgerTransaction({ idempotencyKey: "test:replay", type: "P2pTransfer", legs });

    expect(first.status).toBe("posted");
    expect(second.status).toBe("duplicate");
    expect(second.transactionId).toBe(first.transactionId);
    expect(await getDerivedBalance(bob.id)).toBe(1_000);
  });

  it("rejects an overdraft and leaves both sides untouched", async () => {
    const alice = await createUser("9000000005", 500);
    const bob = await createUser("9000000006", 0);

    await expect(
      postLedgerTransaction({
        idempotencyKey: "test:overdraft",
        type: "P2pTransfer",
        legs: [
          { userId: alice.id, amount: -5_000 },
          { userId: bob.id, amount: 5_000 }
        ]
      })
    ).rejects.toBeInstanceOf(LedgerError);

    expect(await getDerivedBalance(alice.id)).toBe(500);
    expect(await getDerivedBalance(bob.id)).toBe(0);
    expect(await prisma.ledgerTransaction.count({ where: { idempotencyKey: "test:overdraft" } })).toBe(0);
  });

  it("rejects unbalanced legs", async () => {
    const alice = await createUser("9000000007", 1_000);
    await expect(
      postLedgerTransaction({
        idempotencyKey: "test:unbalanced",
        type: "Adjustment",
        legs: [
          { userId: alice.id, amount: 100 },
          { userId: null, amount: -50 }
        ]
      })
    ).rejects.toMatchObject({ code: "UNBALANCED" });
  });

  it("rolls back the `apply` writes when the ledger transaction fails", async () => {
    const alice = await createUser("9000000008", 100);
    const bob = await createUser("9000000009", 0);

    await expect(
      postLedgerTransaction({
        idempotencyKey: "test:apply-rollback",
        type: "P2pTransfer",
        legs: [
          { userId: alice.id, amount: -100 },
          { userId: bob.id, amount: 100 }
        ],
        apply: async () => {
          throw new Error("downstream write failed");
        }
      })
    ).rejects.toThrow("downstream write failed");

    expect(await getDerivedBalance(alice.id)).toBe(100);
    expect(await prisma.balance.findUniqueOrThrow({ where: { userId: alice.id } })).toMatchObject({ amount: 100 });
  });

  it("stays consistent under concurrent transfers in a cycle", async () => {
    const [a, b, c] = await Promise.all([
      createUser("9000000010", 10_000),
      createUser("9000000011", 10_000),
      createUser("9000000012", 10_000)
    ]);
    const pairs = [
      [a!.id, b!.id],
      [b!.id, c!.id],
      [c!.id, a!.id]
    ];

    const attempts = Array.from({ length: 30 }, (_, i) => {
      const pair = pairs[i % pairs.length]!;
      return postLedgerTransaction({
        idempotencyKey: `test:concurrent:${i}`,
        type: "P2pTransfer",
        legs: [
          { userId: pair[0]!, amount: -100 },
          { userId: pair[1]!, amount: 100 }
        ]
      }).catch((e) => e);
    });
    await Promise.all(attempts);

    const balances = await prisma.balance.findMany();
    const total = balances.reduce((acc, b) => acc + b.amount, 0);
    expect(total).toBe(30_000);
    for (const balance of balances) {
      expect(balance.amount).toBe(await getDerivedBalance(balance.userId));
    }
  });
});

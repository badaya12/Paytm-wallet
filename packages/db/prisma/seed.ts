import bcrypt from "bcrypt";
import prisma from "../index";
import { postLedgerTransaction } from "../ledger";

async function main() {
  const alice = await prisma.user.upsert({
    where: { number: '1111111111' },
    update: {},
    create: {
      number: '1111111111',
      password: await bcrypt.hash('alice', 10),
      name: 'alice',
      OnRampTransaction: {
        create: {
          startTime: new Date(),
          status: "Success",
          amount: 20000,
          token: "token__1",
          provider: "HDFC Bank",
        },
      },
    },
  })
  const bob = await prisma.user.upsert({
    where: { number: '2222222222' },
    update: {},
    create: {
      number: '2222222222',
      password: await bcrypt.hash('bob', 10),
      name: 'bob',
      OnRampTransaction: {
        create: {
          startTime: new Date(),
          status: "Failure",
          amount: 2000,
          token: "token__2",
          provider: "HDFC Bank",
        },
      },
    },
  })

  // Opening balances go through the ledger so cached balances match derived ones.
  await postLedgerTransaction({
    idempotencyKey: "onramp:token__1",
    type: "OnRamp",
    legs: [
      { userId: null, amount: -20000 },
      { userId: alice.id, amount: 20000 }
    ]
  })
  await postLedgerTransaction({
    idempotencyKey: `seed:opening:${bob.number}`,
    type: "Adjustment",
    legs: [
      { userId: null, amount: -2000 },
      { userId: bob.id, amount: 2000 }
    ]
  })

  console.log({ alice, bob })
}
main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })

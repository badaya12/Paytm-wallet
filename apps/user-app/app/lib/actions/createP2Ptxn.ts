"use server"

import prisma from "@repo/db/client"
import { LedgerError, postLedgerTransaction } from "@repo/db/ledger"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "../auth"

const transferInput = z.object({
    amountInRupees: z.number().positive().finite(),
    phoneNumber: z.string().regex(/^\d{10}$/, "Enter a 10 digit phone number"),
    requestId: z.string().uuid()
})

/// `requestId` is the client's idempotency key: retrying the same click, or a
/// double submit, posts the transfer exactly once.
export async function createP2PTransactions(amountInRupees: number, phoneNumber: string, requestId: string) {
    const parsed = transferInput.safeParse({ amountInRupees, phoneNumber, requestId })
    if (!parsed.success) {
        return { message: parsed.error.errors[0]?.message ?? "Invalid transfer" }
    }
    const amount = Math.round(parsed.data.amountInRupees * 100)

    const session = await getServerSession(authOptions)
    const senderId = Number(session?.user?.id)
    if (!senderId) {
        return { message: "You are not signed in" }
    }

    const recipient = await prisma.user.findFirst({ where: { number: parsed.data.phoneNumber } })
    if (!recipient) {
        return { message: "User does not exist" }
    }
    if (recipient.id === senderId) {
        return { message: "You cannot send money to yourself" }
    }

    try {
        const result = await postLedgerTransaction({
            idempotencyKey: `p2p:${senderId}:${parsed.data.requestId}`,
            type: "P2pTransfer",
            legs: [
                { userId: senderId, amount: -amount },
                { userId: recipient.id, amount }
            ],
            apply: async (tx) => {
                await tx.p2PTransaction.create({
                    data: {
                        amount,
                        fromId: senderId,
                        toId: recipient.id,
                        timeStamp: new Date()
                    }
                })
            }
        })
        if (result.status === "duplicate") {
            return { message: "Transaction already processed" }
        }
    } catch (e) {
        if (e instanceof LedgerError && e.code === "INSUFFICIENT_FUNDS") {
            return { message: "Insufficient funds" }
        }
        console.error(e)
        return { message: "Something went wrong" }
    }

    return { message: "Transaction successful" }
}

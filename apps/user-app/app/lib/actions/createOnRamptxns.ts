"use server"
import { randomUUID } from "crypto";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "../auth";
import db from "@repo/db/client";

const onRampInput = z.object({
    amountInRupees: z.number().positive().finite(),
    provider: z.string().min(1)
})

export async function createOnRampTransactions(
    amountInRupees: number,
    provider: string
): Promise<{ message: string; token?: string }> {
    const parsed = onRampInput.safeParse({ amountInRupees, provider })
    if (!parsed.success) {
        return { message: parsed.error.errors[0]?.message ?? "Invalid request" }
    }

    const session = await getServerSession(authOptions);
    const userId = Number(session?.user?.id);
    if (!userId) {
        return { message: "You are not signed in" };
    }

    // The token is what the bank quotes back to the webhook, so it doubles as
    // the idempotency key of the eventual credit and must be unguessable.
    const token = randomUUID();
    await db.onRampTransaction.create({
        data: {
            status: "Processing",
            provider: parsed.data.provider,
            amount: Math.round(parsed.data.amountInRupees * 100),
            token,
            userId,
            startTime: new Date()
        }
    });

    return { message: "Payment started", token };
}

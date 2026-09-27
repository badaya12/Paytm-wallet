import "dotenv/config";
import crypto from "crypto";
import express from "express";
import { z } from "zod";
import db from "@repo/db/client";
import { LedgerError, postLedgerTransaction } from "@repo/db/ledger";

const app = express();
app.use(express.json({ verify: (req, _res, buf) => { (req as RawBodyRequest).rawBody = buf; } }));

type RawBodyRequest = express.Request & { rawBody?: Buffer };

const WEBHOOK_SECRET = process.env.HDFC_WEBHOOK_SECRET;
const PORT = Number(process.env.PORT ?? 3003);

const paymentNotification = z.object({
    token: z.string().min(1),
    user_identifier: z.coerce.number().int().positive(),
    amount: z.coerce.number().int().positive()
});

/// The bank signs the raw body with a shared secret. Without this any caller
/// that can reach this port can mint balance.
function hasValidSignature(req: RawBodyRequest): boolean {
    if (!WEBHOOK_SECRET) {
        return false;
    }
    const provided = req.header("x-webhook-signature");
    if (!provided || !req.rawBody) {
        return false;
    }
    const expected = crypto.createHmac("sha256", WEBHOOK_SECRET).update(req.rawBody).digest("hex");
    const providedBuffer = Buffer.from(provided, "utf8");
    const expectedBuffer = Buffer.from(expected, "utf8");
    return (
        providedBuffer.length === expectedBuffer.length &&
        crypto.timingSafeEqual(providedBuffer, expectedBuffer)
    );
}

app.post("/hdfcWebhook", async (req, res) => {
    if (!WEBHOOK_SECRET) {
        console.error("HDFC_WEBHOOK_SECRET is not configured; refusing to credit balances");
        return res.status(500).json({ message: "Webhook is not configured" });
    }
    if (!hasValidSignature(req)) {
        return res.status(401).json({ message: "Invalid signature" });
    }

    const parsed = paymentNotification.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ message: "Invalid payload", issues: parsed.error.issues });
    }
    const { token, user_identifier: userId, amount } = parsed.data;

    const onRamp = await db.onRampTransaction.findUnique({ where: { token } });
    if (!onRamp || onRamp.userId !== userId || onRamp.amount !== amount) {
        return res.status(404).json({ message: "Unknown payment" });
    }
    if (onRamp.status === "Failure") {
        return res.status(409).json({ message: "Payment already failed" });
    }

    try {
        // Bank callbacks are at-least-once. The token keys the ledger
        // transaction, so a replay finds the row already there and credits nothing.
        const result = await postLedgerTransaction({
            idempotencyKey: `onramp:${token}`,
            type: "OnRamp",
            legs: [
                { userId: null, amount: -amount },
                { userId, amount }
            ],
            apply: async (tx) => {
                await tx.onRampTransaction.update({
                    where: { token },
                    data: { status: "Success" }
                });
            }
        });
        return res.status(200).json({
            message: result.status === "duplicate" ? "Already processed" : "Successful transaction"
        });
    } catch (e) {
        if (e instanceof LedgerError) {
            return res.status(400).json({ message: e.message });
        }
        console.error(e);
        return res.status(500).json({ message: "Something went wrong" });
    }
});

app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

if (require.main === module) {
    app.listen(PORT, () => console.log(`webhook listening on ${PORT}`));
}

export default app;

"use client"
import { Button } from "@repo/ui/button";
import { Card } from "@repo/ui/card";
import { TextInput } from "@repo/ui/textInput";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createP2PTransactions } from "../app/lib/actions/createP2Ptxn"

export function SendCard() {
    const [number, setNumber] = useState("");
    const [amount, setAmount] = useState("");
    const [status, setStatus] = useState<string | null>(null);
    const [pending, setPending] = useState(false);
    // Kept across retries of the same submission so a double click or a retried
    // request cannot post the transfer twice.
    const requestId = useRef<string | null>(null);
    const router = useRouter();

    const send = async () => {
        setPending(true);
        if (!requestId.current) {
            requestId.current = crypto.randomUUID();
        }
        try {
            const { message } = await createP2PTransactions(Number(amount), number, requestId.current);
            setStatus(message);
            if (message === "Transaction successful") {
                requestId.current = null;
                setAmount("");
                router.refresh();
            }
        } finally {
            setPending(false);
        }
    };

    return <div className="h-[90vh]">
        <Card title="Send">
            <div>
                <TextInput placeholder={"Number"} label="Number" onChange={setNumber} />
                <TextInput placeholder={"Amount"} label="Amount (INR)" onChange={setAmount} />
                <div className="pt-4 flex justify-center">
                    <Button onClick={send}>{pending ? "Sending..." : "Send"}</Button>
                </div>
                {status ? <div className="pt-4 text-center text-sm text-slate-600">{status}</div> : null}
            </div>
        </Card>
    </div>
}

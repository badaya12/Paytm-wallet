"use client"
import { Button } from "@repo/ui/button";
import { Card } from "@repo/ui/card";
import { Select } from "@repo/ui/Select";
import { useState } from "react";
import { TextInput } from "@repo/ui/textInput";
import { createOnRampTransactions } from "../app/lib/actions/createOnRamptxns";


const SUPPORTED_BANKS = [{
    name: "HDFC Bank",
    redirectUrl: "https://netbanking.hdfcbank.com"
}, {
    name: "Axis Bank",
    redirectUrl: "https://www.axisbank.com/"
}];

export const AddMoney = () => {
    const [amount,setAmount] = useState<number>(0);
    const [error, setError] = useState<string | null>(null);
    const [provider,setProvider] = useState<string>(SUPPORTED_BANKS[0]?.name || "");
    const [redirectUrl, setRedirectUrl] = useState(SUPPORTED_BANKS[0]?.redirectUrl);
    return <Card title="Add Money">
    <div className="w-full">
        <TextInput label={"Amount"} placeholder={"Amount"}  onChange={(money) => {
            setAmount(Number(money));
        }} />
        <div className="py-4 text-left">
            Bank
        </div>
        <Select onSelect={(value) => {
            setRedirectUrl(SUPPORTED_BANKS.find(x => x.name === value)?.redirectUrl || "")
            setProvider(SUPPORTED_BANKS.find(x => x.name === value)?.name || "")
        }} options={SUPPORTED_BANKS.map(x => ({
            key: x.name,
            value: x.name
        }))} />
        <div className="flex justify-center pt-4">
            <Button onClick={async () => {
                const { token } = await createOnRampTransactions(amount, provider);
                if (!token) {
                    setError("Enter an amount greater than zero");
                    return;
                }
                setError(null);
                window.location.href = redirectUrl || "";
            }}>
            Add Money
            </Button>
        </div>
        {error ? <div className="pt-4 text-center text-sm text-red-600">{error}</div> : null}
    </div>
</Card>
}
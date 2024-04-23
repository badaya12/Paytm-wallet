"use client"
import { Button } from "@repo/ui/button";
import { Card } from "@repo/ui/card";
import { Center } from "@repo/ui/Center";
import { TextInput } from "@repo/ui/textInput";
import { useState } from "react";
import {createP2PTransactions} from "../app/lib/actions/createP2Ptxn"

export  function SendCard() {
    const [number, setNumber] = useState("");
    const [amount, setAmount] = useState("");

    return <div className="h-[90vh]">
        
            <Card title="Send">
                <div >
                    <TextInput placeholder={"Number"} label="Number" onChange={(value) => {
                        setNumber(value)
                    }} />
                    <TextInput placeholder={"Amount"} label="Amount" onChange={(value) => {
                        setAmount(value)
                    }} />
                    <div className="pt-4 flex justify-center">
                        <Button onClick={async () => {
                            const message = await createP2PTransactions(Number(amount)*100,number)
                            console.log(message);
                            alert(message);
                        }}>Send</Button>
                    </div>
                </div>
            </Card>
       
    </div>
}
import { Card } from "@repo/ui/card"
import { DateTime } from "next-auth/providers/kakao"

export const P2PTransactions = ({
    transactions
}: {
    transactions: {
        time: Date,
        amount: number,
        user_id : number,
        received : boolean
    }[]
}) => {
    if (!transactions.length) {
        return <Card title="Recent Transactions">
            <div className="text-center pb-8 pt-8">
                No Recent transactions
            </div>
        </Card>
    }
    return <Card title="Recent Transactions">
        <div className="pt-2">
            {transactions.map(t => <div className="flex justify-between">
                <div>
                    <div className="text-sm">
                        {t.received ? "Received INR" : "Sent INR"}
                    </div>
                    <div className="text-slate-600 text-xs">
                        {t.time.toDateString()}
                        
                    </div>
                </div>
                <div>
                <div className="flex flex-col justify-center">
                    {t.received ? "+" : "-"} Rs {t.amount / 100}
                </div>
                <div className="text-slate-600 text-xs">
                        {t.user_id }
                    </div>
                </div>
            </div>)}
        </div>
    </Card>
}
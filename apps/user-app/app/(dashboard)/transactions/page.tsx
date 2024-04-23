import prisma from "@repo/db/client";
import { AddMoney } from "../../../components/AddMoneyCard";
import { BalanceCard } from "../../../components/BalanceCard";
import { P2PTransactions } from "../../../components/P2PTransaction";
import { getServerSession } from "next-auth";
import { authOptions } from "../../lib/auth";
import { SendCard } from "../../../components/SendMoney";


async function getP2PTransactions() {
    const session = await getServerSession(authOptions);
    console.log(session);
    const txns = await prisma.p2PTransaction.findMany({
        where: {
            fromId: Number(session?.user?.id)
        }
    });
    const Sent :{
        time : Date,
        amount : number,
        user_id : number,
        received : boolean}[] =  txns.map((t) => ({
       time : t.timeStamp,
       amount : t.amount,
        user_id : t.toId,
        received : false
    }))

    const txns_2 = await prisma.p2PTransaction.findMany({
        where: {
            toId: Number(session?.user?.id)
        }
    });

    const received :{
        time : Date,
        amount : number,
        user_id : number,
        received : boolean}[]  = txns_2.map((t) => ({
        time : t.timeStamp,
        amount : t.amount,
         user_id: t.fromId,
         received : true
     }))

    return [...Sent,...received]

}

export default async function() {
    const transactions = await getP2PTransactions();
    const session = await getServerSession(authOptions);
    console.log(session);
    return <div className="w-screen">
        <div className="text-4xl text-[#6a51a6] pt-8 mb-8 font-bold">
            Transfer
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 p-4">
            <div>
                <SendCard />
            </div>
            <div>
                <div className="pt-4">
                    <P2PTransactions transactions={transactions}/>
                </div>
            </div>
        </div>
    </div>
}
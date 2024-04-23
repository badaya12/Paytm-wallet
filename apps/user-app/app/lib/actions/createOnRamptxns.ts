"use server"
import { getServerSession } from "next-auth";
import { authOptions } from "../auth";
import db from "@repo/db/client";


export async function createOnRampTransactions(amount : number,provider :string){
    const session = await getServerSession(authOptions);
    const userId = session.user.id;
    if(!userId)
    {
        return {message : "Not valid user"};
    }

    const Token : string = (Math.random()*1000).toString();
    await db.$transaction([
        db.onRampTransaction.create({
            data:{
                status : "Processing",
                provider : provider,
                amount : amount*100,
                token : Token,
                userId : Number(userId),
                startTime : new Date()
            }
        })

        
    ])
    return {message : "Money successfully addeed"};

}
"use server"

import prisma from "@repo/db/client"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth"



export async  function createP2PTransactions(amount : number,phoneNumber:string){
    const session = await getServerSession(authOptions);
    const user_id_1 = session?.user?.id;
    if(!user_id_1)
      {  return {message :"something went wrong"};}
    const user2 = await prisma.user.findFirst({where:{number : phoneNumber}});
    if(!user2)
       { return {message :"user does not exist"};}
    
    try
   { await prisma.$transaction(async (tx) =>{
    await tx.$queryRaw`SELECT * FROM "Balance" WHERE "userId" = ${Number(user_id_1)} FOR UPDATE`;
        const user1 = await tx.balance.findFirst({where : {userId: Number(user_id_1)}})
        if(!user1 || user1.amount < amount)
            {
                throw new Error("Insufficient Funds");
            }
       await tx.balance.update({
        where:{userId : Number(user_id_1)},
        data:{
            amount : {
                decrement :amount
            }
        }
       }),
       await tx.balance.update({
        where:{userId : Number(user2.id)},
        data:{
            amount : {
                increment :amount
            }
        }
       }),
       await tx.p2PTransaction.create({
        data:{
            amount : amount,
            fromId : Number(user_id_1),
            toId :  user2.id,
            timeStamp : new Date()
        }
       })
   })
   console.log("transaction")
    return {message :"Transaction Successful"};
}
    catch(e){
        return {message:"Something went wrong"};
    }
}
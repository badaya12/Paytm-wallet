import express from "express";
import db from "@repo/db/client"
const app = express();
app.use(express.json())
app.post("/hdfcWebhook", async (req, res) => {
    //TODO: Add zod validation here?
    const paymentInformation :{
        token : string,
        userId : string,
        amount : string
    } = {
        token: req.body.token,
        userId: req.body.user_identifier,
        amount: req.body.amount
    };
    try{
        await db.$transaction([
            db.balance.updateMany({
                where: {userId:Number(paymentInformation.userId)},
                data:{
                    amount:{
                        increment : Number(paymentInformation.amount)
                    }
                }
            }),
            db.onRampTransaction.updateMany({
                where:{
                    token : paymentInformation.token
                },
                data:{
                    status : "Success"
                }
            })
        ])
    }
    catch(e){
        res.status(401).json({message : "something went wrong"})
    }
    res.status(200).json({message : "Successful transaction"})

})
app.listen(3003,()=>{console.log("server started")});
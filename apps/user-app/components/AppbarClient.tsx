"use client"
import { signIn, signOut, useSession } from "next-auth/react";
import { Appbar } from "@repo/ui/appbar";
import { useRouter } from "next/navigation";

export function AppbarClient(){
    const route  =  useRouter();
  const session = useSession();
  return (
   <div>
      <Appbar onSignin={signIn} onSignout={async()=>{
        await signOut();
        route.push("/api/auth/signin");
      }} user={session.data?.user} />
   </div>
  );
}

import { NextRequest, NextResponse } from "next/server";
import { appUrl, configured, db } from "@/lib/supabase";

export async function GET(request:NextRequest){
  const token=request.nextUrl.searchParams.get("token_hash");
  const type=request.nextUrl.searchParams.get("type");
  const code=request.nextUrl.searchParams.get("code");
  if(!configured()) return NextResponse.redirect(new URL("/forgot-password?invalid=1",appUrl()));
  const client=await db();
  if((token && (type==="recovery" || type==="invite")) || code){
    const {error}=token && (type==="recovery" || type==="invite")?
      await client.auth.verifyOtp({token_hash:token,type}):await client.auth.exchangeCodeForSession(code!);
    if(!error){
      const response=NextResponse.redirect(new URL("/reset-password",appUrl()));
      response.cookies.set("scm-recovery","approved",{httpOnly:true,sameSite:"lax",secure:appUrl().startsWith("https:"),maxAge:600,path:"/"});
      response.headers.set("Cache-Control","no-store");
      return response;
    }
  }
  return NextResponse.redirect(new URL("/forgot-password?invalid=1",appUrl()));
}


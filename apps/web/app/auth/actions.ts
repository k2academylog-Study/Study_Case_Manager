"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { appUrl, configured, db } from "@/lib/supabase";

export type Result = { error?:string; notice?:string };
export async function signIn(role:"admin"|"staff", _state:Result, data:FormData):Promise<Result> {
  if(!configured()) return {error:"Institutional access is awaiting Supabase configuration. You can explore the demo."};
  const parsed=z.object({email:z.email(),password:z.string().min(1).max(256)}).safeParse(Object.fromEntries(data));
  if(!parsed.success) return {error:"Enter a valid email address and password."};
  const client=await db();
  const {error}=await client.auth.signInWithPassword(parsed.data);
  if(error) return {error:"Check your credentials or ask your institution to verify your access."};
  const {data:member}=await client.rpc("current_actor").maybeSingle();
  if((member as {role?:string}|null)?.role!==role){
    await client.auth.signOut({scope:"local"});
    return {error:"This account does not have access to this portal."};
  }
  redirect("/"+role+"/dashboard");
}
export async function requestReset(_state:Result,data:FormData):Promise<Result>{
  const email=z.email().safeParse(data.get("email"));
  if(!email.success) return {error:"Enter a valid email address."};
  if(!configured()) return {error:"Institutional access is awaiting Supabase configuration."};
  const client=await db();
  await client.auth.resetPasswordForEmail(email.data,{redirectTo:appUrl()+"/auth/confirm"});
  return {notice:"If this address belongs to an active account, a password reset email will arrive shortly."};
}
export async function setPassword(_state:Result,data:FormData):Promise<Result>{
  if(!configured()) return {error:"Institutional access is awaiting Supabase configuration."};
  const jar=await cookies();
  if(jar.get("scm-recovery")?.value!=="approved") return {error:"Open a valid password setup or recovery link first."};
  const password=z.string().min(12).max(128).safeParse(data.get("password"));
  if(!password.success || password.data!==data.get("confirm")) return {error:"Use at least 12 characters and enter the same password twice."};
  const client=await db();
  const {error}=await client.auth.updateUser({password:password.data});
  if(error)return {error:"This password could not be saved. Request a new link and try again."};
  await client.auth.signOut({scope:"local"});
  jar.delete("scm-recovery");
  redirect("/?password=updated");
}
export async function signOut() {
  if(configured()) await (await db()).auth.signOut({scope:"local"});
  redirect("/");
}


import "server-only";
import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Role } from "./catalog";

export function configured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
export async function db() {
  if (!configured()) throw new Error("Supabase is not configured.");
  const jar=await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
    cookieOptions:{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production" && !process.env.NEXT_PUBLIC_APP_URL?.startsWith("http://localhost")},
    cookies:{
      getAll:()=>jar.getAll(),
      setAll(items){ try{ for(const item of items) jar.set(item.name,item.value,item.options); } catch { /* Proxy refreshes cookies for Server Components. */ } },
    },
  });
}
export function serviceDb() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url || !key) throw new Error("The service role is not configured.");
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
export async function staffAuthAccount(email:string) {
  const url=new URL("/auth/v1/admin/users",process.env.NEXT_PUBLIC_SUPABASE_URL!);
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const target=email.trim().toLowerCase();
  url.searchParams.set("filter",target);
  url.searchParams.set("per_page","100");
  const headers:Record<string,string>={apikey:key};
  if(!key.startsWith("sb_secret_"))headers.Authorization="Bearer "+key;
  for(let page=1;;page++){
    url.searchParams.set("page",String(page));
    const res=await fetch(url,{headers,cache:"no-store",redirect:"error",signal:AbortSignal.timeout(10000)});
    if(!res.ok)throw new Error("Auth account lookup failed.");
    const {users}=await res.json() as {users:{id:string;email?:string;email_confirmed_at?:string}[]};
    const match=users.find(user=>user.email?.toLowerCase()===target);
    if(match)return match;
    if(users.length<100)return null;
  }
}
export const actor=cache(async()=>{
  if(!configured()) return null;
  const client=await db();
  const {data:claims,error}=await client.auth.getClaims();
  if(error || !claims?.claims.sub) return null;
  const {data}=await client.rpc("current_actor").maybeSingle();
  const membership=data as {institution_id:string;role:Role;staff_id:string|null;display_name:string}|null;
  return membership ? {...membership,userId:String(claims.claims.sub),client} : null;
});
export async function apiAllowed(client:Awaited<ReturnType<typeof db>>,route:string){
  const {data,error}=await client.rpc("consume_api_quota",{p_route:route});
  return !error&&data===true;
}
export function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}


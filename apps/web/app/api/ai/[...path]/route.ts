import { NextResponse, type NextRequest } from "next/server";
import { actor, apiAllowed, appUrl } from "@/lib/supabase";
export const maxDuration=120;
const getRoutes=/^(assistant\/conversations(?:\/[\w-]+)?|performance\/results\/[\w-]+|communication\/status\/[\w-]+|runs\/[\w-]+|integrations|usage)$/;
const postRoutes=/^(assistant\/chat|performance\/analyze|interventions|communication\/(draft|edit|approve|send|schedule|cancel|retry|templates))$/;
const patchRoutes=/^interventions\/[\w-]+$/;
const fail=(message:string,status:number)=>NextResponse.json({error:message},{status});
async function forward(request:NextRequest,{params}:{params:Promise<{path:string[]}>}){
  const path=(await params).path.join("/");
  const method=request.method;
  const allowed=method==="GET"?getRoutes:method==="PATCH"?patchRoutes:postRoutes;
  if(!allowed.test(path))return fail("This endpoint is unavailable.",404);
  if(method!=="GET"&&![request.nextUrl.origin,new URL(appUrl()).origin].includes(request.headers.get("origin")??""))return fail("Invalid request origin.",403);
  const user=await actor();
  if(!user)return fail("Sign in to continue.",401);
  if(user.role!=="admin"&&!path.startsWith("assistant/")&&!path.startsWith("runs/"))return fail("Administrator access is required.",403);
  const quota=method!=="GET"?"agent_write":path==="integrations"&&request.nextUrl.searchParams.get("verify")==="true"?"provider_check":null;
  if(quota&&!await apiAllowed(user.client,quota))return fail("Too many AI requests. Try again shortly.",429);
  if(!process.env.AI_BACKEND_URL||!process.env.INTERNAL_API_SECRET)return fail("The AI service is awaiting configuration.",503);
  const {data:{session}}=await user.client.auth.getSession();
  if(!session?.access_token)return fail("Your session has expired.",401);
  const body=method==="GET"?undefined:await request.text();
  if((body?.length??0)>120_000)return fail("Request is too large.",413);
  try{
    const url=process.env.AI_BACKEND_URL.replace(/\/$/,"")+"/api/v1/ai/"+path+request.nextUrl.search;
    const upstream=await fetch(url,{method,body,headers:{"Authorization":"Bearer "+session.access_token,"Content-Type":"application/json","X-Internal-Secret":process.env.INTERNAL_API_SECRET},signal:AbortSignal.timeout(115_000),cache:"no-store"});
    const response=await upstream.json();
    if(!upstream.ok)return fail(typeof response.detail==="string"?response.detail:"The agent could not complete this request.",upstream.status);
    return NextResponse.json(response,{status:upstream.status,headers:{"Cache-Control":"no-store"}});
  }catch{return fail("The AI service could not be reached.",502);}
}
export const GET=forward;
export const POST=forward;
export const PATCH=forward;


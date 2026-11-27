import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request:NextRequest) {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let response=NextResponse.next({request});
  if(!url || !key) return response;
  const client=createServerClient(url,key,{
    cookieOptions:{httpOnly:true,sameSite:"lax",secure:request.nextUrl.protocol==="https:"},
    cookies:{
      getAll:()=>request.cookies.getAll(),
      setAll(items){
        for(const item of items) request.cookies.set(item.name,item.value);
        response=NextResponse.next({request});
        for(const item of items) response.cookies.set(item.name,item.value,item.options);
      },
    },
  });
  await client.auth.getClaims();
  response.headers.set("Cache-Control","private, no-store");
  return response;
}
export const config={matcher:["/admin/:path*","/staff/:path*","/auth/:path*","/api/:path*"]};


import { createClient } from "@supabase/supabase-js";
import { actor } from "@/lib/supabase";

export const dynamic="force-dynamic";
export const maxDuration=30;
export async function GET(request:Request){
  const user=await actor();
  if(!user)return new Response(null,{status:401});
  const {data:{session}}=await user.client.auth.getSession();
  if(!session?.access_token)return new Response(null,{status:401});
  const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
    accessToken:async()=>session.access_token,
    auth:{persistSession:false,autoRefreshToken:false},
  });
  const encoder=new TextEncoder();
  let cleanup=()=>{};
  const stream=new ReadableStream<Uint8Array>({
    start(controller){
      let closed=false;
      const timer=setTimeout(()=>close(),21_000);
      const heartbeat=setInterval(()=>event(": heartbeat\n\n"),8_000);
      const channel=client.channel("institution-notifications-"+crypto.randomUUID()).on("postgres_changes",
        {event:"INSERT",schema:"public",table:"notifications",filter:"institution_id=eq."+user.institution_id},()=>event("data: changed\n\n"));
      function event(value:string){if(!closed)controller.enqueue(encoder.encode(value));}
      function close(){
        if(closed)return;
        closed=true;clearTimeout(timer);clearInterval(heartbeat);
        void client.removeChannel(channel);
        request.signal.removeEventListener("abort",close);
        try{controller.close();}catch{/* The client already closed the stream. */}
      }
      cleanup=close;
      request.signal.addEventListener("abort",close,{once:true});
      event("retry: 2000\n\n");
      channel.subscribe();
    },
    cancel(){cleanup();},
  });
  return new Response(stream,{headers:{"Content-Type":"text/event-stream","Cache-Control":"private, no-store","X-Accel-Buffering":"no"}});
}

"use client";
import { useState } from "react";
import { Link2 } from "lucide-react";
import { Notice } from "./ui";
type Check={model:boolean;email:boolean;whatsapp:boolean;redis:boolean;verified?:{email?:boolean;whatsapp?:boolean}};
export function IntegrationCheck({online}:{online:boolean}){
  const [status,setStatus]=useState<Check>();
  const [usage,setUsage]=useState<{requests:number;input_tokens:number;output_tokens:number;estimated_usd:number}>();
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  async function check(){
    setBusy(true);setError("");
    try{
      const response=await fetch("/api/ai/integrations?verify=true",{cache:"no-store"});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error);
      setStatus({...result,redis:result.background_delivery});
      const usageResponse=await fetch("/api/ai/usage",{cache:"no-store"});
      if(usageResponse.ok)setUsage(await usageResponse.json());
    }catch(err){setError((err as Error).message);}finally{setBusy(false);}
  }
  function provider(channel:"email"|"whatsapp"){
    if(!status?.[channel])return "Awaiting configuration";
    return status.verified?.[channel]?"Connection verified":"Configured · verification unavailable";
  }
  return <div className="record-form">
    <div className="row-field"><Notice>AI backend {online?"configured":"awaiting configuration"}</Notice><button disabled={!online||busy} className="button button-secondary" onClick={check}><Link2 size={16}/>{busy?"Checking…":"Check connections"}</button></div>
    {status&&<dl className="details-grid"><div><dt>GPT‑4o mini</dt><dd>{status.model?"Configured":"Awaiting configuration"}</dd></div><div><dt>Background workers</dt><dd>{status.redis?"Configured":"Awaiting configuration"}</dd></div><div><dt>Resend</dt><dd>{provider("email")}</dd></div><div><dt>WhatsApp Business</dt><dd>{provider("whatsapp")}</dd></div></dl>}
    {usage&&<div><h3>AI usage ? Last 30 days</h3><div className="report-kpis">{[["Metered runs",usage.requests],["Input tokens",usage.input_tokens],["Output tokens",usage.output_tokens],["Estimated cost","$"+Number(usage.estimated_usd).toFixed(4)]].map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></div>}
    {error&&<Notice type="error">{error}</Notice>}
  </div>;
}

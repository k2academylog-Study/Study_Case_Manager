"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Notice } from "./ui";

export function RecordFile({type,id,exists,editable=true}:{type:"student"|"staff"|"assignment"|"institution";id:string;exists:boolean;editable?:boolean}){
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState<{error?:string;success?:string}>({});
  const attachment=type==="assignment";
  const name=attachment?"attachment":type==="institution"?"logo":"profile photo";
  const path="/api/files?type="+type+"&id="+id;
  async function upload(file:File|undefined){
    if(!file)return;
    setBusy(true);setStatus({});
    try{
      const data=new FormData();
      data.set("type",type);data.set("id",id);data.set("file",file);
      const response=await fetch("/api/files",{method:"POST",body:data});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error);
      setStatus({success:name.charAt(0).toUpperCase()+name.slice(1)+" saved."});router.refresh();
    }catch(error){setStatus({error:(error as Error).message});}
    finally{setBusy(false);}
  }
  return <div className="row-field">
    {exists&&<a className="button button-secondary" href={path} target="_blank" rel="noreferrer">View {name}</a>}
    {editable&&<label className="button button-secondary upload-label"><Upload size={15}/>{busy?"Uploading…":(exists?"Replace ":"Upload ")+name}<input type="file" disabled={busy} aria-label={"Upload "+name} accept={attachment?".pdf,.png,.jpg,.jpeg,.webp":type==="institution"?".png,.jpg,.jpeg":".png,.jpg,.jpeg,.webp"} onChange={e=>{void upload(e.target.files?.[0]);e.target.value="";}}/></label>}
    {status.error&&<Notice type="error">{status.error}</Notice>}
    {status.success&&<Notice type="success">{status.success}</Notice>}
  </div>;
}

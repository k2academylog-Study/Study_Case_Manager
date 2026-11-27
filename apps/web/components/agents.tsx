"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, CalendarClock, ClipboardCheck, MessageSquareText, Plus, Send, Sparkles } from "lucide-react";
import { label, list, rowName, type Data, type Item, type Role } from "@/lib/catalog";
import type { Filters } from "@/lib/metrics";
import { localTime, Modal, RecordTable } from "./records";
import { FilterBar } from "./dashboard";
import { Empty, Notice, PageHeading, Status } from "./ui";

async function call<T>(path:string,body?:unknown):Promise<T>{
  const response=await fetch("/api/ai/"+path,{method:body===undefined?"GET":"POST",headers:{"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});
  const result=await response.json();
  if(!response.ok)throw new Error(result.error??"The AI request failed.");
  return result as T;
}
function AgentHeader({title,description,integrated,link,children}:{title:string;description:string;integrated:boolean;link?:string;children?:React.ReactNode}){
  return <><PageHeading title={title} detail={description}>{children}</PageHeading>{!integrated&&<div style={{marginBottom:14}}><Notice>The AI service is awaiting configuration.{link&&<> <Link href={link} className="text-link">Review settings</Link></>}</Notice></div>}</>;
}
type Finding={student_id:string;summary:string;recommendations:string[];evidence_keys:string[]};
type Analysis={id?:string;analyzed:number;average_attendance:number|null;average_assessment:number|null;findings:Finding[];missing:string[];evidence:Record<string,Record<string,unknown>>};
export function PerformanceAgent({data,base,enabled,demo}:{data:Data;base:string;enabled:boolean;demo:boolean}){
  const [filters,setFilters]=useState<Filters>({});
  const [student,setStudent]=useState("");
  const [analysis,setAnalysis]=useState<Analysis|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  async function analyze(){
    setBusy(true);setError("");
    try{
      const response=await call<{run_id:string;status:string;result?:Analysis}>("performance/analyze",{request_id:crypto.randomUUID(),class_id:filters.classId,batch_id:filters.batchId,subject_id:filters.subjectId,staff_id:filters.staffId,student_id:student||undefined,from_date:filters.from,to_date:filters.to});
      if(response.result){setAnalysis(response.result);return;}
      for(let attempt=0;attempt<30;attempt++){
        await new Promise(resolve=>setTimeout(resolve,1500));
        const next=await call<{status:string;details?:{result_id?:string;error?:string}}>("runs/"+response.run_id);
        if(next.status==="failed")throw new Error(next.details?.error??"The analysis failed.");
        if(next.details?.result_id){
          const result=await call<{result:Analysis}>("performance/results/"+next.details.result_id);
          setAnalysis(result.result);return;
        }
      }
      throw new Error("The analysis is still processing. Check the saved analyses list.");
    }catch(err){setError((err as Error).message);}finally{setBusy(false);}
  }
  return <><AgentHeader title="Student performance analysis" description="Review academic evidence and prepare student support plans." integrated={enabled} link={demo?undefined:base+"/settings"}><button className="button button-primary" disabled={!enabled||busy} onClick={analyze}><Sparkles size={16}/>{busy?"Analyzing…":"Run AI analysis"}</button></AgentHeader>
  <div className="module-hero"><span className="feature-icon purple"><Activity size={21}/></span><div><h2>Evidence-based academic review</h2><p>Use attendance, assessment trends, and assignment data alongside teacher observations.</p></div></div>
  <FilterBar data={data} filters={filters} setFilters={setFilters}/>
  <div className="padded-panel panel"><label className="stack-field">Student scope<select value={student} onChange={e=>setStudent(e.target.value)}><option value="">All eligible students</option>{list(data,"students").filter(r=>!filters.batchId||r.batch_id===filters.batchId).map(row=><option key={row.id} value={row.id}>{String(row.name)}</option>)}</select></label></div>
  {error&&<Notice type="error">{error}</Notice>}
  {analysis?<><div className="report-kpis">{[["Students analyzed",analysis.analyzed],["Average attendance",analysis.average_attendance],["Average assessment",analysis.average_assessment],["Review findings",analysis.findings.length]].map(([key,value])=><div key={key}><span>{key}</span><strong>{value??"—"}</strong></div>)}</div>{analysis.missing.length>0&&<Notice>Missing data · {analysis.missing.join(", ")}</Notice>}
    <div className="panel-stack">{analysis.findings.map(finding=><section className="panel padded-panel" key={finding.student_id}><div className="panel-head"><div><h2>{rowName(data,"students",finding.student_id)}</h2><p>{finding.summary}</p></div></div><ul style={{listStyle:"disc",marginLeft:20}}>{finding.recommendations.map(item=><li key={item}>{item}</li>)}</ul><details style={{margin:"10px 0"}}><summary>Supporting academic records</summary><dl className="details-grid">{Object.entries(analysis.evidence[finding.student_id]??{}).map(([key,value])=><div key={key}><dt>{label(key)}</dt><dd>{Array.isArray(value)?value.map(String).join(", "):label(value)}</dd></div>)}</dl></details><div className="row-field"><Link className="button button-secondary" href={base+"/ai/interventions?create=1"}><ClipboardCheck size={16}/> Create intervention plan</Link><Link className="button button-secondary" href={base+"/ai/communication?student="+finding.student_id}>Notify subject teachers</Link><Link className="button button-ghost" href={base+"/reports/students/"+finding.student_id}>Download report</Link></div></section>)}</div>{!analysis.findings.length&&<div className="panel"><Empty title="No findings for this scope"/></div>}</>:<section className="panel"><Empty title="No analysis selected" text="Select a scope and run an analysis, or open a result from the history."/></section>}
  <section style={{marginTop:15}}><div className="panel-head"><h2>Saved analyses</h2></div><RecordTable data={data} items={list(data,"ai_analysis_results")} columns={["created_at","run_id"]} renderAction={row=><button className="text-link" onClick={()=>setAnalysis(row.result as Analysis)}>Open analysis</button>}/></section></>;
}
type Dataset={tool:string;count:number;records:Record<string,unknown>[]};
type Message={id?:string;role:"user"|"assistant";body:string;sources?:{tool:string;count:number}[];links?:{label:string;path:string}[];datasets?:Dataset[];follow_up?:string[]};
function ResultTables({datasets}:{datasets:Dataset[]}){
  return <>{datasets.map((set,i)=>{
    const keys=[...new Set(set.records.flatMap(row=>Object.keys(row)))].slice(0,10);
    return <details key={set.tool+i} className="tool-result"><summary>{label(set.tool)} ? {set.count} records</summary><div className="table-scroll"><table><thead><tr>{keys.map(key=><th key={key}>{label(key)}</th>)}</tr></thead><tbody>{set.records.map((row,index)=><tr key={index}>{keys.map(key=><td key={key}>{Array.isArray(row[key])?(row[key] as unknown[]).map(label).join(", "):typeof row[key]==="object"&&row[key]!==null?Object.entries(row[key] as Record<string,unknown>).map(([name,value])=>name+" "+label(value)).join(", "):label(row[key])}</td>)}</tr>)}</tbody></table></div></details>;
  })}</>;
}
type Conversation={id:string;title:string;messages?:Message[]};
export function AssistantAgent({enabled,base,role}:{enabled:boolean;base:string;role:Role}){
  const [conversation,setConversation]=useState<string>();
  const [history,setHistory]=useState<Conversation[]>([]);
  const [messages,setMessages]=useState<Message[]>([]);
  const [prompt,setPrompt]=useState("");
  const [search,setSearch]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  useEffect(()=>{if(enabled)call<{items:Conversation[]}>("assistant/conversations").then(result=>setHistory(result.items)).catch(error=>setError(error.message));},[enabled]);
  async function send(text:string){
    if(!text.trim()||busy||!enabled)return;
    setBusy(true);setError("");setPrompt("");setMessages(old=>[...old,{role:"user",body:text}]);
    try{
      const result=await call<{conversation_id:string;title:string;message:Message}>("assistant/chat",{request_id:crypto.randomUUID(),conversation_id:conversation,question:text});
      setConversation(result.conversation_id);setMessages(old=>[...old,result.message]);
      setHistory(old=>old.some(item=>item.id===result.conversation_id)?old:[{id:result.conversation_id,title:result.title},...old]);
    }catch(err){setError((err as Error).message);setMessages(old=>old.slice(0,-1));setPrompt(text);}finally{setBusy(false);}
  }
  async function open(id:string){
    try{const result=await call<Conversation>("assistant/conversations/"+id);setConversation(id);setMessages(result.messages??[]);}
    catch(err){setError((err as Error).message);}
  }
  const suggestions=role==="admin"?["Which classes have low attendance?","Show syllabus progress by subject.","Who has pending attendance records?"]:["What classes are scheduled for me tomorrow?","Show my syllabus progress.","Which assignments are pending?"];
  return <><AgentHeader title="Academic assistant" description="Ask questions about authorized academic records." integrated={enabled}/>
    <div className="chat-layout"><aside className="panel padded-panel chat-history"><h2>Conversations</h2><button className="button button-primary" disabled={busy} onClick={()=>{setConversation(undefined);setMessages([]);setError("");}}><Plus size={16}/> New conversation</button><input aria-label="Search conversations" placeholder="Search history…" value={search} onChange={e=>setSearch(e.target.value)}/>{history.filter(item=>item.title.toLowerCase().includes(search.toLowerCase())).map(item=><button disabled={busy} className={"button "+(item.id===conversation?"button-primary":"button-secondary")} key={item.id} onClick={()=>open(item.id)}>{item.title}</button>)}</aside>
    <section className="panel padded-panel"><div className="message-list" aria-live="polite">{messages.length?messages.map((message,i)=><div className={"message "+message.role} key={message.id??i}><strong>{message.role==="user"?"You":"Academic assistant"}</strong><div>{message.body}</div>{message.datasets&&<ResultTables datasets={message.datasets}/>}
    {message.follow_up?.length?<div className="section-tabs" style={{marginTop:8,marginBottom:2}}>{message.follow_up.filter(Boolean).map((suggestion,index)=><button key={index} onClick={()=>setPrompt(suggestion.slice(0,4000))} disabled={busy}>{suggestion}</button>)}</div>:null}{message.sources?.map(source=><small key={source.tool} style={{marginRight:9}}>{label(source.tool)} · {source.count} records</small>)}{message.links?.filter(link=>/^\/(reports|ai)\//.test(link.path)).map(link=><Link className="text-link" key={link.path} href={base+link.path}>{link.label}</Link>)}</div>):<><div className="module-hero"><span className="feature-icon purple"><Sparkles size={21}/></span><div><h2>What would you like to know?</h2><p>Ask about attendance, results, teaching schedules, or syllabus progress.</p></div></div><div className="section-tabs">{suggestions.map(item=><button key={item} disabled={!enabled} onClick={()=>setPrompt(item)}>{item}</button>)}</div></>}</div>
    {error&&<Notice type="error">{error}</Notice>}
    <form className="record-form" onSubmit={e=>{e.preventDefault();void send(prompt);}}><label className="stack-field">Your question<textarea placeholder="Ask about your academic workspace…" maxLength={4000} value={prompt} onChange={e=>setPrompt(e.target.value)} disabled={!enabled} required/></label><div className="form-actions"><button className="button button-primary" disabled={!enabled||busy||!prompt.trim()}><Send size={16}/>{busy?"Retrieving records…":"Send question"}</button></div></form></section></div></>;
}

type Draft={id:string;title:string;status:string;content_hash:string;recipients:Item[];excluded?:number;deliveries?:Item[]};
export function CommunicationAgent({data,enabled,demo,studentId,campaignId,reportId,recipientId}:{data:Data;enabled:boolean;demo:boolean;studentId?:string;campaignId?:string;reportId?:string;recipientId?:string}){
  const [tab,setTab]=useState("Quick send");
  const [command,setCommand]=useState(reportId?(studentId?"Prepare an email for the verified parent or guardian of this student. Introduce the attached academic report.":"Prepare an email to the selected staff member about their attached teaching report."):studentId?"Prepare a reminder for the subject teachers assigned to the selected student's batch. Ask them to review current progress and determine whether revision support is needed.":"");
  const [channel,setChannel]=useState("email");
  const [templateId,setTemplateId]=useState("");
  const [templateName,setTemplateName]=useState("");
  const [templateBody,setTemplateBody]=useState("");
  const [templateDialog,setTemplateDialog]=useState<"email"|"whatsapp"|null>(null);
  const [providerName,setProviderName]=useState("");
  const [language,setLanguage]=useState("en_US");
  const [integrations,setIntegrations]=useState<{email?:boolean;whatsapp?:boolean;templates?:Item[]}>({});
  const [staffIds,setStaffIds]=useState<string[]>(recipientId?[recipientId]:[]);
  const [draft,setDraft]=useState<Draft|null>(null);
  const [approved,setApproved]=useState(false);
  const [editing,setEditing]=useState(false);
  const [editSubject,setEditSubject]=useState("");
  const [editBody,setEditBody]=useState("");
  const [editVariables,setEditVariables]=useState<string[]>([]);
  const [confirm,setConfirm]=useState(false);
  const [schedule,setSchedule]=useState("");
  const [repeat,setRepeat]=useState(7);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const [busy,setBusy]=useState(false);
  const [history,setHistory]=useState(list(data,"communication_campaigns"));
  const timezone=String(list(data,"institution_settings")[0]?.timezone??"Asia/Kolkata");
  const available=(channel==="email"?integrations.email:integrations.whatsapp)===true;
  async function open(id:string){
    try{const result=await call<Draft>("communication/status/"+id);setDraft(result);setApproved(result.status==="approved");if(result.recipients[0]?.channel)setChannel(String(result.recipients[0].channel));}
    catch(err){setError((err as Error).message);}
  }
  useEffect(()=>{
    if(!enabled)return;
    call<typeof integrations>("integrations").then(setIntegrations).catch(error=>setError(error.message));
    if(campaignId)void open(campaignId);
  },[enabled,campaignId]);
  function remember(item:Draft){
    setDraft(item);
    setHistory(old=>[{...item,id:item.id},...old.filter(row=>row.id!==item.id)]);
  }
  async function perform(action:string,body:Record<string,unknown>){
    setBusy(true);setError("");setSuccess("");
    try{
      if(action==="template"){
        const value=await call<Item>("communication/templates",body);
        setIntegrations(previous=>({...previous,templates:[...(previous.templates??[]),value]}));setTemplateDialog(null);setSuccess("Template saved.");
        return;
      }
      const result=await call<Draft>("communication/"+action,body);
      if(action==="edit"&&draft)setHistory(old=>old.map(row=>row.id===draft.id?{...row,status:"cancelled"}:row));
      remember(result);
      setEditing(false);
      setApproved(result.status==="approved");
      if(action!=="draft")setSuccess("Campaign "+label(result.status)+".");
    }catch(err){setError((err as Error).message);}finally{setBusy(false);setConfirm(false);}
  }
  async function generate(){
    await perform("draft",{request_id:crypto.randomUUID(),command,channel,staff_ids:staffIds,student_id:studentId||undefined,template_id:templateId||undefined,report_id:reportId||undefined});
  }
  const preview=draft?.recipients[0];
  const shared=preview&&draft?.recipients.every(row=>row.body===preview.body&&row.subject===preview.subject);
  const draftTime=tab==="Quick send"||!schedule?null:localTime(schedule,timezone);
  return <><AgentHeader title="Communication & notifications" description="Prepare, review, and deliver institutional messages to eligible recipients." integrated={enabled}><button className="button button-secondary" disabled={!enabled} onClick={()=>{setTemplateName("");setTemplateBody("");setTemplateDialog(channel as "email"|"whatsapp");}}>Manage templates</button></AgentHeader>
  <div className="section-tabs">{["Quick send","Scheduled messaging","Recurring notifications"].map(value=><button key={value} className={tab===value?"selected":""} onClick={()=>setTab(value)}>{value}</button>)}</div>
  <div className="dashboard-grid"><section className="panel padded-panel">
    <div className="panel-head"><div><h2>Message instructions</h2><p>Describe what to communicate and who should receive it.</p></div><span className="feature-icon purple"><MessageSquareText size={19}/></span></div>
    <form className="record-form" onSubmit={e=>{e.preventDefault();void generate();}}><label className="stack-field">Command<textarea value={command} maxLength={4000} placeholder="Example: Email Mathematics teachers about the faculty meeting on Friday at 10:00." onChange={e=>setCommand(e.target.value)} required/></label>
    <div className="form-grid"><label>Channel<select value={channel} disabled={Boolean(reportId)} onChange={e=>{setChannel(e.target.value);setTemplateId("");}}><option value="email">Email</option><option value="whatsapp">WhatsApp</option></select></label>
    <label>{channel==="whatsapp"?"Approved WhatsApp template":"Email template"}<select value={templateId} onChange={e=>setTemplateId(e.target.value)}><option value="">{channel==="whatsapp"?"Select template":"Draft from instructions"}</option>{integrations.templates?.filter(item=>item.channel===channel).map(item=><option key={item.id} value={item.id}>{String(item.name)}</option>)}</select></label>
    {tab!=="Quick send"&&<label>Send at ({timezone})<input type="datetime-local" value={schedule} onChange={e=>setSchedule(e.target.value)}/></label>}
    {tab==="Recurring notifications"&&<label>Repeat every (days)<input type="number" min="1" max="365" value={repeat} onChange={e=>setRepeat(Number(e.target.value))}/></label>}</div>
    {reportId&&<Notice>Saved academic PDF attached for the authorized recipient.</Notice>}
    {!(reportId&&studentId)&&<details><summary>Select specific staff (optional)</summary><div className="roster-picks">{list(data,"staff").filter(r=>r.active).map(row=><label key={row.id}><input type="checkbox" checked={staffIds.includes(row.id)} onChange={()=>setStaffIds(old=>old.includes(row.id)?old.filter(id=>id!==row.id):[...old,row.id])}/>{String(row.name)}</label>)}</div></details>}
    {!available&&<Notice>{channel==="email"?"Resend":"WhatsApp Business"} delivery is awaiting configuration.</Notice>}
    <div className="form-actions"><button className="button button-primary" type="submit" disabled={!enabled||busy||!command.trim()||(channel==="whatsapp"&&!templateId)}><Sparkles size={17}/>{busy?"Working…":"Generate message preview"}</button></div></form>
  </section><section className="panel padded-panel"><div className="panel-head"><div><h2>Approval and delivery</h2><p>Review the exact message and recipients before approval.</p></div></div>{draft?<div className="record-form"><strong>{draft.title}</strong><Status value={draft.status}/><p>{draft.recipients.length} eligible recipient{draft.recipients.length===1?"":"s"}{draft.excluded?" · "+draft.excluded+" excluded":""}</p>
      {draft.recipients.map(recipient=><details key={recipient.id} open={draft.recipients.length===1}><summary>{rowName(data,recipient.student_id?"students":"staff",recipient.student_id??recipient.staff_id)} · {String(recipient.destination)}</summary><div className="message"><strong>{String(recipient.subject??recipient.template_name??recipient.channel)}</strong>{String(recipient.body)}</div></details>)}
      {shared&&["approved","awaiting_approval"].includes(draft.status)&&<button className="button button-secondary" disabled={busy} onClick={()=>{setEditSubject(String(preview.subject??""));setEditBody(String(preview.body??""));setEditVariables(Array.isArray(preview.template_variables)?preview.template_variables.map(String):[]);setEditing(true);}}>Edit message</button>}
      {draft.status==="awaiting_approval"&&<button className="button button-primary" disabled={busy||!draft.recipients.length} onClick={()=>setConfirm(true)}>Review and approve</button>}
      {approved&&<button className="button button-primary" disabled={busy||!available||(tab!=="Quick send"&&!draftTime)} onClick={()=>perform(tab==="Quick send"?"send":"schedule",{campaign_id:draft.id,content_hash:draft.content_hash,when:draftTime,recurring_days:tab==="Recurring notifications"?repeat:null})}>{tab==="Quick send"?<Send size={16}/>:<CalendarClock size={16}/>} {tab==="Quick send"?"Queue delivery":"Schedule delivery"}</button>}
      {["scheduled","queued","approved"].includes(draft.status)&&<button className="button button-secondary" disabled={busy} onClick={()=>perform("cancel",{campaign_id:draft.id,content_hash:draft.content_hash})}>Cancel campaign</button>}
      {draft.deliveries?.some(row=>row.status==="failed")&&<button className="button button-secondary" disabled={busy} onClick={()=>perform("retry",{campaign_id:draft.id,content_hash:draft.content_hash})}>Retry failed deliveries</button>}
      {!!draft.deliveries?.length&&<RecordTable data={data} items={draft.deliveries} columns={["channel","status","attempts","error"]}/>}
    </div>:<Empty title="No message preview" text="Generate a draft to review its recipients and content."/>}</section></div>
    {error&&<Notice type="error">{error}</Notice>}{success&&<Notice type="success">{success}</Notice>}
    <div className="panel-head" style={{marginTop:14}}><h2>Delivery overview</h2></div>
    {(()=>{
      const initial=list(data,"communication_delivery_logs");
      const update=new Map((draft?.deliveries??[]).map(row=>[row.id,row]));
      const logs=[...initial.filter(row=>!update.has(row.id)),...update.values()];
      const delivered=logs.filter(row=>["delivered","read"].includes(String(row.status))).length;
      const failed=logs.filter(row=>["failed","bounced"].includes(String(row.status))).length;
      const sent=logs.filter(row=>["sent","delivered","read"].includes(String(row.status)));
      const metrics=[
        ["Campaigns",history.length],["Awaiting approval",history.filter(row=>row.status==="awaiting_approval").length],["Scheduled",history.filter(row=>row.status==="scheduled").length],
        ["Email accepted",sent.filter(row=>row.channel==="email").length],["WhatsApp accepted",sent.filter(row=>row.channel==="whatsapp").length],
        ["Provider-confirmed",delivered],["Failed or bounced",failed],["Confirmed delivery rate",sent.length+failed?Math.round(delivered*100/(sent.length+failed))+"%":"—"],
      ];
      return <div className="report-kpis">{metrics.map(([key,value])=><div className="panel" key={key}><span>{key}</span><strong>{value}</strong></div>)}</div>;
    })()}
    <div className="panel-head" style={{marginTop:14}}><h2>Campaign history</h2></div><RecordTable data={data} items={history} columns={["title","status","next_run_at"]} renderAction={row=><button className="text-link" onClick={()=>open(row.id)} disabled={!enabled}>Open campaign</button>}/>
    {editing&&draft&&preview&&<Modal title="Edit message preview" close={()=>setEditing(false)}><form className="record-form" onSubmit={e=>{e.preventDefault();void perform("edit",{campaign_id:draft.id,content_hash:draft.content_hash,subject:editSubject||null,body:editBody||null,template_variables:preview.channel==="whatsapp"?editVariables:null});}}>
      <p>The edited message requires a new approval.</p>{preview.channel==="email"?<><label className="stack-field">Subject<input required maxLength={160} value={editSubject} onChange={e=>setEditSubject(e.target.value)}/></label><label className="stack-field">Message<textarea required maxLength={3000} value={editBody} onChange={e=>setEditBody(e.target.value)}/></label></>:editVariables.map((value,i)=><label className="stack-field" key={i}>Template value {i+1}<input required maxLength={300} value={value} onChange={e=>setEditVariables(old=>old.map((item,j)=>i===j?e.target.value:item))}/></label>)}
      {error&&<Notice type="error">{error}</Notice>}<div className="form-actions"><button type="button" className="button button-secondary" onClick={()=>setEditing(false)}>Cancel</button><button className="button button-primary" disabled={busy||preview.channel==="whatsapp"&&!editVariables.length}>Save new preview</button></div></form></Modal>}
    {confirm&&draft&&<Modal title="Approve this message" close={()=>setConfirm(false)}><div className="record-form"><p>Approve the displayed content for the {draft.recipients.length} listed recipients. Delivery is queued separately.</p><div className="form-actions"><button className="button button-secondary" onClick={()=>setConfirm(false)}>Cancel</button><button className="button button-primary" disabled={busy} onClick={()=>perform("approve",{campaign_id:draft.id,content_hash:draft.content_hash})}>Approve message</button></div></div></Modal>}
    {templateDialog&&<Modal title={templateDialog==="email"?"Save email template":"Register approved WhatsApp template"} close={()=>setTemplateDialog(null)}><form className="record-form" onSubmit={e=>{e.preventDefault();void perform("template",{channel:templateDialog,name:templateName,body:templateBody||String(draft?.recipients[0]?.body??""),subject:templateDialog==="email"?String(draft?.recipients[0]?.subject??templateName):null,provider_name:templateDialog==="whatsapp"?providerName:null,language:templateDialog==="whatsapp"?language:null});}}><label className="stack-field">Display name<input required value={templateName} onChange={e=>setTemplateName(e.target.value)}/></label>{templateDialog==="whatsapp"&&<><label className="stack-field">Meta template name<input required value={providerName} onChange={e=>setProviderName(e.target.value)}/></label><label className="stack-field">Meta language code<input required value={language} onChange={e=>setLanguage(e.target.value)}/></label></>}<label className="stack-field">Template body<textarea required value={templateBody||String(draft?.recipients[0]?.body??"")} onChange={e=>setTemplateBody(e.target.value)}/></label><div className="form-actions"><button className="button button-primary" disabled={busy}>Save template</button></div></form></Modal>}
    {demo&&<p className="demo-foot">Communication requires an institutional account and configured providers.</p>}
  </>;
}

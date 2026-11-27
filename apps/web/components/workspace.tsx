"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Server } from "lucide-react";
import { MotionConfig, motion } from "framer-motion";
import { list, modules, type Data, type Item, type Role } from "@/lib/catalog";
import { staffDemo } from "@/lib/demo";
import { applyDemo } from "@/lib/demo-command";
import { AssistantAgent, CommunicationAgent, PerformanceAgent } from "./agents";
import { Dashboard } from "./dashboard";
import { ModulePage, Modal, RecordForm, type RunCommand } from "./records";
import { SessionsPage, WorkRoster } from "./roster";
import { PersonPage, ReportPage } from "./reports";
import { RecordFile } from "./record-file";
import { SyllabusTree } from "./syllabus-tree";
import { IntegrationCheck } from "./integration-check";
import { WorkTopics } from "./work-topics";
import { Shell } from "./shell";
import { Empty, Notice, PageHeading } from "./ui";
const CalendarPage=dynamic(()=>import("./calendar").then(mod=>mod.CalendarPage),{ssr:false,loading:()=> <div className="skeleton" aria-label="Loading calendar"/>});

type Query={create?:string;student?:string;campaign?:string;report?:string;recipient?:string};
export function Workspace({role,route,demo=false,source,name,institution,online=false,query}:{role:Role;route:string;demo?:boolean;source:Data;name:string;institution:string;online?:boolean;query:Query}){
  const base=(demo?"/demo":"")+"/"+role;
  const router=useRouter();
  const [local,setLocal]=useState<Data>(source);
  const [roster,setRoster]=useState<{kind:"marks"|"assignments"|"student";row:Item}|null>(null);
  const [feedback,setFeedback]=useState("");
  const [workTopics,setWorkTopics]=useState<{kind:"assignments"|"assessments";entry:Item}|null>(null);
  const storageKey="study-case-manager-demo-v1";
  useEffect(()=>{
    if(!demo)return;
    try{
      const saved=localStorage.getItem(storageKey);
      if(saved)setLocal(JSON.parse(saved) as Data);
    }catch{ /* Use the initial demonstration records if older browser storage is invalid. */ }
  },[demo]);
  useEffect(()=>{
    if(demo||route!=="notifications")return;
    const feed=new EventSource("/api/academic/notifications");
    feed.onmessage=()=>router.refresh();
    return ()=>feed.close();
  },[demo,route,router]);
  const data=demo?(role==="staff"?staffDemo(local):local):source;
  const run:RunCommand=async command=>{
    if(demo){
      const result=applyDemo(local,command);setLocal(result);
      try{localStorage.setItem(storageKey,JSON.stringify(result));}catch{setFeedback("Saved for this session. Browser storage is unavailable.");}
      return;
    }
    const response=await fetch("/api/academic",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(command)});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error);
    router.refresh();
    return result;
  };
  const permitted=(capability:string)=>role==="admin"||!list(data,"role_permissions").some(row=>row.permission===capability&&row.enabled===false);
  const enabled=online&&list(data,"institution_settings")[0]?.ai_enabled===true&&permitted("academic_assistant");
  const [first,second,third]=route.split("/");
  const create=query.create==="1";
  const isPerson=first==="students"||first==="staff";
  let page:React.ReactNode;
  if(first==="dashboard"||first==="analytics")page=<Dashboard data={data} role={role} base={base} name={name} demo={demo} analytics={second}/>;
  else if(first==="reports"){
    const type=second==="students"?"student":second==="staff"?"staff":undefined;
    const person=third&&type?list(data,type==="student"?"students":"staff").find(row=>row.id===third):undefined;
    page=third&&!person?<div className="panel"><Empty title="Report subject not found"/></div>:<ReportPage data={data} base={base} demo={demo} type={type} personId={third}/>;
  }else if(isPerson&&second){
    const entry=list(data,first).find(row=>row.id===second);
    const noun=first==="students"?"student":"staff member";
    if(second==="add"||third==="edit"&&entry){
      const back=base+"/"+first+(entry?"/"+entry.id:"");
      page=<><PageHeading title={(entry?"Edit ":"Add ")+noun} detail={entry?"Update the profile and enrollment or employment status.":"Create a new institutional record."}><Link className="button button-secondary" href={back}>Back</Link></PageHeading><div className="panel padded-panel"><RecordForm module={first} entry={entry} data={data} run={run} cancel={()=>router.push(back)} onDone={()=>router.push(back)}/></div></>;
    }else page=entry?<PersonPage module={first} entry={entry} data={data} base={base} demo={demo} run={run}/>:<div className="panel"><Empty title="Profile not found"/></div>;
  }else if(first==="calendar"||first==="timetable")page=<CalendarPage data={data} role={role} base={base} timetable={first==="timetable"} run={run}/>;
  else if(first==="class-sessions"||first==="attendance")page=<SessionsPage data={data} attendance={first==="attendance"} run={run} create={create} editable={permitted("record_sessions")}/>;
  else if(route==="ai/assistant")page=<AssistantAgent enabled={enabled} base={base} role={role}/>;
  else if(route==="ai/student-performance")page=<PerformanceAgent data={data} base={base} enabled={enabled} demo={demo}/>;
  else if(route==="ai/communication")page=<CommunicationAgent data={data} enabled={enabled} demo={demo} studentId={query.student} campaignId={query.campaign} reportId={query.report} recipientId={query.recipient}/>;
  else {
    const spec=modules[route];
    const rosterKind=route==="assignments"?"assignments":route==="assessments"||route==="marks"?"marks":route==="student-performance"?"student":null;
    const editable=Boolean(spec?.fields&&(role==="admin"||spec.staffWrite&&permitted(route)));
    page=spec?<><ModulePage module={route} data={data} base={base} editable={editable} run={run} create={create} openTopics={editable&&(route==="assignments"||route==="assessments")?entry=>setWorkTopics({kind:route,entry}):undefined} openRoster={rosterKind&&(rosterKind==="student"||permitted(rosterKind==="marks"?"assessments":"assignments"))?row=>setRoster({kind:rosterKind,row}):undefined}/>
      {route==="syllabus"&&<div style={{marginTop:14}}><SyllabusTree data={data}/></div>}
      {route==="settings"&&!demo&&list(data,"institution_settings").map(settings=><section className="panel padded-panel" style={{marginTop:14}} key={settings.id}><div className="panel-head"><h2>Institution logo</h2></div><RecordFile type="institution" id={settings.id} exists={Boolean(settings.logo_path)}/></section>)}
      {route==="settings"&&<section className="panel padded-panel" style={{marginTop:14}}><div className="panel-head"><div><h2>Integrations</h2><p>Credentials are configured on the web and AI services.</p></div><span className="feature-icon purple"><Server size={20}/></span></div><IntegrationCheck online={online}/></section>}</>:<div className="panel"><Empty title="Page not found"/></div>;
  }
  return <Shell role={role} route={route} demo={demo} institution={institution} name={name}><MotionConfig reducedMotion="user"><motion.div initial={{opacity:0}} animate={{opacity:1}} transition={{duration:.17}}>
    {list(data,"dataset_limits").length>0&&<div style={{marginBottom:14}}><Notice>This preview shows the most recent records within the workspace limit. Use a narrower reporting period for a complete PDF export.</Notice></div>}
    {feedback&&<Notice>{feedback}</Notice>}
    {page}
    {workTopics&&<WorkTopics data={data} kind={workTopics.kind} entry={workTopics.entry} run={run} close={()=>setWorkTopics(null)}/>}
    {roster&&(roster.kind==="student"?<Modal title={String(roster.row.name)+" · performance"} close={()=>setRoster(null)}><ReportPage base={base} data={data} demo={demo} type="student" personId={roster.row.id} embedded/></Modal>:<WorkRoster kind={roster.kind} parent={roster.row} data={data} demo={demo} run={run} close={()=>setRoster(null)}/>)}
  </motion.div></MotionConfig></Shell>;
}


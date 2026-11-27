"use client";
import { useState } from "react";
import Link from "next/link";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { CalendarPlus, Lightbulb } from "lucide-react";
import { list, rowName, type Data, type Item, type Role } from "@/lib/catalog";
import { academicDateTime, dateKey, scope, syllabusProgress, type Filters } from "@/lib/metrics";
import { FilterBar } from "./dashboard";
import { Modal, RecordForm, type RunCommand } from "./records";
import { Notice, PageHeading, Status } from "./ui";

export function CalendarPage({data,role,base,timetable,run}:{data:Data;role:Role;base:string;timetable:boolean;run:RunCommand}){
  const [filters,setFilters]=useState<Filters>({});
  const [editing,setEditing]=useState<{module:string;entry?:Item}|null>(null);
  const [selection,setSelection]=useState<{module:string;entry:Item}|null>(null);
  const [notice,setNotice]=useState("");
  const scoped=scope(data,filters);
  const assignmentIds=new Set(scoped.assignments.map(row=>row.id));
  const batchIds=new Set(scoped.batches.map(row=>row.id));
  const zone=String(list(data,"institution_settings")[0]?.timezone??"Asia/Kolkata");
  const toWall=(input:unknown)=>{
    const value=new Date(String(input));
    return new Intl.DateTimeFormat("sv-SE",{timeZone:zone,dateStyle:"short",timeStyle:"short",hourCycle:"h23"}).format(value).replace(" ","T")+":00Z";
  };
  const schedule=scoped.scheduled.map(row=>({id:row.id,title:String(row.title),start:toWall(row.starts_at),end:toWall(row.ends_at),color:row.status==="cancelled"?"#94a3b8":"#7c3aed",extendedProps:{module:"timetable",row}}));
  const general=list(data,"calendar_events").filter(row=>!row.batch_id||batchIds.has(String(row.batch_id))).map(row=>({id:row.id,title:String(row.title),start:toWall(row.starts_at),end:toWall(row.ends_at),color:row.event_type==="holiday"?"#bf3d54":"#2563b1",extendedProps:{module:"calendar",row}}));
  const assessments=list(data,"assessments").filter(row=>assignmentIds.has(String(row.staff_assignment_id))).map(row=>({id:row.id,title:String(row.title),start:String(row.assessment_on),allDay:true,color:"#167e63",extendedProps:{module:"assessment",row}}));
  const deadlines=list(data,"assignments").filter(row=>assignmentIds.has(String(row.staff_assignment_id))).map(row=>({id:row.id,title:String(row.title)+" due",start:String(row.due_on),allDay:true,color:"#b36a10",extendedProps:{module:"assignment",row}}));
  const today=dateKey(new Date(),zone);
  const delayed=scoped.progress.filter(row=>row.target_on&&String(row.target_on)<today&&Number(row.completion)<100);
  function progressFor(id:unknown){
    const planned=list(data,"syllabus_targets").filter(r=>r.staff_assignment_id===id&&String(r.target_on)<=today).sort((a,b)=>String(b.target_on).localeCompare(String(a.target_on)))[0];
    const progress=syllabusProgress(data,scoped.progress.filter(r=>r.staff_assignment_id===id),scoped.assignments.filter(row=>row.id===id));
    return {planned,progress};
  }
  const recommendations=[...Map.groupBy(delayed,row=>row.staff_assignment_id)].slice(0,6).map(([id,rows])=>{
    const allocation=scoped.assignments.find(item=>item.id===id);
    const candidates=scoped.assignments.filter(item=>{
      if(item.id===id|| item.batch_id!==allocation?.batch_id || item.subject_id===allocation?.subject_id)return false;
      const status=progressFor(item.id);
      return status.planned&&status.progress!==null&&status.progress>Number(status.planned.target_completion);
    });
    const options=scoped.scheduled.filter(row=>row.status!=="cancelled" && row.starts_at && new Date(String(row.starts_at))>new Date() &&
      candidates.some(item=>item.id===row.staff_assignment_id)).sort((a,b)=>String(a.starts_at).localeCompare(String(b.starts_at))).slice(0,2);
    return {id,rows,options,...progressFor(id)};
  });
  return <><PageHeading title={timetable?"Timetable":"Academic calendar"} detail={"Schedule and review academic activities in "+zone+"."}>{role==="admin"&&<><button className="button button-secondary" onClick={()=>setEditing({module:"calendar"})}>Add calendar event</button><button className="button button-primary" onClick={()=>setEditing({module:"timetable"})}><CalendarPlus size={17}/> Schedule class</button></>}</PageHeading>
    <div className="section-tabs"><Link className={!timetable?"selected":""} href={base+"/calendar"}>Calendar</Link><Link className={timetable?"selected":""} href={base+"/timetable"}>Timetable</Link></div>
    <FilterBar data={data} filters={filters} setFilters={setFilters} dates={false}/>
    {notice&&<Notice type="success">{notice}</Notice>}
    <section className="panel padded-panel"><FullCalendar plugins={[dayGridPlugin,timeGridPlugin,interactionPlugin]} initialView={timetable?"timeGridWeek":"dayGridMonth"} initialDate={today} timeZone="UTC" firstDay={1} nowIndicator
      headerToolbar={{left:"prev,next today",center:"title",right:"dayGridMonth,timeGridWeek,timeGridDay"}} buttonText={{today:"Today",month:"Month",week:"Week",day:"Day"}} height="auto" dayMaxEvents={3}
      events={timetable?schedule:[...schedule,...general,...assessments,...deadlines]} eventClick={event=>{const {module,row}=event.event.extendedProps as {module:string;row:Item};setSelection({module,entry:row});}}
    /></section>
    {!!recommendations.length&&<section className="panel padded-panel"><div className="panel-head"><div><h2><Lightbulb size={17} style={{display:"inline",marginRight:5}}/>Timetable recommendations</h2><p>Review additional eligible teaching time for overdue syllabus topics.</p></div></div>{recommendations.map(({id,rows,planned,progress,options})=><div key={String(id)}><strong>{rowName(data,"staff_assignments",id)}</strong><p>{rows.length} overdue {rows.length===1?"item":"items"}. Weighted progress {progress??"—"}%. {planned?"Target "+planned.target_completion+"% as of "+planned.target_on+".":""} Review upcoming periods and confirm any schedule change.</p>{options.map(row=><p key={row.id}><button className="text-link" onClick={()=>setSelection({module:"timetable",entry:row})}>{String(row.title)} · {academicDateTime(row.starts_at,zone)}</button> · Another subject in this batch is ahead of target.</p>)}</div>)}</section>}
    {selection&&(()=>{const entry=selection.entry;return <Modal title={String(entry.title)} close={()=>setSelection(null)}><div className="record-form"><p>{entry.staff_assignment_id?rowName(data,"staff_assignments",entry.staff_assignment_id):String(entry.event_type??"Academic event")}</p><p>{String(entry.starts_at??entry.assessment_on??entry.due_on??"")}</p>{entry.status!=null&&<Status value={entry.status}/>}
    <div className="form-actions"><button className="button button-secondary" onClick={()=>setSelection(null)}>Close</button>{role==="admin"&&["timetable","calendar"].includes(selection.module)&&<button className="button button-primary" onClick={()=>{setEditing({module:selection.module,entry});setSelection(null);}}>Edit event</button>}</div></div></Modal>;})()}
    {editing&&<Modal title={editing.entry?"Edit event":editing.module==="timetable"?"Schedule class":"Add calendar event"} close={()=>setEditing(null)}><RecordForm module={editing.module} entry={editing.entry} data={data} run={run} cancel={()=>setEditing(null)} onDone={()=>{setEditing(null);setNotice("Calendar updated.");}}/></Modal>}
  </>;
}

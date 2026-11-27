"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type Resolver } from "react-hook-form";
import { Download, Plus, Search, Upload, UserRoundPlus, X } from "lucide-react";
import { fieldsFor, heading, label, list, modules, referenceColumns, rowName, type Data, type Field, type Item } from "@/lib/catalog";
import type { Command } from "@/lib/command";
import { academicDateTime, dateKey } from "@/lib/metrics";
import { downloadCsv, readSpreadsheet } from "@/lib/spreadsheet";
import { Empty, Initials, Notice, PageHeading, Status } from "./ui";
import { Button } from "./ui/button";

export type RunCommand=(command:Command)=>Promise<unknown>;
export function Modal({title,children,close}:{title:string;children:ReactNode;close:()=>void}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{ref.current?.showModal();},[]);
  return <dialog ref={ref} className="modal" onCancel={close} onClick={e=>{if(e.target===ref.current){const r=ref.current?.getBoundingClientRect();if(r&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))close();}}}><div className="panel-head"><h2>{title}</h2><button type="button" className="icon-button" aria-label="Close dialog" onClick={close}><X size={20}/></button></div>{children}</dialog>;
}
export function StaffInvite({staff,base,run,entry}:{staff:Item[];base:string;run:RunCommand;entry?:Item}){
  const [open,setOpen]=useState(false);
  const [selected,setSelected]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [result,setResult]=useState<"connected"|"invited"|null>(null);
  const recipient=entry??staff.find(row=>row.id===selected);
  const eligible=staff.filter(row=>row.active&&row.email);
  const live=base==="/admin";
  async function send(){
    if(!live||!recipient?.active||!recipient.email||busy||result)return;
    setBusy(true);setError("");
    try{
      const response=await run({operation:"invite",id:recipient.id,connectExisting:true});
      setResult(response && typeof response==="object" && "connected" in response && response.connected===true?"connected":"invited");
    }catch(cause){setError((cause as Error).message);}
    finally{setBusy(false);}
  }
  return <>
    <button type="button" className="button button-secondary" onClick={()=>{setOpen(true);setError("");setSelected("");setResult(null);}}><UserRoundPlus size={16}/> Invite staff account</button>
    {open&&<Modal title="Invite staff account" close={()=>setOpen(false)}>
      {!live?<><p>Sign in as an administrator to send invitations from your institution.</p><Link className="button button-primary" href="/admin/staff">Open live staff directory</Link></>:
        result?<Notice type="success">{result==="connected"?String(recipient?.email)+" can now sign in to the staff portal with their existing account.":"Invitation sent to "+String(recipient?.email)+"."}</Notice>:
        entry&&(!entry.active||!entry.email)?<><p>An invitation requires an active staff record with an email address.</p><Link className="button button-secondary" href={base+"/staff/"+entry.id+"/edit"}>Edit staff profile</Link></>:
        !entry&&!eligible.length?<><p>Add an active staff member with an email address to send an invitation.</p><Link className="button button-primary" href={base+"/staff/add"}>Add staff member</Link></>:
        <div className="panel-stack">
          {!entry&&<label>Staff member<select value={selected} disabled={busy} onChange={e=>{setSelected(e.target.value);setError("");}}><option value="">Select a staff member</option>{eligible.map(row=><option key={row.id} value={row.id}>{String(row.name)} ({String(row.email)})</option>)}</select></label>}
          {recipient&&<p>Grant staff access to <strong>{String(recipient.email)}</strong>? An existing verified account will be connected. New users will receive a password setup invitation.</p>}
          {error&&<Notice type="error">{error}</Notice>}
          <button type="button" className="button button-primary" disabled={!recipient||busy} onClick={send}>{busy?"Checking account…":"Grant staff access"}</button>
        </div>}
    </Modal>}
  </>;
}
const defaultChoice:Record<string,string>={academic_status:"enrolled",employment_status:"employed",status:"scheduled"};
function defaultValues(fields:Field[],entry:Item|undefined,timezone:string){
  return Object.fromEntries(fields.map(field=>{
    const value=entry?.[field.key];
    if(field.kind==="checkbox")return [field.key,value??["active","enabled"].includes(field.key)];
    if(field.kind==="number")return [field.key,value??(field.required?0:null)];
    if(field.kind==="weekdays")return [field.key,value??[1,2,3,4,5,6]];
    if(field.kind==="date")return [field.key,value??(field.required||field.key==="admission_date"?dateKey(new Date(),timezone):null)];
    if(field.kind==="datetime" && value){
      const local=new Intl.DateTimeFormat("sv-SE",{timeZone:timezone,dateStyle:"short",timeStyle:"short",hourCycle:"h23"}).format(new Date(String(value))).replace(" ","T");
      return [field.key,local];
    }
    return [field.key,value??(field.options?.includes(defaultChoice[field.key])?defaultChoice[field.key]:field.options?.[0])??null];
  }));
}
export function localTime(value:string,zone:string){
  const requested=new Date(value+"Z");
  if(Number.isNaN(+requested))return "";
  let utc=+requested;
  for(let i=0;i<3;i++){
    const local=new Intl.DateTimeFormat("sv-SE",{timeZone:zone,dateStyle:"short",timeStyle:"short",hourCycle:"h23"}).format(new Date(utc)).replace(" ","T");
    const shift=+requested- +new Date(local+"Z");
    if(shift===0)return new Date(utc).toISOString();
    utc+=shift;
  }
  return "";
}
function importValue(field:Field,value:string|undefined,data:Data){
  if(field.kind==="checkbox")return value?["yes","true","1","active"].includes(value.toLowerCase()):field.key==="active";
  if(!value && field.options)return field.options.includes(defaultChoice[field.key])?defaultChoice[field.key]:field.options[0];
  if(!value && field.key==="admission_date")return dateKey(new Date(),String(list(data,"institution_settings")[0]?.timezone??"Asia/Kolkata"));
  if(!value)return null;
  if(field.kind==="number")return Number(value);
  if(field.source){
    const source=field.source;
    if(list(data,source).some(row=>row.id===value))return value;
    const matching=list(data,source).filter(row=>rowName(data,source,row.id).toLowerCase()===value.toLowerCase()||String(row[field.labelKey??"name"]??"").toLowerCase()===value.toLowerCase());
    if(matching.length!==1)throw new Error("Use an unambiguous "+field.label+" name or record ID.");
    return matching[0].id;
  }
  return field.options?value.trim().toLowerCase().replaceAll(" ","_"):value.trim();
}
export function RecordForm({module,entry,data,run,onDone,cancel}:{module:string;entry?:Item;data:Data;run:RunCommand;onDone:()=>void;cancel:()=>void}){
  const spec=modules[module];
  const fields=spec.fields??[];
  const timezone=String(list(data,"institution_settings")[0]?.timezone??"Asia/Kolkata");
  const {register,handleSubmit,formState:{errors,isSubmitting},setValue,watch}=useForm<Record<string,unknown>>({
    defaultValues:defaultValues(fields,entry,timezone),
    resolver:zodResolver(fieldsFor(fields),undefined,{raw:true}) as Resolver<Record<string,unknown>>,
  });
  const [error,setError]=useState("");
  const [weeks,setWeeks]=useState(1);
  const [optionFilters,setOptionFilters]=useState<Record<string,string>>({});
  const id=useRef(entry?.id??"");
  async function submit(values:Record<string,unknown>){
    setError("");
    try{
      if(!id.current)id.current=crypto.randomUUID();
      await run({operation:"save",module,id:id.current,values,create:!entry,weeks});
      onDone();
    }catch(error){setError((error as Error).message);}
  }
  function choices(field:Field){
    let rows=list(data,field.source??"");
    const assignmentId=watch("staff_assignment_id");
    if(field.source==="staff_assignments")rows=rows.filter(row=>row.active!==false||row.id===entry?.staff_assignment_id);
    if(field.source==="topics"&&assignmentId){
      const a=list(data,"staff_assignments").find(row=>row.id===assignmentId);
      const batch=list(data,"batches").find(row=>row.id===a?.batch_id);
      const curricula=list(data,"syllabi").filter(row=>row.class_id===batch?.class_id&&row.academic_year_id===batch?.academic_year_id&&row.subject_id===a?.subject_id).map(row=>row.id);
      const chapters=list(data,"chapters").filter(row=>curricula.includes(String(row.syllabus_id))).map(row=>row.id);
      rows=rows.filter(row=>chapters.includes(String(row.chapter_id)));
    }
    if(field.source==="subtopics"&&watch("topic_id"))rows=rows.filter(row=>row.topic_id===watch("topic_id"));
    const lookup=optionFilters[field.key]?.trim().toLowerCase();
    return lookup ? rows.filter(row=>row.id===watch(field.key)||rowName(data,field.source!,row.id).toLowerCase().includes(lookup)) : rows;
  }
  return <form className="record-form" onSubmit={handleSubmit(submit)} noValidate><div className="form-grid">{fields.map(field=>{
    if(field.kind==="weekdays"){
      const days=watch(field.key) as number[];
      return <fieldset className="stack-field" key={field.key}><legend>{field.label}</legend><div className="roster-picks">{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((day,i)=><label key={day}><input type="checkbox" checked={days.includes(i+1)} onChange={()=>setValue(field.key,days.includes(i+1)?days.filter(n=>n!==i+1):[...days,i+1].sort(),{shouldValidate:true})}/>{day}</label>)}</div>{errors[field.key]&&<span className="field-error">Select at least one working day.</span>}</fieldset>;
    }
    const props=register(field.key,{setValueAs:value=>{
      if(value===""||value==null)return null;
      if(field.kind==="number")return Number(value);
      if(field.kind==="datetime"&&typeof value==="string"&&!value.endsWith("Z"))return localTime(value,timezone);
      return value;
    }});
    return <label key={field.key} className={field.kind==="checkbox"?"checkbox-field":""}>{field.kind==="checkbox"&&<input type="checkbox" {...props}/>}<span>{field.label}{field.required&&<span aria-hidden="true"> *</span>}{field.kind==="datetime"&&<small> ({timezone})</small>}</span>
      {field.source&&list(data,field.source).length>=20&&<input aria-label={"Filter "+field.label.toLowerCase()+" options"} placeholder={"Search "+field.label.toLowerCase()+"?"} value={optionFilters[field.key]??""} onChange={e=>setOptionFilters(previous=>({...previous,[field.key]:e.target.value}))}/>}
      {field.kind==="checkbox"?null:field.options||field.source?<select {...props} defaultValue={String(entry?.[field.key]??(field.options?.includes(defaultChoice[field.key])?defaultChoice[field.key]:field.options?.[0])??"")} onChange={event=>{
        props.onChange(event);
        if(field.key==="staff_assignment_id"&&module==="syllabus"){setValue("topic_id",null);setValue("subtopic_id",null);}
        if(field.key==="topic_id"&&module==="syllabus")setValue("subtopic_id",null);
      }}><option value="">{field.required?"Select "+field.label.toLowerCase():"None"}</option>{field.options?.map(option=><option key={option} value={option}>{label(option)}</option>)}{field.source&&choices(field).map(row=><option key={row.id} value={row.id}>{rowName(data,field.source!,row.id)}</option>)}</select>:
      field.kind==="textarea"?<textarea {...props}/>:<input type={field.kind==="datetime"?"datetime-local":field.kind==="phone"?"tel":field.kind??"text"} {...props} min={field.min} step="any"/>}
      {errors[field.key]&&<span className="field-error">{String(errors[field.key]?.message??"Check this value.")}</span>}
    </label>;
  })}
  {module==="timetable"&&!entry&&<label>Weekly occurrences<input type="number" min="1" max="52" value={weeks} onChange={e=>setWeeks(Number(e.target.value))}/></label>}
  </div>{error&&<Notice type="error">{error}</Notice>}<div className="form-actions"><button className="button button-secondary" type="button" onClick={cancel}>Cancel</button><Button type="submit" disabled={isSubmitting}>{isSubmitting?"Saving…":"Save record"}</Button></div></form>;
}
export function recordValue(data:Data,row:Item,column:string){
  const value=row[column];
  if(referenceColumns[column])return rowName(data,referenceColumns[column],value);
  if(column==="active")return <Status value={value?"active":"inactive"}/>;
  if(column==="status"||column.endsWith("_status"))return <Status value={value}/>;
  if(column==="completion"&&value!=null)return String(value)+"%";
  if(column.endsWith("_at")&&typeof value==="string")return academicDateTime(value,String(list(data,"institution_settings")[0]?.timezone??"Asia/Kolkata"));
  return label(value);
}
export function RecordTable({data,items,columns,renderAction,person,filter=true}:{data:Data;items:Item[];columns:string[];renderAction?:(row:Item)=>ReactNode;person?:boolean;filter?:boolean}){
  const [query,setQuery]=useState("");
  const [page,setPage]=useState(0);
  const matches=items.filter(row=>columns.some(column=>{
    const value=referenceColumns[column]?rowName(data,referenceColumns[column],row[column]):label(row[column]);
    return value.toLocaleLowerCase().includes(query.toLocaleLowerCase());
  }));
  const pages=Math.max(1,Math.ceil(matches.length/20));
  const shown=Math.min(page,pages-1);
  return <div className="panel record-list">{filter&&<div className="table-toolbar"><label className="search-field"><Search size={16}/><input aria-label="Search records" value={query} placeholder="Search records…" onChange={e=>{setQuery(e.target.value);setPage(0);}}/></label></div>}
    {matches.length?<><div className="table-scroll"><table><thead><tr>{columns.map(key=><th key={key}>{heading(key)}</th>)}{renderAction&&<th>Actions</th>}</tr></thead><tbody>{matches.slice(shown*20,shown*20+20).map(row=><tr key={row.id}>{columns.map(key=><td key={key}>{person&&key==="name"?<span className="person-cell"><Initials name={String(row.name)}/>{String(row.name)}</span>:recordValue(data,row,key)}</td>)}{renderAction&&<td><div className="row-field">{renderAction(row)}</div></td>}</tr>)}</tbody></table></div><div className="table-pagination"><span>{shown*20+1}–{Math.min((shown+1)*20,matches.length)} of {matches.length} records</span><div><button className="button button-ghost" onClick={()=>setPage(shown-1)} disabled={shown===0}>Previous</button><button className="button button-ghost" onClick={()=>setPage(shown+1)} disabled={shown+1===pages}>Next</button></div></div></>:<Empty title={query?"No matching records":"No records yet"} text={query?"Try a different search.":"Add records to start tracking this area."}/>}
  </div>;
}
export function ModulePage({module,data,base,editable,run,create=false,openRoster,openTopics}:{module:string;data:Data;base:string;editable:boolean;run:RunCommand;create?:boolean;openRoster?:(row:Item)=>void;openTopics?:(row:Item)=>void}){
  const spec=modules[module];
  const [editing,setEditing]=useState<Item|true|null>(create&&editable?true:null);
  const [notice,setNotice]=useState<{error?:string;success?:string}>({});
  const [busy,setBusy]=useState(false);
  const [batch,setBatch]=useState("");
  const [state,setState]=useState("");
  const allItems=list(data,spec.table);
  const statusColumn=spec.columns.find(c=>["status","academic_status","employment_status"].includes(c));
  const states=statusColumn?[...new Set(allItems.map(row=>String(row[statusColumn]??"")).filter(Boolean))].sort():[];
  const items=allItems.filter(row=>(!batch||row.batch_id===batch)&&(!state||row[statusColumn??""]===state));
  const profile=["students","staff"].includes(module);
  const importable=["students","staff","topics","subtopics"].includes(module);
  async function importRows(file?:File){
    if(!file)return;
    setBusy(true);setNotice({});
    try{
      const sheet=await readSpreadsheet(file);
      if(!sheet.length || sheet.length>300)throw new Error("Import between 1 and 300 rows.");
      const rows=sheet.map(row=>Object.fromEntries((spec.fields??[]).map(field=>[field.key,importValue(field,row[field.key],data)])));
      await run({operation:"import",module:module as "students"|"staff"|"topics"|"subtopics",rows});
      setNotice({success:sheet.length+" records imported."});
    }catch(error){setNotice({error:(error as Error).message});}finally{setBusy(false);}
  }
  const syllabusTabs=module==="syllabus"&&base.endsWith("/admin");
  return <>
    <PageHeading title={spec.title} detail={spec.detail}>
      {module==="staff"&&editable&&<StaffInvite staff={allItems} base={base} run={run}/>}
      {editable&&importable&&<><button type="button" className="button button-ghost" onClick={()=>downloadCsv(module+"-template",(spec.fields??[]).map(f=>f.key),[])}>CSV template</button><label className="button button-secondary upload-label"><Upload size={15}/>{busy?"Importing…":"Import"}<input aria-label={"Import "+module} disabled={busy} type="file" accept=".csv,.xlsx" onChange={e=>{void importRows(e.target.files?.[0]);e.target.value="";}}/></label></>}
      {profile&&<button className="button button-secondary" onClick={()=>downloadCsv(module,spec.columns,items.map(row=>spec.columns.map(key=>row[key])))}><Download size={15}/> Export</button>}
      {editable&&spec.fields&&(profile?<Link className="button button-primary" href={base+"/"+module+"/add"}><Plus size={16}/> Add {module==="students"?"student":"staff member"}</Link>:<button className="button button-primary" onClick={()=>setEditing(true)}><Plus size={16}/> {module==="notifications"?"Publish update":module==="settings"?"Create settings":"Add record"}</button>)}
    </PageHeading>
    {syllabusTabs&&<div className="section-tabs">{["curricula","chapters","topics","subtopics","syllabus-targets"].map(key=><Link key={key} href={base+"/"+key}>{modules[key].title}</Link>)}</div>}
    {module==="settings"&&<div className="section-tabs">{["academic-years","academic-terms","class-subjects","teaching-assignments","staff-permissions","report-templates"].map(key=><Link key={key} href={base+"/"+key}>{modules[key].title}</Link>)}</div>}
    {notice.error&&<Notice type="error">{notice.error}</Notice>}{notice.success&&<Notice type="success">{notice.success}</Notice>}
    {(states.length>1||spec.columns.includes("batch_id"))&&<div className="filter-bar">
      {spec.columns.includes("batch_id")&&<select aria-label="Filter by batch" value={batch} onChange={e=>setBatch(e.target.value)}><option value="">All batches</option>{list(data,"batches").map(row=><option key={row.id} value={row.id}>{rowName(data,"batches",row.id)}</option>)}</select>}
      {states.length>1&&<select aria-label="Filter by status" value={state} onChange={e=>setState(e.target.value)}><option value="">All statuses</option>{states.map(value=><option key={value} value={value}>{label(value)}</option>)}</select>}
    </div>}
    <RecordTable data={data} items={items} columns={spec.columns} person={profile||module==="student-performance"} renderAction={profile||editable&&spec.fields||openRoster?row=><>
      {profile&&<Link className="text-link" href={base+"/"+module+"/"+row.id}>View</Link>}
      {openTopics&&<button className="text-link" onClick={()=>openTopics(row)}>Topics</button>}
      {openRoster&&<button className="text-link" onClick={()=>openRoster(row)}>{module==="assignments"?"Submissions":module==="student-performance"?"View performance":"Enter marks"}</button>}
      {editable&&spec.fields&&(profile?<Link className="text-link" href={base+"/"+module+"/"+row.id+"/edit"}>Edit</Link>:<button className="text-link" onClick={()=>setEditing(row)}>Edit</button>)}
    </>:undefined}/>
    {editing&&<Modal title={editing===true?"Add "+spec.title.toLowerCase().replace(/s$/,""):"Edit record"} close={()=>setEditing(null)}><RecordForm module={module} entry={editing===true?undefined:editing} data={data} run={run} cancel={()=>setEditing(null)} onDone={()=>{setEditing(null);setNotice({success:"Record saved."});}}/></Modal>}
  </>;
}

"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type Resolver } from "react-hook-form";
import { Check, Copy, Download, KeyRound, Plus, Search, Trash2, Upload, UserRoundPlus, X } from "lucide-react";
import { defaultSubjects, fieldsFor, heading, label, list, modules, referenceColumns, rowName, type Data, type Field, type Item } from "@/lib/catalog";
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
export function StaffInvite({staff,base,run,entry,autoOpen=false,onClose}:{staff:Item[];base:string;run:RunCommand;entry?:Item;autoOpen?:boolean;onClose?:()=>void}){
  const [open,setOpen]=useState(autoOpen);
  const [selected,setSelected]=useState(entry?.id??"");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [tempPassword,setTempPassword]=useState("");
  const [recipientEmail,setRecipientEmail]=useState("");
  const [recipientName,setRecipientName]=useState("");
  const [copied,setCopied]=useState(false);
  const recipient=entry??staff.find(row=>row.id===selected);
  const eligible=staff.filter(row=>row.active&&row.email);
  const handleClose=()=>{
    setOpen(false);
    setTempPassword("");
    onClose?.();
  };
  async function generate(){
    if(!recipient?.active||!recipient.email||busy)return;
    setBusy(true);setError("");setCopied(false);
    try{
      const response=await run({operation:"invite",id:recipient.id,connectExisting:true}) as {
        temporaryPassword?:string;
        email?:string;
        name?:string;
      } | undefined;
      if(response?.temporaryPassword){
        setTempPassword(response.temporaryPassword);
        setRecipientEmail(response.email || String(recipient.email));
        setRecipientName(response.name || String(recipient.name));
      }else{
        setError("Could not generate credentials. Try again.");
      }
    }catch(cause){setError((cause as Error).message);}
    finally{setBusy(false);}
  }
  return <>
    {!autoOpen&&<button type="button" className="button button-secondary" onClick={()=>{setOpen(true);setError("");setSelected(entry?.id??"");setTempPassword("");setCopied(false);}}><KeyRound size={16}/> Staff login credentials</button>}
    {open&&<Modal title="Staff login credentials" close={handleClose}>
      {tempPassword?<div className="panel-stack">
        <Notice type="success">{"Temporary password generated for " + recipientEmail}</Notice>
        <div style={{background:"var(--surface)",border:"1px solid var(--line)",borderRadius:12,padding:16,display:"grid",gap:12}}>
          <div>
            <span style={{fontSize:".8rem",color:"var(--muted)",display:"block",fontWeight:600}}>Staff Member</span>
            <strong style={{fontSize:".95rem"}}>{recipientName}</strong>
          </div>
          <div>
            <span style={{fontSize:".8rem",color:"var(--muted)",display:"block",fontWeight:600}}>Staff Email (Username)</span>
            <strong style={{fontSize:".95rem"}}>{recipientEmail}</strong>
          </div>
          <div>
            <span style={{fontSize:".8rem",color:"var(--muted)",display:"block",fontWeight:600}}>Temporary Password</span>
            <div style={{display:"flex",gap:8,alignItems:"center",marginTop:5}}>
              <input type="text" readOnly value={tempPassword} style={{fontFamily:"monospace",fontWeight:700,letterSpacing:1,flex:1,padding:"8px 12px",borderRadius:8,border:"1px solid var(--line)",background:"#fff"}} onClick={e=>(e.target as HTMLInputElement).select()}/>
              <button type="button" className="button button-primary" onClick={()=>{navigator.clipboard?.writeText(tempPassword);setCopied(true);setTimeout(()=>setCopied(false),2500);}}>
                {copied?<Check size={16}/>:<Copy size={16}/>} {copied?"Copied!":"Copy"}
              </button>
            </div>
          </div>
        </div>
        <div style={{background:"#f5f3ff",border:"1px solid #ddd6fe",borderRadius:8,padding:"10px 14px",fontSize:".85rem",color:"#5b21b6"}}>
          <strong>First-time login requirement:</strong>
          <p style={{margin:"4px 0 0",color:"#6d28d9",fontSize:".82rem"}}>
            When this staff member logs in at <strong>/staff/login</strong> with this temporary password, the system will immediately require them to set their own permanent password before accessing the portal.
          </p>
        </div>
        <div className="form-actions" style={{marginTop:8}}>
          <button type="button" className="button button-secondary" onClick={handleClose}>Done</button>
        </div>
      </div>:
      entry&&(!entry.active||!entry.email)?<><p>Staff credentials require an active staff record with an email address.</p><Link className="button button-secondary" href={base+"/staff/"+entry.id+"/edit"}>Edit staff profile</Link></>:
      !entry&&!eligible.length?<><p>Add an active staff member with an email address to create their login.</p><Link className="button button-primary" href={base+"/staff/add"}>Add staff member</Link></>:
      <div className="panel-stack">
        {!entry&&<label>Staff member<select value={selected} disabled={busy} onChange={e=>{setSelected(e.target.value);setError("");}}><option value="">Select a staff member</option>{eligible.map(row=><option key={row.id} value={row.id}>{String(row.name)} ({String(row.email)})</option>)}</select></label>}
        {recipient&&<p>Generate a temporary login password for <strong>{String(recipient.name)}</strong> (<code>{String(recipient.email)}</code>)?<br/><small style={{color:"var(--muted)",marginTop:6,display:"block"}}>The staff member can sign in directly at /staff/login using this temporary password and will be prompted to create their own permanent password on first login.</small></p>}
        {error&&<Notice type="error">{error}</Notice>}
        <button type="button" className="button button-primary" disabled={!recipient||busy} onClick={generate}><KeyRound size={16}/> {busy?"Generating…":"Generate temporary password"}</button>
      </div>}
    </Modal>}
  </>;
}
const defaultChoice:Record<string,string>={academic_status:"enrolled",employment_status:"employed",status:"scheduled"};
export function generateAdmissionNumber(data?: Data): string {
  const students = data ? list(data, "students") : [];
  let maxNum = 1000;
  let prefix = "SCM-";
  for (const s of students) {
    const str = String(s.admission_number ?? "").trim();
    const match = str.match(/^(.*?)(\d+)$/);
    if (match) {
      if (match[1]) prefix = match[1];
      const num = parseInt(match[2], 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  }
  return `${prefix}${maxNum + 1}`;
}
function defaultValues(fields:Field[],entry:Item|undefined,timezone:string,data?:Data){
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
    if(field.source==="academic_years" && !value && data){
      const today=dateKey(new Date(),timezone);
      const active=list(data,"academic_years").find(r=>String(r.starts_on)<=today && String(r.ends_on)>=today) ?? list(data,"academic_years")[0];
      if(active)return [field.key,active.id];
    }
    if(field.key==="admission_number" && (!value || value==="") && (!entry || !entry.id)){
      return [field.key, generateAdmissionNumber(data)];
    }
    if(field.key==="class_id" && data){
      const batchClass = entry?.class_id ?? (entry?.batch_id ? list(data,"batches").find(b=>b.id===entry.batch_id)?.class_id : null);
      if(batchClass) return [field.key, batchClass];
      return [field.key, value ?? list(data,"classes")[0]?.id ?? null];
    }
    if(field.key==="stream"){
      return [field.key, value ?? (entry?.stream ?? "Common (All Subjects)")];
    }
    if(field.key==="handled_subjects"){
      return [field.key, value ?? (entry?.handled_subjects ?? "")];
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
    defaultValues:defaultValues(fields,entry,timezone,data),
    resolver:zodResolver(fieldsFor(fields),undefined,{raw:true}) as Resolver<Record<string,unknown>>,
  });
  const [error,setError]=useState("");
  const [confirmDelete,setConfirmDelete]=useState(false);
  const [deleting,setDeleting]=useState(false);
  const [weeks,setWeeks]=useState(1);
  const [optionFilters,setOptionFilters]=useState<Record<string,string>>({});
  const [generatedCredentials,setGeneratedCredentials]=useState<{email:string;password:string;name:string}|null>(null);
  const [copied,setCopied]=useState(false);
  const id=useRef(entry?.id??"");
  const [selectedSubjects,setSelectedSubjects]=useState<string[]>(()=>{
    if(module==="staff"){
      const raw=entry?.handled_subjects;
      if(typeof raw==="string"&&raw.trim()){
        return raw.split(",").map(s=>s.trim()).filter(Boolean);
      }
    }
    return [];
  });
  const [subjectFilter,setSubjectFilter]=useState("");
  const toggleSubject=(sub:string)=>{
    const trimmed=sub.trim();
    if(!trimmed)return;
    const exists=selectedSubjects.includes(trimmed);
    const next=exists?selectedSubjects.filter(s=>s!==trimmed):[...selectedSubjects,trimmed];
    setSelectedSubjects(next);
    setValue("handled_subjects",next.length>0?next.join(", "):"",{shouldValidate:true});
  };
  const removeSubject=(sub:string)=>{
    const next=selectedSubjects.filter(s=>s!==sub);
    setSelectedSubjects(next);
    setValue("handled_subjects",next.length>0?next.join(", "):"",{shouldValidate:true});
  };
  const selectedClassId=watch("class_id");
  const selectedClassObj=list(data,"classes").find(c=>c.id===selectedClassId);
  const selectedClassName=String(selectedClassObj?.name??"");
  const isSenior=/\b(11|12)\b/.test(selectedClassName);
  async function submit(values:Record<string,unknown>){
    setError("");
    try{
      if(!id.current)id.current=crypto.randomUUID();
      if(module==="students"){
        const classObj=list(data,"classes").find(c=>c.id===values.class_id);
        const senior=/\b(11|12)\b/.test(String(classObj?.name??""));
        if(!senior){
          values.stream="Common (All Subjects)";
        }else if(!values.stream||values.stream==="Common (All Subjects)"){
          setError("Please select a subject stream for Class 11/12 (e.g. Physics, Chemistry, Maths, Biology / Computer Science).");
          return;
        }
      }
      if(module==="staff"){
        values.handled_subjects = selectedSubjects.length > 0 ? selectedSubjects.join(", ") : null;
      }
      const res=await run({operation:"save",module,id:id.current,values,create:!entry,weeks}) as {temporaryPassword?:string;email?:string;name?:string}|undefined;
      if(module==="staff"&&res?.temporaryPassword){
        setGeneratedCredentials({
          email:res.email || String(values.email),
          password:res.temporaryPassword,
          name:res.name || String(values.name || "Staff Member"),
        });
        return;
      }
      onDone();
    }catch(error){setError((error as Error).message);}
  }
  function choices(field:Field){
    let rows=list(data,field.source??"");
    const assignmentId=watch("staff_assignment_id");
    if(field.source==="staff_assignments")rows=rows.filter(row=>row.active!==false||row.id===entry?.staff_assignment_id);
    if(field.source==="batches"&&module==="students"){
      const classId=watch("class_id");
      if(classId)rows=rows.filter(row=>row.class_id===classId);
    }
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
    if(module==="students"&&field.key==="stream"){
      if(!isSenior){
        return <div key="stream-common-info" style={{gridColumn:"1/-1",background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:8,padding:"12px 14px",marginTop:4,marginBottom:6}}>
          <div style={{display:"flex",alignItems:"center",gap:8,fontWeight:600,color:"#166534",fontSize:".9rem"}}>
            <Check size={18} style={{color:"#16a34a"}}/>
            <span>Class 6–10 Curriculum: Common Subjects</span>
          </div>
          <p style={{margin:"4px 0 0",color:"#15803d",fontSize:".82rem"}}>
            All subjects are common for Class 6 to 10 (Mathematics, English, Science, Social Science, Language). No stream selection required.
          </p>
        </div>;
      }
      const streamProps=register("stream",{required:isSenior?"Select a subject stream for Class 11/12":false});
      return <label key="stream">
        <span>Subject stream (Class 11 &amp; 12) <span aria-hidden="true">*</span></span>
        <select {...streamProps} defaultValue={String(entry?.stream??"")}>
          <option value="">Select subject stream</option>
          <option value="Physics, Chemistry, Mathematics, Biology (PCMB)">Physics, Chemistry, Mathematics, Biology (PCMB)</option>
          <option value="Physics, Chemistry, Mathematics, Computer Science (PCMC)">Physics, Chemistry, Mathematics, Computer Science (PCMC)</option>
          <option value="Physics, Chemistry, Biology (PCB)">Physics, Chemistry, Biology (PCB)</option>
          <option value="Physics, Chemistry, Mathematics (PCM)">Physics, Chemistry, Mathematics (PCM)</option>
          <option value="Commerce with Mathematics">Commerce with Mathematics (Accountancy, Business Studies, Economics, Maths)</option>
          <option value="Commerce with Computer Science">Commerce with Computer Science (Accountancy, Business Studies, Economics, CS)</option>
          <option value="Arts & Humanities">Arts &amp; Humanities (History, Political Science, Geography, Economics)</option>
        </select>
        <small style={{color:"var(--purple-dark)",marginTop:4,display:"block",fontSize:".78rem"}}>
          Choose the subject combination for this senior student.
        </small>
        {errors.stream&&<span className="field-error">{String(errors.stream?.message??"Please select a subject stream.")}</span>}
      </label>;
    }
    if(module==="staff"&&field.key==="handled_subjects"){
      const catalogSubjects=list(data,"subjects").map(s=>String(s.name??"")).filter(Boolean);
      const allAvailable=Array.from(new Set([...defaultSubjects,...catalogSubjects,...selectedSubjects]));
      const filterText=subjectFilter.trim().toLowerCase();
      const filtered=filterText?allAvailable.filter(s=>s.toLowerCase().includes(filterText)):allAvailable;

      return (
        <div key={field.key} style={{gridColumn:"1/-1",display:"flex",flexDirection:"column",gap:8,background:"var(--surface)",border:"1px solid var(--line)",borderRadius:10,padding:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",flexWrap:"wrap",gap:4}}>
            <span style={{fontWeight:600,fontSize:".92rem",color:"var(--foreground)"}}>
              {field.label} <small style={{fontWeight:400,color:"var(--muted)"}}>(Select multiple subjects handled by this staff)</small>
            </span>
            <span style={{fontSize:".8rem",color:"var(--purple-dark)",fontWeight:600}}>
              {selectedSubjects.length} selected
            </span>
          </div>

          {selectedSubjects.length>0?(
            <div style={{display:"flex",flexWrap:"wrap",gap:6,padding:"8px 10px",background:"#f5f3ff",border:"1px solid #ddd6fe",borderRadius:8,alignItems:"center"}}>
              {selectedSubjects.map(sub=>(
                <span key={sub} style={{display:"inline-flex",alignItems:"center",gap:5,background:"#7c3aed",color:"#fff",padding:"4px 9px",borderRadius:999,fontSize:".8rem",fontWeight:500}}>
                  {sub}
                  <button
                    type="button"
                    onClick={()=>removeSubject(sub)}
                    title={`Remove ${sub}`}
                    style={{background:"transparent",border:0,color:"#fff",cursor:"pointer",padding:0,display:"inline-flex",alignItems:"center"}}
                  >
                    <X size={13}/>
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={()=>{
                  setSelectedSubjects([]);
                  setValue("handled_subjects","",{shouldValidate:true});
                }}
                style={{background:"transparent",border:0,color:"#6d28d9",textDecoration:"underline",cursor:"pointer",fontSize:".75rem",padding:"2px 6px",marginLeft:"auto"}}
              >
                Clear all
              </button>
            </div>
          ):(
            <div style={{padding:"8px 12px",background:"#fafafa",border:"1px dashed var(--line)",borderRadius:8,color:"var(--muted)",fontSize:".82rem"}}>
              No subjects selected yet. Click any subject pill below or search to assign.
            </div>
          )}

          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <div style={{position:"relative",flex:1}}>
              <Search size={14} style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:"var(--muted)"}}/>
              <input
                type="text"
                placeholder="Search subjects (e.g. Maths, Physics, English, Tamil, CS)..."
                value={subjectFilter}
                onChange={e=>setSubjectFilter(e.target.value)}
                onKeyDown={e=>{
                  if(e.key==="Enter"){
                    e.preventDefault();
                    if(subjectFilter.trim()){
                      toggleSubject(subjectFilter.trim());
                      setSubjectFilter("");
                    }
                  }
                }}
                style={{paddingLeft:30,width:"100%",fontSize:".85rem",height:36,borderRadius:6,border:"1px solid var(--line)"}}
              />
            </div>
            {subjectFilter.trim()&&!allAvailable.some(s=>s.toLowerCase()===filterText)&&(
              <button
                type="button"
                className="button button-secondary"
                style={{padding:"6px 12px",height:36,fontSize:".82rem",whiteSpace:"nowrap"}}
                onClick={()=>{
                  toggleSubject(subjectFilter.trim());
                  setSubjectFilter("");
                }}
              >
                <Plus size={14}/> Add &quot;{subjectFilter.trim()}&quot;
              </button>
            )}
          </div>

          <div style={{display:"flex",flexWrap:"wrap",gap:6,maxHeight:160,overflowY:"auto",padding:6,border:"1px solid var(--line)",borderRadius:8,background:"#fff"}}>
            {filtered.map(sub=>{
              const isSelected=selectedSubjects.includes(sub);
              return (
                <button
                  key={sub}
                  type="button"
                  onClick={()=>toggleSubject(sub)}
                  style={{
                    display:"inline-flex",
                    alignItems:"center",
                    gap:5,
                    padding:"4px 10px",
                    borderRadius:999,
                    fontSize:".8rem",
                    fontWeight:isSelected?600:400,
                    border:isSelected?"1px solid #7c3aed":"1px solid var(--line)",
                    background:isSelected?"#ede9fe":"#fff",
                    color:isSelected?"#5b21b6":"var(--foreground)",
                    cursor:"pointer",
                    transition:"all 0.15s ease"
                  }}
                >
                  {isSelected?<Check size={12} style={{strokeWidth:3}}/>:<Plus size={12} style={{color:"var(--muted)"}}/>}
                  {sub}
                </button>
              );
            })}
            {filtered.length===0&&(
              <p style={{margin:"6px 8px",fontSize:".82rem",color:"var(--muted)"}}>
                No matching subject. Press Enter or click &quot;Add&quot; to add this subject.
              </p>
            )}
          </div>

          <input type="hidden" {...register("handled_subjects")} value={selectedSubjects.join(", ")}/>
          {errors.handled_subjects&&<span className="field-error">{String(errors.handled_subjects.message)}</span>}
        </div>
      );
    }
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
      {field.kind==="checkbox"?null:field.options||field.source?<select {...props} defaultValue={String(entry?.[field.key]??(field.source==="academic_years"?(list(data,"academic_years").find(r=>String(r.starts_on)<=dateKey(new Date(),timezone)&&String(r.ends_on)>=dateKey(new Date(),timezone))?.id??list(data,"academic_years")[0]?.id):undefined)??(field.options?.includes(defaultChoice[field.key])?defaultChoice[field.key]:field.options?.[0])??"")} onChange={event=>{
        props.onChange(event);
        if(field.key==="staff_assignment_id"&&module==="syllabus"){setValue("topic_id",null);setValue("subtopic_id",null);}
        if(field.key==="topic_id"&&module==="syllabus")setValue("subtopic_id",null);
        if(field.key==="class_id"&&module==="students"){
          setValue("batch_id",null);
          const targetClass=list(data,"classes").find(c=>c.id===event.target.value);
          const targetIsSenior=/\b(11|12)\b/.test(String(targetClass?.name??""));
          if(!targetIsSenior){
            setValue("stream","Common (All Subjects)");
          }else{
            setValue("stream","");
          }
        }
      }}><option value="">{field.required?(choices(field).length===0?"No "+field.label.toLowerCase()+" found":"Select "+field.label.toLowerCase()):"None"}</option>{field.options?.map(option=><option key={option} value={option}>{label(option)}</option>)}{field.source&&choices(field).map(row=><option key={row.id} value={row.id}>{rowName(data,field.source!,row.id)}</option>)}</select>:
      field.kind==="textarea"?<textarea {...props}/>:<input type={field.kind==="datetime"?"datetime-local":field.kind==="phone"?"tel":field.kind??"text"} {...props} min={field.min} step="any"/>}
      {field.key==="admission_number"&&!entry&&<small style={{color:"var(--purple-dark)",marginTop:4,display:"block",fontSize:".78rem"}}>✨ Auto-generated admission number</small>}
      {field.source&&choices(field).length===0&&<small style={{color:"var(--purple-dark)",marginTop:4,display:"block",fontSize:".78rem"}}>No {field.label.toLowerCase()} available. <Link href={field.source==="academic_years"?"/admin/academic-years":"/admin/"+field.source.replaceAll("_","-")} style={{textDecoration:"underline",fontWeight:700}}>Add {field.label.toLowerCase()} &rarr;</Link></small>}
      {errors[field.key]&&<span className="field-error">{errors[field.key]?.message&&String(errors[field.key]?.message).includes("expected string")?`${field.label} is required.`:String(errors[field.key]?.message??"Check this value.")}</span>}
    </label>;
  })}
  {module==="timetable"&&!entry&&<label>Weekly occurrences<input type="number" min="1" max="52" value={weeks} onChange={e=>setWeeks(Number(e.target.value))}/></label>}
  </div>{error&&<Notice type="error">{error}</Notice>}<div className="form-actions">
    {entry&&<button type="button" className="button button-secondary" style={{color:"#dc2626",borderColor:"#fecaca",marginRight:"auto"}} onClick={()=>setConfirmDelete(true)} disabled={isSubmitting||deleting}><Trash2 size={15}/> Delete {module==="staff"?"staff member":module==="students"?"student":"record"}</button>}
    <button className="button button-secondary" type="button" onClick={cancel}>Cancel</button><Button type="submit" disabled={isSubmitting||deleting}>{isSubmitting?"Saving…":"Save record"}</Button></div>
  {confirmDelete&&<Modal title={"Delete "+(module==="staff"?"staff member":module==="students"?"student":"record")} close={()=>setConfirmDelete(false)}>
    <div className="delete-confirm-box">
      <p>Are you sure you want to delete <strong>{String(entry?.name??entry?.title??"this record")}</strong>?</p>
      {module==="staff"&&<small style={{color:"#b91c1c",display:"block",marginTop:8}}>Warning: This will permanently remove this staff member and all associated teaching assignments.</small>}
      <div className="form-actions" style={{marginTop:20}}>
        <button className="button button-secondary" type="button" onClick={()=>setConfirmDelete(false)} disabled={deleting}>Cancel</button>
        <button className="button button-primary" style={{background:"#dc2626",borderColor:"#dc2626"}} disabled={deleting} onClick={async ()=>{
          setDeleting(true);
          try{
            await run({operation:"delete",module,id:entry!.id});
            onDone();
          }catch(err){setError((err as Error).message);setDeleting(false);setConfirmDelete(false);}
        }}>{deleting?"Deleting…":"Confirm delete"}</button>
      </div>
    </div>
  </Modal>}
  {generatedCredentials&&<Modal title="Staff credentials generated" close={onDone}>
    <div className="panel-stack">
      <Notice type="success">{"Temporary password generated for " + generatedCredentials.email}</Notice>
      <div style={{background:"var(--surface)",border:"1px solid var(--line)",borderRadius:12,padding:16,display:"grid",gap:12}}>
        <div>
          <span style={{fontSize:".8rem",color:"var(--muted)",display:"block",fontWeight:600}}>Staff Member</span>
          <strong style={{fontSize:".95rem"}}>{generatedCredentials.name}</strong>
        </div>
        <div>
          <span style={{fontSize:".8rem",color:"var(--muted)",display:"block",fontWeight:600}}>Staff Email (Username)</span>
          <strong style={{fontSize:".95rem"}}>{generatedCredentials.email}</strong>
        </div>
        <div>
          <span style={{fontSize:".8rem",color:"var(--muted)",display:"block",fontWeight:600}}>Temporary Password</span>
          <div style={{display:"flex",gap:8,alignItems:"center",marginTop:5}}>
            <input type="text" readOnly value={generatedCredentials.password} style={{fontFamily:"monospace",fontWeight:700,letterSpacing:1,flex:1,padding:"8px 12px",borderRadius:8,border:"1px solid var(--line)",background:"#fff"}} onClick={e=>(e.target as HTMLInputElement).select()}/>
            <button type="button" className="button button-primary" onClick={()=>{navigator.clipboard?.writeText(generatedCredentials.password);setCopied(true);setTimeout(()=>setCopied(false),2500);}}>
              {copied?<Check size={16}/>:<Copy size={16}/>} {copied?"Copied!":"Copy"}
            </button>
          </div>
        </div>
      </div>
      <div style={{background:"#f5f3ff",border:"1px solid #ddd6fe",borderRadius:8,padding:"10px 14px",fontSize:".85rem",color:"#5b21b6"}}>
        <strong>First-time login requirement:</strong>
        <p style={{margin:"4px 0 0",color:"#6d28d9",fontSize:".82rem"}}>
          When this staff member logs in at <strong>/staff/login</strong> with this temporary password, the system will immediately require them to set their own permanent password before accessing the portal.
        </p>
      </div>
      <div className="form-actions" style={{marginTop:8}}>
        <button type="button" className="button button-secondary" onClick={onDone}>Done</button>
      </div>
    </div>
  </Modal>}
  </form>;
}
export function recordValue(data:Data,row:Item,column:string){
  const value=row[column];
  if(column==="class_id"){
    const classId=value??(row.batch_id?list(data,"batches").find(b=>b.id===row.batch_id)?.class_id:null);
    return rowName(data,"classes",classId);
  }
  if(column==="stream"){
    const classId=row.class_id??(row.batch_id?list(data,"batches").find(b=>b.id===row.batch_id)?.class_id:null);
    const className=String(list(data,"classes").find(c=>c.id===classId)?.name??"");
    const isSenior=/\b(11|12)\b/.test(className);
    if(!isSenior)return "Common";
    return value?label(value):"—";
  }
  if(column==="handled_subjects"){
    if(!value)return "—";
    const items=String(value).split(",").map(s=>s.trim()).filter(Boolean);
    if(items.length<=2)return items.join(", ");
    return <span title={String(value)}>{items.slice(0,2).join(", ")} <span style={{fontSize:".75rem",color:"var(--purple-dark)",fontWeight:600}}>+{items.length-2} more</span></span>;
  }
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
    const rawVal=column==="class_id"?(row[column]??list(data,"batches").find(b=>b.id===row.batch_id)?.class_id):column==="stream"?(row.stream??(row.batch_id&&!/\b(11|12)\b/.test(String(list(data,"classes").find(c=>c.id===list(data,"batches").find(b=>b.id===row.batch_id)?.class_id)?.name??""))?"Common":"")):column==="handled_subjects"?(row.handled_subjects??""):row[column];
    const value=referenceColumns[column]?rowName(data,referenceColumns[column],rawVal):label(rawVal);
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
  const [deletingItem,setDeletingItem]=useState<Item|null>(null);
  const [credentialsStaff,setCredentialsStaff]=useState<Item|null>(null);
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
      {profile&&module==="staff"&&row.email&&<button type="button" className="text-link" onClick={()=>setCredentialsStaff(row)}>Login credentials</button>}
      {editable&&spec.fields&&<button type="button" className="text-link" style={{color:"#dc2626"}} onClick={()=>setDeletingItem(row)}>Delete</button>}
    </>:undefined}/>
    {credentialsStaff&&<StaffInvite staff={allItems} base={base} entry={credentialsStaff} run={run} autoOpen onClose={()=>setCredentialsStaff(null)}/>}
    {editing&&<Modal title={editing===true?"Add "+spec.title.toLowerCase().replace(/s$/,""):"Edit record"} close={()=>setEditing(null)}><RecordForm module={module} entry={editing===true?undefined:editing} data={data} run={run} cancel={()=>setEditing(null)} onDone={()=>{setEditing(null);setNotice({success:"Record saved."});}}/></Modal>}
    {deletingItem&&<Modal title={"Delete "+(module==="students"?"student":module==="staff"?"staff member":"record")} close={()=>setDeletingItem(null)}>
      <div className="delete-confirm-box">
        <p>Are you sure you want to delete <strong>{String(deletingItem.name??deletingItem.title??"this record")}</strong>?</p>
        {module==="staff"&&<small style={{color:"#b91c1c",display:"block",marginTop:8}}>Warning: This will permanently remove this staff member and all associated teaching assignments.</small>}
        {notice.error&&<div style={{marginTop:12}}><Notice type="error">{notice.error}</Notice></div>}
        <div className="form-actions" style={{marginTop:20}}>
          <button className="button button-secondary" type="button" onClick={()=>setDeletingItem(null)} disabled={busy}>Cancel</button>
          <button className="button button-primary" style={{background:"#dc2626",borderColor:"#dc2626"}} disabled={busy} onClick={async ()=>{
            setBusy(true);setNotice({});
            try{
              await run({operation:"delete",module,id:deletingItem.id});
              setDeletingItem(null);
              setNotice({success:"Record deleted successfully."});
            }catch(err){setNotice({error:(err as Error).message});}finally{setBusy(false);}
          }}>{busy?"Deleting…":"Confirm delete"}</button>
        </div>
      </div>
    </Modal>}
  </>;
}

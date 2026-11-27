"use client";
import { useState } from "react";
import { ClipboardCheck, Upload } from "lucide-react";
import { label, list, rowName, type Data, type Item } from "@/lib/catalog";
import { attendanceStatuses, attentiveness, participation, scoreStatuses, understanding, workStatuses } from "@/lib/command";
import { dateKey } from "@/lib/metrics";
import { readSpreadsheet } from "@/lib/spreadsheet";
import { localTime, Modal, RecordTable, type RunCommand } from "./records";
import { Empty, Notice, PageHeading } from "./ui";
import { RecordFile } from "./record-file";

export function eligibleRoster(data:Data,assignmentId:unknown,day:string){
  const batch=list(data,"staff_assignments").find(r=>r.id===assignmentId)?.batch_id;
  const eligible=new Set(list(data,"student_enrollments").filter(r=>r.batch_id===batch&&String(r.starts_on)<=day&&(!r.ends_on||String(r.ends_on)>=day)).map(r=>r.student_id));
  return list(data,"students").filter(row=>eligible.has(row.id)).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
}
function KindSelect({value,onChange,options,name,blank="Select"}:{value?:string;onChange:(value:string)=>void;options:readonly string[];name:string;blank?:string}){
  return <select aria-label={name} value={value??""} onChange={e=>onChange(e.target.value)}><option value="">{blank}</option>{options.map(v=><option value={v} key={v}>{label(v)}</option>)}</select>;
}
type PersonSession={status?:string;remarks?:string;attentiveness?:string;participation?:string;understanding?:string;observation?:string;completed_classwork?:boolean;needs_support?:boolean;follow_up?:boolean};
function SessionEditor({data,entry,run,close}:{data:Data;entry?:Item;run:RunCommand;close:()=>void}){
  const timezone=String(list(data,"institution_settings")[0]?.timezone??"Asia/Kolkata");
  const todaysDate=dateKey(new Date(),timezone);
  const initialAssignment=String(entry?.staff_assignment_id??"");
  const [assignment,setAssignment]=useState(initialAssignment);
  const [timetable,setTimetable]=useState(String(entry?.timetable_id??""));
  const [day,setDay]=useState(String(entry?.date??todaysDate));
  const [duration,setDuration]=useState(Number(entry?.duration_minutes??list(data,"institution_settings")[0]?.class_minutes??45));
  const [notes,setNotes]=useState(String(entry?.notes??""));
  const [revision,setRevision]=useState(Boolean(entry?.revision));
  const zoned=(v:unknown)=>v?new Intl.DateTimeFormat("sv-SE",{timeZone:timezone,dateStyle:"short",timeStyle:"short",hourCycle:"h23"}).format(new Date(String(v))).replace(" ","T"):"";
  const [start,setStart]=useState(zoned(entry?.actual_start));
  const [end,setEnd]=useState(zoned(entry?.actual_end));
  const [topics,setTopics]=useState(list(data,"session_topics").filter(row=>row.session_id===entry?.id).map(row=>String(row.topic_id)));
  const [subtopics,setSubtopics]=useState(list(data,"session_subtopics").filter(row=>row.session_id===entry?.id).map(row=>String(row.subtopic_id)));
  const [roster,setRoster]=useState<Record<string,PersonSession>>(()=>{
    const rows:Record<string,PersonSession>={};
    for(const observation of list(data,"student_observations").filter(r=>r.session_id===entry?.id)){
      rows[String(observation.student_id)]={...observation,observation:String(observation.remarks??""),remarks:undefined};
    }
    for(const record of list(data,"attendance_records").filter(r=>r.session_id===entry?.id)){
      const id=String(record.student_id);
      rows[id]={...rows[id],status:String(record.status),remarks:String(record.remarks??"")};
    }
    return rows;
  });
  const [request]=useState(String(entry?.request_id??crypto.randomUUID()));
  const [query,setQuery]=useState("");
  const [observe,setObserve]=useState(false);
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const students=eligibleRoster(data,assignment,day);
  const selected=list(data,"staff_assignments").find(a=>a.id===assignment);
  const batch=list(data,"batches").find(b=>b.id===selected?.batch_id);
  const curricula=list(data,"syllabi").filter(s=>s.class_id===batch?.class_id&&s.academic_year_id===batch?.academic_year_id&&s.subject_id===selected?.subject_id).map(s=>s.id);
  const chapters=list(data,"chapters").filter(row=>curricula.includes(String(row.syllabus_id)));
  const chapterIds=new Set(chapters.map(r=>r.id));
  const eligibleTopics=list(data,"topics").filter(r=>chapterIds.has(String(r.chapter_id)));
  const change=(id:string,patch:PersonSession)=>setRoster(value=>({...value,[id]:{...value[id],...patch}}));
  const selectList=(list:string[],key:string)=>list.includes(key)?list.filter(v=>v!==key):[...list,key];
  function pickSchedule(value:string){
    setTimetable(value);
    const row=list(data,"timetable_entries").find(r=>r.id===value);
    if(!row)return;
    setAssignment(String(row.staff_assignment_id));
    setDay(dateKey(new Date(String(row.starts_at)),timezone));
    setDuration(Math.round((+new Date(String(row.ends_at))- +new Date(String(row.starts_at)))/60000));
    setStart(zoned(row.starts_at));setEnd(zoned(row.ends_at));setTopics([]);setSubtopics([]);
  }
  async function save(status:"draft"|"completed"){
    setNotice("");setBusy(true);
    try{
      if(!assignment||!day||!Number.isInteger(duration)||duration<1||duration>1440)throw new Error("Choose a teaching assignment, date, and valid duration.");
      if(status==="completed"&&students.some(s=>!roster[s.id]?.status))throw new Error("Mark attendance for every student before submitting.");
      if(Boolean(start)!==Boolean(end))throw new Error("Enter both actual start and end times.");
      const actual_start=start?localTime(start,timezone):null, actual_end=end?localTime(end,timezone):null;
      if(start&&(!actual_start||!actual_end||actual_end<=actual_start))throw new Error("The session must end after it starts.");
      const calculated=actual_start&&actual_end?Math.round((+new Date(actual_end)- +new Date(actual_start))/60000):duration;
      await run({operation:"session",session:{staff_assignment_id:assignment,timetable_id:timetable||null,date:day,duration_minutes:calculated,status,notes,revision,request_id:request,actual_start,actual_end},topics,subtopics,
        roster:students.map(student=>({student_id:student.id,...roster[student.id]})) as Extract<import("@/lib/command").Command,{operation:"session"}>["roster"]});
      close();
    }catch(error){setNotice((error as Error).message);}finally{setBusy(false);}
  }
  return <div className="record-form">
    <div className="form-grid"><label>Scheduled class<select value={timetable} disabled={Boolean(entry)} onChange={e=>pickSchedule(e.target.value)}><option value="">Unscheduled session</option>{list(data,"timetable_entries").filter(row=>row.status!=="cancelled"&&(row.id===entry?.timetable_id||!list(data,"class_sessions").some(s=>s.timetable_id===row.id))).map(row=><option key={row.id} value={row.id}>{zoned(row.starts_at)} · {String(row.title)} · {rowName(data,"staff_assignments",row.staff_assignment_id)}</option>)}</select></label>
      <label>Teaching assignment<select value={assignment} disabled={Boolean(timetable||entry)} onChange={e=>{setAssignment(e.target.value);setTopics([]);setSubtopics([]);}}><option value="">Select teaching assignment</option>{list(data,"staff_assignments").filter(row=>row.active||row.id===initialAssignment).map(row=><option value={row.id} key={row.id}>{rowName(data,"staff_assignments",row.id)}</option>)}</select></label>
      <label>Session date<input type="date" value={day} disabled={Boolean(timetable||entry?.status==="completed")} onChange={e=>setDay(e.target.value)}/></label>
      <label>Teaching minutes<input type="number" min="1" max="1440" value={duration} onChange={e=>setDuration(Number(e.target.value))}/></label>
      <label>Actual start ({timezone})<input type="datetime-local" value={start} onChange={e=>setStart(e.target.value)}/></label><label>Actual end ({timezone})<input type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)}/></label>
    </div>
    {assignment&&<div><div className="panel-head"><h2>Syllabus topics</h2></div>{chapters.length?chapters.map(chapter=><details key={chapter.id} open><summary>{String(chapter.name)}</summary><div className="roster-picks">{eligibleTopics.filter(topic=>topic.chapter_id===chapter.id).map(topic=><div key={topic.id}><label><input type="checkbox" checked={topics.includes(topic.id)} onChange={()=>setTopics(value=>selectList(value,topic.id))}/>{String(topic.name)}</label>{list(data,"subtopics").filter(sub=>sub.topic_id===topic.id).map(sub=><label key={sub.id}><input type="checkbox" checked={subtopics.includes(sub.id)} onChange={()=>setSubtopics(value=>selectList(value,sub.id))}/>{String(sub.name)}</label>)}</div>)}</div></details>):<p>No curriculum topics have been defined for this assignment.</p>}</div>}
    <label className="checkbox-field"><input type="checkbox" checked={revision} onChange={e=>setRevision(e.target.checked)}/> Revision session</label>
    <label className="stack-field">Teaching notes<textarea value={notes} onChange={e=>setNotes(e.target.value)} maxLength={8000}/></label>
    <div className="panel-head"><div><h2>Attendance roster</h2><p>{students.length} eligible students</p></div><button className="button button-secondary" disabled={!students.length} onClick={()=>setRoster(r=>Object.fromEntries(students.map(s=>[s.id,{...r[s.id],status:"present"}])))}>Mark all present</button></div>
    {!!students.length&&<div className="row-field"><input aria-label="Search roster" placeholder="Search roster…" value={query} onChange={e=>setQuery(e.target.value)}/><label className="checkbox-field"><input type="checkbox" checked={observe} onChange={e=>setObserve(e.target.checked)}/> Show observations</label><KindSelect name="Set attendance for all visible students" blank="Bulk status" options={attendanceStatuses} onChange={v=>{if(v)setRoster(previous=>({...previous,...Object.fromEntries(students.filter(s=>String(s.name).toLowerCase().includes(query.toLowerCase())).map(s=>[s.id,{...previous[s.id],status:v}]))}));}}/></div>}
    {observe&&students.length>0&&<div className="row-field">{([["attentiveness",attentiveness],["participation",participation],["understanding",understanding]] as const).map(([key,options])=><KindSelect key={key} name={"Bulk "+key} blank={"Bulk "+key} options={options} onChange={value=>{
      if(value)setRoster(old=>({...old,...Object.fromEntries(students.filter(student=>String(student.name).toLowerCase().includes(query.toLowerCase())).map(student=>[student.id,{...old[student.id],[key]:value}]))}));
    }}/>)}</div>}
    {!!students.length&&<div className="table-scroll roster-table"><table><thead><tr><th>Student</th><th>Attendance</th><th>Remarks</th>{observe&&<><th>Attentiveness</th><th>Participation</th><th>Understanding</th><th>Classwork</th><th>Support</th><th>Follow-up</th><th>Observation</th></>}</tr></thead><tbody>{students.filter(s=>String(s.name).toLowerCase().includes(query.toLowerCase())).map(s=><tr key={s.id}><td>{String(s.name)}</td>
      <td><KindSelect name={"Attendance for "+s.name} value={roster[s.id]?.status} options={attendanceStatuses} onChange={v=>change(s.id,{status:v||undefined})}/></td>
      <td><input aria-label={"Attendance remarks for "+s.name} value={roster[s.id]?.remarks??""} onChange={e=>change(s.id,{remarks:e.target.value})}/></td>
      {observe&&<>{([["attentiveness",attentiveness],["participation",participation],["understanding",understanding]] as const).map(([key,options])=><td key={key}><KindSelect name={key+" for "+s.name} value={roster[s.id]?.[key]} options={options} blank="Not recorded" onChange={v=>change(s.id,{[key]:v||undefined})}/></td>)}{(["completed_classwork","needs_support","follow_up"] as const).map(key=><td key={key}><input className="checkbox-field" type="checkbox" aria-label={key+" for "+s.name} checked={Boolean(roster[s.id]?.[key])} onChange={e=>change(s.id,{[key]:e.target.checked})}/></td>)}<td><input aria-label={"Observation for "+s.name} value={roster[s.id]?.observation??""} onChange={e=>change(s.id,{observation:e.target.value})}/></td></>}</tr>)}</tbody></table></div>}
    {observe&&<p>Observations reflect what the teacher recorded during the session.</p>}
    {notice&&<Notice type="error">{notice}</Notice>}
    <div className="form-actions"><button className="button button-secondary" onClick={close}>Cancel</button>{entry?.status!=="completed"&&<button className="button button-secondary" disabled={busy} onClick={()=>save("draft")}>Save draft</button>}<button className="button button-primary" disabled={busy} onClick={()=>save("completed")}>{entry?.status==="completed"?"Save corrections":"Submit session"}</button></div>
  </div>;
}
export function SessionsPage({data,attendance,run,create,editable=true}:{data:Data;attendance:boolean;run:RunCommand;create:boolean;editable?:boolean}){
  const [selected,setSelected]=useState<Item|true|null>(create&&editable?true:null);
  const [notice,setNotice]=useState("");
  const entries=list(data,attendance?"attendance_records":"class_sessions").filter(row=>!attendance||list(data,"class_sessions").some(s=>s.id===row.session_id&&s.status==="completed"));
  return <><PageHeading title={attendance?"Attendance":"Class sessions"} detail={attendance?"Review submitted attendance and make audited corrections.":"Record teaching time, syllabus coverage, attendance, and observations."}>{editable&&<button className="button button-primary" onClick={()=>setSelected(true)}><ClipboardCheck size={16}/>{attendance?"Mark attendance":"Record session"}</button>}</PageHeading>
    {notice&&<Notice type="success">{notice}</Notice>}
    <RecordTable data={data} items={entries} columns={attendance?["student_id","session_id","status","remarks"]:["date","staff_assignment_id","duration_minutes","status","notes"]} renderAction={editable?row=><button className="text-link" onClick={()=>setSelected(attendance?list(data,"class_sessions").find(s=>s.id===row.session_id)??null:row)}>{attendance?"Correct attendance":"Open session"}</button>:undefined}/>
    {selected&&<Modal title={selected===true?"Record class session":"Class session details"} close={()=>setSelected(null)}><SessionEditor data={data} entry={selected===true?undefined:selected} run={run} close={()=>setSelected(null)}/></Modal>}
  </>;
}
export function WorkRoster({kind,parent,data,demo,run,close}:{kind:"marks"|"assignments";parent:Item;data:Data;demo:boolean;run:RunCommand;close:()=>void}){
  const marks=kind==="marks";
  const statuses=marks?scoreStatuses:workStatuses;
  const students=eligibleRoster(data,parent.staff_assignment_id,String(marks?parent.assessment_on:parent.assigned_on));
  const previous=list(data,marks?"assessment_scores":"assignment_submissions").filter(r=>r[marks?"assessment_id":"assignment_id"]===parent.id);
  const questions=marks?list(data,"assessment_questions").filter(row=>row.assessment_id===parent.id).sort((a,b)=>Number(a.question_number)-Number(b.question_number)):[];
  const [showQuestions,setShowQuestions]=useState(false);
  const [questionMarks,setQuestionMarks]=useState<Record<string,Record<string,string>>>(()=>Object.fromEntries(students.map(student=>{
    const score=previous.find(row=>row.student_id===student.id);
    return [student.id,Object.fromEntries(list(data,"assessment_question_scores").filter(row=>row.score_id===score?.id).map(row=>[String(row.question_id),String(row.marks)]))];
  })));
  const [rows,setRows]=useState<Record<string,{status:string;marks:string;feedback:string}>>(()=>Object.fromEntries(students.map(student=>{
    const row=previous.find(record=>record.student_id===student.id);
    return [student.id,{status:String(row?.status??(marks?"not_evaluated":"not_submitted")),marks:String(row?.marks??""),feedback:String(row?.feedback??"")}];
  })));
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  function change(id:string,field:"status"|"marks"|"feedback",value:string){
    setRows(prev=>({...prev,[id]:{...prev[id],[field]:value,...(marks&&field==="status"&&value!=="evaluated"?{marks:""}:{}),...(marks&&field==="marks"&&value?{status:"evaluated"}:{})}}));
  }
  async function save(draft:boolean){
    setBusy(true);setNotice("");
    try{
      const parsed=students.map(student=>{
        const row=rows[student.id], value=row.marks===""?null:Number(row.marks);
        if((marks&&row.status==="evaluated"&&value===null)||(value!==null&&(!Number.isFinite(value)||value<0||value>Number(parent.max_marks))))throw new Error("Check the marks for "+student.name+".");
        const question_marks:Record<string,number|null>={};
        let mapped=0;
        if(marks&&row.status==="evaluated")for(const question of questions){
          const raw=questionMarks[student.id]?.[question.id]??"";
          const score=raw===""?null:Number(raw);
          if(score!==null&&(!Number.isFinite(score)||score<0||score>Number(question.max_marks)))throw new Error("Check question "+question.question_number+" for "+student.name+".");
          if(score!==null)mapped+=score;
          question_marks[question.id]=score;
        }
        if(value!==null&&mapped>value)throw new Error("Mapped question marks exceed the total for "+student.name+".");
        return {...row,marks:value,student_id:student.id,...(marks?{question_marks}:{})};
      });
      await run({operation:"roster",kind,parent:parent.id,draft,rows:parsed});close();
    }catch(error){setNotice((error as Error).message);}finally{setBusy(false);}
  }
  async function importMarks(file?:File){
    if(!file)return;
    setNotice("");
    try{
      const sheet=await readSpreadsheet(file);
      const updates:typeof rows={};
      for(const line of sheet){
        const student=students.find(s=>s.id===line.student_id||s.admission_number===line.admission_number);
        if(!student)throw new Error("A spreadsheet row does not match an eligible admission number.");
        const raw=line.marks?.trim()??"";
        if(raw!==""&&(!Number.isFinite(Number(raw))||Number(raw)<0||Number(raw)>Number(parent.max_marks)))throw new Error("Invalid marks for "+student.name+".");
        const status=line.status|| (raw!==""?"evaluated":"not_evaluated");
        if(!(statuses as readonly string[]).includes(status))throw new Error("Invalid status for "+student.name+".");
        updates[student.id]={status,marks:raw,feedback:line.feedback??""};
      }
      setRows(value=>({...value,...updates}));
    }catch(error){setNotice((error as Error).message);}
  }
  return <Modal title={(marks?"Marks · ":"Submissions · ")+parent.title} close={close}>
    <div className="record-form">
    {!marks&&!demo&&<RecordFile type="assignment" id={parent.id} exists={Boolean(list(data,"assignments").find(row=>row.id===parent.id)?.attachment_path)}/>}
    <p>{parent.max_marks!=null?"Maximum score "+parent.max_marks+". ":""}{students.length} eligible students.</p>
    <div className="row-field">{marks?<label className="button button-secondary upload-label"><Upload size={15}/> Import scores<input aria-label="Import scores" type="file" accept=".csv,.xlsx" onChange={e=>void importMarks(e.target.files?.[0])}/></label>:<KindSelect name="Set all submission statuses" blank="Set all statuses" options={statuses} onChange={value=>{if(value)setRows(old=>Object.fromEntries(Object.entries(old).map(([id,row])=>[id,{...row,status:value}])));}}/>}</div>
    {questions.length>0&&<label className="checkbox-field"><input type="checkbox" checked={showQuestions} onChange={e=>setShowQuestions(e.target.checked)}/> Enter question marks</label>}
    {students.length?<div className="table-scroll roster-table"><table><thead><tr><th>Student</th><th>Status</th><th>Marks</th><th>Feedback</th>{showQuestions&&questions.map(q=><th key={q.id}>Q{String(q.question_number)} / {String(q.max_marks)}</th>)}</tr></thead><tbody>{students.map(s=><tr key={s.id}><td>{String(s.name)}</td><td><KindSelect name={"Status for "+s.name} options={statuses} value={rows[s.id]?.status} onChange={value=>{if(value)change(s.id,"status",value);}}/></td><td><input type="number" aria-label={"Marks for "+s.name} min="0" max={Number(parent.max_marks)} step="any" disabled={!parent.max_marks||rows[s.id].status==="absent"} value={rows[s.id]?.marks??""} onChange={e=>change(s.id,"marks",e.target.value)}/></td><td><input aria-label={"Feedback for "+s.name} value={rows[s.id]?.feedback??""} onChange={e=>change(s.id,"feedback",e.target.value)}/></td>{showQuestions&&questions.map(q=><td key={q.id}><input aria-label={"Question "+q.question_number+" marks for "+s.name} type="number" min="0" max={Number(q.max_marks)} step="any" disabled={rows[s.id].status!=="evaluated"} value={questionMarks[s.id]?.[q.id]??""} onChange={e=>setQuestionMarks(old=>({...old,[s.id]:{...old[s.id],[q.id]:e.target.value}}))}/></td>)}</tr>)}</tbody></table></div>:<Empty title="No eligible students"/>}
    {notice&&<Notice type="error">{notice}</Notice>}
    <div className="form-actions"><button className="button button-secondary" onClick={close}>Close</button>{marks&&!previous.some(row=>row.draft===false)&&<button className="button button-secondary" disabled={busy||!students.length} onClick={()=>save(true)}>Save draft</button>}<button className="button button-primary" disabled={busy||!students.length} onClick={()=>save(false)}>{marks?"Submit final marks":"Save submissions"}</button></div>
    </div>
  </Modal>;
}

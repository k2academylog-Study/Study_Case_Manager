"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { list, type Data, type Item } from "@/lib/catalog";
import { Modal, type RunCommand } from "./records";
import { Empty, Notice } from "./ui";
export function WorkTopics({data,kind,entry,run,close}:{data:Data;kind:"assignments"|"assessments";entry:Item;run:RunCommand;close:()=>void}){
  const assessment=kind==="assessments";
  const allocation=list(data,"staff_assignments").find(row=>row.id===entry.staff_assignment_id);
  const batch=list(data,"batches").find(row=>row.id===allocation?.batch_id);
  const curricula=list(data,"syllabi").filter(row=>row.subject_id===allocation?.subject_id&&row.class_id===batch?.class_id&&row.academic_year_id===batch?.academic_year_id);
  const chapters=list(data,"chapters").filter(row=>curricula.some(curriculum=>curriculum.id===row.syllabus_id));
  const topics=list(data,"topics").filter(row=>chapters.some(chapter=>chapter.id===row.chapter_id));
  const [selected,setSelected]=useState(list(data,assessment?"assessment_topics":"assignment_topics").filter(row=>row[assessment?"assessment_id":"assignment_id"]===entry.id).map(row=>String(row.topic_id)));
  const [questions,setQuestions]=useState(list(data,"assessment_questions").filter(row=>row.assessment_id===entry.id).sort((a,b)=>Number(a.question_number)-Number(b.question_number)).map(row=>({key:row.id,topic_id:String(row.topic_id??""),question_number:Number(row.question_number),max_marks:Number(row.max_marks)})));
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  return <Modal title={"Related topics · "+String(entry.title)} close={close}><form className="record-form" onSubmit={async event=>{
    event.preventDefault();setError("");setBusy(true);
    try{await run({operation:"work-topics",kind,parent:entry.id,topics:selected,questions:assessment?questions.map(({topic_id,question_number,max_marks})=>({topic_id:topic_id||null,question_number,max_marks})):[]});close();}
    catch(err){setError((err as Error).message);}finally{setBusy(false);}
  }}>
    {topics.length?<div className="roster-picks">{topics.map(row=><label className="checkbox-field" key={row.id}><input type="checkbox" checked={selected.includes(row.id)} onChange={()=>setSelected(old=>old.includes(row.id)?old.filter(id=>id!==row.id):[...old,row.id])}/>{String(row.name)}</label>)}</div>:<Empty title="No curriculum topics" text="Create a syllabus for this academic year, class, and subject."/>}
    {assessment&&<><div className="panel-head"><div><h2>Question-to-topic mapping</h2><p>Mapped scores are measured against each question’s maximum.</p></div><button type="button" className="button button-secondary" disabled={questions.length>=60} onClick={()=>setQuestions(old=>[...old,{key:crypto.randomUUID(),topic_id:"",question_number:Math.max(0,...old.map(r=>r.question_number))+1,max_marks:1}])}><Plus size={15}/> Add question</button></div>
    {questions.length>0&&<div className="table-scroll roster-table"><table><thead><tr><th>Question</th><th>Topic</th><th>Max. marks</th><th>Action</th></tr></thead><tbody>{questions.map((row,i)=><tr key={row.key}>
      <td><input aria-label={"Question number "+(i+1)} type="number" min="1" required value={row.question_number||""} onChange={e=>setQuestions(old=>old.map(q=>q.key===row.key?{...q,question_number:Number(e.target.value)}:q))}/></td>
      <td><select aria-label={"Topic for question "+(i+1)} value={row.topic_id} onChange={e=>setQuestions(old=>old.map(q=>q.key===row.key?{...q,topic_id:e.target.value}:q))}><option value="">Unmapped</option>{topics.map(topic=><option value={topic.id} key={topic.id}>{String(topic.name)}</option>)}</select></td>
      <td><input aria-label={"Maximum marks for question "+(i+1)} type="number" min=".01" max={Number(entry.max_marks)} step="any" required value={row.max_marks||""} onChange={e=>setQuestions(old=>old.map(q=>q.key===row.key?{...q,max_marks:Number(e.target.value)}:q))}/></td>
      <td><button type="button" aria-label={"Remove question "+(i+1)} className="icon-button" onClick={()=>setQuestions(old=>old.filter(q=>q.key!==row.key))}><Trash2 size={16}/></button></td>
    </tr>)}</tbody></table></div>}</>}
    {error&&<Notice type="error">{error}</Notice>}
    <div className="form-actions"><button type="button" className="button button-secondary" onClick={close}>Cancel</button><button className="button button-primary" disabled={busy}>{busy?"Saving…":"Save topic mapping"}</button></div>
  </form></Modal>;
}

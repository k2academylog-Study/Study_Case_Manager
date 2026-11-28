import { list, type Data, type Item } from "./catalog";
import { validateValues, type Command } from "./command";
import { dateKey, relativeDate } from "./metrics";
import { modules } from "./catalog";

export function applyDemo(current:Data,command:Command):Data{
  const next=structuredClone(current);
  const rows=(key:string)=>next[key]??(next[key]=[]);
  const upsert=(key:string,value:Item)=>{
    const index=rows(key).findIndex(row=>row.id===value.id);
    if(index<0)rows(key).unshift(value);else rows(key)[index]={...rows(key)[index],...value};
  };
  const stamp=()=>({created_at:new Date().toISOString()});
  function save(module:string,values:Record<string,unknown>,id=crypto.randomUUID(),weeks=1){
    const table=modules[module].table;
    if(module==="students" && (!values.admission_number || String(values.admission_number).trim() === "")){
      const students = rows(table);
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
      values.admission_number = `${prefix}${maxNum + 1}`;
    }
    const parsed=validateValues(module,values);
    const old=rows(table).find(row=>row.id===id);
    const today=dateKey();
    if(module==="students"){
      if(rows(table).some(row=>row.id!==id&&row.admission_number===parsed.admission_number))throw new Error("That admission number already exists.");
      if(!old||old.batch_id!==parsed.batch_id||old.active!==parsed.active){
        next.student_enrollments=rows("student_enrollments").flatMap(row=>row.student_id===id&&!row.ends_on?String(row.starts_on)===today?[]:[{...row,ends_on:relativeDate(today,-1)}]:[row]);
        if(parsed.active)rows("student_enrollments").push({id:crypto.randomUUID(),student_id:id,batch_id:parsed.batch_id,starts_on:old?today:parsed.admission_date??today,ends_on:null});
      }
    }
    if(module==="assessments"&&Number(parsed.pass_marks)>Number(parsed.max_marks))throw new Error("Passing marks cannot exceed the maximum.");
    if(module==="assignments"&&String(parsed.assigned_on)>String(parsed.due_on))throw new Error("The due date must be on or after the assigned date.");
    if(module==="timetable"||module==="calendar"){
      const start=new Date(String(parsed.starts_at)),end=new Date(String(parsed.ends_at));
      if(start>=end)throw new Error("The event must end after it begins.");
      const teaching=list(next,"staff_assignments").find(a=>a.id===parsed.staff_assignment_id);
      const overlaps=(row:Item,s:number,e:number)=>+new Date(String(row.starts_at))<e&&+new Date(String(row.ends_at))>s;
      for(let i=0;i<weeks;i++){
        const offset=i*604800000,s=+start+offset,e=+end+offset;
        if(module==="timetable"&&parsed.status!=="cancelled"){
          const conflict=rows("timetable_entries").some(row=>{
            const a=list(next,"staff_assignments").find(item=>item.id===row.staff_assignment_id);
            return row.id!==id&&row.status!=="cancelled"&&overlaps(row,s,e)&&(a?.staff_id===teaching?.staff_id||a?.batch_id===teaching?.batch_id);
          });
          if(conflict||rows("calendar_events").some(row=>row.event_type==="holiday"&&(!row.batch_id||row.batch_id===teaching?.batch_id)&&overlaps(row,s,e)))throw new Error("The class conflicts with an existing class or holiday.");
        }
        upsert(table,{...stamp(),...parsed,id:i?crypto.randomUUID():id,starts_at:new Date(s).toISOString(),ends_at:new Date(e).toISOString()});
      }
      return;
    }
    upsert(table,{...stamp(),...parsed,id});
  }
  if(command.operation==="save")save(command.module,command.values,command.id,command.weeks);
  if(command.operation==="delete"){
    const table=modules[command.module]?.table;
    if(table && next[table]){
      next[table]=rows(table).filter(row=>row.id!==command.id);
    }
    if(command.module==="chapters"){
      const topicIds=rows("topics").filter(t=>t.chapter_id===command.id).map(t=>t.id);
      next["topics"]=rows("topics").filter(t=>t.chapter_id!==command.id);
      next["subtopics"]=rows("subtopics").filter(s=>!topicIds.includes(String(s.topic_id)));
    }else if(command.module==="topics"){
      next["subtopics"]=rows("subtopics").filter(s=>s.topic_id!==command.id);
    }else if(command.module==="staff"){
      const asgnIds = rows("staff_assignments").filter(a=>a.staff_id===command.id).map(a=>a.id);
      next["staff"]=rows("staff").filter(s=>s.id!==command.id);
      next["staff_assignments"]=rows("staff_assignments").filter(a=>a.staff_id!==command.id);
      next["timetable_entries"]=rows("timetable_entries").filter(t=>!asgnIds.includes(String(t.staff_assignment_id)));
      next["topic_progress"]=rows("topic_progress").filter(p=>!asgnIds.includes(String(p.staff_assignment_id)));
      next["class_sessions"]=rows("class_sessions").filter(s=>!asgnIds.includes(String(s.staff_assignment_id)));
      next["assessments"]=rows("assessments").filter(a=>!asgnIds.includes(String(a.staff_assignment_id)));
      next["assignments"]=rows("assignments").filter(a=>!asgnIds.includes(String(a.staff_assignment_id)));
      next["profiles"]=rows("profiles").filter(p=>p.staff_id!==command.id);
    }
  }
  if(command.operation==="import")command.rows.forEach(row=>save(command.module,row));
  if(command.operation==="invite")throw new Error("Invitations require institutional configuration.");
  if(command.operation==="work-topics"){
    const assessments=command.kind==="assessments";
    const key=assessments?"assessment_id":"assignment_id";
    const table=assessments?"assessment_topics":"assignment_topics";
    next[table]=rows(table).filter(row=>row[key]!==command.parent);
    for(const topic of command.topics)rows(table).push({id:crypto.randomUUID(),[key]:command.parent,topic_id:topic});
    if(assessments){
      const saved=rows("assessment_questions").filter(row=>row.assessment_id===command.parent);
      const total=command.questions.reduce((sum,q)=>sum+q.max_marks,0);
      if(total>Number(rows("assessments").find(row=>row.id===command.parent)?.max_marks))throw new Error("The question maxima exceed the assessment maximum.");
      if(new Set(command.questions.map(q=>q.question_number)).size!==command.questions.length)throw new Error("Use a different number for each question.");
      next.assessment_questions=rows("assessment_questions").filter(row=>row.assessment_id!==command.parent);
      for(const question of command.questions)rows("assessment_questions").push({...question,id:saved.find(q=>q.question_number===question.question_number)?.id??crypto.randomUUID(),assessment_id:command.parent});
    }
  }
  if(command.operation==="roster"){
    const key=command.kind==="marks"?"assessment_id":"assignment_id";
    const table=command.kind==="marks"?"assessment_scores":"assignment_submissions";
    for(const row of command.rows){
      const existing=rows(table).find(record=>record[key]===command.parent&&record.student_id===row.student_id);
      const id=existing?.id??crypto.randomUUID();
      const {question_marks,...score}=row;
      upsert(table,{...stamp(),...score,id,[key]:command.parent,draft:command.draft});
      if(command.kind==="marks"&&question_marks){
        next.assessment_question_scores=rows("assessment_question_scores").filter(r=>r.score_id!==id);
        for(const [question_id,value] of Object.entries(question_marks))if(value!==null&&row.status==="evaluated")rows("assessment_question_scores").push({id:crypto.randomUUID(),question_id,score_id:id,marks:value});
      }
    }
  }
  if(command.operation==="session"){
    const entry=command.session;
    const existing=rows("class_sessions").find(row=>row.request_id===entry.request_id || (entry.timetable_id&&row.timetable_id===entry.timetable_id));
    if(existing?.status==="completed"&&existing.request_id&&existing.request_id!==entry.request_id)throw new Error("This session has already been submitted.");
    const id=existing?.id??crypto.randomUUID();
    upsert("class_sessions",{...stamp(),...entry,id});
    for(const key of ["attendance_records","student_observations","session_topics","session_subtopics"])next[key]=rows(key).filter(row=>row.session_id!==id);
    for(const row of command.roster){
      if(row.status)rows("attendance_records").push({id:crypto.randomUUID(),session_id:id,student_id:row.student_id,status:row.status,remarks:row.remarks});
      rows("student_observations").push({id:crypto.randomUUID(),session_id:id,...row,remarks:row.observation});
    }
    for(const [key,ids] of [["topic",command.topics],["subtopic",command.subtopics]] as const){
      for(const selected of ids){
        rows("session_"+key+"s").push({id:crypto.randomUUID(),session_id:id,[key+"_id"]:selected,revision:entry.revision});
        if(entry.status!=="completed"||entry.revision)continue;
        const sub=key==="subtopic"?selected:null;
        const topic=sub?rows("subtopics").find(row=>row.id===sub)?.topic_id:selected;
        const progress=rows("topic_progress").find(row=>row.staff_assignment_id===entry.staff_assignment_id&&row.topic_id===topic&&(row.subtopic_id??null)===sub);
        upsert("topic_progress",{id:progress?.id??crypto.randomUUID(),staff_assignment_id:entry.staff_assignment_id,topic_id:topic,subtopic_id:sub,completion:100,status:"completed",completed_on:entry.date});
      }
    }
  }
  return next;
}


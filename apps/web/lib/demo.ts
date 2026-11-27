import { type Data, type Item, list, rowName } from "./catalog";
import { dateKey, relativeDate } from "./metrics";

const id = (value:number) => "00000000-0000-4000-8000-"+String(value).padStart(12,"0");
export function demoData(today=dateKey()): Data {
  const classes=Array.from({length:7},(_,i)=>({id:id(100+i),name:"Class "+(i+6),description:"Academic year group"}));
  const year={id:id(190),name:"2026–27",starts_on:"2026-04-01",ends_on:"2027-03-31"};
  const batches=classes.flatMap((entry,i)=>["A","B"].map((letter,j)=>({id:id(200+i*2+j),name:"Batch "+letter,class_id:entry.id,academic_year_id:year.id})));
  const teacherNames=["Priya Sharma","Meera Iyer","Kavya Menon","Vikram Rao","Ananya Das","Arjun Nair","Divya Raman","Rohit Verma"];
  const staff=teacherNames.map((name,i)=>({id:id(300+i),name,email:name.toLowerCase().replace(" ",".")+"@example.test",active:true,employment_status:"employed",email_consent:false,whatsapp_consent:false}));
  const subjects=["Mathematics","English","Science","Social Science","Computer Science","Tamil","Physics","Chemistry"].map((name,i)=>({id:id(400+i),name}));
  const cohortNames=["Aarav Mehta","Ananya Patel","Ishaan Rao","Diya Sharma","Riya Krishnan","Kabir Shah","Myra Nair","Vivaan Das","Saanvi Iyer","Rohan Gupta","Aditya Ravi","Sara Thomas","Ira Menon","Arun Kumar"];
  const students=Array.from({length:112},(_,i)=>({id:id(500+i),name:cohortNames[i%14]+(i>=14?" "+["","S.","R.","M.","A.","P.","K.","V."][Math.floor(i/14)]:""),admission_number:"SCM-"+String(1001+i),batch_id:batches[i%14].id,active:true,academic_status:"enrolled"}));
  const staff_assignments=batches.map((batch,i)=>({id:id(700+i),batch_id:batch.id,subject_id:subjects[i%8].id,staff_id:staff[i%8].id,active:true}));
  const timetable_entries=staff_assignments.slice(0,5).map((a,i)=>({id:id(800+i),title:subjects[i].name,staff_assignment_id:a.id,starts_at:today+"T"+["09:00","10:00","11:30","13:00","14:00"][i]+":00+05:30",ends_at:today+"T"+["09:45","10:45","12:15","13:45","14:45"][i]+":00+05:30",status:"scheduled"}));
  const class_sessions=Array.from({length:98},(_,i)=>({id:id(1000+i),timetable_id:i<2?timetable_entries[i].id:null,date:i<2?today:relativeDate(today,-(1+Math.floor((i-2)/2))),staff_assignment_id:staff_assignments[i%14].id,duration_minutes:45,status:"completed",notes:["Topic review","Group practice","Guided discussion"][i%3]}));
  const attendance_records=class_sessions.flatMap((session,i)=>students.filter(s=>s.batch_id===staff_assignments[i%14].batch_id).map((s,j)=>({id:id(2000+i*8+j),student_id:s.id,session_id:session.id,status:((i*3+j*7)%19 < (j===0?6:2)+(Math.floor(i/14)%3))?"absent":(i+j)%22===0?"late":"present"})));
  const assessments=Array.from({length:28},(_,i)=>({id:id(3000+i),title:["Weekly review","Unit test","Monthly assessment"][i%3],staff_assignment_id:staff_assignments[i%14].id,assessment_on:relativeDate(today,-i*2),assessment_type:"unit_test",max_marks:50,pass_marks:20}));
  const assessment_scores=assessments.flatMap((entry,i)=>students.filter(s=>s.batch_id===staff_assignments[i%14].batch_id).map((s,j)=>({id:id(4000+i*8+j),assessment_id:entry.id,student_id:s.id,status:"evaluated",marks: j===0 ? 17+(i%9) : 33+(i*7+j*4)%17,draft:false})));
  const syllabi=staff_assignments.map((a,i)=>({id:id(7100+i),name:"Subject curriculum",class_id:batches[i].class_id,academic_year_id:year.id,subject_id:a.subject_id}));
  const chapters=syllabi.map((a,i)=>({id:id(7200+i),name:"Core concepts",syllabus_id:a.id,position:1}));
  const topics=chapters.map((a,i)=>({id:id(5000+i),name:["Linear equations","Reading comprehension","Energy and motion","Map interpretation","Data and algorithms","Literary analysis","Electricity","Chemical reactions"][i%8],chapter_id:a.id,estimated_minutes:120,weight:1}));
  const topic_progress=staff_assignments.map((a,i)=>({id:id(5100+i),staff_assignment_id:a.id,topic_id:topics[i].id,completion:50+(i*13)%51,target_on:relativeDate(today,i-3),status:i===0?"delayed":"in_progress"}));
  const assignments=staff_assignments.map((a,i)=>({id:id(6000+i),title:["Skills practice","Chapter review","Reading exercise"][i%3],staff_assignment_id:a.id,assigned_on:relativeDate(today,-i),due_on:relativeDate(today,5-i),max_marks:20}));
  const assignment_submissions=assignments.flatMap((entry,i)=>students.filter(s=>s.batch_id===staff_assignments[i].batch_id).map((s,j)=>({id:id(8000+i*8+j),assignment_id:entry.id,student_id:s.id,status:(i+j)%4===0?"not_submitted":"submitted"})));
  const calendar_events=[
    {id:id(6500),title:"Faculty planning meeting",event_type:"meeting",starts_at:relativeDate(today,1)+"T10:00:00+05:30",ends_at:relativeDate(today,1)+"T11:00:00+05:30"},
    {id:id(6501),title:"Monthly assessment review",event_type:"assessment",starts_at:relativeDate(today,3)+"T11:30:00+05:30",ends_at:relativeDate(today,3)+"T12:15:00+05:30"},
    {id:id(6502),title:"Assignment submission deadline",event_type:"deadline",starts_at:relativeDate(today,5)+"T15:00:00+05:30",ends_at:relativeDate(today,5)+"T16:00:00+05:30"},
  ];
  return {
    institutions:[{id:id(1),name:"Northview Academy"}], institution_settings:[{id:id(2),institution_name:"Northview Academy",timezone:"Asia/Kolkata",working_days:[1,2,3,4,5,6],class_minutes:45,attendance_threshold:75,assessment_threshold:50,decline_threshold:15,pending_threshold:3,consecutive_absences:3,ai_daily_limit:20,retention_days:365,syllabus_weighting:"weight",late_present:true,exclude_excused:true,ai_enabled:false}],
    classes,academic_years:[year],batches,staff,subjects,students,staff_assignments,timetable_entries,class_sessions,attendance_records,assessments,assessment_scores,syllabi,chapters,topics,topic_progress,assignments,assignment_submissions,calendar_events,
    session_topics: class_sessions.map((s,i)=>({id:id(9000+i),session_id:s.id,topic_id:topics[i%14].id,revision:i%11===0})),
    student_enrollments:students.map((s,i)=>({id:id(12000+i),student_id:s.id,batch_id:s.batch_id,starts_on:"2026-04-01",ends_on:null})),
    notifications:[{id:id(6600),title:"Faculty planning meeting",body:"Bring updated syllabus progress to the next faculty planning meeting.",published_at:today}],
  };
}
export function staffDemo(data:Data):Data {
  const staff=list(data,"staff").slice(0,1);
  const staff_assignments=list(data,"staff_assignments").filter(r=>r.staff_id===staff[0]?.id && r.active);
  const matched=(rows:Item[],key:string,ids:unknown[])=>rows.filter(r=>ids.includes(r[key]));
  const assignmentIds=staff_assignments.map(r=>r.id);
  const batches=matched(list(data,"batches"),"id",staff_assignments.map(r=>r.batch_id));
  const batchIds=batches.map(r=>r.id);
  const pick=(key:string)=>matched(list(data,key),"staff_assignment_id",assignmentIds);
  const class_sessions=pick("class_sessions"), assessments=pick("assessments"), assignments=pick("assignments");
  const subjects=matched(list(data,"subjects"),"id",staff_assignments.map(r=>r.subject_id));
  const syllabi=list(data,"syllabi").filter(r=>batches.some(batch=>batch.class_id===r.class_id)&&subjects.some(subject=>subject.id===r.subject_id));
  const chapters=matched(list(data,"chapters"),"syllabus_id",syllabi.map(r=>r.id));
  const topics=matched(list(data,"topics"),"chapter_id",chapters.map(r=>r.id));
  const sessionRecords=(key:string)=>matched(list(data,key),"session_id",class_sessions.map(r=>r.id));
  return { institutions:list(data,"institutions"),institution_settings:list(data,"institution_settings"),academic_years:list(data,"academic_years"),staff,staff_assignments,batches,
    classes:matched(list(data,"classes"),"id",batches.map(r=>r.class_id)),subjects,
    students:matched(list(data,"students"),"batch_id",batchIds), student_enrollments:matched(list(data,"student_enrollments"),"batch_id",batchIds),
    class_sessions,timetable_entries:pick("timetable_entries"),assessments,assignments,syllabi,chapters,topics,subtopics:matched(list(data,"subtopics"),"topic_id",topics.map(r=>r.id)),topic_progress:pick("topic_progress"),
    attendance_records:sessionRecords("attendance_records"),student_observations:sessionRecords("student_observations"),session_topics:sessionRecords("session_topics"),session_subtopics:sessionRecords("session_subtopics"),
    assessment_scores:matched(list(data,"assessment_scores"),"assessment_id",assessments.map(r=>r.id)), assignment_submissions:matched(list(data,"assignment_submissions"),"assignment_id",assignments.map(r=>r.id)),
    assessment_questions:matched(list(data,"assessment_questions"),"assessment_id",assessments.map(r=>r.id)),
    assessment_question_scores:matched(list(data,"assessment_question_scores"),"score_id",matched(list(data,"assessment_scores"),"assessment_id",assessments.map(r=>r.id)).map(r=>r.id)),
    assessment_topics:matched(list(data,"assessment_topics"),"assessment_id",assessments.map(r=>r.id)),
    assignment_topics:matched(list(data,"assignment_topics"),"assignment_id",assignments.map(r=>r.id)),
    calendar_events:list(data,"calendar_events").filter(r=>!r.batch_id || batchIds.includes(String(r.batch_id))),notifications:list(data,"notifications"),
  };
}
export const demoPerson = (data:Data) => rowName(data,"staff",list(data,"staff")[0]?.id);


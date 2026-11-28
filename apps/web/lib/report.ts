import { list, rowName, type Data, type Item } from "./catalog";
import { attendance, average, byPeriod, dateKey, inRange, marks, percent, relativeDate, scope, syllabusProgress, type Filters } from "./metrics";

export const reportTypes:Record<string,string>={student:"Individual student",staff:"Individual staff",class:"Class",batch:"Batch",subject:"Subject",attendance:"Attendance",assessment:"Assessments",assignment:"Assignments",syllabus:"Syllabus progress",analysis:"AI student performance",communication:"Communication delivery"};
export type ReportFilters=Filters&{type:string;personId?:string;templateId?:string};
export type Section={title:string;headers:string[];rows:string[][]};
export type Report={institution:string;title:string;person?:string;period:string;generated:string;academicYear:string;signature?:string;logo?:string;metrics:[string,string][];sections:Section[];trend:{date:string;Attendance:number|null;Assessment:number|null;Submissions:number|null}[]};
const text=(value:unknown)=>value==null?"—":String(value).replaceAll("_"," ");
const pct=(value:number|null)=>value===null?"—":value.toFixed(1)+"%";
const showDate=(value:unknown)=>text(value).slice(0,10);
export function makeReport(data:Data,filters:ReportFilters):Report {
  const {type,personId}=filters;
  const template=list(data,"report_templates").find(row=>row.id===filters.templateId&&row.report_type===type);
  const settings=list(data,"institution_settings")[0];
  const today=dateKey(new Date(),String(settings?.timezone??"Asia/Kolkata"));
  const student=type==="student"?list(data,"students").find(r=>r.id===personId):undefined;
  const teacher=type==="staff"?list(data,"staff").find(r=>r.id===personId):undefined;
  const scopedFilters=teacher?{...filters,staffId:teacher.id}:filters;
  const scoped=scope(data,scopedFilters);
  const attendanceRows=scoped.records.filter(row=>!student||row.student_id===student.id);
  const scoreRows=scoped.scores.filter(row=>!student||row.student_id===student.id);
  const submissionRows=scoped.submissions.filter(row=>!student||row.student_id===student.id);
  const attendanceTotals=attendance(attendanceRows,settings);
  const sessions=new Map(scoped.sessions.map(row=>[row.id,row]));
  const lookupAssessment=new Map(scoped.assessments.map(row=>[row.id,row]));
  const lookupAssignment=new Map(scoped.work.map(row=>[row.id,row]));
  const subject=(item?:Item)=>rowName(data,"subjects",scoped.assignments.find(a=>a.id===item?.staff_assignment_id)?.subject_id);
  const missed=attendanceRows.filter(row=>row.status==="absent" || (row.status==="late"&&settings?.late_present===false) || (row.status==="excused"&&settings?.exclude_excused===false));
  const coverage=[...list(data,"session_topics").map(row=>({...row,session_id:row.session_id,revision:row.revision,name:rowName(data,"topics",row.topic_id)})),...list(data,"session_subtopics").map(row=>({...row,session_id:row.session_id,revision:row.revision,name:rowName(data,"subtopics",row.subtopic_id)}))];
  const batch=list(data,"batches").find(r=>r.id===(student?.batch_id??filters.batchId));
  const academicYear=batch?rowName(data,"academic_years",batch.academic_year_id):list(data,"academic_years").find(r=>inRange(filters.to??today,String(r.starts_on),String(r.ends_on)))?.name??"All academic years";
  const included=(...types:string[])=>types.includes(type)||["class","batch","subject"].includes(type);
  const sections:Section[]=[];
  const add=(title:string,headers:string[], rows:string[][])=>sections.push({title,headers,rows});
  let metrics:[string,string][]=[
    ["Attendance",pct(attendanceTotals.rate)],["Eligible attendance entries",String(attendanceTotals.eligible)],["Average assessment",pct(average(marks(data,scoreRows)))],["Syllabus progress",pct(syllabusProgress(data,scoped.progress,scoped.assignments))],
  ];
  if(student){
    const finalizedScores=scoreRows.filter(r=>r.status==="evaluated"&&r.draft!==true).sort((a,b)=>String(lookupAssessment.get(String(a.assessment_id))?.assessment_on).localeCompare(String(lookupAssessment.get(String(b.assessment_id))?.assessment_on)));
    const latest=marks(data,finalizedScores.slice(-2));
    add("Student details",["Student","Admission number","Class and batch"],[[String(student.name),text(student.admission_number),rowName(data,"batches",student.batch_id)]]);
    metrics=[...metrics,["Classes attended",String(attendanceTotals.attended)],["Classes missed",String(attendanceTotals.missed)],["Missed teaching hours",(missed.reduce((sum,row)=>sum+Number(sessions.get(String(row.session_id))?.duration_minutes??0),0)/60).toFixed(1)],["Latest score change",latest.length===2?(latest[1]-latest[0]).toFixed(1)+" pp":"—"]];
    add("Enrollment history",["Batch","From","To"],list(data,"student_enrollments").filter(r=>r.student_id===student.id).map(r=>[rowName(data,"batches",r.batch_id),text(r.starts_on),text(r.ends_on)]));
    add("Teacher observations",["Date","Attentiveness","Participation","Understanding","Remarks"],list(data,"student_observations").filter(row=>row.student_id===student.id&&sessions.has(String(row.session_id))).map(row=>[showDate(sessions.get(String(row.session_id))?.date),text(row.attentiveness),text(row.participation),text(row.understanding),text(row.remarks)]));
    add("Interventions",["Issue","Action","Target","Status","Outcome"],list(data,"academic_interventions").filter(r=>r.student_id===student.id).map(r=>[text(r.issue),text(r.action),text(r.target_on),text(r.status),text(r.outcome)]));
    const findings=list(data,"ai_analysis_results").flatMap(row=>{
      const result=row.result as {findings?:{student_id?:string;summary?:string;recommendations?:string[]}[]}|undefined;
      return (result?.findings??[]).filter(item=>item.student_id===student.id).map(item=>[showDate(row.created_at),text(item.summary),(item.recommendations??[]).join("\n")]);
    });
    add("AI findings",["Generated","Summary","Recommendations"],findings);
  }
  if(teacher){
    add("Teaching assignments",["Class and batch","Subject","Active"],scoped.assignments.map(r=>[rowName(data,"batches",r.batch_id),rowName(data,"subjects",r.subject_id),r.active?"Yes":"No"]));
    const scheduled=scoped.scheduled.filter(r=>r.status!=="cancelled");
    const unrecorded=scheduled.filter(s=>showDate(s.starts_at)<=today&&!scoped.sessions.some(r=>r.timetable_id===s.id));
    metrics=[["Scheduled sessions",String(scheduled.length)],["Completed sessions",String(scoped.sessions.length)],["Cancelled sessions",String(scoped.scheduled.length-scheduled.length)],["Rescheduled sessions",String(scoped.scheduled.filter(r=>r.status==="rescheduled").length)],["Planned teaching hours",(scheduled.reduce((sum,r)=>sum+(+new Date(String(r.ends_at))- +new Date(String(r.starts_at))),0)/3600000).toFixed(1)],["Actual teaching hours",(scoped.sessions.reduce((sum,r)=>sum+Number(r.duration_minutes),0)/60).toFixed(1)],["Syllabus progress",pct(syllabusProgress(data,scoped.progress,scoped.assignments))],["Pending session records",String(unrecorded.length)],["Assignments",String(scoped.work.length)],["Assessments",String(scoped.assessments.length)]];
    const completed=scoped.progress.filter(row=>row.status==="completed"&&row.completed_on&&row.target_on);
    metrics.push(["Met topic deadlines",String(completed.filter(row=>String(row.completed_on)<=String(row.target_on)).length)],
       ["Completed after target",String(completed.filter(row=>String(row.completed_on)>String(row.target_on)).length)],
       ["Tracked topics pending",String(scoped.progress.filter(row=>Number(row.completion)<100).length)]);
    add("Teaching sessions",["Date","Subject","Minutes","Notes"],scoped.sessions.map(row=>[text(row.date),subject(row),text(row.duration_minutes),text(row.notes)]));
    const teacherAssessments = scoped.assessments.slice().sort((a,b)=>String(b.assessment_on).localeCompare(String(a.assessment_on)));
    if(teacherAssessments.length){
      add("Assessments given by teacher",["Date","Assessment type","Title","Subject","Class and batch","Max marks","Pass marks"],teacherAssessments.map(a=>{
        const asgn = scoped.assignments.find(r=>r.id===a.staff_assignment_id);
        return [showDate(a.assessment_on),text(a.assessment_type),text(a.title),rowName(data,"subjects",asgn?.subject_id),rowName(data,"batches",asgn?.batch_id),String(a.max_marks??"—"),String(a.pass_marks??"—")];
      }));
    }
  }
  if(included("student","attendance")){
    add("Subject attendance",["Subject","Eligible","Attended","Missed","Attendance"],[...Map.groupBy(attendanceRows,r=>subject(sessions.get(String(r.session_id))))].map(([name,rows])=>{const a=attendance(rows,settings);return [name,String(a.eligible),String(a.attended),String(a.missed),pct(a.rate)];}));
    add("Topic attendance",["Date","Subject","Topic","Attendance","Session type"],attendanceRows.flatMap(r=>coverage.filter(topic=>topic.session_id===r.session_id).map(topic=>[showDate(sessions.get(String(r.session_id))?.date),subject(sessions.get(String(r.session_id))),topic.name,text(r.status),topic.revision?"Revision":"Teaching"])));
  }
  if(included("student","staff","assessment")){
    const finalized=scoreRows.filter(row=>row.draft!==true && row.status==="evaluated" && row.marks!=null);
    const values=marks(data,finalized);
    const passed=finalized.filter(row=>Number(row.marks)>=Number(lookupAssessment.get(String(row.assessment_id))?.pass_marks)).length;
    if(!teacher)metrics=[...metrics,["Highest normalized score",values.length?pct(Math.max(...values)):"?"],["Lowest normalized score",values.length?pct(Math.min(...values)):"?"],["Pass rate",pct(percent(passed,finalized.length))]];
    const finalizedIds=new Set(finalized.map(row=>row.id));
    const defined=new Map(list(data,"assessment_questions").map(row=>[row.id,row]));
    const questionResults=list(data,"assessment_question_scores").flatMap(row=>{
      const question=defined.get(String(row.question_id));
      return question?.topic_id&&finalizedIds.has(String(row.score_id))?[{topic:question.topic_id,marks:Number(row.marks),max:Number(question.max_marks)}]:[];
    });
    const byTopic=Map.groupBy(questionResults,row=>row.topic);
    if(byTopic.size)add("Performance on mapped topics",["Topic","Responses","Marks earned","Marks possible","Average"],[...byTopic].map(([id,rows])=>{
      const earned=rows.reduce((total,row)=>total+row.marks,0),maximum=rows.reduce((total,row)=>total+row.max,0);
      return [rowName(data,"topics",id),String(rows.length),String(earned),String(maximum),pct(percent(earned,maximum))];
    }));
    add("Assessment results",["Date","Subject","Assessment","Student","Marks","Result"],scoreRows.filter(row=>row.draft!==true).map(r=>{
      const a=lookupAssessment.get(String(r.assessment_id));
      return [showDate(a?.assessment_on),subject(a),text(a?.title),rowName(data,"students",r.student_id),r.marks==null?"—":r.marks+" / "+a?.max_marks,r.marks==null?text(r.status):Number(r.marks)>=Number(a?.pass_marks)?"Pass":"Below pass mark"];
    }));
  }
  if(included("student","assignment"))add("Assignment tracking",["Assignment","Due date","Student","Status","Marks"],submissionRows.map(r=>{
    const work=lookupAssignment.get(String(r.assignment_id));
    return [text(work?.title),showDate(work?.due_on),rowName(data,"students",r.student_id),text(r.status),text(r.marks)];
  }));
  if(included("staff","syllabus"))add("Teaching progress",["Topic","Teaching assignment","Target","Actual completion","Progress","Status"],scoped.progress.map(r=>[rowName(data,r.subtopic_id?"subtopics":"topics",r.subtopic_id??r.topic_id),rowName(data,"staff_assignments",r.staff_assignment_id),showDate(r.target_on),showDate(r.completed_on),text(r.completion)+"%",text(r.status)]));
  if(type==="analysis")add("Saved analyses",["Generated","Scope","Findings"],list(data,"ai_analysis_results").filter(row=>inRange(row.created_at,filters.from,filters.to)).flatMap(row=>{
    const result=row.result as {findings?:{student_id?:string;summary?:string;recommendations?:string[]}[]}|undefined;
    return (result?.findings??[]).map(item=>[showDate(row.created_at),rowName(data,"students",item.student_id),[item.summary,...(item.recommendations??[])].join("\n")]);
  }));
  if(type==="communication")add("Campaigns",["Campaign","Created","Status","Scheduled"],list(data,"communication_campaigns").filter(row=>inRange(row.created_at,filters.from,filters.to)).map(row=>[text(row.title),showDate(row.created_at),text(row.status),showDate(row.next_run_at)]));
  if(type==="communication")add("Delivery outcomes",["Date","Channel","Status","Attempts"],list(data,"communication_delivery_logs").filter(row=>inRange(row.occurrence,filters.from,filters.to)).map(row=>[showDate(row.occurrence),text(row.channel),text(row.status),text(row.attempts)]));
  const trendData=student?{...data,attendance_records:attendanceRows,assessment_scores:scoreRows,assignment_submissions:submissionRows}:data;
  return {institution:String(settings?.institution_name??list(data,"institutions")[0]?.name??"Study Case Manager"),title:template?String(template.name):(reportTypes[type]??"Academic")+" report",signature:template?.signature_label?String(template.signature_label):undefined,person:student?String(student.name):teacher?String(teacher.name):undefined,period:(filters.from??"Earliest record")+" to "+(filters.to??"Latest record"),generated:today,academicYear:String(academicYear),metrics,sections,trend:byPeriod(trendData,scopedFilters,today)};
}


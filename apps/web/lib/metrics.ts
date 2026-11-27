import { list, rowName, type Data, type Item } from "./catalog";
export const percent = (numerator: number, denominator: number) => denominator ? Math.round(numerator * 1000 / denominator) / 10 : null;
export const average = (values: number[]) => values.length ? Math.round(values.reduce((a,b)=>a+b,0)*10/values.length)/10 : null;
export const dateKey = (input = new Date(), timezone = "Asia/Kolkata") => {
  const parts = new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(input);
  return ["year","month","day"].map(key=>parts.find(part=>part.type===key)?.value).join("-");
};
export function academicDate(input: Date, timezone = "Asia/Kolkata", withWeekday = false) {
  const parts = new Intl.DateTimeFormat("en-GB",{timeZone:timezone,weekday:"long",day:"numeric",month:"long",year:"numeric"}).formatToParts(input);
  const pick = (key: string) => parts.find(part=>part.type===key)?.value ?? "";
  return (withWeekday ? pick("weekday")+", " : "")+pick("day")+" "+pick("month")+" "+pick("year");
}
export function academicDateTime(value: unknown, timezone = "Asia/Kolkata"){
  const input = new Date(String(value));
  if(Number.isNaN(+input)) return "?";
  const time = new Intl.DateTimeFormat("en-GB",{timeZone:timezone,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(input);
  return academicDate(input,timezone)+" ? "+time.find(p=>p.type==="hour")?.value+":"+time.find(p=>p.type==="minute")?.value;
}
export const relativeDate = (date: string, days: number) => {
  const value = new Date(date+"T12:00:00Z");
  value.setUTCDate(value.getUTCDate()+days);
  return value.toISOString().slice(0,10);
};
export const inRange = (date: unknown, from?: string, to?: string) => typeof date==="string" && (!from || date.slice(0,10)>=from) && (!to || date.slice(0,10)<=to);
export function attendance(records: Item[], settings?: Item) {
  const eligible = records.filter(r=>r.status!=="excused" || settings?.exclude_excused===false);
  const attended = eligible.filter(r=>r.status==="present" || (r.status==="late" && settings?.late_present!==false));
  return { eligible:eligible.length, attended:attended.length, missed:eligible.length-attended.length, rate:percent(attended.length,eligible.length) };
}
export function marks(data:Data, scores:Item[]) {
  const assessments = new Map(list(data,"assessments").map(a=>[a.id,a]));
  return scores.flatMap(score=>{
    const max=Number(assessments.get(String(score.assessment_id))?.max_marks);
    return score.status==="evaluated" && score.draft!==true && score.marks!=null && max>0 ? [Number(score.marks)*100/max] : [];
  });
}
export function syllabusProgress(data:Data, progress:Item[], teaching?:Item[]) {
  const weighting=list(data,"institution_settings")[0]?.syllabus_weighting==="minutes"?"estimated_minutes":"weight";
  const topics=new Map(list(data,"topics").map(topic=>[topic.id,topic]));
  const subtopics=Map.groupBy(list(data,"subtopics"),topic=>topic.topic_id);
  const chapters=Map.groupBy(list(data,"chapters"),chapter=>chapter.syllabus_id);
  const topicsByChapter=Map.groupBy([...topics.values()],topic=>topic.chapter_id);
  const batches=new Map(list(data,"batches").map(batch=>[batch.id,batch]));
  const groups=Map.groupBy(progress,row=>row.staff_assignment_id+":"+row.topic_id);
  const expected=new Map<string,string>();
  for(const assignment of teaching??[]) {
    const batch=batches.get(String(assignment.batch_id));
    for(const syllabus of list(data,"syllabi").filter(s=>s.class_id===batch?.class_id&&s.academic_year_id===batch?.academic_year_id&&s.subject_id===assignment.subject_id)) {
      for(const chapter of chapters.get(syllabus.id)??[]) {
        for(const topic of topicsByChapter.get(chapter.id)??[])expected.set(assignment.id+":"+topic.id,topic.id);
      }
    }
  }
  for(const [key,rows] of groups)expected.set(key,String(rows[0].topic_id));
  let sum=0,weights=0;
  for(const [key,topicId] of expected){
    const rows=groups.get(key)??[];
    const topic=topics.get(topicId);
    const weight=Number(topic?.[weighting]??1);
    const parent=rows.find(row=>!row.subtopic_id);
    const children=subtopics.get(topicId)??[];
    const childWeights=children.reduce((total,row)=>total+Number(row[weighting]??1),0);
    const weightedChildren=children.reduce((total,row)=>total+Number(row[weighting]??1)*Number(rows.find(r=>r.subtopic_id===row.id)?.completion??0),0);
    const completion=parent?Number(parent.completion):childWeights?weightedChildren/childWeights:average(rows.map(row=>Number(row.completion)))??0;
    sum+=completion*weight;
    weights+=weight;
  }
  return percent(sum,weights*100);
}
export function workCompletion(data:Data, scoped:ReturnType<typeof scope>, today:string){
  const teaching=new Map(scoped.assignments.map(a=>[a.id,a]));
  const enrollments=Map.groupBy(list(data,"student_enrollments"),row=>row.batch_id);
  const submissions=new Map(scoped.submissions.map(r=>[r.assignment_id+":"+r.student_id,r]));
  const scores=new Map(scoped.scores.map(r=>[r.assessment_id+":"+r.student_id,r]));
  function eligible(work:Item,day:unknown){
    return new Set((enrollments.get(teaching.get(String(work.staff_assignment_id))?.batch_id)??[]).filter(row=>
      String(row.starts_on)<=String(day) && (!row.ends_on||String(row.ends_on)>=String(day))).map(r=>r.student_id));
  }
  let expected=0, handedIn=0, overdue=0, awaitingReview=0, pendingMarks=0;
  for(const work of scoped.work) {
    for(const student of eligible(work,work.assigned_on)){
      const current=submissions.get(work.id+":"+student);
      if(current?.status==="excused")continue;
      expected++;
      const submitted=["submitted","late","under_review","evaluated"].includes(String(current?.status));
      if(submitted)handedIn++;
      if(!submitted&&String(work.due_on)<today)overdue++;
      if(current?.status==="under_review"||current?.status==="submitted"||current?.status==="late")awaitingReview++;
    }
  }
  for(const assessment of scoped.assessments.filter(a=>String(a.assessment_on)<=today)){
    const roster=eligible(assessment,assessment.assessment_on);
    if([...roster].some(student=>{const score=scores.get(assessment.id+":"+student);return !score||score.draft===true||score.status==="not_evaluated";}))pendingMarks++;
  }
  return {expected,handedIn,overdue,awaitingReview,pendingMarks,rate:percent(handedIn,expected)};
}
export type Filters = {classId?:string;batchId?:string;subjectId?:string;staffId?:string;from?:string;to?:string};
export function scope(data:Data, filters:Filters) {
  const batches = list(data,"batches").filter(r=>(!filters.classId || r.class_id===filters.classId) && (!filters.batchId || r.id===filters.batchId));
  const batchIds = new Set(batches.map(r=>r.id));
  const assignments = list(data,"staff_assignments").filter(r=>batchIds.has(String(r.batch_id)) && (!filters.subjectId || r.subject_id===filters.subjectId) && (!filters.staffId || r.staff_id===filters.staffId));
  const ids = new Set(assignments.map(r=>r.id));
  const hasTeachingFilter=Boolean(filters.subjectId || filters.staffId);
  const assignedBatchIds = new Set(assignments.map(r=>r.batch_id));
  const students = list(data,"students").filter(r=>batchIds.has(String(r.batch_id)) && (!hasTeachingFilter || assignedBatchIds.has(r.batch_id)));
  const scheduled = list(data,"timetable_entries").filter(r=>ids.has(String(r.staff_assignment_id)) && inRange(r.starts_at,filters.from,filters.to));
  const sessions = list(data,"class_sessions").filter(r=>r.status==="completed" && ids.has(String(r.staff_assignment_id)) && inRange(r.date,filters.from,filters.to));
  const sessionIds = new Set(sessions.map(r=>r.id));
  const records = list(data,"attendance_records").filter(r=>sessionIds.has(String(r.session_id)));
  const assessments = list(data,"assessments").filter(r=>ids.has(String(r.staff_assignment_id)) && inRange(r.assessment_on,filters.from,filters.to));
  const assessmentIds = new Set(assessments.map(r=>r.id));
  const scores = list(data,"assessment_scores").filter(r=>assessmentIds.has(String(r.assessment_id)));
  const work = list(data,"assignments").filter(r=>ids.has(String(r.staff_assignment_id)) && inRange(r.assigned_on,filters.from,filters.to));
  const workIds = new Set(work.map(r=>r.id));
  const submissions = list(data,"assignment_submissions").filter(r=>workIds.has(String(r.assignment_id)));
  const progress = list(data,"topic_progress").filter(r=>ids.has(String(r.staff_assignment_id)));
  return {batches,assignments,students,scheduled,sessions,records,assessments,scores,work,submissions,progress};
}
export function byPeriod(data:Data, filters:Filters, today:string, count=7) {
  return Array.from({length:count},(_,index)=>{
    const to=relativeDate(filters.to ?? today,-7*(count-index-1));
    const from=relativeDate(to,-6);
    const values=scope(data,{...filters,from:filters.from && filters.from>from?filters.from:from,to});
    return {
      date: new Date(to+"T12:00:00Z").toLocaleDateString("en-GB",{day:"numeric",month:"short",timeZone:"UTC"}),
      Attendance:attendance(values.records,list(data,"institution_settings")[0]).rate,
      Assessment:average(marks(data,values.scores)),
      Submissions:workCompletion(data,values,to).rate,
    };
  });
}
export function support(data:Data, scoped:ReturnType<typeof scope>) {
  const settings=list(data,"institution_settings")[0];
  const attendanceByStudent=Map.groupBy(scoped.records,row=>row.student_id);
  const scoresByStudent=Map.groupBy(scoped.scores,row=>row.student_id);
  return scoped.students.flatMap(student=>{
    const rate=attendance(attendanceByStudent.get(student.id)??[],settings).rate;
    const score=average(marks(data,scoresByStudent.get(student.id)??[]));
    const issues=[
      rate!==null && rate<Number(settings?.attendance_threshold??75) ? "Attendance" : "",
      score!==null && score<Number(settings?.assessment_threshold??50) ? "Assessment" : "",
    ].filter(Boolean);
    return issues.length?[{student,rate,score,issues}]:[];
  });
}
export function subjectBreakdown(data:Data, scoped:ReturnType<typeof scope>) {
  return list(data,"subjects").map(subject=>{
    const assignments=scoped.assignments.filter(r=>r.subject_id===subject.id);
    const ids=new Set(assignments.map(r=>r.id));
    const assessments=new Set(scoped.assessments.filter(r=>ids.has(String(r.staff_assignment_id))).map(r=>r.id));
    return { name:rowName(data,"subjects",subject.id), "Average score":average(marks(data,scoped.scores.filter(r=>assessments.has(String(r.assessment_id))))), "Syllabus":syllabusProgress(data,scoped.progress.filter(r=>ids.has(String(r.staff_assignment_id))),assignments) };
  }).filter(row=>row["Average score"]!==null || row.Syllabus!==null);
}


import "server-only";
import { actor } from "./supabase";
import { modules, list, type Data, type Item } from "./catalog";
type DataOptions={limit?:number;from?:string;to?:string;studentId?:string};
const periodKeys:Record<string,{field:string;parent?:string;timestamp?:boolean}>={
  class_sessions:{field:"date"},timetable_entries:{field:"starts_at",timestamp:true},assessments:{field:"assessment_on"},
  assignments:{field:"assigned_on"},calendar_events:{field:"starts_at",timestamp:true},attendance_records:{parent:"class_sessions",field:"date"},
  student_observations:{parent:"class_sessions",field:"date"},session_topics:{parent:"class_sessions",field:"date"},session_subtopics:{parent:"class_sessions",field:"date"},
  assessment_scores:{parent:"assessments",field:"assessment_on"},assignment_submissions:{parent:"assignments",field:"assigned_on"},
  communication_campaigns:{field:"created_at",timestamp:true},communication_delivery_logs:{field:"occurrence",timestamp:true},
  ai_analysis_results:{field:"created_at",timestamp:true},
};
const studentTables=new Set(["student_enrollments","attendance_records","student_observations","assessment_scores","assignment_submissions","academic_interventions"]);
const base=["institutions","institution_settings","classes","batches","subjects","academic_years","staff","staff_assignments","role_permissions"];
const records=["students","student_enrollments","timetable_entries","class_sessions","attendance_records","student_observations","session_topics","session_subtopics","assignments","assignment_submissions","assessments","assessment_scores","syllabi","chapters","topics","subtopics","topic_progress","syllabus_targets","calendar_events","notifications"];
const usages:Record<string,string[]>={
  students:["students","student_enrollments"],staff:["staff"],"class-sessions":["students","student_enrollments","timetable_entries","class_sessions","attendance_records","student_observations","session_topics","session_subtopics","syllabi","chapters","topics","subtopics"],
  attendance:["students","student_enrollments","timetable_entries","class_sessions","attendance_records","student_observations","session_topics","session_subtopics","syllabi","chapters","topics","subtopics"],
  "student-observations":["students","class_sessions","student_observations"],
  syllabus:["syllabi","chapters","topics","subtopics","topic_progress","syllabus_targets"],
  assignments:["assignments","assignment_submissions","student_enrollments","students","assignment_topics","syllabi","chapters","topics"],
  assessments:["assessments","assessment_scores","assessment_topics","assessment_questions","assessment_question_scores","student_enrollments","students","syllabi","chapters","topics"],
  marks:["assessments","assessment_scores","assessment_questions","assessment_question_scores","student_enrollments","students"],
  timetable:["timetable_entries","calendar_events","assignments","assessments","topic_progress","topics","syllabus_targets"],
  calendar:["timetable_entries","calendar_events","assignments","assessments","topic_progress","topics","syllabus_targets"],
  "ai/student-performance":["students","ai_analysis_results"],"ai/communication":["students","communication_campaigns","communication_recipients","communication_delivery_logs"],
  "ai/interventions":["students","academic_interventions"],ai:["students","ai_analysis_results"],"ai/assistant":["students","ai_analysis_results"],reporting:["generated_reports","report_templates","students","staff"],chapters:["syllabi","chapters"],topics:["chapters","topics"],subtopics:["topics","subtopics"],
};
export async function loadData(route:string, options:DataOptions={}):Promise<Data> {
  const user=await actor();
  if(!user) return {};
  const [root,segment,personId]=route.split("/");
  const limit=options.limit??5000;
  const studentId=options.studentId??(root==="students"&&/^[a-f0-9-]{36}$/i.test(segment??"")?segment:root==="reports"&&segment==="students"?personId:undefined);
  const everything = ["dashboard","reporting","reports","analytics","student-performance"].includes(root) || /^students\/[^/]+$/.test(route) || /^staff\/[^/]+$/.test(route);
  const tables=new Set([...base,...(everything?records:usages[route]??usages[root]??[]),...(root==="reports"?["generated_reports","ai_analysis_results","academic_interventions","communication_campaigns","communication_delivery_logs","report_templates","assessment_questions","assessment_question_scores"]:[]),...(root==="dashboard"&&user.role==="admin"?["communication_campaigns","ai_analysis_results"]:[])]);
  const exact=modules[route]??modules[root];
  if(exact) tables.add(exact.table);
  const limited:string[]=[];
  const result=await Promise.all([...tables].map(async table=>{
    const rows:Item[]=[];
    const privateProfile = user.role==="admin" && table==="students" && (root==="students");
    const columns=table==="students" ? "id,name,batch_id,admission_number,stream,academic_status,active,created_at" : "*";
    const recent=table==="ai_analysis_results"&&root==="dashboard"?1:table==="communication_campaigns"&&root==="dashboard"?8:null;
    const cap=recent??limit;
    const batchSize=Math.min(cap,500);
    for(let start=0;start<=cap;start+=batchSize){
      if(recent&&start>=cap)break;
      const requested=Math.min(batchSize,cap+1-start);
      const range=periodKeys[table];
      const join=studentId&&table==="assessment_question_scores"?",assessment_scores!inner(student_id)":
        range?.parent&&(options.from||options.to)?","+range.parent+"!inner("+range.field+")":"";
      let query=user.client.from(table).select(columns+join).order("created_at",{ascending:false}).order("id");
      if(studentId&&studentTables.has(table))query=query.eq("student_id",studentId);
      if(studentId&&table==="students")query=query.eq("id",studentId);
      if(studentId&&table==="assessment_question_scores")query=query.eq("assessment_scores.student_id",studentId);
      if(range){
        const key=(range.parent?range.parent+".":"")+range.field;
        if(options.from)query=query.gte(key,options.from+(range.timestamp?"T00:00:00+00:00":""));
        if(options.to)query=query.lte(key,options.to+(range.timestamp?"T23:59:59.999+00:00":""));
      }
      const {data,error}=privateProfile
        ? await user.client.rpc("read_student_profiles",{p_offset:start,p_limit:requested,p_id:studentId??null})
        : await query.range(start,start+requested-1);
      if(error) throw new Error("Academic records could not be loaded.");
      rows.push(...((data??[]) as unknown as Item[]));
      if(!Array.isArray(data)||data.length<requested)break;
    }
    if(rows.length>cap)limited.push(table);
    if(rows.length>cap)rows.length=cap;
    return [table,rows] as const;
  }));
  const data=Object.fromEntries(result);
  data.dataset_limits=limited.sort().map(id=>({id}));
  if(user.role==="staff"){
    data.staff=list(data,"staff").filter(row=>row.id===user.staff_id);
  }
  return data;
}


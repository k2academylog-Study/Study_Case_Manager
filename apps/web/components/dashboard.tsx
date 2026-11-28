"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Activity, BookOpen, CalendarClock, CalendarDays, ChartNoAxesCombined, ClipboardCheck, ClipboardList, FileCheck2, GraduationCap, Layers, Plus, Sparkles, UsersRound, type LucideIcon } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { list, rowName, type Data, type Role } from "@/lib/catalog";
import { academicDate, academicDateTime, attendance, average, byPeriod, dateKey, inRange, marks, relativeDate, scope, subjectBreakdown, support, syllabusProgress, workCompletion, type Filters } from "@/lib/metrics";
import { Empty, Initials, PageHeading, Status } from "./ui";

const pct=(value:number|null)=>value===null?"—":value+"%";
function Stat({title,value,note,icon:Icon,tone,link}:{title:string;value:string|number;note:string;icon:LucideIcon;tone:string;link:string}){
 return <Link className="stat-card" href={link}><span className={"feature-icon "+tone}><Icon size={21}/></span><span className="stat-label">{title}</span><strong>{value}</strong><span className="stat-note">{note}</span></Link>;
}
export function FilterBar({data,filters,setFilters,dates=true}:{data:Data;filters:Filters;setFilters:(filter:Filters)=>void;dates?:boolean}){
  function select(key:keyof Filters,text:string,table:string){
    const rows=list(data,table).filter(r=>key!=="batchId"||!filters.classId||r.class_id===filters.classId);
    return <select aria-label={text} value={filters[key]??""} onChange={event=>setFilters({...filters,[key]:event.target.value||undefined,...(key==="classId"?{batchId:undefined}:{})})}><option value="">{text}</option>{rows.map(r=><option key={r.id} value={r.id}>{rowName(data,table,r.id)}</option>)}</select>;
  }
  return <div className="filter-bar" aria-label="Academic filters">{select("classId","All classes","classes")}{select("batchId","All batches","batches")}{select("subjectId","All subjects","subjects")}{list(data,"staff").length>1&&select("staffId","All staff","staff")}{dates&&<><label>From <input aria-label="From date" type="date" value={filters.from??""} max={filters.to} onChange={e=>setFilters({...filters,from:e.target.value||undefined})}/></label><label>To <input aria-label="To date" type="date" value={filters.to??""} min={filters.from} onChange={e=>setFilters({...filters,to:e.target.value||undefined})}/></label></>}{Object.values(filters).some(Boolean)&&<button className="button button-ghost" onClick={()=>setFilters({})}>Clear</button>}</div>;
}
function Trend({data,filters,today,metric="Attendance"}:{data:Data;filters:Filters;today:string;metric:"Attendance"|"Assessment"|"Submissions"}){
  const values=useMemo(()=>byPeriod(data,filters,today),[data,filters,today]);
  return <div className="chart-wrap">{values.some(row=>row[metric]!==null)?<ResponsiveContainer width="100%" height={235} minWidth={0}><AreaChart data={values} margin={{left:-19,right:10,top:12,bottom:0}}>
    <defs><linearGradient id={"trend-"+metric} x1="0" x2="0" y1="0" y2="1"><stop offset="5%" stopColor="#8b55f3" stopOpacity={0.27}/><stop offset="98%" stopColor="#8b55f3" stopOpacity={0.02}/></linearGradient></defs>
    <CartesianGrid stroke="#edf0f5" vertical={false} strokeDasharray="4 4"/><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill:"#657084",fontSize:12}} tickMargin={11}/><YAxis axisLine={false} tickLine={false} tick={{fill:"#657084",fontSize:12}} tickFormatter={value=>value+"%"} domain={[0,100]} tickCount={5}/><Tooltip formatter={value=>[String(value)+"%",metric]}/><Area type="monotone" dataKey={metric} stroke="#7c3aed" fill={"url(#trend-"+metric+")"} strokeWidth={2.75} dot={{r:3,fill:"#fff",strokeWidth:2}} animationDuration={450}/></AreaChart></ResponsiveContainer>:<Empty title="No trend data" text="Trend points appear as academic records are submitted."/>}</div>;
}

function assessmentBadge(type: unknown) {
  const t = String(type ?? "other");
  const badges: Record<string, { label: string; bg: string; color: string; border: string }> = {
    weekly_test: { label: "Weekly Test", bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
    unit_test: { label: "Unit Test", bg: "#f5f3ff", color: "#6d28d9", border: "#ddd6fe" },
    quiz: { label: "Quiz", bg: "#fffbeb", color: "#b45309", border: "#fde68a" },
    monthly_test: { label: "Monthly Test", bg: "#ecfdf5", color: "#047857", border: "#a7f3d0" },
    revision_test: { label: "Revision Test", bg: "#eef2ff", color: "#4338ca", border: "#c7d2fe" },
    model_examination: { label: "Model Exam", bg: "#fff1f2", color: "#be123c", border: "#fecdd3" },
    term_examination: { label: "Term Exam", bg: "#fdf2f8", color: "#be185d", border: "#fbcfe8" },
    assignment_assessment: { label: "Assignment Assessment", bg: "#f0f9ff", color: "#0369a1", border: "#bae6fd" }
  };
  const b = badges[t] ?? { label: t.replaceAll("_", " "), bg: "#f8fafc", color: "#475569", border: "#e2e8f0" };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 10px",
        borderRadius: "999px",
        fontSize: "0.74rem",
        fontWeight: 750,
        background: b.bg,
        color: b.color,
        border: `1px solid ${b.border}`,
        whiteSpace: "nowrap"
      }}
    >
      {b.label}
    </span>
  );
}
export function Dashboard({data,role,base,name,demo,analytics}:{data:Data;role:Role;base:string;name:string;demo:boolean;analytics?:string}){
  const [filters,setFilters]=useState<Filters>({});
  const [showFilters,setShowFilters]=useState(Boolean(analytics));
  const [metric,setMetric]=useState<"Attendance"|"Assessment"|"Submissions">("Attendance");
  const [activeStaffFilter,setActiveStaffFilter]=useState("");
  const today=dateKey(new Date(),String(list(data,"institution_settings")[0]?.timezone??"Asia/Kolkata"));
  const settings=list(data,"institution_settings")[0];
  const scoped=useMemo(()=>scope(data,filters),[data,filters]);
  const allStaffAssignments=list(data,"staff_assignments");
  const assignmentMap=useMemo(()=>new Map(allStaffAssignments.map(a=>[a.id,a])),[allStaffAssignments]);
  const staffMap=useMemo(()=>new Map(list(data,"staff").map(s=>[s.id,s])),[data]);
  const allScores=list(data,"assessment_scores");
  const staffAssessments=useMemo(()=>{
    return scoped.assessments
      .filter(a=>{
        if(!activeStaffFilter)return true;
        const asgn=assignmentMap.get(String(a.staff_assignment_id));
        return asgn?.staff_id===activeStaffFilter;
      })
      .slice()
      .sort((a,b)=>String(b.assessment_on).localeCompare(String(a.assessment_on)));
  },[scoped.assessments,activeStaffFilter,assignmentMap]);
  const totalAttendance=attendance(scoped.records,settings).rate;
  const latest=scope(data,{...filters,from:today,to:today});
  const work=workCompletion(data,scoped,today);
  const needsSupport=support(data,scoped);
  const bySubject=subjectBreakdown(data,scoped);
  const targetRows=list(data,"syllabus_targets");
  const planned=average(scoped.assignments.flatMap(assignment=>{
    const latest=targetRows.filter(row=>row.staff_assignment_id===assignment.id&&String(row.target_on)<=(filters.to??today)).sort((a,b)=>String(b.target_on).localeCompare(String(a.target_on)))[0];
    return latest?[Number(latest.target_completion)]:[];
  }));
  const latestAnalysis=list(data,"ai_analysis_results")[0];
  const summaries=(latestAnalysis?.result as {findings?:{summary:string}[]}|undefined)?.findings??[];
  const classes=list(data,"classes").filter(row=>!filters.classId||row.id===filters.classId);
  const [cohort,setCohort]=useState<"class"|"batch">("class");
  const cohortMetrics=(cohort==="class"?classes:scoped.batches).map(row=>{
    const subset=scope(data,{...filters,[cohort==="class"?"classId":"batchId"]:row.id});
    return {name:cohort==="class"?String(row.name):rowName(data,"batches",row.id),average:average(marks(data,subset.scores))};
  }).filter(row=>row.average!==null).slice(0,16);
  const tabs=[{name:"Attendance",icon:ClipboardCheck,href:"attendance"},{name:"Class session",icon:ClipboardList,href:"class-sessions"},{name:"Syllabus",icon:BookOpen,href:"syllabus"},{name:"New assignment",icon:Plus,href:"assignments?create=1"},{name:"New assessment",icon:FileCheck2,href:"assessments?create=1"},{name:"Upload marks",icon:Activity,href:"marks"},{name:"Timetable",icon:CalendarDays,href:"timetable"},{name:"Ask AI assistant",icon:Sparkles,href:"ai/assistant"}];
  const activeSession=latest.scheduled.filter(row=>row.status!=="cancelled");
  const pastWithoutSession=scoped.scheduled.filter(row=>row.status!=="cancelled" && String(row.starts_at).slice(0,10)<=today && !scoped.sessions.some(s=>s.timetable_id===row.id));
  const events=[...list(data,"calendar_events"),...scoped.scheduled.filter(row=>row.status!=="cancelled").map(row=>({...row,event_type:"class",starts_at:row.starts_at,title:row.title}))].filter(row=>inRange(row.starts_at,today,relativeDate(today,60))).sort((a,b)=>String(a.starts_at).localeCompare(String(b.starts_at))).slice(0,5);
  const delayed=scoped.progress.filter(row=>row.target_on && String(row.target_on)<today && Number(row.completion)<100);
  const staffCount=filters.batchId||filters.classId||filters.subjectId||filters.staffId ? new Set(scoped.assignments.map(a=>a.staff_id)).size : list(data,"staff").filter(s=>s.active!==false).length;
  const title=analytics?({"students":"Student analytics","staff":"Staff analytics","academic":"Academic analytics"}[analytics]??"Academic analytics"):"Dashboard";
  const firstName=name.split(" ")[0];
  const reportHref=base+"/reports";
  const firstChart=analytics==="staff"?"Teaching activity":metric==="Attendance"?"Attendance overview":metric==="Assessment"?"Assessment trends":"Assignment submissions";
  return <div className="dashboard">
    <PageHeading title={title} detail={analytics?"Review performance and academic operations across your institution.":"Here’s what’s happening across your academic workspace today."}>
      <button className="button button-secondary" onClick={()=>setShowFilters(!showFilters)}><Layers size={16}/> Filters</button>
      <Link className="button button-primary" href={role==="admin"?reportHref:base+"/class-sessions?create=1"}>{role==="admin"?<FileCheck2 size={17}/>:<Plus size={17}/>} {role==="admin"?"View reports":"Record session"}</Link>
    </PageHeading>
    {showFilters&&<FilterBar data={data} filters={filters} setFilters={setFilters}/>}
    {!analytics&&<section className="dashboard-banner">
      <div className="dashboard-banner-content"><span><CalendarDays size={15}/>{academicDate(new Date(today+"T12:00:00Z"),"UTC",true)}</span><h2>Welcome, {firstName}.</h2><p>{role==="admin"?"Track academic activity and see where your team can offer support.":"Review your classes, teaching progress, and pending academic work."}</p><Link href={base+"/calendar"} className="button">View academic calendar</Link></div>
      <div className="banner-art" aria-hidden="true"><div className="banner-ring ring-one"/><div className="banner-ring ring-two"/><div className="banner-ring ring-three"/><div className="art-tile art-tile-main"><GraduationCap size={57} strokeWidth={1.5}/></div><div className="art-tile art-tile-first"><ChartNoAxesCombined size={25}/></div><div className="art-tile art-tile-second"><BookOpen size={23}/></div><span className="art-spark"><Sparkles size={21}/></span></div>
    </section>}
    <div className="stats-grid">
      <Stat title={role==="admin"?"Total students":"Assigned students"} value={scoped.students.filter(r=>r.active!==false).length} note={new Set(scoped.batches.map(row=>row.class_id)).size+" classes ? "+scoped.batches.length+" batches"} icon={GraduationCap} tone="purple" link={base+(role==="admin"?"/students":"/student-performance")}/>
      <Stat title={role==="admin"?"Teaching staff":"Scheduled classes"} value={role==="admin"?staffCount:activeSession.length} note={role==="admin"?"Active staff members":latest.sessions.length+" completed today"} icon={UsersRound} tone="blue" link={base+(role==="admin"?"/staff":"/my-classes")}/>
      <Stat title="Overall attendance" value={pct(totalAttendance)} note={scoped.records.length+" attendance entries"} icon={ClipboardCheck} tone="green" link={base+"/attendance"}/>
      <Stat title="Syllabus completion" value={pct(syllabusProgress(data,scoped.progress,scoped.assignments))} note={delayed.length+" topics past target"} icon={BookOpen} tone="amber" link={base+"/syllabus"}/>
    </div>
    {role==="staff"&&<div className="quick-grid">{tabs.map(({name,icon:Icon,href})=><Link href={base+"/"+href} key={href}><Icon size={19}/><span>{name}</span></Link>)}</div>}
    <div className="dashboard-grid">
      <section className="panel dashboard-panel"><div className="panel-head"><div><h2>{firstChart}</h2><p>{analytics==="staff"?"Completed teaching hours by staff member":"Weekly trends for the selected academic scope"}</p></div>{analytics!=="staff"&&<select aria-label="Trend metric" value={metric} onChange={e=>setMetric(e.target.value as typeof metric)}><option>Attendance</option><option>Assessment</option><option>Submissions</option></select>}</div>
        {analytics==="staff"? <div className="chart-wrap"><ResponsiveContainer width="100%" height={235} minWidth={0}><BarChart data={list(data,"staff").map(s=>({name:String(s.name).split(" ")[0],hours:Math.round(scoped.sessions.filter(c=>scoped.assignments.some(a=>a.id===c.staff_assignment_id&&a.staff_id===s.id)).reduce((sum,c)=>sum+Number(c.duration_minutes),0)/6)/10}))}><CartesianGrid stroke="#edf0f5" vertical={false}/><XAxis dataKey="name" tick={{fontSize:12}}/><YAxis/><Tooltip/><Bar dataKey="hours" fill="#7c3aed" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></div>:<Trend data={data} filters={filters} today={today} metric={metric}/>}
      </section>
      <section className="panel dashboard-panel"><div className="panel-head"><div><h2>{analytics?"Academic snapshot":"Today at a glance"}</h2><p>{analytics?"Progress in the selected scope":"Classes and work that need your attention"}</p></div><span className="feature-icon purple"><CalendarClock size={19}/></span></div>
        <div className="snapshot">{[
          ["Scheduled classes",activeSession.length,CalendarDays,"purple","calendar"],["Completed sessions",latest.sessions.length,ClipboardCheck,"green","class-sessions"],["Pending session records",pastWithoutSession.length,ClipboardList,"amber","class-sessions"],["Overdue assignments",work.overdue,BookOpen,"blue","assignments"],["Assessment average",pct(average(marks(data,scoped.scores))),Activity,"purple",role==="admin"?"#staff-assessments":"assessments"],
          ...(role==="staff"?[["Pending assignment reviews",work.awaitingReview,ClipboardList,"blue","assignments"],["Pending marks uploads",work.pendingMarks,FileCheck2,"amber","marks"]]:[]),
        ].map(([text,value,icon,tone,url])=>{const Icon=icon as LucideIcon;return <Link href={base+"/"+url} key={String(text)}><span className={"small-icon "+tone}><Icon size={16}/></span><span>{String(text)}</span><strong>{String(value)}</strong></Link>;})}</div>
      </section>
    </div>
    {(role !== "admin" || Boolean(analytics)) && (
      <>
        <div className="dashboard-grid">
          <section className="panel dashboard-panel"><div className="panel-head"><div><h2>Subject performance</h2><p>Average finalized score and weighted syllabus progress</p></div></div>{bySubject.length?<div className="subject-rows">{bySubject.slice(0,8).map(row=><div key={row.name}><span>{row.name}</span><span className="progress-track"><i style={{width:(row["Average score"]??0)+"%"}}/></span><strong>{pct(row["Average score"])}</strong><small>{pct(row.Syllabus)} syllabus</small></div>)}</div>:<Empty/>}</section>
          <section className="panel dashboard-panel"><div className="panel-head"><div><h2>Upcoming events</h2><p>Classes, deadlines, and institutional dates</p></div><Link className="text-link" href={base+"/calendar"}>Calendar</Link></div>{events.length?<div className="event-rows">{events.map(row=><div key={row.id}><span className="small-icon purple"><CalendarDays size={17}/></span><div><strong>{String(row.title)}</strong><small>{academicDateTime(row.starts_at,String(settings?.timezone??"Asia/Kolkata"))}</small></div><Status value={row.event_type}/></div>)}</div>:<Empty title="No upcoming events"/>}</section>
        </div>
        <div className="dashboard-grid"><section className="panel dashboard-panel">
          <div className="panel-head"><div><h2>{role==="admin"?"Performance by cohort":"Teaching progress against target"}</h2><p>{role==="admin"?"Average finalized assessment results":"Weighted topic completion across assigned classes"}</p></div>{role==="admin"&&<select aria-label="Performance grouping" value={cohort} onChange={e=>setCohort(e.target.value as typeof cohort)}><option value="class">Class</option><option value="batch">Batch</option></select>}</div>
          {role==="admin"?cohortMetrics.length?<div className="chart-wrap"><ResponsiveContainer width="100%" height={221} minWidth={0}><BarChart data={cohortMetrics}><CartesianGrid vertical={false} stroke="#edf0f5"/><XAxis dataKey="name" tick={{fontSize:11}}/><YAxis domain={[0,100]} tick={{fontSize:11}} tickFormatter={value=>value+"%"}/><Tooltip formatter={value=>[String(value)+"%","Average score"]}/><Bar dataKey="average" fill="#8b55eb" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></div>:<Empty title="No assessment results"/>:<div className="report-kpis"><div><span>Actual completion</span><strong>{pct(syllabusProgress(data,scoped.progress,scoped.assignments))}</strong></div><div><span>Planned completion</span><strong>{pct(planned)}</strong></div><div><span>Past target</span><strong>{delayed.length}</strong></div></div>}
        </section>
        <section className="panel dashboard-panel"><div className="panel-head"><div><h2>{role==="admin"?"Recent academic activity":"Syllabus deadlines"}</h2><p>{role==="admin"?"Submitted teaching records and notices":"Upcoming targets in your syllabus"}</p></div></div>
        <div className="event-rows">{role==="admin"?scoped.sessions.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,4).map(row=><div key={row.id}><span className="small-icon purple"><ClipboardCheck size={17}/></span><div><strong>{rowName(data,"staff_assignments",row.staff_assignment_id)}</strong><small>Completed session ? {String(row.date)}</small></div></div>):scoped.progress.filter(row=>row.target_on&&String(row.target_on)>=today&&Number(row.completion)<100).sort((a,b)=>String(a.target_on).localeCompare(String(b.target_on))).slice(0,4).map(row=><div key={row.id}><span className="small-icon amber"><BookOpen size={17}/></span><div><strong>{rowName(data,"topics",row.topic_id)}</strong><small>Target {String(row.target_on)}</small></div></div>)}</div>
        {list(data,"notifications").slice(0,1).map(row=><Link key={row.id} className="text-link" href={base+"/notifications"}>{String(row.title)}</Link>)}
        </section></div>
      </>
    )}
    {role==="admin"&&<section className="panel dashboard-panel support-panel"><div className="panel-head"><div><h2>Students who may benefit from support</h2><p>Based on the institution’s attendance and assessment thresholds.</p></div><Link className="button button-secondary" href={base+"/ai/student-performance"}><Sparkles size={16}/> Performance analysis</Link></div>{needsSupport.length?<div className="table-scroll"><table><thead><tr><th>Student</th><th>Attendance</th><th>Assessment</th><th>Review area</th></tr></thead><tbody>{needsSupport.slice(0,8).map(({student,rate,score,issues})=><tr key={student.id}><td><Link href={base+"/students/"+student.id} className="person-cell"><Initials name={String(student.name)}/>{String(student.name)}</Link></td><td>{pct(rate)}</td><td>{pct(score)}</td><td>{issues.join(" and ")}</td></tr>)}</tbody></table></div>:<Empty title="No threshold alerts"/>}</section>}
    {role==="admin"&&(
      <section id="staff-assessments" className="panel dashboard-panel" style={{marginTop:16}}>
        <div className="panel-head" style={{alignItems:"center"}}>
          <div>
            <h2>Daily staff assessment activity</h2>
            <p>Assessments conducted by teaching staff, showing assessment types, subjects, and student evaluations</p>
          </div>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <select
              aria-label="Filter activity by staff"
              value={activeStaffFilter}
              onChange={e=>setActiveStaffFilter(e.target.value)}
              style={{fontSize:"0.82rem",padding:"6px 28px 6px 12px"}}
            >
              <option value="">All teaching staff</option>
              {list(data,"staff")
                .filter(s=>s.active!==false)
                .map(s=>(
                  <option key={s.id} value={s.id}>
                    {String(s.name)}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {staffAssessments.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Staff member</th>
                  <th>Date</th>
                  <th>Assessment type</th>
                  <th>Title</th>
                  <th>Subject & Batch</th>
                  <th>Max / Pass marks</th>
                  <th>Evaluation status</th>
                </tr>
              </thead>
              <tbody>
                {staffAssessments.slice(0,15).map(a=>{
                  const asgn=assignmentMap.get(String(a.staff_assignment_id));
                  const teacher=asgn?staffMap.get(String(asgn.staff_id)):undefined;
                  const scores=allScores.filter(s=>s.assessment_id===a.id);
                  const evaluated=scores.filter(s=>s.status==="evaluated"&&s.draft!==true);
                  const avg=evaluated.length>0?Math.round(evaluated.reduce((sum,s)=>sum+Number(s.marks??0),0)/evaluated.length*10)/10:null;

                  return (
                    <tr key={a.id}>
                      <td>
                        {teacher ? (
                          <Link href={base+"/staff/"+teacher.id} className="person-cell">
                            <Initials name={String(teacher.name)}/>
                            <strong>{String(teacher.name)}</strong>
                          </Link>
                        ) : (
                          <span className="person-cell">
                            <Initials name="Staff"/>
                            <strong>Assigned staff</strong>
                          </span>
                        )}
                      </td>
                      <td style={{whiteSpace:"nowrap",fontSize:"0.82rem"}}>
                        {String(a.assessment_on)}
                      </td>
                      <td>{assessmentBadge(a.assessment_type)}</td>
                      <td>
                        <strong>{String(a.title)}</strong>
                      </td>
                      <td>
                        <span style={{fontSize:"0.84rem",color:"#334155"}}>
                          {rowName(data,"subjects",asgn?.subject_id)} · <small style={{color:"#64748b"}}>{rowName(data,"batches",asgn?.batch_id)}</small>
                        </span>
                      </td>
                      <td style={{fontSize:"0.82rem",whiteSpace:"nowrap"}}>
                        <strong>{String(a.max_marks)} marks</strong>
                        {a.pass_marks!=null&&<span style={{color:"#64748b"}}> (Pass: {String(a.pass_marks)})</span>}
                      </td>
                      <td>
                        {evaluated.length>0 ? (
                          <span style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:"0.82rem",color:"#047857",fontWeight:650}}>
                            <span style={{width:7,height:7,borderRadius:"50%",background:"#10b981"}}/>
                            {evaluated.length} evaluated {avg!==null?`(${avg} avg)`:""}
                          </span>
                        ) : (
                          <span style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:"0.82rem",color:"#b45309",fontWeight:600}}>
                            <span style={{width:7,height:7,borderRadius:"50%",background:"#f59e0b"}}/>
                            Scheduled / Awaiting marks
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No staff assessments recorded" text="When teaching staff plan or record assessments, they will appear here as daily activity."/>
        )}
      </section>
    )}
    {role==="admin"&&<div className="dashboard-grid" style={{marginTop:14}}><section className="panel dashboard-panel"><div className="panel-head"><div><h2>Planned and actual syllabus</h2><p>Scheduled targets as of {filters.to??today}</p></div></div><div className="report-kpis"><div><span>Weighted actual</span><strong>{pct(syllabusProgress(data,scoped.progress,scoped.assignments))}</strong></div><div><span>Planned target</span><strong>{pct(planned)}</strong></div><div><span>Topics past target</span><strong>{delayed.length}</strong></div></div>{summaries[0]&&<p><Sparkles size={14} style={{display:"inline",marginRight:6}}/>{summaries[0].summary}</p>}</section>
    <section className="panel dashboard-panel"><div className="panel-head"><div><h2>Institutional communications</h2><p>Recent campaigns and their current status</p></div><Link className="text-link" href={base+"/ai/communication"}>View campaigns</Link></div>{list(data,"communication_campaigns").length?<div className="event-rows">{list(data,"communication_campaigns").slice(0,4).map(row=><div key={row.id}><strong>{String(row.title)}</strong><Status value={row.status}/></div>)}</div>:<Empty title="No communications yet"/>}</section></div>}
    {demo&&<p className="demo-foot">Northview Academy is a fictional institution. All records in this workspace are demonstration data.</p>}
  </div>;
}

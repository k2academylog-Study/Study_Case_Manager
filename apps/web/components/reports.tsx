"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, FileText, Printer, Trash2 } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { list, modules, rowName, type Data, type Item } from "@/lib/catalog";
import { makeReport, reportTypes, type ReportFilters } from "@/lib/report";
import type { Filters } from "@/lib/metrics";
import { FilterBar } from "./dashboard";
import { Modal, RecordTable, recordValue, StaffInvite, type RunCommand } from "./records";
import { Empty, Initials, Notice, PageHeading } from "./ui";
import { RecordFile } from "./record-file";

export function ReportPage({data,base,demo,type="attendance",personId,embedded=false}:{data:Data;base:string;demo:boolean;type?:string;personId?:string;embedded?:boolean}){
  const [kind,setKind]=useState(type);
  const [person,setPerson]=useState(personId??"");
  const [filters,setFilters]=useState<Filters>({});
  const [template,setTemplate]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const people=kind==="student"?"students":kind==="staff"?"staff":null;
  const parameters:ReportFilters={...filters,type:kind,personId:person||undefined,templateId:template||undefined};
  const report=useMemo(()=>makeReport(data,parameters),[data,kind,person,filters,template]);
  const available=!people||Boolean(person);
  async function download(){
    setNotice("");setBusy(true);
    try{
      if(demo){
        const [{pdf},{AcademicPdf}]=await Promise.all([import("@react-pdf/renderer"),import("@/lib/pdf")]);
        const url=URL.createObjectURL(await pdf(<AcademicPdf report={report} demo/>).toBlob());
        const link=document.createElement("a");link.href=url;link.download="demo-academic-report.pdf";link.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
      }else{
        const res=await fetch("/api/reports",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(parameters)});
        const result=await res.json();
        if(!res.ok)throw new Error(result.error);
        const link=document.createElement("a");link.href=result.url;link.download="academic-report.pdf";link.click();
      }
    }catch(error){setNotice((error as Error).message);}finally{setBusy(false);}
  }
  return <div className="panel-stack">
    {!embedded&&<PageHeading title={personId?report.title:"Report centre"} detail="Preview academic records and generate a confidential PDF for review.">{personId&&<Link className="button button-secondary" href={base+"/reports"}>All reports</Link>}<button className="button button-secondary" disabled={!available} onClick={()=>window.print()}><Printer size={16}/> Print</button><button className="button button-primary" disabled={busy||!available} onClick={download}><Download size={16}/>{busy?"Generating…":"Download PDF"}</button></PageHeading>}
    <div className="row-field no-print">{!personId&&<><select aria-label="Report type" value={kind} onChange={e=>{setKind(e.target.value);setPerson("");setTemplate("");}}>{Object.entries(reportTypes).map(([value,title])=><option key={value} value={value}>{title}</option>)}</select>
    {people&&<select aria-label="Report subject" value={person} onChange={e=>setPerson(e.target.value)}><option value="">Select {kind==="staff"?"staff member":"student"}</option>{list(data,people).map(row=><option key={row.id} value={row.id}>{String(row.name)}</option>)}</select>}</>}</div>
    {!embedded&&list(data,"report_templates").some(row=>row.report_type===kind)&&<div className="row-field no-print"><select aria-label="Report template" value={template} onChange={e=>setTemplate(e.target.value)}><option value="">Default report template</option>{list(data,"report_templates").filter(row=>row.report_type===kind).map(row=><option key={row.id} value={row.id}>{String(row.name)}</option>)}</select></div>}
    <div className="no-print"><FilterBar data={data} filters={filters} setFilters={setFilters}/></div>
    {notice&&<Notice type="error">{notice}</Notice>}
    {available?<section className="panel padded-panel"><div className="panel-head"><div><h2>{report.person??report.title}</h2><p>{report.institution} · {report.academicYear} · {report.period}</p></div><span className="feature-icon purple"><FileText size={21}/></span></div>
      <div className="report-kpis">{report.metrics.map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      {report.trend.some(point=>point.Attendance!==null||point.Assessment!==null)&&<div className="chart-wrap"><ResponsiveContainer width="100%" height={210} minWidth={0}><AreaChart data={report.trend} margin={{left:-18,right:12,top:10}}><CartesianGrid vertical={false} stroke="#edeaf5"/><XAxis dataKey="date" tick={{fontSize:11}}/><YAxis domain={[0,100]} tick={{fontSize:11}}/><Tooltip/><Area dataKey="Attendance" stroke="#7c3aed" fill="#eadcff" type="monotone"/><Area dataKey="Assessment" stroke="#2563b1" fill="#d5e7fd" type="monotone"/></AreaChart></ResponsiveContainer></div>}
      {report.sections.map(section=><div key={section.title} style={{marginTop:17}}><h3 style={{marginBottom:7}}>{section.title}</h3>{section.rows.length?<div className="table-scroll"><table><thead><tr>{section.headers.map(value=><th key={value}>{value}</th>)}</tr></thead><tbody>{section.rows.slice(0,50).map((row,i)=><tr key={i}>{row.map((value,j)=><td key={j} style={{whiteSpace:"pre-wrap",minWidth:75,overflowWrap:"anywhere"}}>{value}</td>)}</tr>)}</tbody></table>{section.rows.length>50&&<p>Showing 50 of {section.rows.length} rows. Download the PDF for the full section.</p>}</div>:<p>No records for this period.</p>}</div>)}
      <p className="print-only">Authorized signature __________________________ · Generated {report.generated}</p>
    </section>:<div className="panel"><Empty title="Select a report subject" text="Choose a student or staff member to preview their report."/></div>}
    {!embedded&&!personId&&<section className="no-print"><div className="panel-head"><h2>Saved reports</h2></div><RecordTable data={data} items={list(data,"generated_reports")} columns={["title","report_type","created_at"]} renderAction={row=><><a className="text-link" href={"/api/reports?id="+row.id}>Download again</a>{!demo&&row.subject_id&&["student","staff"].includes(String(row.report_type))? <Link className="text-link" href={base+"/ai/communication?report="+row.id+"&"+(row.report_type==="student"?"student":"recipient")+"="+row.subject_id}>Prepare approved email</Link>:null}</>}/></section>}
  </div>;
}
export function PersonPage({module,entry,data,base,demo,run}:{module:"students"|"staff";entry:Item;data:Data;base:string;demo:boolean;run:RunCommand}){
  const router = useRouter();
  const [tab,setTab]=useState("Profile");
  const [confirmDelete,setConfirmDelete]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const student=module==="students";
  const classId=student?(entry.class_id??(entry.batch_id?list(data,"batches").find(b=>b.id===entry.batch_id)?.class_id:null)):null;
  const staffDetail=entry.email?String(entry.email)+(entry.handled_subjects?" · "+String(entry.handled_subjects):""):"Staff profile";
  const studentDetail=student?String(entry.admission_number)+(classId?" · "+rowName(data,"classes",classId):"")+" · "+rowName(data,"batches",entry.batch_id)+(entry.stream?" · "+String(entry.stream):""):staffDetail;
  return <><PageHeading title={String(entry.name)} detail={student?studentDetail:staffDetail}><Link className="button button-secondary" href={base+"/"+module}>Back to {module}</Link><Link className="button button-secondary" href={base+"/"+module+"/"+entry.id+"/edit"}>Edit profile</Link><Link className="button button-primary" href={base+"/reports/"+module+"/"+entry.id}><Download size={16}/> Full report</Link><button type="button" className="button button-secondary" style={{color:"#dc2626",borderColor:"#fecaca"}} onClick={()=>setConfirmDelete(true)}><Trash2 size={16}/> Delete {student?"student":"staff member"}</button></PageHeading>
    <div className="section-tabs">{["Profile",student?"Academic history":"Teaching activity"].map(value=><button className={tab===value?"selected":""} key={value} onClick={()=>setTab(value)}>{value}</button>)}</div>
    {tab==="Profile"?<section className="panel padded-panel"><div className="panel-head"><div className="person-cell"><Initials name={String(entry.name)}/><h2>{student?"Student details":"Staff details"}</h2></div>{!student&&<StaffInvite staff={list(data,"staff")} base={base} entry={entry} run={run}/>}</div>
    {!demo&&<div style={{marginBottom:13}}><RecordFile type={student?"student":"staff"} id={entry.id} exists={Boolean(entry.photo_path)}/></div>}
    <dl className="details-grid">{modules[module].fields?.map(field=><div key={field.key}><dt>{field.label}</dt><dd>{recordValue(data,entry,field.key)}</dd></div>)}</dl></section>:<ReportPage data={data} base={base} demo={demo} type={student?"student":"staff"} personId={entry.id} embedded/>}
    {confirmDelete&&<Modal title={"Delete "+(student?"student":"staff member")} close={()=>setConfirmDelete(false)}>
      <div className="delete-confirm-box">
        <p>Are you sure you want to delete <strong>{String(entry.name)}</strong>?</p>
        {!student&&<small style={{color:"#b91c1c",display:"block",marginTop:8}}>Warning: This will permanently remove this staff member and all associated teaching assignments.</small>}
        {error&&<Notice type="error">{error}</Notice>}
        <div className="form-actions" style={{marginTop:20}}>
          <button className="button button-secondary" type="button" onClick={()=>setConfirmDelete(false)} disabled={busy}>Cancel</button>
          <button className="button button-primary" style={{background:"#dc2626",borderColor:"#dc2626"}} disabled={busy} onClick={async ()=>{
            setBusy(true);setError("");
            try{
              await run({operation:"delete",module,id:entry.id});
              router.push(base+"/"+module);
            }catch(err){setError((err as Error).message);setBusy(false);}
          }}>{busy?"Deleting…":"Confirm delete"}</button>
        </div>
      </div>
    </Modal>}
  </>;
}

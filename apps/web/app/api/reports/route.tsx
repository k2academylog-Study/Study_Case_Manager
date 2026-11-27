import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { z } from "zod";
import { actor, apiAllowed, appUrl } from "@/lib/supabase";
import { loadData } from "@/lib/data";
import { AcademicPdf } from "@/lib/pdf";
import { makeReport, reportTypes } from "@/lib/report";
export const maxDuration=60;
const filter=z.object({type:z.string().refine(type=>Object.hasOwn(reportTypes,type)),personId:z.uuid().optional(),templateId:z.uuid().optional(),from:z.iso.date().optional(),to:z.iso.date().optional(),classId:z.uuid().optional(),batchId:z.uuid().optional(),subjectId:z.uuid().optional(),staffId:z.uuid().optional()});
const error=(message:string,status:number)=>NextResponse.json({error:message},{status});
export async function POST(request:Request){
  if(![new URL(request.url).origin,new URL(appUrl()).origin].includes(request.headers.get("origin")??""))return error("Invalid request origin.",403);
  const user=await actor();
  if(user?.role!=="admin")return error("Administrator access is required.",403);
  if(!await apiAllowed(user.client,"reports"))return error("Too many PDF requests. Try again shortly.",429);
  const body=await request.json().catch(()=>null);
  const parsed=filter.safeParse(body);
  if(!parsed.success)return error("Check the report filters.",400);
  const {type,personId,from,to}=parsed.data;
  if(from&&to&&from>to)return error("The reporting period is invalid.",400);
  if(["student","staff"].includes(type)&&!personId)return error("Select a report subject.",400);
  try{
    const data=await loadData("reports",{from,to,studentId:type==="student"?personId:undefined});
    if(data.dataset_limits?.length)return error("Narrow the reporting period or choose an individual report.",422);
    if((type==="student"&&!data.students?.some(r=>r.id===personId))||(type==="staff"&&!data.staff?.some(r=>r.id===personId)))return error("The report subject was not found.",404);
    const report=makeReport(data,parsed.data);
    const logo=data.institution_settings?.[0]?.logo_path;
    if(typeof logo==="string"){
      const {data:blob}=await user.client.storage.from("academic-files").download(logo);
      if(blob&&["image/png","image/jpeg"].includes(blob.type)&&blob.size<=3_000_000){
        report.logo="data:"+blob.type+";base64,"+Buffer.from(await blob.arrayBuffer()).toString("base64");
      }
    }
    const rowCount=report.sections.reduce((sum,section)=>sum+section.rows.length,0);
    if(rowCount>2200)return error("Narrow the reporting period or choose a smaller group.",422);
    const buffer=await renderToBuffer(<AcademicPdf report={report}/>);
    const id=crypto.randomUUID();
    const path=user.institution_id+"/"+id+".pdf";
    const bucket=user.client.storage.from("academic-reports");
    const uploaded=await bucket.upload(path,buffer,{contentType:"application/pdf",upsert:false});
    if(uploaded.error)return error("Report storage is unavailable.",502);
    const {error:insertError}=await user.client.from("generated_reports").insert({id,institution_id:user.institution_id,title:report.title,report_type:type,subject_id:personId,storage_path:path,requested_by:user.userId,filters:parsed.data});
    if(insertError){await bucket.remove([path]);return error("The report history could not be saved.",502);}
    const signed=await bucket.createSignedUrl(path,60,{download:"academic-report.pdf"});
    if(signed.error || !signed.data)return error("The report was saved. Open it again from report history.",502);
    await user.client.from("report_access_logs").insert({institution_id:user.institution_id,report_id:id,user_id:user.userId});
    return NextResponse.json({url:signed.data.signedUrl},{headers:{"Cache-Control":"no-store"}});
  }catch{return error("The report could not be generated.",502);}
}
export async function GET(request:Request) {
  const user=await actor();
  if(user?.role!=="admin")return error("Administrator access is required.",403);
  const id=z.uuid().safeParse(new URL(request.url).searchParams.get("id"));
  if(!id.success)return error("Invalid report.",400);
  const {data}=await user.client.from("generated_reports").select("storage_path").eq("id",id.data).eq("institution_id",user.institution_id).maybeSingle();
  if(!data)return error("Report not found.",404);
  const {data:signed}=await user.client.storage.from("academic-reports").createSignedUrl(data.storage_path,60,{download:"academic-report.pdf"});
  if(!signed)return error("The report file is unavailable.",502);
  await user.client.from("report_access_logs").insert({institution_id:user.institution_id,report_id:id.data,user_id:user.userId});
  return NextResponse.redirect(signed.signedUrl,303);
}

import { NextResponse } from "next/server";
import { parseCommand, scoreStatuses, validateValues, workStatuses } from "@/lib/command";
import { modules } from "@/lib/catalog";
import { actor, apiAllowed, appUrl, serviceDb, staffAuthAccount } from "@/lib/supabase";

function fail(message:string,status=400){return NextResponse.json({error:message},{status});}
function databaseError(error:{code?:string;message?:string}){
  if(error.code==="P0001") return fail(error.message??"The change failed validation.");
  if(error.code==="23505") return fail("A matching record already exists.",409);
  if(error.code==="23514") return fail("A value failed the academic validation rules.");
  if(error.code==="42501" || error.code==="23503") return fail("The selected record is unavailable.",403);
  return fail("The database could not save this change.",500);
}
export async function POST(request:Request){
  const origin=request.headers.get("origin");
  if(!origin || ![new URL(request.url).origin,new URL(appUrl()).origin].includes(origin)) return fail("Invalid request origin.",403);
  if(Number(request.headers.get("content-length")??0)>2_000_000) return fail("The request is too large.",413);
  const user=await actor();
  if(!user) return fail("Sign in to continue.",401);
  if(!await apiAllowed(user.client,"academic"))return fail("Too many academic requests. Try again shortly.",429);
  const json=await request.text();
  if(json.length>2_000_000)return fail("The request is too large.",413);
  let body:unknown;
  try{body=JSON.parse(json);}catch{return fail("Invalid JSON request.");}
  const parsed=parseCommand(body);
  if(!parsed.success) return fail("Check the submitted fields.");
  const cmd=parsed.data, client=user.client, admin=user.role==="admin", institution_id=user.institution_id;
  try{
    const permission=cmd.operation==="work-topics"?cmd.kind:cmd.operation==="session"?"record_sessions":cmd.operation==="roster"?(cmd.kind==="marks"?"assessments":"assignments"):
      cmd.operation==="save"&&["syllabus","assignments","assessments"].includes(cmd.module)?cmd.module:null;
    if(!admin && permission){
      const {data,error}=await client.rpc("actor_permission",{capability:permission});
      if(error || data!==true)return fail("This capability is unavailable to staff.",403);
    }
    if(cmd.operation==="save"){
      const module=modules[cmd.module];
      if(!module?.fields || (!admin && (module.adminOnly||!module.staffWrite))) return fail("This operation requires administrator approval.",403);
      const values=validateValues(cmd.module,cmd.values);
      if(cmd.module==="students"){
        const {data,error}=await client.rpc("save_student_profile",{p_id:cmd.id,p_value:values,p_create:cmd.create});
        return error?databaseError(error):NextResponse.json({id:data});
      }
      if(cmd.weeks && cmd.weeks>1){
        if(!admin||cmd.module!=="timetable"||!cmd.create||values.status!=="scheduled")return fail("Select a new scheduled class for recurrence.");
        const {data,error}=await client.rpc("schedule_recurrence",{p_value:values,p_weeks:cmd.weeks});
        return error?databaseError(error):NextResponse.json({data});
      }
      const payload={...values,institution_id,id:cmd.id};
      const result=cmd.create
        ? await client.from(module.table).upsert(payload,{onConflict:"id",ignoreDuplicates:true}).select("id")
        : await client.from(module.table).update(values).eq("id",cmd.id).eq("institution_id",institution_id).select("id");
      if(result.error)return databaseError(result.error);
      if(!result.data?.length){
        const {data}=await client.from(module.table).select("id").eq("id",cmd.id).eq("institution_id",institution_id).maybeSingle();
        if(!cmd.create || !data)return fail("This record is unavailable.",404);
      }
      return NextResponse.json({id:cmd.id});
    }
    if(cmd.operation==="import"){
      if(!admin)return fail("Administrator access is required.",403);
      const rows=cmd.rows.map((row,index)=>{
        try{return {...validateValues(cmd.module,row),institution_id};}
        catch(error){ throw new Error("Row "+(index+2)+". "+(error as Error).message); }
      });
      const {error}=cmd.module==="students"
        ? await client.rpc("import_student_profiles",{p_rows:rows})
        : await client.from(modules[cmd.module].table).insert(rows);
      return error?databaseError(error):NextResponse.json({count:rows.length});
    }
    if(cmd.operation==="session"){
      const {data,error}=await client.rpc("record_class_session",{p_session:cmd.session,p_topics:cmd.topics,p_subtopics:cmd.subtopics,p_roster:cmd.roster});
      return error?databaseError(error):NextResponse.json({id:data});
    }
    if(cmd.operation==="work-topics"){
      const {data,error}=await client.rpc("save_work_topics",{p_kind:cmd.kind,p_parent:cmd.parent,p_topics:cmd.topics,p_questions:cmd.questions});
      return error?databaseError(error):NextResponse.json({saved:data===true});
    }
    if(cmd.operation==="roster"){
      const marks=cmd.kind==="marks";
      const selected=marks?scoreStatuses:workStatuses;
      if(cmd.rows.some(row=>!(selected as readonly string[]).includes(row.status) || (marks && (row.status==="evaluated")!==(row.marks!==null))))return fail("Check the status and marks for each student.");
      const {error}=marks
        ? await client.rpc("save_assessment_roster",{p_parent:cmd.parent,p_rows:cmd.rows,p_draft:cmd.draft})
        : await client.from("assignment_submissions").upsert(cmd.rows.map(({student_id,status,marks,feedback})=>({student_id,status,marks,feedback,assignment_id:cmd.parent,institution_id})),{onConflict:"assignment_id,student_id"});
      return error?databaseError(error):NextResponse.json({count:cmd.rows.length});
    }
    if(!admin)return fail("Administrator access is required.",403);
    const {data:staff}=await client.from("staff").select("id,email,name,active").eq("id",cmd.id).eq("institution_id",institution_id).maybeSingle();
    if(!staff?.email || !staff.active)return fail("Select an active staff member with an email address.");
    const service=serviceDb();
    const {data:existing,error:lookupError}=await service.from("profiles").select("id").eq("staff_id",staff.id).eq("institution_id",institution_id).maybeSingle();
    if(lookupError)return fail("Could not check staff membership. Try again.",502);
    if(existing)return fail("This staff member already has a connected account.",409);
    if(cmd.connectExisting){
      const account=await staffAuthAccount(staff.email);
      if(account){
        if(!account.email_confirmed_at)return fail("This email already has a sign-in. Ask the staff member to verify their email before connecting it.",409);
        const {data:membership,error:membershipError}=await service.from("profiles").select("id").eq("user_id",account.id).maybeSingle();
        if(membershipError)return fail("Could not check the account's membership. Try again.",502);
        if(membership)return fail("This email already belongs to an institutional profile. Edit the staff record and use a separate email address for staff access.",409);
        const {error}=await service.rpc("link_invited_staff",{p_institution:institution_id,p_staff:staff.id,p_user:account.id,p_name:staff.name});
        if(error?.code==="23505")return fail("An institutional account is already connected. Refresh the directory. If this staff record is still unlinked, use a separate email address for staff access.",409);
        if(error)return fail("Could not connect the existing account. Check the staff membership setup.",502);
        return NextResponse.json({id:staff.id,connected:true});
      }
    }
    const {data:invited,error}=await service.auth.admin.inviteUserByEmail(staff.email,{redirectTo:appUrl()+"/auth/confirm"});
    if(error?.code==="email_address_not_authorized")return fail("Supabase's built-in email sender cannot deliver to this address. Configure custom SMTP in Supabase Authentication, then retry.",422);
    if(error?.status===429)return fail("Supabase has reached its email or request limit. Wait before trying again.",429);
    if(error?.code==="email_exists"||error?.code==="user_already_exists")return fail("This email already has a sign-in. Refresh the staff directory and choose Grant staff access.",409);
    if(error||!invited.user)return fail("Supabase could not send the invitation. Check the failed invite in Supabase Auth Logs.",502);
    const {error:link}=await service.rpc("link_invited_staff",{p_institution:institution_id,p_staff:staff.id,p_user:invited.user.id,p_name:staff.name});
    if(link)return fail("The invitation was sent but the account could not be linked. Check Supabase Auth and membership setup.",502);
    return NextResponse.json({id:staff.id});
  }catch(error){
    return fail(error instanceof Error && ["save","import"].includes(cmd.operation)?error.message:"This operation could not be completed. Check institutional configuration.");
  }
}


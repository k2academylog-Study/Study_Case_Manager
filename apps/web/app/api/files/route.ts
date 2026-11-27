import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { actor, apiAllowed, appUrl } from "@/lib/supabase";
const schema=z.object({type:z.enum(["student","staff","institution","assignment"]),id:z.uuid()});
const failure=(message:string,status:number)=>NextResponse.json({error:message},{status});
export async function GET(request:NextRequest){
  const parsed=schema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  const user=await actor();
  if(!user)return failure("Sign in to access this file.",401);
  if(!parsed.success)return failure("Invalid file.",400);
  const {type,id}=parsed.data;
  const {data}=await user.client.rpc("record_file_path",{p_type:type,p_id:id});
  if(typeof data!=="string")return failure("This file is unavailable.",404);
  const {data:signed}=await user.client.storage.from("academic-files").createSignedUrl(data,60);
  if(!signed)return failure("This file is unavailable.",404);
  return NextResponse.redirect(signed.signedUrl,303);
}
export async function POST(request:NextRequest){
  if(![request.nextUrl.origin,new URL(appUrl()).origin].includes(request.headers.get("origin")??""))return failure("Invalid request origin.",403);
  if(Number(request.headers.get("content-length")??0)>3_200_000)return failure("Use a file under 3 MB.",413);
  const user=await actor();
  if(!user)return failure("Sign in to upload files.",401);
  if(!await apiAllowed(user.client,"files"))return failure("Too many file uploads. Try again shortly.",429);
  const form=await request.formData().catch(()=>null);
  const parsed=schema.safeParse({type:form?.get("type"),id:form?.get("id")});
  const file=form?.get("file");
  if(!parsed.success||!(file instanceof File)||!file.size||file.size>3_000_000)return failure("Select a supported file under 3 MB.",400);
  const {type,id}=parsed.data;
  if(type!=="assignment"&&user.role!=="admin")return failure("Administrator access is required.",403);
  const bytes=new Uint8Array(await file.arrayBuffer());
  const ascii=new TextDecoder("ascii").decode(bytes.slice(0,16));
  const image=bytes[0]===0x89&&ascii.slice(1,4)==="PNG"?["png","image/png"]:
    bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff?["jpg","image/jpeg"]:
    ascii.startsWith("RIFF")&&ascii.slice(8,12)==="WEBP"?["webp","image/webp"]:null;
  const kind=type==="assignment"&&ascii.startsWith("%PDF-")?["pdf","application/pdf"]:image;
  if(!kind||type==="institution"&&kind[0]==="webp")return failure("Choose a PNG or JPEG image, or an allowed assignment attachment.",400);
  const path=user.institution_id+"/"+type+"/"+id+"/"+crypto.randomUUID()+"."+kind[0];
  const bucket=user.client.storage.from("academic-files");
  const {error}=await bucket.upload(path,bytes,{contentType:kind[1],upsert:false});
  if(error)return failure("The file could not be stored for this record.",403);
  const {data}=await user.client.rpc("set_record_file",{p_type:type,p_id:id,p_path:path});
  if(!data){await bucket.remove([path]);return failure("The record could not be updated.",403);}
  return NextResponse.json({saved:true});
}

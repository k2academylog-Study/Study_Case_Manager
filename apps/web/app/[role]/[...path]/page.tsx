import { notFound, redirect } from "next/navigation";
import { Workspace } from "@/components/workspace";
import { loadData } from "@/lib/data";
import { list } from "@/lib/catalog";
import { actor } from "@/lib/supabase";
import { validRoute } from "@/lib/routing";
import { aiServiceBaseUrl } from "@/lib/ai-service";

export default async function Page({params,searchParams}:{params:Promise<{role:string;path:string[]}>;searchParams:Promise<{create?:string;student?:string;campaign?:string;report?:string;recipient?:string}>}){
  const {role,path}=await params;
  const route=path.join("/");
  if((role!=="admin"&&role!=="staff")||!validRoute(role,route))notFound();
  const user=await actor();
  if(!user||user.role!==role)redirect("/"+role+"/login");
  if(role==="staff"&&user.mustChangePassword)redirect("/staff/set-password");
  const data=await loadData(route);
  const institution=String(list(data,"institution_settings")[0]?.institution_name??list(data,"institutions")[0]?.name??"Institution workspace");
  return <Workspace key={role+"/"+route} role={role} route={route} source={data} name={user.display_name} institution={institution} online={Boolean(aiServiceBaseUrl()&&process.env.INTERNAL_API_SECRET)} query={await searchParams}/>;
}

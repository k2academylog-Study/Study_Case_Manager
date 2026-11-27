import { notFound } from "next/navigation";
import { Workspace } from "@/components/workspace";
import { demoData, demoPerson } from "@/lib/demo";
import { validRoute } from "@/lib/routing";
export const metadata={title:"Demo workspace"};
export default async function Page({params,searchParams}:{params:Promise<{role:string;path:string[]}>;searchParams:Promise<{create?:string;student?:string;campaign?:string;report?:string;recipient?:string}>}){
  const {role,path}=await params;
  const route=path.join("/");
  if((role!=="admin"&&role!=="staff")||!validRoute(role,route))notFound();
  const data=demoData();
  return <Workspace key={role+"/"+route} role={role} route={route} source={data} name={role==="admin"?"Alex Morgan":demoPerson(data)} institution="Northview Academy" demo query={await searchParams}/>;
}

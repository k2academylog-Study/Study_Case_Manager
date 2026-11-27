import { notFound, redirect } from "next/navigation";
export default async function Page({params}:{params:Promise<{role:string}>}){
  const {role}=await params;
  if(role!=="admin"&&role!=="staff")notFound();
  redirect("/"+role+"/dashboard");
}

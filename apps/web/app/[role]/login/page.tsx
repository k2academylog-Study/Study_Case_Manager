import { notFound } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { configured } from "@/lib/supabase";
export default async function Page({params}:{params:Promise<{role:string}>}){
  const {role}=await params;
  if(role!=="admin"&&role!=="staff")notFound();
  return <AuthForm mode={role} configured={configured()}/>;
}

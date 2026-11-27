import { AuthForm } from "@/components/auth-form";
import { configured } from "@/lib/supabase";
export const metadata={title:"Reset password"};
export default async function Page({searchParams}:{searchParams:Promise<{invalid?:string}>}){
  return <AuthForm mode="forgot" configured={configured()} invalid={(await searchParams).invalid==="1"}/>;
}

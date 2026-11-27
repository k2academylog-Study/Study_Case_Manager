import { AuthForm } from "@/components/auth-form";
import { configured } from "@/lib/supabase";
export const metadata={title:"Set new password"};
export default function Page(){return <AuthForm mode="reset" configured={configured()}/>;}

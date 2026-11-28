import { notFound, redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { actor, configured } from "@/lib/supabase";

export const metadata = { title: "Set your permanent password" };

export default async function Page({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (role !== "staff") notFound();
  if (configured()) {
    const user = await actor();
    if (!user) redirect("/staff/login");
    if (!user.mustChangePassword) {
      redirect("/staff/dashboard");
    }
  }
  return <AuthForm mode="set-password" configured={configured()} />;
}

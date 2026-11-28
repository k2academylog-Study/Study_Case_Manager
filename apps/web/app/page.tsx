import { PortalHome } from "@/components/portal-home";

export default async function Page({ searchParams }: { searchParams: Promise<{ password?: string }> }) {
  const params = await searchParams;
  return <PortalHome passwordUpdated={params.password === "updated"} />;
}

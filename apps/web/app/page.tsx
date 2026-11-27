import { Landing } from "@/components/public-site";
export default async function Page({searchParams}:{searchParams:Promise<{password?:string}>}){
  return <Landing passwordUpdated={(await searchParams).password==="updated"}/>;
}

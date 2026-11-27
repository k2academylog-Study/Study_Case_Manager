import { PublicInfo } from "@/components/public-site";
export const metadata={title:"Contact"};
export default function Page(){return <PublicInfo contact email={process.env.CONTACT_EMAIL}/>;}

import Link from "next/link";
import { GraduationCap } from "lucide-react";
export function Brand({dark=false,compact=false}:{dark?:boolean;compact?:boolean}) {
  return <Link href="/" className={"brand "+(dark?"brand-dark":"")} aria-label="Study Case Manager home"><span className="brand-icon"><GraduationCap size={22}/></span>{!compact&&<span>Study Case<span className="brand-manager"> Manager</span></span>}</Link>;
}


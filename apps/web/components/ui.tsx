import type { ReactNode } from "react";
import { CircleAlert, Inbox } from "lucide-react";
export function Empty({title="No records yet",text="Records will appear here when they’re available."}:{title?:string;text?:string}){
  return <div className="empty"><span><Inbox size={22}/></span><strong>{title}</strong><p>{text}</p></div>;
}
export function Notice({children,type="normal"}:{children:ReactNode;type?:"normal"|"error"|"success"}){
  return <div className={"notice "+type} role={type==="error"?"alert":"status"}>{type==="error"&&<CircleAlert size={16}/>}<div>{children}</div></div>;
}
export function Status({value}:{value:unknown}){
  const text=String(value??"—").replaceAll("_"," ");
  const category=["completed","active","employed","present","evaluated","delivered","approved","submitted","enrolled","scheduled","yes"].includes(text)?"good":["absent","failed","cancelled","delayed","withdrawn","bounced","no"].includes(text)?"bad":["late","pending","draft","in progress","revision required","awaiting approval"].includes(text)?"warn":"neutral";
  return <span className={"status "+category}>{text}</span>;
}
export function PageHeading({title,detail,children}:{title:string;detail?:string;children?:ReactNode}){
  return <div className="page-heading"><div><h1>{title}</h1>{detail&&<p>{detail}</p>}</div>{children&&<div className="page-actions">{children}</div>}</div>;
}
export function Initials({name}:{name:string}){return <span className="avatar">{name.trim().split(/\s+/).slice(0,2).map(v=>v[0]).join("").toUpperCase()}</span>;}


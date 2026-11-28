"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Activity, Bell, BookOpen, CalendarDays, ChartNoAxesCombined, ChevronDown, ChevronsLeft, ChevronsRight, ClipboardCheck, ClipboardList, FileCheck2, Files, GraduationCap, History, LayoutDashboard, ListChecks, LogOut, Menu, MessageSquareText, Settings2, Sparkles, UserRound, UsersRound, X, type LucideIcon } from "lucide-react";
import { Brand } from "./brand";
import { Initials } from "./ui";
import { signOut } from "@/app/auth/actions";
import type { Role } from "@/lib/catalog";

type Nav = [string,string,LucideIcon,Nav[]?];
const academics:Nav[]=[["academic-years","Academic years",CalendarDays],["classes","Classes",GraduationCap],["batches","Batches",UsersRound],["syllabus","Subjects & syllabus",BookOpen],["teaching-assignments","Teaching assignments",ClipboardList]];
const adminMain:Nav[]=[
  ["dashboard","Dashboard",LayoutDashboard],["students","Students",GraduationCap],["staff","Staff",UsersRound],["academics","Academic management",BookOpen,academics],
  ["attendance","Attendance",ClipboardCheck],["class-sessions","Class sessions",ListChecks],["assignments","Assignments",ClipboardList],["calendar","Calendar & timetable",CalendarDays],
  ["ai","AI agents",Sparkles],["reports","Reports & analytics",ChartNoAxesCombined],
];
const staffMain:Nav[]=[
  ["dashboard","Dashboard",LayoutDashboard],["my-classes","My classes",GraduationCap],["attendance","Attendance",ClipboardCheck],["class-sessions","Class sessions",ListChecks],["syllabus","Syllabus progress",BookOpen],
  ["student-observations","Student observations",UsersRound],["assignments","Assignments",ClipboardList],["assessments","Assessments",FileCheck2],["marks","Upload marks",ClipboardCheck],["student-performance","Student performance",Activity],["calendar","Calendar & timetable",CalendarDays],["ai/assistant","AI academic assistant",Sparkles],
];
const adminManage:Nav[]=[["notifications","Notifications",Bell],["settings","Settings",Settings2],["audit-logs","Audit logs",History]];
const staffManage:Nav[]=[["notifications","Notifications",Bell],["profile","Profile",UserRound]];
function activeRoute(current:string,target:string){
  if (current===target||current.startsWith(target+"/")) return true;
  if (target==="calendar"&&current==="timetable") return true;
  if (target==="ai"&&(current==="ai"||current.startsWith("ai/"))) return true;
  if (target==="reports"&&(current==="reports"||current==="reporting"||current.startsWith("reports/")||current.startsWith("analytics/")||current==="report-templates")) return true;
  return false;
}
export function Shell({role,route,demo,institution,name,children}:{role:Role;route:string;demo:boolean;institution:string;name:string;children:ReactNode}){
  const base=(demo?"/demo":"")+"/"+role;
  const [collapsed,setCollapsed]=useState(false);
  const [mobile,setMobile]=useState(false);
  const [expanded,setExpanded]=useState<string[]>([]);
  const main=role==="admin"?adminMain:staffMain, manage=role==="admin"?adminManage:staffManage;
  const activeTitle=(route==="ai"||route.startsWith("ai/"))
    ? "AI agents"
    : (route==="reports"||route==="reporting"||route.startsWith("analytics/")||route==="report-templates")
    ? "Reports & analytics"
    : [...main,...manage,...academics].find(([slug])=>activeRoute(route,slug))?.[1]??route.split("/").at(0)?.replaceAll("-"," ");
  function nav([slug,title,Icon,links]:Nav){
    const isActive=links?links.some(([s])=>activeRoute(route,s)):activeRoute(route,slug);
    const open=expanded.includes(slug)||isActive;
    return <div key={slug}>{links?<><button className={"side-link "+(isActive?"active":"")} title={title} onClick={()=>{if(collapsed)setCollapsed(false);setExpanded(value=>value.includes(slug)?value.filter(item=>item!==slug):[...value,slug]);}} aria-expanded={open}><Icon size={19}/><span>{title}</span><ChevronDown size={14} className="side-chevron"/></button>
      {open&&!collapsed&&<div className="side-sub">{links.map(nav)}</div>}</>:<Link className={"side-link "+(isActive?"active":"")} aria-current={isActive?"page":undefined} title={title} href={base+"/"+slug} onClick={()=>setMobile(false)}><Icon size={19}/><span>{title}</span></Link>}</div>;
  }
  return <div className={"workspace "+(collapsed?"sidebar-collapsed":"")}>
    {mobile&&<button className="mobile-scrim" aria-label="Close navigation" onClick={()=>setMobile(false)}/>}
    <aside className={"sidebar "+(mobile?"sidebar-open":"")}>
      <div className="sidebar-brand"><Brand dark compact={collapsed}/><button className="sidebar-mobile-close" aria-label="Close navigation" onClick={()=>setMobile(false)}><X size={20}/></button></div>
      <div className="school-switch"><span className="school-icon"><GraduationCap size={18}/></span><div><strong>{institution}</strong><small>{role==="admin"?"Administrator portal":"Staff portal"}</small></div></div>
      <nav className="side-menu" aria-label="Workspace navigation"><div className="side-caption">Workspace</div>{main.map(nav)}<div className="side-caption side-caption-secondary">Management</div>{manage.map(nav)}</nav>
      <div className="sidebar-bottom">{demo?<Link className="side-link" href="/"><LogOut size={18}/><span>Exit demo</span></Link>:<form action={signOut}><button className="side-link"><LogOut size={18}/><span>Sign out</span></button></form>}
      <button className="side-link collapse-button" onClick={()=>setCollapsed(!collapsed)} title={collapsed?"Expand sidebar":"Collapse sidebar"}>{collapsed?<ChevronsRight size={18}/>:<ChevronsLeft size={18}/>}<span>Collapse sidebar</span></button></div>
    </aside>
    <div className="workspace-right">
      <header className="topbar"><div className="topbar-path"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={()=>setMobile(true)}><Menu size={23}/></button><span>Workspace</span><span className="breadcrumb-divider">/</span><strong>{activeTitle}</strong></div><div className="topbar-actions">
        {demo&&<><span className="demo-badge">Demo workspace</span><Link className="demo-switch" href={"/demo/"+(role==="admin"?"staff":"admin")+"/dashboard"}>Switch to {role==="admin"?"staff":"admin"}</Link></>}
        <Link href={base+"/notifications"} className="icon-button" aria-label="Notifications"><Bell size={19}/></Link><div className="account"><Initials name={name}/><div><strong>{name}</strong><small>{role==="admin"?"Administrator":"Teaching staff"}</small></div></div>
      </div></header>
      <main className="workspace-main">{children}</main>
    </div></div>;
}


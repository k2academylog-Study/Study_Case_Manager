import Link from "next/link";
import { Activity, BookOpen, CalendarDays, ChartNoAxesCombined, Check, ChevronDown, ClipboardList, GraduationCap, LayoutDashboard, Mail, MessageSquareText, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import { Brand } from "./brand";
import { Button } from "./ui/button";

const features=[
  {icon:UsersRound,title:"Students & staff",copy:"Keep enrollment histories, staff assignments, and student records connected across classes and batches.",color:"purple"},
  {icon:BookOpen,title:"Syllabus & teaching",copy:"Plan teaching by chapter and topic. See actual progress against the targets your institution sets.",color:"blue"},
  {icon:ClipboardList,title:"Attendance & assessment",copy:"Record attendance, capture teacher observations, and enter scores against the right class roster.",color:"green"},
  {icon:CalendarDays,title:"Calendar & timetable",copy:"Plan classes, assessments, and holidays with a calendar that checks for scheduling conflicts.",color:"amber"},
  {icon:ChartNoAxesCombined,title:"Academic reporting",copy:"Review attendance, results, and teaching activity in one place. Export reports for authorized sharing.",color:"purple"},
  {icon:ShieldCheck,title:"Role-based access",copy:"Give administrators institutional visibility and teaching staff access to the classes they are assigned.",color:"blue"},
];
const agents=[
  {title:"Student Performance Analysis",copy:"Use verified attendance, assessment and assignment records to find where a student could benefit from support.",icon:Activity},
  {title:"Academic Assistant",copy:"Ask a question in plain language and get an answer grounded in the academic records you can access.",icon:Sparkles},
  {title:"Communication & Notifications",copy:"Prepare WhatsApp and email drafts, verify recipients, and review the exact message before sending.",icon:MessageSquareText},
];

function Header(){
  return <header className="public-header"><div className="public-container public-nav">
    <Brand/><nav aria-label="Public navigation"><Link href="/#platform">Platform</Link><Link href="/#ai-agents">AI agents</Link><Link href="/about">About</Link><Link href="/contact">Contact</Link></nav>
    <div className="nav-actions"><Link className="button button-ghost" href="/staff/login">Staff login</Link><Link className="button button-primary" href="/admin/login">Admin login</Link></div>
  </div></header>;
}
function Footer(){
  return <footer className="public-footer"><div className="public-container footer-inner"><div><Brand/><p>Academic management for schools and tuition centres.</p></div><nav aria-label="Footer navigation"><Link href="/#platform">Platform</Link><Link href="/about">About</Link><Link href="/contact">Contact</Link><Link href="/staff/login">Staff login</Link></nav></div><div className="public-container footer-bottom"><span>© {new Date().getFullYear()} Study Case Manager</span><span>Built for academic teams</span></div></footer>;
}
function ProductPreview(){
  const navigation=[["Overview",LayoutDashboard],["Students",UsersRound],["Attendance",ClipboardList],["Syllabus",BookOpen],["Calendar",CalendarDays],["AI agents",Sparkles]] as const;
  return <div className="product-frame" aria-label="Illustration of the admin dashboard with demo data">
    <aside className="mini-sidebar">
      <span className="mini-brand"><span><GraduationCap size={15}/></span>Study Case Manager</span>
      <span className="mini-caption">WORKSPACE</span>
      {navigation.map(([title,Icon],i)=><span key={title} className={"mini-link "+(!i?"mini-active":"")}><Icon size={12}/>{title}</span>)}
      <span className="mini-account"><b>AM</b><span>Alex Morgan<small>Administrator</small></span></span>
    </aside>
    <section className="mini-main">
      <div className="mini-header"><div><h2>Academic overview</h2><p>Northview Academy · Demo data</p></div><span>Last 30 days <ChevronDown size={9}/></span></div>
      <div className="mini-stats">{[["Students","112",UsersRound],["Attendance","84.2%",ClipboardList],["Syllabus","72.6%",BookOpen]] .map(([label,value,Icon])=>{const Glyph=Icon as typeof UsersRound;return <div key={String(label)}><span className="mini-icon"><Glyph size={12}/></span><small>{String(label)}</small><strong>{String(value)}</strong></div>})}</div>
      <div className="mini-chart"><div className="mini-chart-header"><div><strong>Attendance trend</strong><small>Weekly attendance across all batches</small></div><span><i/> Attendance</span></div>
        <div className="chart-illustration"><div className="chart-scale"><span>100%</span><span>80%</span><span>60%</span><span>40%</span></div><div className="chart-plot"><div className="chart-area"/><div className="chart-bars">{[45,61,52,72,66,87,79,93].map((height,i)=><i style={{height:height+"%"}} key={i}/> )}</div></div></div>
        <div className="chart-labels"><span>Week 1</span><span>Week 2</span><span>Week 3</span><span>Week 4</span></div>
      </div>
      <div className="mini-bottom"><strong>Teaching progress</strong><div><span>Mathematics</span><i><b style={{width:"74%"}}/></i><span>74%</span></div><div><span>Science</span><i><b style={{width:"89%"}}/></i><span>89%</span></div></div>
    </section>
  </div>;
}
export function Landing({passwordUpdated=false}:{passwordUpdated?:boolean}){
  return <><Header/>{passwordUpdated&&<div className="public-container success-banner">Password updated. You can now sign in to your portal.</div>}
    <main>
      <section className="landing-hero"><div className="public-container hero-grid">
        <div className="hero-copy"><span className="eyebrow"><Sparkles size={15}/> AI-powered academic management</span>
          <h1>A clearer view of <span>academic progress.</span></h1>
          <p>Bring student records, teaching, and academic reporting into one workspace. See what needs attention and give your team the information to act.</p>
          <div className="hero-actions"><Button size="large" asChild><Link href="/demo/admin/dashboard"><LayoutDashboard size={18}/> Explore the demo</Link></Button><Link className="button button-secondary button-large" href="/#platform">Explore features</Link></div>
          <div className="hero-support"><Check size={17}/> Built for schools and tuition centres serving Classes 6–12</div>
        </div>
        <div className="hero-product"><div className="product-halo"/><ProductPreview/><div className="preview-note"><span><Activity size={20}/></span><div><strong>Weekly attendance</strong><small>Live in your workspace</small></div></div></div>
      </div></section>
      <section className="landing-section public-container" id="platform"><div className="section-intro"><span className="section-label">THE PLATFORM</span><h2>Run your academic day in one place</h2><p>From the first roll call to end-of-term reporting, each update is available wherever the team needs it.</p></div><div className="feature-grid">{features.map(({icon:Icon,title,copy,color})=><article className="feature-card" key={title}><span className={"feature-icon "+color}><Icon size={22}/></span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>
      <section className="agent-section" id="ai-agents"><div className="public-container landing-section"><div className="section-intro"><span className="section-label">THE AI WORKSPACE</span><h2>Academic answers you can review</h2><p>Three dedicated agents help your team interpret records, find answers, and prepare communications.</p></div><div className="agent-grid">{agents.map(({title,copy,icon:Icon})=><article className="agent-card" key={title}><span className="feature-icon purple"><Icon size={22}/></span><h3>{title}</h3><p>{copy}</p></article>)}</div></div></section>
      <section className="public-container public-contact"><div><h2>Explore Study Case Manager</h2><p>Take a look around the administrator workspace or learn how to reach your institution’s support team.</p></div><div className="hero-actions"><Link className="button button-primary button-large" href="/demo/admin/dashboard">Open demo</Link><Link className="button button-secondary button-large" href="/contact"><Mail size={17}/> Contact</Link></div></section>
    </main><Footer/></>;
}
export function PublicInfo({contact=false,email}:{contact?:boolean;email?:string}) {
  return <><Header/><main className="public-container info-page"><span className="section-label">{contact?"CONTACT":"ABOUT THE PLATFORM"}</span>
    <h1>{contact?"Contact and support":"Study Case Manager"}</h1>
    <p>{contact?"For access, password setup, or questions about your school’s records, contact the administrator at your institution.":"Study Case Manager connects academic administration and classroom operations for schools and tuition centres."}</p>
    <div className="feature-grid">{(contact?[{title:"Account access",copy:"Staff access is set up by your institution. If you already have an account, use the password reset link on the sign-in page.",icon:ShieldCheck,color:"purple"},{title:"Academic records",copy:"Ask your institution’s administrator to review or correct attendance, scores, and enrollment records.",icon:ClipboardList,color:"blue"}]:features.slice(0,3)).map(({title,copy,icon:Icon,color})=><article className="feature-card" key={title}><span className={"feature-icon "+color}><Icon size={22}/></span><h3>{title}</h3><p>{copy}</p></article>)}</div>
    <div className="hero-actions">{email&&contact?<a className="button button-primary" href={"mailto:"+email}>Email support</a>:<Link className="button button-primary" href={contact?"/forgot-password":"/demo/admin/dashboard"}>{contact?"Reset your password":"Explore the demo"}</Link>}<Link className="button button-secondary" href="/">Back to home</Link></div>
  </main><Footer/></>;
}


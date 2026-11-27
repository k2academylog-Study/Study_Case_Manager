"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { BookOpenCheck, Eye, EyeOff, KeyRound, LockKeyhole, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { Brand } from "./brand";
import { Button } from "./ui/button";
import { requestReset, setPassword, signIn } from "@/app/auth/actions";
import type { Role } from "@/lib/catalog";

export function AuthForm({mode,configured,invalid=false}:{mode:Role|"forgot"|"reset";configured:boolean;invalid?:boolean}){
  const portal=mode==="admin"||mode==="staff";
  const action=portal?signIn.bind(null,mode):mode==="forgot"?requestReset:setPassword;
  const [result,submit,pending]=useActionState(action,{});
  const [visible,setVisible]=useState(false);
  const title=mode==="admin"?"Administrator login":mode==="staff"?"Staff login":mode==="forgot"?"Reset your password":"Set a new password";
  return <main className="auth-page"><aside className="auth-aside"><Brand dark/><div className="auth-aside-content"><span className="auth-icon"><BookOpenCheck size={28}/></span><h1>Academic progress starts with a clear view.</h1><p>Access your institution’s academic records, teaching tools, and reporting workspace.</p></div><span className="auth-aside-footer"><ShieldCheck size={16}/> Secure institution access</span></aside>
  <section className="auth-content"><Link className="back-link" href="/">Back to home</Link><div className="auth-panel"><span className="feature-icon purple">{mode==="forgot"||mode==="reset"?<KeyRound size={23}/>:<LockKeyhole size={23}/>}</span><h2>{title}</h2>
    <p>{portal?"Sign in with the account provided by your institution.":mode==="forgot"?"Enter your institutional email to receive a recovery link.":"Choose a password with at least 12 characters."}</p>
    <form action={submit} className="auth-fields">
      {mode!=="reset"&&<label>Email address<span className="icon-field"><Mail size={17}/><input name="email" type="email" placeholder="name@institution.edu" autoComplete="email" required/></span></label>}
      {mode!=="forgot"&&<label>Password<span className="icon-field"><LockKeyhole size={17}/><input name="password" type={visible?"text":"password"} autoComplete={mode==="reset"?"new-password":"current-password"} placeholder={mode==="reset"?"At least 12 characters":"Enter your password"} required minLength={mode==="reset"?12:undefined}/><button type="button" onClick={()=>setVisible(!visible)} aria-label={visible?"Hide password":"Show password"}>{visible?<EyeOff size={17}/>:<Eye size={17}/>}</button></span></label>}
      {mode==="reset"&&<label>Confirm password<input name="confirm" type={visible?"text":"password"} autoComplete="new-password" required minLength={12}/></label>}
      {portal&&<Link className="forgot-link" href="/forgot-password">Forgot password?</Link>}
      {(result.error||invalid)&&<div className="notice error" role="alert">{result.error??"That link has expired or was already used. Request a new link below."}</div>}
      {result.notice&&<div className="notice success" role="status">{result.notice}</div>}
      {!configured&&<div className="notice">Institutional sign-in requires Supabase configuration.</div>}
      <Button type="submit" size="large" disabled={pending||!configured}>{pending?"Please wait…":mode==="forgot"?"Send reset link":mode==="reset"?"Update password":"Sign in"}</Button>
    </form>
    {portal&&<div className="auth-links"><Link href={mode==="admin"?"/staff/login":"/admin/login"}>{mode==="admin"?"Go to staff login":"Go to administrator login"}</Link><Link href={"/demo/"+mode+"/dashboard"}><Sparkles size={14}/> Explore the demo</Link></div>}
  </div></section></main>;
}


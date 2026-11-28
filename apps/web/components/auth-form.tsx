"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { BookOpenCheck, Eye, EyeOff, KeyRound, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { Brand } from "./brand";
import { Button } from "./ui/button";
import { requestReset, setFirstTimePassword, setPassword, signIn } from "@/app/auth/actions";
import type { Role } from "@/lib/catalog";

export function AuthForm({mode,configured,invalid=false}:{mode:Role|"forgot"|"reset"|"set-password";configured:boolean;invalid?:boolean}){
  const portal=mode==="admin"||mode==="staff";
  const action=portal?signIn.bind(null,mode):mode==="forgot"?requestReset:mode==="set-password"?setFirstTimePassword:setPassword;
  const [result,submit,pending]=useActionState(action,{});
  const [visible,setVisible]=useState(false);
  const title=mode==="admin"?"Administrator login":mode==="staff"?"Staff login":mode==="forgot"?"Reset your password":mode==="set-password"?"Set your permanent password":"Set a new password";
  return <main className="auth-page"><aside className="auth-aside"><Brand dark/><div className="auth-aside-content"><span className="auth-icon"><BookOpenCheck size={28}/></span><h1>Academic progress starts with a clear view.</h1><p>Access your institution’s academic records, teaching tools, and reporting workspace.</p></div><span className="auth-aside-footer"><ShieldCheck size={16}/> Secure institution access</span></aside>
  <section className="auth-content"><Link className="back-link" href="/">Back to home</Link><div className="auth-panel"><span className="feature-icon purple">{mode==="forgot"||mode==="reset"||mode==="set-password"?<KeyRound size={23}/>:<LockKeyhole size={23}/>}</span><h2>{title}</h2>
    <p>{portal?"Sign in with the account provided by your institution.":mode==="forgot"?"Enter your institutional email to receive a recovery link.":mode==="set-password"?"You logged in with a temporary password. Choose a new secure permanent password with at least 8 characters to continue.":"Choose a password with at least 12 characters."}</p>
    <form action={submit} className="auth-fields">
      {mode!=="reset"&&mode!=="set-password"&&<label>Email address<span className="icon-field"><Mail size={17}/><input name="email" type="email" placeholder="name@institution.edu" autoComplete="email" required/></span></label>}
      {mode!=="forgot"&&<label>{mode==="set-password"?"New password":"Password"}<span className="icon-field"><LockKeyhole size={17}/><input name="password" type={visible?"text":"password"} autoComplete={mode==="reset"||mode==="set-password"?"new-password":"current-password"} placeholder={mode==="set-password"?"At least 8 characters":mode==="reset"?"At least 12 characters":"Enter your password"} required minLength={mode==="set-password"?8:mode==="reset"?12:undefined}/><button type="button" onClick={()=>setVisible(!visible)} aria-label={visible?"Hide password":"Show password"}>{visible?<EyeOff size={17}/>:<Eye size={17}/>}</button></span></label>}
      {(mode==="reset"||mode==="set-password")&&<label>Confirm new password<span className="icon-field"><LockKeyhole size={17}/><input name="confirm" type={visible?"text":"password"} autoComplete="new-password" placeholder="Confirm your new password" required minLength={mode==="set-password"?8:12}/></span></label>}
      {portal&&<Link className="forgot-link" href="/forgot-password">Forgot password?</Link>}
      {(result.error||invalid)&&<div className="notice error" role="alert">{result.error??"That link has expired or was already used. Request a new link below."}</div>}
      {result.notice&&<div className="notice success" role="status">{result.notice}</div>}
      {!configured&&<div className="notice">Institutional sign-in requires Supabase configuration.</div>}
      <Button type="submit" size="large" disabled={pending||!configured}>{pending?"Please wait…":mode==="forgot"?"Send reset link":mode==="set-password"?"Save password & continue":mode==="reset"?"Update password":"Sign in"}</Button>
    </form>
    {portal&&<div className="auth-links"><Link href={mode==="admin"?"/staff/login":"/admin/login"}>{mode==="admin"?"Go to staff login":"Go to administrator login"}</Link></div>}
  </div></section></main>;
}


"use client";
import Link from "next/link";
export default function ErrorPage({reset}:{reset:()=>void}){return <main className="public-container info-page"><h1>Academic records are unavailable</h1><p>Check your connection or ask your institution to verify the academic database setup.</p><div className="row-field"><button className="button button-primary" onClick={reset}>Try again</button><Link className="button button-secondary" href="/">Return home</Link></div></main>;}

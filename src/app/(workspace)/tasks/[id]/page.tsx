"use client";
import {use,useEffect,useRef,useState} from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import type {publicTask} from "@/lib/operations/domain";
import s from "@/components/product/workspace.module.css";
type Task=ReturnType<typeof publicTask>;
export default function TaskPage({params}:{params:Promise<{id:string}>}){
 const {id}=use(params);
 const [task,setTask]=useState<Task|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0);
 const pending=useRef(false);
 useEffect(()=>{
  const controller=new AbortController();
  const load=async()=>{try{const response=await fetch(`/api/v1/tasks/${encodeURIComponent(id)}`,{signal:controller.signal});const result=await response.json();if(!response.ok)throw new Error(result.error??"Task unavailable.");setTask(result);setError("");}catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Could not load task.");}};
  void load();const timer=setInterval(()=>{if(!document.hidden&&!pending.current)void load();},10000);
  return()=>{controller.abort();clearInterval(timer);};
 },[id,retry]);
 async function decide(decision:"accept"|"reject"|"cancel"){
  if(!task||pending.current)return;
  pending.current=true;setBusy(true);setError("");
  try{const response=await fetch(`/api/v1/tasks/${encodeURIComponent(id)}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({decision,reviewToken:task.reviewToken})});const result=await response.json();if(!response.ok)throw new Error(result.error??"Could not save your decision.");setTask(result);}
  catch(e){setError(e instanceof Error?e.message:"Could not save your decision.");}
  finally{pending.current=false;setBusy(false);}
 }
 return <div className={s.page}>
  <Link href="/today">Back to today</Link>
  {error&&<p role="alert">{error} <button className={s.secondary} onClick={()=>setRetry(n=>n+1)}>Try again</button></p>}
  {!task&&!error&&<p role="status">Opening your task…</p>}
  {task&&<>
   <header className={s.head}><div><h1>{task.title}</h1><p>{task.status.replaceAll("_"," ")}</p></div></header>
   <p>Quoted task price: {new Intl.NumberFormat("en",{style:"currency",currency:"EUR"}).format(task.quote.totalCents/100)}. No automatic payment is collected from this review.</p>
   {task.error&&<p role="alert">{task.error}</p>}
   {task.output&&<article><h2>{task.output.title}</h2><ReactMarkdown>{task.output.body}</ReactMarkdown>
    <h3>Sources</h3>{task.output.citations.map((citation,index)=><blockquote key={index}><p>{citation.excerpt}</p><footer>{citation.sourceName} · {citation.locator}</footer></blockquote>)}
    {!!task.output.unknowns.length&&<><h3>Still needs your input</h3><ul>{task.output.unknowns.map((item,index)=><li key={index}>{item}</li>)}</ul></>}
   </article>}
   {task.status==="needs_review"&&<div><button className={s.primary} disabled={busy} onClick={()=>void decide("accept")}>Accept this result</button>{" "}<button className={s.secondary} disabled={busy} onClick={()=>void decide("reject")}>Reject result</button></div>}
   {["queued","running","needs_review"].includes(task.status)&&<p><button className={s.secondary} disabled={busy} onClick={()=>void decide("cancel")}>Cancel task</button></p>}
   {task.status==="completed"&&<p>Accepted and recorded in your daily recap.</p>}
  </>}
 </div>;
}

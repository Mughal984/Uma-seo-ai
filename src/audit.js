import * as cheerio from "cheerio";
import {normalizeUrl,checkPublicHost} from "./security.js";
const MAX=Math.min(20,Math.max(1,Number(process.env.CRAWL_MAX_PAGES||10)));
const TIMEOUT=Number(process.env.CRAWL_TIMEOUT_MS||10000);
async function fetchPage(url){
 await checkPublicHost(url);const c=new AbortController();const timer=setTimeout(()=>c.abort(),TIMEOUT);
 try{
  const r=await fetch(url,{signal:c.signal,redirect:"manual",headers:{"user-agent":"UmarSEOAI/1.0 (site owner initiated audit)"}});
  if([301,302,303,307,308].includes(r.status)){const loc=r.headers.get("location");if(!loc)throw new Error("Redirect destination missing");const target=new URL(loc,url);if(target.hostname!==new URL(url).hostname)throw new Error("Cross-domain redirect blocked");return {status:r.status,redirect:target.toString()};}
  const type=r.headers.get("content-type")||"";if(!type.includes("text/html"))return {status:r.status,html:""};
  if(Number(r.headers.get("content-length")||0)>2000000)throw new Error("Page too large");
  const html=await r.text();if(html.length>2000000)throw new Error("Page too large");return {status:r.status,html};
 }finally{clearTimeout(timer)}
}
export async function auditWebsite(input){
 const start=normalizeUrl(input),origin=new URL(start).origin,queue=[start],seen=new Set(),pages=[],issues=[];
 while(queue.length&&pages.length<MAX){
  const url=queue.shift();if(seen.has(url))continue;seen.add(url);let f;
  try{f=await fetchPage(url)}catch(e){issues.push({severity:"warning",page:url,issue:"Fetch failed: "+e.message});continue}
  if(f.redirect){issues.push({severity:"info",page:url,issue:"Redirects to "+f.redirect});continue}
  const p={url,status:f.status,title:"",description:"",h1Count:0,noindex:false,imagesMissingAlt:0};
  if(f.html){
   const $=cheerio.load(f.html);p.title=$("title").first().text().trim();p.description=$('meta[name="description" i]').attr("content")||"";
   p.h1Count=$("h1").length;p.noindex=/noindex/i.test($('meta[name="robots" i]').attr("content")||"");
   p.imagesMissingAlt=$("img").filter((_,e)=>!$(e).attr("alt")).length;
   $("a[href]").each((_,e)=>{try{const u=new URL($(e).attr("href"),url);if(u.origin===origin&&["http:","https:"].includes(u.protocol)){u.hash="";const v=u.toString().replace(/\/$/,"");if(!seen.has(v)&&queue.length<MAX*3)queue.push(v)}}catch{}});
   if(!p.title)issues.push({severity:"high",page:url,issue:"Missing page title"});
   if(!p.description)issues.push({severity:"medium",page:url,issue:"Missing meta description"});
   if(!p.h1Count)issues.push({severity:"medium",page:url,issue:"Missing H1 heading"});
   if(p.h1Count>1)issues.push({severity:"low",page:url,issue:"Multiple H1 headings ("+p.h1Count+")"});
   if(p.noindex)issues.push({severity:"high",page:url,issue:"Page has noindex directive"});
   if(p.imagesMissingAlt)issues.push({severity:"low",page:url,issue:p.imagesMissingAlt+" image(s) missing alt text"});
  }else issues.push({severity:f.status>=400?"high":"info",page:url,issue:"Non-HTML response"});
  if(f.status>=400)issues.push({severity:"high",page:url,issue:"HTTP status "+f.status});
  pages.push(p);
 }
 const counts={high:0,medium:0,low:0,warning:0,info:0};for(const i of issues)counts[i.severity]=(counts[i.severity]||0)+1;
 return {website:start,scannedAt:new Date().toISOString(),pagesScanned:pages.length,pageLimit:MAX,counts,pages,issues};
}

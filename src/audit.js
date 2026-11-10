import * as cheerio from "cheerio";
import {normalizeUrl,safeFetch} from "./security.js";
import {extractKeywordSignals} from "./keyword-research.js";
import {readTextLimited} from "./http-utils.js";
const MAX=Math.min(20,Math.max(1,Number(process.env.CRAWL_MAX_PAGES||10)));
const TIMEOUT=Number(process.env.CRAWL_TIMEOUT_MS||10000);
const MAX_BYTES=2000000;
async function fetchPage(url){
 const c=new AbortController();const timer=setTimeout(()=>c.abort(),TIMEOUT);
 try{
  const r=await safeFetch(url,{signal:c.signal,headers:{"user-agent":"UmarSEOAI/1.0 (site owner initiated audit)"}});
  if([301,302,303,307,308].includes(r.status)){const loc=r.headers.get("location");if(!loc)throw new Error("Redirect destination missing");const target=new URL(loc,url);if(target.hostname!==new URL(url).hostname)throw new Error("Cross-domain redirect blocked");return {status:r.status,redirect:target.toString()};}
  const type=r.headers.get("content-type")||"";if(!type.toLowerCase().includes("text/html"))return {status:r.status,html:""};
  if(Number(r.headers.get("content-length")||0)>MAX_BYTES)throw new Error("Page too large");
  const html=await readTextLimited(r,MAX_BYTES);return {status:r.status,html};
 }finally{clearTimeout(timer)}
}
async function fetchText(url){
 await checkPublicHost(url);const c=new AbortController();const timer=setTimeout(()=>c.abort(),TIMEOUT);
 try{const r=await fetch(url,{signal:c.signal,redirect:"manual",headers:{"user-agent":"UmarSEOAI/1.0 (site owner initiated audit)"}});if(r.status>=300&&r.status<400)return {status:r.status,redirect:r.headers.get("location")||""};const body=await readTextLimited(r,1000000);return {status:r.status,body}}finally{clearTimeout(timer)}
}
function add(issues,severity,page,issue,details={}){issues.push({severity,page,issue,...details})}
export async function auditWebsite(input){
 const start=normalizeUrl(input),origin=new URL(start).origin,queue=[start],seen=new Set(),pages=[],issues=[];
 let robots={status:"not_checked",sitemapUrls:[]},sitemap={status:"not_checked",url:new URL("/sitemap.xml",origin).toString(),urlCount:null};
 try{const r=await fetchText(new URL("/robots.txt",origin).toString());robots.status=r.status;if(r.status===200){for(const line of r.body.split(/\r?\n/)){const m=line.match(/^\s*sitemap:\s*(\S+)/i);if(m)robots.sitemapUrls.push(m[1])}}else add(issues,"medium",robots.url,"robots.txt is not available (HTTP "+r.status+")")}catch(e){robots.status="fetch_failed";add(issues,"warning",new URL("/robots.txt",origin).toString(),"Could not inspect robots.txt: "+e.message)}
 const sitemapUrl=robots.sitemapUrls[0]||sitemap.url;sitemap.url=sitemapUrl;
 try{const r=await fetchText(sitemapUrl);sitemap.status=r.status;if(r.status===200){const matches=r.body.match(/<loc>\s*[^<]+\s*<\/loc>/gi)||[];sitemap.urlCount=matches.length;if(!matches.length)add(issues,"medium",sitemapUrl,"Sitemap returned no readable <loc> URLs")}else add(issues,"medium",sitemapUrl,"Sitemap is not available (HTTP "+r.status+")")}catch(e){sitemap.status="fetch_failed";add(issues,"warning",sitemapUrl,"Could not inspect sitemap: "+e.message)}
 while(queue.length&&pages.length<MAX){
  const url=queue.shift();if(seen.has(url))continue;seen.add(url);let f;
  try{f=await fetchPage(url)}catch(e){add(issues,"warning",url,"Fetch failed: "+e.message);continue}
  if(f.redirect){add(issues,"info",url,"Redirects to "+f.redirect);continue}
  const p={url,status:f.status,title:"",description:"",h1Count:0,noindex:false,imagesMissingAlt:0,canonical:"",language:"",hasViewport:false,openGraphTitle:false,openGraphDescription:false,structuredDataBlocks:0,wordCount:0,keywordSignals:[]};
  if(f.html){
   const $=cheerio.load(f.html);p.title=$("title").first().text().trim();p.description=$('meta[name="description" i]').attr("content")||"";
   p.h1Count=$("h1").length;p.noindex=/noindex/i.test($('meta[name="robots" i]').attr("content")||"");
   p.imagesMissingAlt=$("img").filter((_,e)=>!$(e).attr("alt")).length;
   p.canonical=$('link[rel~="canonical" i]').first().attr("href")||"";
   p.language=String($("html").attr("lang")||"").trim();
   p.hasViewport=$('meta[name="viewport" i]').length>0;
   p.openGraphTitle=$('meta[property="og:title"]').length>0;
   p.openGraphDescription=$('meta[property="og:description"]').length>0;
   p.structuredDataBlocks=$('script[type="application/ld+json"]').length;
   const bodyText=$("body").text().replace(/\s+/g," ").trim();
   p.wordCount=bodyText.split(" ").filter(Boolean).length;
   p.keywordSignals=extractKeywordSignals({title:p.title,description:p.description,headings:$("h1,h2,h3").map((_,e)=>$(e).text()).get(),bodyText:bodyText.slice(0,20000)});
   if(p.canonical){try{p.canonical=new URL(p.canonical,url).toString()}catch{add(issues,"medium",url,"Canonical URL is malformed",{canonical:p.canonical});p.canonical=""}}
   $("a[href]").each((_,e)=>{try{const u=new URL($(e).attr("href"),url);if(u.origin===origin&&["http:","https:"].includes(u.protocol)){u.hash="";const v=u.toString().replace(/\/$/,"");if(!seen.has(v)&&queue.length<MAX*3)queue.push(v)}}catch{}});
   if(!p.title)add(issues,"high",url,"Missing page title");
   else if(p.title.length>60)add(issues,"low",url,"Page title is longer than the common 50–60 character display range",{observedLength:p.title.length});
   if(!p.description)add(issues,"medium",url,"Missing meta description");
   else if(p.description.length>160)add(issues,"low",url,"Meta description is longer than the common 150–160 character display range",{observedLength:p.description.length});
   if(!p.h1Count)add(issues,"medium",url,"Missing H1 heading");
   if(p.h1Count>1)add(issues,"low",url,"Multiple H1 headings ("+p.h1Count+")");
   if(p.noindex)add(issues,"high",url,"Page has noindex directive");
   if(p.imagesMissingAlt)add(issues,"low",url,p.imagesMissingAlt+" image(s) missing alt text");
   if(!p.canonical)add(issues,"medium",url,"Missing canonical link element");
   else if(new URL(p.canonical).origin!==origin)add(issues,"high",url,"Canonical points to a different origin",{canonical:p.canonical});
   if(!p.language)add(issues,"low",url,"HTML lang attribute is missing");
   if(!p.hasViewport)add(issues,"medium",url,"Missing mobile viewport meta tag");
   if(!p.openGraphTitle||!p.openGraphDescription)add(issues,"low",url,"Open Graph title or description is missing");
   if(!p.structuredDataBlocks)add(issues,"low",url,"No JSON-LD structured data detected (may be unnecessary for this page)");
   if(p.wordCount<100)add(issues,"info",url,"Page has fewer than 100 visible body words; review whether the page fully satisfies its purpose",{wordCount:p.wordCount});
  }else add(issues,f.status>=400?"high":"info",url,"Non-HTML response");
  if(f.status>=400)add(issues,"high",url,"HTTP status "+f.status);
  pages.push(p);
 }
 const counts={high:0,medium:0,low:0,warning:0,info:0};for(const i of issues)counts[i.severity]=(counts[i.severity]||0)+1;
 return {website:start,scannedAt:new Date().toISOString(),pagesScanned:pages.length,pageLimit:MAX,counts,robots,sitemap,pages,issues,limitations:["Crawl is limited to the configured page limit and same-domain links.","Keyword volume, rankings, competitor data, Core Web Vitals field data, and Google Search Console data are not measured by this crawler.","Structured data presence is detected; schema validity is not fully validated.","Page word count is a rough visible-text signal, not a content-quality score."]};
}

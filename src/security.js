import dns from "node:dns/promises";
import net from "node:net";
import http from "node:http";
import https from "node:https";
import { Readable } from "node:stream";

export function normalizeUrl(value){
 let u;try{u=new URL(value)}catch{throw new Error("Enter a valid website URL.")};
 if(!["http:","https:"].includes(u.protocol)||u.username||u.password)throw new Error("Only public HTTP/HTTPS website URLs are allowed.");
 u.hash="";return u.toString().replace(/\/$/,"");
}
function privateIp(ip){
 if(net.isIPv4(ip)){
  const p=ip.split(".").map(Number),a=p[0],b=p[1],c=p[2];
  return a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===0||b===168||b===88&&c===99||b===0&&c===2))||(a===198&&(b===18||b===19||b===51&&c===100))||(a===203&&b===0&&c===113)||a>=240;
 }
 const s=ip.toLowerCase();
 return s==="::"||s==="::1"||s.startsWith("::ffff:")||s.startsWith("fc")||s.startsWith("fd")||/^fe[89ab]/.test(s)||s.startsWith("ff")||s.startsWith("2001:db8:");
}
export async function resolvePublicAddress(host, lookup=dns.lookup){
 const hostname=String(host||"").toLowerCase().replace(/^\[|\]$/g,"");
 if(hostname==="localhost"||hostname.endsWith(".localhost")||hostname.endsWith(".local"))throw new Error("Local/private hosts are blocked.");
 if(net.isIP(hostname)){if(privateIp(hostname))throw new Error("Private IP addresses are blocked.");return {address:hostname,family:net.isIP(hostname)};}
 const records=await lookup(hostname,{all:true,verbatim:true});
 if(!records.length||records.some(record=>privateIp(record.address)))throw new Error("Website resolves to a private/restricted IP.");
 return records[0];
}
export function createPinnedLookup(record){
 return (hostname,options,callback)=>{
  if(typeof options==="function"){callback=options;options={};}
  if(options?.all)return callback(null,[{address:record.address,family:record.family}]);
  callback(null,record.address,record.family);
 };
}
/** Fetch only after resolving and pinning a validated public IP for this request. */
export async function safeFetch(value,{signal,headers={}}={}){
 const target=new URL(value);
 if(!["http:","https:"].includes(target.protocol))throw new Error("Only HTTP/HTTPS requests are allowed.");
 const hostname=target.hostname.toLowerCase().replace(/^\[|\]$/g,"");
 const resolved=await resolvePublicAddress(hostname);
 const transport=target.protocol==="https:"?https:http;
 return new Promise((resolve,reject)=>{
  const request=transport.request(target,{method:"GET",headers,signal,lookup:createPinnedLookup(resolved),servername:net.isIP(hostname)?undefined:hostname},incoming=>{
   const responseHeaders=new Headers();
   for(const [name,value] of Object.entries(incoming.headers)){
    if(value===undefined)continue;
    if(Array.isArray(value)){for(const item of value)responseHeaders.append(name,String(item));}
    else responseHeaders.set(name,String(value));
   }
   const status=incoming.statusCode||502;
   const body=[204,205,304].includes(status)?null:Readable.toWeb(incoming);
   resolve(new Response(body,{status,headers:responseHeaders}));
  });
  request.on("error",reject);
  request.end();
 });
}
export async function checkPublicHost(value){
 const host=new URL(value).hostname;
 await resolvePublicAddress(host);
}

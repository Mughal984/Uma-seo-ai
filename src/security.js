import dns from "node:dns/promises";
import net from "node:net";
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
export async function checkPublicHost(value){
 const host=new URL(value).hostname.toLowerCase().replace(/^\[|\]$/g,"");
 if(host==="localhost"||host.endsWith(".localhost")||host.endsWith(".local"))throw new Error("Local/private hosts are blocked.");
 if(net.isIP(host)){if(privateIp(host))throw new Error("Private IP addresses are blocked.");return;}
 const records=await dns.lookup(host,{all:true});
 if(!records.length||records.some(r=>privateIp(r.address)))throw new Error("Website resolves to a private/restricted IP.");
}

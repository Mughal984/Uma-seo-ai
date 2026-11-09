import dns from "node:dns/promises";
import net from "node:net";
export function normalizeUrl(value){
 let u;try{u=new URL(value)}catch{throw new Error("Enter a valid website URL.")};
 if(!["http:","https:"].includes(u.protocol)||u.username||u.password)throw new Error("Only public HTTP/HTTPS website URLs are allowed.");
 u.hash="";return u.toString().replace(/\/$/,"");
}
function privateIp(ip){
 if(net.isIPv4(ip)){const p=ip.split(".").map(Number);return p[0]===10||p[0]===127||p[0]===0||p[0]>=224||(p[0]===169&&p[1]===254)||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&p[1]===168)}
 const s=ip.toLowerCase();return s==="::"||s==="::1"||s.startsWith("fc")||s.startsWith("fd")||s.startsWith("fe8")||s.startsWith("fe9")||s.startsWith("fea")||s.startsWith("feb");
}
export async function checkPublicHost(value){
 const host=new URL(value).hostname.toLowerCase();
 if(host==="localhost"||host.endsWith(".localhost")||host.endsWith(".local"))throw new Error("Local/private hosts are blocked.");
 if(net.isIP(host)){if(privateIp(host))throw new Error("Private IP addresses are blocked.");return;}
 const records=await dns.lookup(host,{all:true});
 if(!records.length||records.some(r=>privateIp(r.address)))throw new Error("Website resolves to a private/restricted IP.");
}

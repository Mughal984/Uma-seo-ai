import "dotenv/config";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {run,get,all} from "./db.js";
import {normalizeUrl} from "./security.js";
import {auditWebsite} from "./audit.js";
import {runSeoAgentV2} from "./seo-agent-v2.js";
const app=express(),PORT=Number(process.env.PORT||3000),SECRET=process.env.JWT_SECRET;
if(!SECRET||SECRET.length<32){console.error("Set JWT_SECRET to at least 32 characters in .env");process.exit(1)}
app.use(helmet({contentSecurityPolicy:false}));app.use(express.json({limit:"100kb"}));app.use(express.static("public"));
app.use("/api",rateLimit({windowMs:900000,limit:100,standardHeaders:true,legacyHeaders:false}));
function auth(req,res,next){try{req.user=jwt.verify((req.headers.authorization||"").replace(/^Bearer\\s+/i,""),SECRET,{issuer:"umar-seo-ai"});next()}catch{res.status(401).json({error:"Please login again."})}}
const validEmail=s=>typeof s==="string"&&/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(s)&&s.length<=254;
app.post("/api/auth/register",async(req,res)=>{try{const email=String(req.body.email||"").trim().toLowerCase(),password=String(req.body.password||"");if(!validEmail(email))return res.status(400).json({error:"Valid email required."});if(password.length<10||password.length>128)return res.status(400).json({error:"Password must be 10–128 characters."});const hash=await bcrypt.hash(password,12),u=await run("INSERT INTO users(email,password_hash) VALUES(?,?)",[email,hash]);const token=jwt.sign({id:u.id,email},SECRET,{expiresIn:"7d",issuer:"umar-seo-ai"});res.status(201).json({token,user:{id:u.id,email}})}catch(e){res.status(e.message.includes("UNIQUE")?409:500).json({error:e.message.includes("UNIQUE")?"Email already registered.":"Registration failed."})}});
app.post("/api/auth/login",async(req,res)=>{try{const email=String(req.body.email||"").trim().toLowerCase(),u=await get("SELECT * FROM users WHERE email=?",[email]);if(!u||!(await bcrypt.compare(String(req.body.password||""),u.password_hash)))return res.status(401).json({error:"Email or password incorrect."});const token=jwt.sign({id:u.id,email},SECRET,{expiresIn:"7d",issuer:"umar-seo-ai"});res.json({token,user:{id:u.id,email}})}catch{res.status(500).json({error:"Login failed."})}});
app.get("/api/me",auth,(req,res)=>res.json({id:req.user.id,email:req.user.email}));
app.get("/api/projects",auth,async(req,res)=>res.json({projects:await all("SELECT id,name,url,created_at FROM projects WHERE user_id=? ORDER BY id DESC",[req.user.id])}));
app.post("/api/projects",auth,async(req,res)=>{try{const name=String(req.body.name||"").trim().slice(0,80),url=normalizeUrl(String(req.body.url||""));if(!name)return res.status(400).json({error:"Project name required."});const r=await run("INSERT INTO projects(user_id,name,url) VALUES(?,?,?)",[req.user.id,name,url]);res.status(201).json({project:{id:r.id,name,url}})}catch(e){res.status(400).json({error:e.message})}});
app.post("/api/projects/:id/audit",auth,async(req,res)=>{try{const p=await get("SELECT * FROM projects WHERE id=? AND user_id=?",[req.params.id,req.user.id]);if(!p)return res.status(404).json({error:"Project not found."});const audit=await auditWebsite(p.url);const seoPlan=runSeoAgentV2(audit);await run("INSERT INTO audits(project_id,result_json) VALUES(?,?)",[p.id,JSON.stringify({...audit,seoPlan})]);res.json({audit,seoPlan})}catch(e){res.status(400).json({error:e.message||"Audit failed."})}});
app.get("/api/projects/:id/audits",auth,async(req,res)=>{const p=await get("SELECT id FROM projects WHERE id=? AND user_id=?",[req.params.id,req.user.id]);if(!p)return res.status(404).json({error:"Project not found."});const rows=await all("SELECT id,result_json,created_at FROM audits WHERE project_id=? ORDER BY id DESC LIMIT 10",[p.id]);res.json({audits:rows.map(x=>({id:x.id,createdAt:x.created_at,result:JSON.parse(x.result_json)}))})});
app.get("/api/health",(req,res)=>res.json({status:"ok",product:"Umar SEO AI"}));
app.listen(PORT,()=>console.log("Umar SEO AI running at http://localhost:"+PORT));

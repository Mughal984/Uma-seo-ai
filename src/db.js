import fs from "node:fs";
import path from "node:path";
import sqlite3 from "sqlite3";
const file = process.env.DATABASE_FILE || "./data/umar-seo-ai.sqlite";
fs.mkdirSync(path.dirname(path.resolve(file)), {recursive:true});
export const db = new sqlite3.Database(file);
export const run = (sql, params=[]) => new Promise((resolve,reject)=>db.run(sql,params,function(e){e?reject(e):resolve({id:this.lastID,changes:this.changes})}));
export const get = (sql, params=[]) => new Promise((resolve,reject)=>db.get(sql,params,(e,row)=>e?reject(e):resolve(row)));
export const all = (sql, params=[]) => new Promise((resolve,reject)=>db.all(sql,params,(e,rows)=>e?reject(e):resolve(rows)));
await new Promise((resolve,reject)=>db.exec(`
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS projects(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,url TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS audits(id INTEGER PRIMARY KEY,project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,result_json TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
`,e=>e?reject(e):resolve()));

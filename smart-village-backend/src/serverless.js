import {sql} from './postgres.js';
import {createHash} from 'node:crypto';
import {readConfig} from './config.js';
import {connectDatabase} from './db.js';
import {createApp} from './app.js';
import * as models from './models.js';
let ready;
export default async function handler(req,res){
 try{
  if(!process.env.DATABASE_URL)throw new Error('Set DATABASE_URL to your Neon pooled PostgreSQL connection string.');
  ready ||= (async()=>{const config={...readConfig(),SERVERLESS:true,LOCAL_AI:true,CRON_SECRET:process.env.CRON_SECRET};await connectDatabase(config.DATABASE_URL);await Promise.all(Object.values(models).map(m=>m.init()));return createApp(config);})();
  const app=await ready;
  const url=new URL(req.url,'https://local.invalid');const route=url.searchParams.get('__route');
  if(route){url.searchParams.delete('__route');req.url='/api/'+route+(url.search?'?'+url.searchParams.toString():'');delete req.query?.__route;}
  if(!req.url.startsWith('/api/cron/')){
   const auth=req.url.startsWith('/api/v1/auth/'),duration=auth?900000:60000,limit=auth?50:200,now=Date.now();
   const ip=String(req.headers['x-real-ip']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();
   const key=createHash('sha256').update((auth?'auth:':'api:')+ip+':'+Math.floor(now/duration)).digest('hex');
   const result=await sql('INSERT INTO village_rate_limits(key,count,expires_at) VALUES($1,1,$2) ON CONFLICT(key) DO UPDATE SET count=village_rate_limits.count+1 RETURNING count',[key,new Date(now+duration)]);
   if(result.rows[0].count>limit){res.statusCode=429;res.setHeader('Content-Type','application/json');res.setHeader('Retry-After',String(Math.ceil(duration/1000)));return res.end(JSON.stringify({error:{message:'Too many requests; try again later.'}}));}
  }
  return app(req,res);
 }catch(error){ready=null;console.error('Serverless startup failed:',error.name);res.statusCode=503;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:{code:'SERVICE_UNAVAILABLE',message:'Server configuration or database connection is unavailable.'}}));}
}

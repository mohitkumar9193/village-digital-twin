import booleanIntersects from '@turf/boolean-intersects';
import {Pool} from 'pg';
import {AsyncLocalStorage} from 'node:async_hooks';
import mongoose from 'mongoose';
const context=new AsyncLocalStorage();let pool,ready;
export async function connectPostgres(uri){
 if(!pool){if(process.env.PG_TEST==='true'){const {PGlite}=await import('@electric-sql/pglite');pool=new PGlite();}else pool=new Pool({connectionString:uri,max:3,connectionTimeoutMillis:10000,idleTimeoutMillis:10000});}
 ready ||= (async()=>{for(const statement of ["CREATE TABLE IF NOT EXISTS village_records(kind text NOT NULL,id text NOT NULL CHECK(id ~ '^[a-f0-9]{24}$'),data jsonb NOT NULL,PRIMARY KEY(kind,id))","CREATE INDEX IF NOT EXISTS village_scope ON village_records(kind,(data->>'villageId'))","CREATE INDEX IF NOT EXISTS complaint_status ON village_records(kind,(data->>'status'))","CREATE TABLE IF NOT EXISTS village_images(id text PRIMARY KEY,image bytea NOT NULL)","CREATE TABLE IF NOT EXISTS village_rate_limits(key text PRIMARY KEY,count integer NOT NULL,expires_at timestamptz NOT NULL)"])await pool.query(statement);})();
 try{await ready;}catch(error){ready=null;throw error;}
}
export async function sql(text,params=[]){if(!pool)await connectPostgres(process.env.DATABASE_URL);return (context.getStore()||pool).query(text,params);}
export async function transaction(fn){
 if(context.getStore())return fn({});
 if(!pool.connect&&pool.transaction)return pool.transaction(client=>context.run(client,()=>fn({})));
 for(let attempt=0;attempt<3;attempt++){
  const client=pool.connect?await pool.connect():pool;
  try{await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');const value=await context.run(client,()=>fn({}));await client.query('COMMIT');return value;}catch(e){await client.query('ROLLBACK');if(['40001','40P01'].includes(e.code)&&attempt<2)continue;throw e;}finally{client.release?.();}
 }
}
export async function disconnectPostgres(){await (pool?.end?pool.end():pool?.close?.());pool=null;ready=null;}
const value=v=>JSON.stringify(v===undefined?null:v);
function where(filter,params){return Object.entries(filter||{}).map(([key,v])=>{
 if(key==='$or'||key==='$and')return '('+v.map(f=>where(f,params)).join(key==='$or'?' OR ':' AND ')+')';
 if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key))throw new Error('Invalid query field');
 const field=`COALESCE(data->'${key}','null'::jsonb)`;
 const param=x=>{params.push(value(x));return `$${params.length}::jsonb`;};
 if(v&&typeof v==='object'&&!Array.isArray(v)&&!(v instanceof Date)&&!v._bsontype){return Object.entries(v).map(([op,x])=>{
  if(op==='$geoIntersects')return 'TRUE';
  if(op==='$exists')return x?`data ? '${key}'`:`NOT (data ? '${key}')`;
  if(op==='$in'||op==='$nin')return '('+(x.length?x.map(y=>`${field} ${op==='$in'?'=':'<>'} ${param(y)}`).join(op==='$in'?' OR ':' AND '):op==='$in'?'FALSE':'TRUE')+')';
  const operators={$ne:'<>',$gt:'>',$gte:'>=',$lt:'<',$lte:'<='};if(!operators[op])throw new Error('Unsupported query operator '+op);return `${field} ${operators[op]} ${param(x)}`;
 }).join(' AND ');}
 return key==='categories'?`(data->'categories' @> jsonb_build_array(${param(v)}))`:`${field} = ${param(v)}`;
}).join(' AND ')||'TRUE';}
function geoMatches(data,filter){return Object.entries(filter).every(([key,v])=>{
 if(key==='$or')return v.some(f=>geoMatches(data,f));if(key==='$and')return v.every(f=>geoMatches(data,f));
 if(!v?.$geoIntersects)return true;const a=data[key],b=v.$geoIntersects.$geometry;if(!a)return false;
 
 return booleanIntersects(a,b);
});}
const models=new Map();
function expr(v,row){
 if(typeof v==='string'&&v.startsWith('$')){let current=row;for(const part of v.slice(1).split('.'))current=Array.isArray(current)?current.map(x=>x?.[part]):current?.[part];return current;}
 if(v===null||typeof v!=='object')return v;if(Array.isArray(v))return v.map(x=>expr(x,row));
 const [[op,x]]=Object.entries(v);const args=()=>x.map(a=>expr(a,row));
 if(op==='$cond'){const [condition,yes,no]=x;return expr(condition,row)?expr(yes,row):expr(no,row);}
 if(op==='$in'){const [a,b]=args();return b.includes(a);}
 if(op==='$and')return args().every(Boolean);
 if(op==='$ne'){const [a,b]=args();return (a??null)!==(b??null);}
 if(op==='$arrayElemAt'){const [a,b]=args();return a?.[b];}
 if(op==='$ifNull'){const [a,b]=args();return a??b;}
 if(op==='$subtract'){const [a,b]=args();return new Date(a)-new Date(b);}
 if(op==='$divide'){const [a,b]=args();return a/b;}
 if(op==='$floor')return Math.floor(expr(x,row));
 if(op==='$dateTrunc'){const date=new Date(expr(x.date,row)),offset=19800000,local=new Date(date.getTime()+offset);if(x.unit==='month')local.setUTCDate(1);else local.setUTCDate(local.getUTCDate()-(local.getUTCDay()+6)%7);local.setUTCHours(0,0,0,0);return new Date(local-offset);}
 return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,expr(x,row)]));
}
async function aggregate(model,pipeline){let rows=[];for(const stage of pipeline){if(stage.$match){rows=(await model.find(stage.$match).lean());}else if(stage.$group){const groups=new Map();for(const row of rows){const id=expr(stage.$group._id,row)??null,key=JSON.stringify(id);if(!groups.has(key))groups.set(key,{id,rows:[]});groups.get(key).rows.push(row);}rows=[...groups.values()].map(g=>{const result={_id:g.id};for(const [key,v]of Object.entries(stage.$group)){if(key==='_id')continue;if(v.$sum!==undefined)result[key]=g.rows.reduce((s,r)=>s+Number(expr(v.$sum,r)),0);else{const nums=g.rows.map(r=>expr(v.$avg,r)).filter(n=>n!==null&&n!==undefined);result[key]=nums.length?nums.reduce((a,b)=>a+b,0)/nums.length:null;}}return result;});}else if(stage.$lookup){const x=stage.$lookup,m=[...models.values()].find(m=>m.collection.collectionName===x.from);for(const row of rows)row[x.as]=await m.find({[x.foreignField]:row[x.localField]}).lean();}else if(stage.$project){rows=rows.map(r=>Object.fromEntries(Object.entries(stage.$project).map(([k,v])=>[k,v===1?r[k]:expr(v,r)])));}else if(stage.$sort){const keys=Object.entries(stage.$sort);rows.sort((a,b)=>{for(const[k,d]of keys){if(a[k]<b[k])return -d;if(a[k]>b[k])return d;}return 0;});}}return rows;}
export function postgresModel(name,schema){
 const Native=mongoose.models[name]||mongoose.model(name,schema);let initialized;
 const init=async()=>{await connectPostgres(process.env.DATABASE_URL);initialized ||= (async()=>{for(const [fields,options]of schema.indexes()){if(!options.unique)continue;const keys=Object.keys(fields);if(!keys.every(k=>/^\w+$/.test(k)))continue;const index=`unique_${name.toLowerCase()}_${keys.join('_').toLowerCase()}`;await sql(`CREATE UNIQUE INDEX IF NOT EXISTS ${index} ON village_records (${keys.map(k=>`(data->>'${k}')`).join(',')}) WHERE kind='${name}'`);}})();await initialized;};
 const validate=data=>{const doc=new Native(data);const error=doc.validateSync();if(error)throw error;return JSON.parse(JSON.stringify(doc.toObject()));};
 function result(data,selection='',lean=false){if(!data)return null;const copy={...data};const tokens=selection.split(/\s+/).filter(Boolean),include=tokens.filter(t=>!t.startsWith('+')&&!t.startsWith('-'));if(include.length){for(const k of Object.keys(copy))if(k!=='_id'&&!include.includes(k))delete copy[k];}for(const[k,p]of Object.entries(schema.paths))if(p.options.select===false&&!tokens.includes('+'+k))delete copy[k];for(const token of tokens)if(token.startsWith('-'))delete copy[token.slice(1)];const doc=Native.hydrate(copy);return lean?doc.toObject():doc;}
 class Query{
  constructor(action,filter={},update={},options={}){Object.assign(this,{action,filter,update,options,selection:'',ordering:null,offset:0,maximum:null,isLean:false});}
  session(){return this;}select(v){this.selection=v;return this;}sort(v){this.ordering=v;return this;}skip(v){this.offset=v;return this;}limit(v){this.maximum=v;return this;}lean(){this.isLean=true;return this;}
  then(resolve,reject){return this.exec().then(resolve,reject);}
  async exec(){await init();const mutation=['updateOne','updateMany','findOneAndUpdate','deleteMany'].includes(this.action);if(mutation&&!context.getStore())return transaction(()=>this.exec());
   const params=[name],condition=where(this.filter,params);let query=`SELECT data FROM village_records WHERE kind=$1 AND (${condition})`;
   if(this.ordering){const keys=Object.entries(this.ordering);query+=' ORDER BY '+keys.map(([key,d])=>{if(!/^\w+$/.test(key))throw new Error('Invalid sort field');return `(data->'${key}') ${d===-1?'DESC':'ASC'}`;}).join(',');}
   if(mutation)query+=' FOR UPDATE';
   const raw=(await sql(query,params)).rows.map(r=>r.data).filter(d=>geoMatches(d,this.filter));
   if(this.action==='count')return raw.length;if(this.action==='exists')return raw[0]?{_id:raw[0]._id}:null;
   if(this.action==='deleteMany'){for(const d of raw)await sql('DELETE FROM village_records WHERE kind=$1 AND id=$2',[name,d._id]);return {deletedCount:raw.length};}
   if(mutation){const selected=this.action==='updateMany'?raw:raw.slice(0,1);if(!selected.length&&this.options.upsert){const base=Object.fromEntries(Object.entries(this.filter).filter(([k,v])=>!k.startsWith('$')&&(typeof v!=='object'||v?._bsontype)));selected.push({_id:new mongoose.Types.ObjectId().toString(),...base});}
    for(const current of selected){const data={...current,...this.update.$set};for(const[k,n]of Object.entries(this.update.$inc||{}))data[k]=(data[k]||0)+n;if(this.options.timestamps!==false&&schema.options.timestamps)data.updatedAt=new Date();if(!data.createdAt&&schema.options.timestamps)data.createdAt=new Date();const valid=validate(data);try{await sql('INSERT INTO village_records(kind,id,data) VALUES($1,$2,$3::jsonb) ON CONFLICT(kind,id) DO UPDATE SET data=EXCLUDED.data',[name,valid._id,JSON.stringify(valid)]);}catch(e){if(e.code==='23505')e.code=11000;throw e;}Object.assign(current,valid);}
    return this.action==='findOneAndUpdate'?result(selected[0],this.selection,this.isLean):{modifiedCount:selected.length,matchedCount:raw.length,upsertedCount:raw.length?0:selected.length};
   }
   const sliced=raw.slice(this.offset,this.maximum===null?undefined:this.offset+this.maximum);return this.action==='findOne'?result(sliced[0],this.selection,this.isLean):sliced.map(d=>result(d,this.selection,this.isLean));
  }
 }
 const model={schema,collection:Native.collection,init,find:f=>new Query('find',f),findOne:f=>new Query('findOne',f),findById:id=>new Query('findOne',{_id:id}),exists:f=>new Query('exists',f),countDocuments:f=>new Query('count',f),findOneAndUpdate:(f,u,o)=>new Query('findOneAndUpdate',f,u,o),findByIdAndUpdate:(id,u,o)=>new Query('findOneAndUpdate',{_id:id},u,o),updateOne:(f,u,o)=>new Query('updateOne',f,u,o),updateMany:(f,u,o)=>new Query('updateMany',f,u,o),deleteMany:f=>new Query('deleteMany',f),aggregate:p=>aggregate(model,p)};
 model.create=async(input,options)=>{await init();if(!context.getStore())return transaction(()=>model.create(input,options));const array=Array.isArray(input),output=[];for(const item of array?input:[input]){const data=validate({...item,...(schema.options.timestamps?{createdAt:item.createdAt||new Date(),updatedAt:item.updatedAt||new Date()}: {})});try{await sql('INSERT INTO village_records(kind,id,data) VALUES($1,$2,$3::jsonb)',[name,data._id,JSON.stringify(data)]);}catch(e){if(e.code==='23505')e.code=11000;throw e;}output.push(Native.hydrate(data));}return array?output:output[0];};model.insertMany=model.create;models.set(name,model);return model;
}

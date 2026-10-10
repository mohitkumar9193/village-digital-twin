import 'dotenv/config';
import mongoose from 'mongoose';
import {readFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {connectPostgres,sql,transaction,disconnectPostgres} from '../src/postgres.js';
import * as models from '../src/models.js';
import {AiRecommendation} from '../src/ai.js';
let source;
try{
 if(!process.env.DATABASE_URL||!process.env.MONGODB_URI)throw new Error('Both database connection strings are required');
 source=await mongoose.createConnection(process.env.MONGODB_URI).asPromise();
 const allModels={...models,AiRecommendation};
 await connectPostgres(process.env.DATABASE_URL);await Promise.all(Object.values(allModels).map(m=>m.init()));
 const root=resolve(process.env.UPLOAD_DIR||'data/uploads');let records=0,images=0;
 await transaction(async()=>{
  await sql('LOCK TABLE village_records IN EXCLUSIVE MODE');
  if(Number((await sql('SELECT count(*) AS n FROM village_records')).rows[0].n))throw new Error('Target must be empty; migration does not overwrite existing records');
  for(const [kind,model]of Object.entries(allModels)){
   for await(const record of source.db.collection(model.collection.collectionName).find({})){
    await sql('INSERT INTO village_records(kind,id,data) VALUES($1,$2,$3::jsonb)',[kind,String(record._id),JSON.stringify(record)]);records++;
    if(kind==='Attachment'){
     const path=resolve(root,record.storageKey),rel=relative(root,path);if(rel.startsWith('..')||isAbsolute(rel))throw new Error('Invalid attachment path');
     await sql('INSERT INTO village_images(id,image) VALUES($1,$2)',[String(record._id),await readFile(path)]);images++;
    }
   }
  }
 });
 console.log(`Migration committed: ${records} records and ${images} private images. Original MongoDB data was not changed.`);
}catch(error){console.error('Migration failed; PostgreSQL transaction rolled back:',error.message.includes('Target must')?error.message:error.name);process.exitCode=1;}finally{await source?.close();await disconnectPostgres();}

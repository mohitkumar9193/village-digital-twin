import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from '../src/database.js';
import {connectDatabase} from '../src/db.js';
import {Village,User,Department,Asset} from '../src/models.js';
import {readFile} from 'node:fs/promises';
import {z} from 'zod';
try{
 const env=z.object({DATABASE_URL:z.string().min(1),ADMIN_EMAIL:z.string().email(),ADMIN_PASSWORD:z.string().min(12).max(72)}).parse(process.env);
 await connectDatabase(env.DATABASE_URL);await Promise.all([Village,User,Department,Asset].map(m=>m.init()));
 const data=JSON.parse(await readFile(new URL('../../smart-village-frontend/src/data/kothri-osm.json',import.meta.url),'utf8'));const[w,s,e,n]=data.bbox;
 const existing=await User.findOne({email:env.ADMIN_EMAIL.toLowerCase()});if(existing){console.log('Admin already exists; no credentials changed. VILLAGE_ID='+existing.villageId);}else{
  await mongoose.connection.transaction(async session=>{
   const village=await Village.create({name:data.name,boundary:{type:'Polygon',coordinates:[[[w,s],[e,s],[e,n],[w,n],[w,s]]]},automationEnabled:true});
   await User.create({name:'Village Administrator',email:env.ADMIN_EMAIL.toLowerCase(),passwordHash:await bcrypt.hash(env.ADMIN_PASSWORD,12),role:'admin',villageId:village._id});
   for(const [name,categories]of [['Roads & public works',['roads','drainage']],['Water services',['water']],['Electricity & lighting',['electricity','street_lights']],['Sanitation',['sanitation','other']]])await Department.create({name,categories,villageId:village._id});
   for(const a of data.assets)await Asset.create({villageId:village._id,assetCode:a.id,name:a.name,assetType:a.assetType,geometry:a.geometry,condition:'unknown',dataSource:a.sourceUrl});
   console.log('Created Kothri Kalan village, Admin, departments and sourced assets. Set VILLAGE_ID='+village._id+' in Vercel. Create department staff from Admin dashboard.');
  });
 }
}catch(error){console.error('Neon bootstrap failed:',error.name);process.exitCode=1;}finally{await mongoose.disconnect();}

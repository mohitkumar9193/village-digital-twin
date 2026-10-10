import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcryptjs';
process.env.DATABASE_URL='postgresql://test';process.env.JWT_SECRET='test-secret-longer-than-32-characters';process.env.VILLAGE_ID='123456789012345678901234';process.env.CORS_ORIGIN='https://village.example';process.env.CRON_SECRET='test-cron-secret-longer-than-32-characters';process.env.NODE_ENV='production';process.env.VERCEL='1';
const {default:handler}=await import('../src/serverless.js');
const {default:db}=await import('../src/database.js');
const {Village,User}=await import('../src/models.js');
test('Vercel rewrite initializes PostgreSQL and authenticates an admin',async()=>{
 await request(handler).get('/api/index?__route=health').expect(200);
 await Village.create({_id:process.env.VILLAGE_ID,name:'Test village',boundary:{type:'Polygon',coordinates:[[[76,23],[77,23],[77,24],[76,24],[76,23]]]},isActive:true});
 await User.create({name:'Admin',email:'vercel@example.com',role:'admin',villageId:process.env.VILLAGE_ID,passwordHash:await bcrypt.hash('Test-password-12345',10)});
 const r=await request(handler).post('/api/index?__route=v1/auth/login').send({email:'vercel@example.com',password:'Test-password-12345'}).expect(200);
 assert.match(r.headers['set-cookie'][0],/Secure/);
 const token=r.body.data.accessToken;
 const metadata=await request(handler).get('/api/index?__route=v1/ai/model').set('Authorization','Bearer '+token).expect(200);
 assert.equal(metadata.body.data.model_version,'synthetic-rf-v1');
 await request(handler).get('/api/index?__route=v1/complaints&status=submitted').set('Authorization','Bearer '+token).expect(200);
});
test('daily cron requires its secret and executes reminders',async()=>{
 await request(handler).get('/api/index?__route=cron/reminders').expect(401);
 const r=await request(handler).get('/api/index?__route=cron/reminders').set('Authorization','Bearer '+process.env.CRON_SECRET).expect(200);
 assert.equal(r.body.data.mode,'request-and-daily-cron');assert.ok(r.body.data.lastCheckedAt);
});
after(async()=>db.disconnect());

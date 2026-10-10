import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import sharp from 'sharp';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createApp } from '../src/app.js';
import { connectDatabase } from '../src/db.js';
import * as models from '../src/models.js';
const { Village, Department, User, Complaint, ComplaintEvent, Notification, Attachment } = models;
let mongo, app, uploadDir, village, department, otherDepartment, admin, staff, outsider, citizen, stranger, foreignAdmin;
const password = 'Test-password-12345';
// Steps 45–53 use disposable fixtures; the running village database is never used.
const auth = (client, token) => client.set('Authorization', `Bearer ${token}`);
const complaintBody = { title: 'Water tank leak', description: 'The public water tank has been leaking since yesterday.', category: 'water', location: { type: 'Point', coordinates: [77.2, 28.6] } };
async function login(user) {
  const response = await request(app).post('/api/v1/auth/login').send({ email: user.email, password }).expect(200);
  return response.body.data.accessToken;
}
async function createComplaint() {
  return (await auth(request(app).post('/api/v1/complaints'), citizen.token).send(complaintBody).expect(201)).body.data;
}
async function act(complaint, action, actor, extra = {}, expected = 200) {
  const latest = await Complaint.findById(complaint._id);
  return auth(request(app).post(`/api/v1/complaints/${complaint._id}/${action}`), actor.token).send({ version: latest.version, ...extra }).expect(expected);
}
before(async () => {
  // All fixture data is synthetic and confined to an ephemeral test database.
  uploadDir = await mkdtemp(resolve('test-uploads-'));
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { downloadDir: resolve('../../work/mongodb-binaries') } });
  await connectDatabase(mongo.getUri());
  await Promise.all(Object.values(models).map(m => m.init()));
  village = await Village.create({ name: 'Synthetic Test Village' });
  const foreignVillage = await Village.create({ name: 'Synthetic Foreign Village' });
  department = await Department.create({ villageId: village._id, name: 'Water Department', categories: ['water'] });
  otherDepartment = await Department.create({ villageId: village._id, name: 'Road Department', categories: ['roads'] });
  const hash = await bcrypt.hash(password, 12);
  const makeUser = async (role, name, departmentId, villageId = village._id) => {
    const doc = await User.create({ name, email: `${name}@example.test`, passwordHash: hash, role, villageId, departmentId });
    return { ...doc.toObject(), token: null };
  };
  admin = await makeUser('admin', 'admin'); staff = await makeUser('staff', 'staff', department._id);
  outsider = await makeUser('staff', 'outsider', otherDepartment._id);
  citizen = await makeUser('citizen', 'citizen'); stranger = await makeUser('citizen', 'stranger');
  foreignAdmin = await makeUser('admin', 'foreign', undefined, foreignVillage._id);
  app = createApp({ NODE_ENV: 'test', JWT_SECRET: 'synthetic-test-secret-32-characters-minimum', JWT_ISSUER: 'smart-village-api', JWT_AUDIENCE: 'smart-village-web', CORS_ORIGIN: 'http://localhost:5173', VILLAGE_ID: String(village._id), UPLOAD_DIR: uploadDir });
  for (const user of [admin, staff, outsider, citizen, stranger, foreignAdmin]) user.token = await login(user);
});
after(async () => {
  await mongoose.disconnect(); if (mongo) await mongo.stop();
  if (uploadDir) {
    const relativePath = relative(resolve('.'), resolve(uploadDir));
    if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath) || !relativePath.startsWith('test-uploads-')) throw new Error('Unsafe test cleanup path');
    await rm(uploadDir, { recursive: true, force: true });
  }
});
test('public registration cannot choose a privileged role or village', async () => {
  await request(app).post('/api/v1/auth/register').send({ name: 'Attacker', email: 'attack@example.test', password, role: 'admin' }).expect(400);
  const result = await request(app).post('/api/v1/auth/register').send({ name: 'New citizen', email: 'new@example.test', password }).expect(201);
  assert.equal(result.body.data.user.role, 'citizen');
  assert.equal(result.body.data.user.villageId, String(village._id));
  assert.equal(JSON.stringify(result.body).includes('passwordHash'), false);
});
test('authentication is mandatory and revoked sessions lose access immediately', async () => {
  await request(app).get('/api/v1/complaints').expect(401);
  await request(app).get('/api/v1/complaints').set('Authorization', 'Bearer invalid').expect(401);
  const token = await login(stranger);
  await auth(request(app).post('/api/v1/auth/logout'), token).expect(204);
  await auth(request(app).get('/api/v1/auth/me'), token).expect(401);
});
test('refresh requires trusted origin, rotates tokens, and detects replay', async () => {
  const client = request.agent(app);
  const loginResponse = await client.post('/api/v1/auth/login').send({ email: stranger.email, password }).expect(200);
  const originalCookie = loginResponse.headers['set-cookie'][0].split(';')[0];
  await client.post('/api/v1/auth/refresh').expect(403);
  await client.post('/api/v1/auth/refresh').set('Origin', 'http://localhost:5173').expect(200);
  await request(app).post('/api/v1/auth/refresh').set('Origin', 'http://localhost:5173').set('Cookie', originalCookie).expect(401);
  await client.post('/api/v1/auth/refresh').set('Origin', 'http://localhost:5173').expect(401);
});
test('complaints and histories enforce citizen, department, and village scope', async () => {
  const c = await createComplaint();
  for (const user of [stranger, outsider, foreignAdmin]) await auth(request(app).get(`/api/v1/complaints/${c._id}`), user.token).expect(404);
  await act(c, 'verify', citizen, {}, 403);
  await act(c, 'verify', admin);
  await act(c, 'assign', admin, { departmentId: String(otherDepartment._id) }, 400);
  await act(c, 'assign', admin, { departmentId: String(department._id) });
  await auth(request(app).get(`/api/v1/complaints/${c._id}`), staff.token).expect(200);
  await act(c, 'start', outsider, {}, 404);
});
test('complete lifecycle requires evidence, writes history, and updates analytics', async () => {
  const c = await createComplaint();
  await act(c, 'resolve', staff, { remarks: 'Done' }, 404);
  await act(c, 'verify', admin);
  await act(c, 'assign', admin, { departmentId: String(department._id), assignedStaffId: String(staff._id) });
  await act(c, 'start', staff);
  await act(c, 'resolve', staff, { remarks: 'Leak repaired' }, 400);
  const image = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#123456' } }).png().toBuffer();
  await auth(request(app).post(`/api/v1/complaints/${c._id}/attachments`), staff.token).attach('image', image, 'repair.png').expect(201);
  await act(c, 'resolve', staff, { remarks: 'Leak repaired with new valve' });
  await act(c, 'close', admin);
  assert.equal((await Complaint.findById(c._id)).status, 'closed');
  assert.equal(await ComplaintEvent.countDocuments({ complaintId: c._id }), 6);
  assert.ok(await Notification.countDocuments({ complaintId: c._id, recipientId: citizen._id }) >= 6);
  const summary = await auth(request(app).get('/api/v1/analytics/summary'), admin.token).expect(200);
  assert.equal(summary.body.data.total, await Complaint.countDocuments({ villageId: village._id }));
  assert.ok(summary.body.data.closed >= 1);
  await act(c, 'reopen', admin, { remarks: 'Leak returned after repair' });
  await act(c, 'start', staff);
  await act(c, 'resolve', staff, { remarks: 'Second repair completed' }, 400);
});
test('concurrent transitions produce one success and one conflict', async () => {
  const c = await createComplaint();
  const results = await Promise.all([1, 2].map(() => auth(request(app).post(`/api/v1/complaints/${c._id}/verify`), admin.token).send({ version: 0 })));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal(await ComplaintEvent.countDocuments({ complaintId: c._id, eventType: 'verify' }), 1);
});
test('assets enforce admin writes, real geometry, and partial updates preserve fields', async () => {
  const body = { assetCode: 'DEMO-TANK-1', name: 'Synthetic tank', assetType: 'water_tank', geometry: { type: 'Point', coordinates: [77.2, 28.6] }, condition: 'poor', dataSource: 'Synthetic test fixture', isDemo: true };
  await auth(request(app).post('/api/v1/assets'), citizen.token).send(body).expect(403);
  const result = await auth(request(app).post('/api/v1/assets'), admin.token).send(body).expect(201);
  const assetId = result.body.data._id;
  const edited = await auth(request(app).patch(`/api/v1/assets/${assetId}`), admin.token).send({ name: 'Renamed test tank' }).expect(200);
  assert.equal(edited.body.data.condition, 'poor'); assert.equal(edited.body.data.isDemo, true);
  const listed = await auth(request(app).get('/api/v1/assets'), citizen.token).expect(200);
  assert.ok(listed.body.data.some(asset => asset._id === assetId), 'Unfiltered listing must include assets with non-unknown condition');
  await auth(request(app).get(`/api/v1/assets/${assetId}`), foreignAdmin.token).expect(404);
  await auth(request(app).post('/api/v1/assets'), admin.token).send({ ...body, assetCode: 'INVALID', geometry: { type: 'Point', coordinates: [500, 500] } }).expect(400);
  const geo = await auth(request(app).get('/api/v1/map/assets?bbox=77,28,78,29'), citizen.token).expect(200);
  assert.ok(geo.body.features.some(f => f.id === assetId));
});
test('private attachments reject disguised files and unrelated readers', async () => {
  const c = await createComplaint();
  await auth(request(app).post(`/api/v1/complaints/${c._id}/attachments`), citizen.token).attach('image', Buffer.from('<script>alert(1)</script>'), 'fake.png').expect(400);
  const image = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#ffffff' } }).png().toBuffer();
  const result = await auth(request(app).post(`/api/v1/complaints/${c._id}/attachments`), citizen.token).attach('image', image, 'photo.png').expect(201);
  assert.equal(result.body.data.storageKey, undefined);
  await auth(request(app).get(`/api/v1/attachments/${result.body.data._id}/download`), citizen.token).expect(200).expect('Content-Type', /image\/jpeg/);
  await auth(request(app).get(`/api/v1/attachments/${result.body.data._id}/download`), stranger.token).expect(404);
  assert.equal(await Attachment.countDocuments({ complaintId: c._id }), 1);
});
test('notifications can only be read or marked by their recipient', async () => {
  const c = await createComplaint();
  const notification = await Notification.findOne({ complaintId: c._id, recipientId: citizen._id });
  await auth(request(app).patch(`/api/v1/notifications/${notification._id}/read`), stranger.token).expect(404);
  await auth(request(app).patch(`/api/v1/notifications/${notification._id}/read`), citizen.token).expect(200);
  assert.ok((await Notification.findById(notification._id)).readAt);
});
test('analytics restrict roles and compute real scoped aggregates', async () => {
  await auth(request(app).get('/api/v1/analytics/summary'), citizen.token).expect(403);
  for (const path of ['categories', 'areas', 'trends', 'departments', 'density']) await auth(request(app).get(`/api/v1/analytics/${path}`), admin.token).expect(200);
  const result = await auth(request(app).get('/api/v1/analytics/summary'), staff.token).expect(200);
  assert.equal(result.body.data.total, await Complaint.countDocuments({ villageId: village._id, departmentId: department._id }));
  await auth(request(app).get('/api/v1/analytics/trends?interval=day'), admin.token).expect(400);
  await auth(request(app).get('/api/v1/analytics/summary?from=2026-10-07T00:00:00Z&to=2026-01-01T00:00:00Z'), admin.token).expect(400);
});
test('configured village boundary rejects locations outside the village', async () => {
  await Village.updateOne({ _id: village._id }, { $set: { boundary: { type: 'Polygon', coordinates: [[[77, 28], [78, 28], [78, 29], [77, 29], [77, 28]]] } } });
  await auth(request(app).post('/api/v1/complaints'), citizen.token).send({ ...complaintBody, location: { type: 'Point', coordinates: [10, 10] } }).expect(400);
  await createComplaint();
});
test('local demo snapshot exposes only synthetic records and no citizen identity', async () => {
  const demoApp = createApp({ NODE_ENV: 'development', LOCAL_DEMO: true, VILLAGE_ID: String(village._id), JWT_SECRET: 'test-demo-secret-at-least-32-characters', JWT_ISSUER: 'test', JWT_AUDIENCE: 'test', CORS_ORIGIN: 'http://localhost:5173' });
  await Village.updateOne({ _id: village._id }, { $set: { isDemo: true } });
  const fixture = await Complaint.create({ ...complaintBody, villageId: village._id, citizenId: citizen._id, trackingNumber: 'SYNTHETIC-PRIVACY-TEST', isDemo: true });
  const result = await request(demoApp).get('/api/v1/demo/snapshot').expect(200);
  assert.equal(result.body.data.complaints.length, 1);
  assert.equal(result.body.data.complaints[0]._id, String(fixture._id));
  assert.equal(result.body.data.complaints[0].citizenId, undefined);
  assert.ok(result.body.data.assets.every(asset => asset.isDemo === true));
  await request(app).get('/api/v1/demo/snapshot').expect(401);
  const productionApp = createApp({ NODE_ENV: 'production', LOCAL_DEMO: true, VILLAGE_ID: String(village._id), JWT_SECRET: 'test-demo-secret-at-least-32-characters', JWT_ISSUER: 'test', JWT_AUDIENCE: 'test', CORS_ORIGIN: 'http://localhost:5173' });
  await request(productionApp).get('/api/v1/demo/snapshot').expect(401);
});
test('profile updates persist and cannot change role, email, or department', async () => {
  await auth(request(app).patch('/api/v1/auth/me'), citizen.token).send({ name: 'Updated Synthetic Citizen' }).expect(200);
  const profile = await auth(request(app).get('/api/v1/auth/me'), citizen.token).expect(200);
  assert.equal(profile.body.data.name, 'Updated Synthetic Citizen');
  assert.equal(profile.body.data.role, 'citizen');
  for (const body of [{ role: 'admin' }, { email: 'other@example.test' }, { departmentId: String(department._id) }]) await auth(request(app).patch('/api/v1/auth/me'), citizen.token).send(body).expect(400);
});
test('admin provisions department staff; citizens cannot provision privileged users', async () => {
  const body = { name: 'Synthetic New Staff', email: 'newstaff@example.test', password, departmentId: String(department._id) };
  await auth(request(app).post('/api/v1/users'), citizen.token).send(body).expect(403);
  const result = await auth(request(app).post('/api/v1/users'), admin.token).send(body).expect(201);
  assert.equal(result.body.data.role, 'staff'); assert.equal(result.body.data.passwordHash, undefined);
  const token = await login({ email: body.email });
  const profile = await auth(request(app).get('/api/v1/auth/me'), token).expect(200);
  assert.equal(profile.body.data.departmentId, String(department._id));
  const summary = await auth(request(app).get('/api/v1/analytics/summary'), token).expect(200);
  assert.equal(summary.body.data.total, await Complaint.countDocuments({ villageId: village._id, departmentId: department._id }));
});
test('mark all read changes only notifications belonging to the current account', async () => {
  const c = await createComplaint();
  const other = await Notification.findOne({ complaintId: c._id, recipientId: admin._id });
  await auth(request(app).post('/api/v1/notifications/read-all'), citizen.token).expect(200);
  assert.equal(await Notification.countDocuments({ recipientId: citizen._id, readAt: null }), 0);
  assert.equal((await Notification.findById(other._id)).readAt, undefined);
});

test('AI suggestions enforce admin access and fail safely when service is absent', async () => {
  await auth(request(app).get('/api/v1/ai/model'), citizen.token).expect(403);
  await auth(request(app).post('/api/v1/ai/recommendations/refresh'), staff.token).send({}).expect(403);
  await auth(request(app).get('/api/v1/ai/model'), admin.token).expect(503);
  const response = await auth(request(app).get('/api/v1/ai/recommendations'), foreignAdmin.token).expect(200);
  assert.deepEqual(response.body.data, []);
});

test('AI integration persists scoped suggestions without changing approved priority', async () => {
  const { createServer } = await import('node:http');
  const { AiRecommendation, complaintFeatures } = await import('../src/ai.js');
  await AiRecommendation.init();
  const c = await createComplaint();
  const before = await Complaint.findById(c._id).lean();
  const now = new Date();
  const features = await complaintFeatures(before, now);
  assert.ok(features.age_hours >= 0);
  assert.equal(features.asset_condition,'unknown');
  assert.equal(features.recent_category_reports,await Complaint.countDocuments({villageId:before.villageId,_id:{$ne:before._id},category:before.category,createdAt:{$gte:new Date(now.getTime()-30*86400000),$lte:now}}));
  const mock = createServer(async (req,res) => {
    assert.equal(req.headers['x-ai-key'],'synthetic-service-test-key-minimum-32');
    let text=''; for await (const chunk of req) text += chunk;
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({suggested_priority:'high',attention_level:'high',model_version:'test-fixture',synthetic:true,class_scores:{high:1},reasons:['Test fixture'],recommendations:['Inspect'],warnings:['Synthetic'],features:JSON.parse(text)}));
  });
  await new Promise(resolve => mock.listen(0,'127.0.0.1',resolve));
  try {
    const testApp=createApp({NODE_ENV:'test',JWT_SECRET:'synthetic-test-secret-32-characters-minimum',JWT_ISSUER:'smart-village-api',JWT_AUDIENCE:'smart-village-web',CORS_ORIGIN:'http://localhost:5173',VILLAGE_ID:String(village._id),UPLOAD_DIR:uploadDir,AI_SERVICE_URL:`http://127.0.0.1:${mock.address().port}`,AI_SERVICE_KEY:'synthetic-service-test-key-minimum-32'});
    await auth(request(testApp).post('/api/v1/ai/recommendations/refresh'),admin.token).send({}).expect(200);
    const after=await Complaint.findById(c._id).lean();
    assert.equal(after.priority,before.priority); assert.equal(after.version,before.version);
    const record=await AiRecommendation.findOne({complaintId:c._id});
    assert.equal(record.result.suggested_priority,'high');
    const foreign=await auth(request(testApp).get('/api/v1/ai/recommendations'),foreignAdmin.token).expect(200);
    assert.deepEqual(foreign.body.data,[]);
    await AiRecommendation.deleteMany({result:{$exists:true}});
  } finally { await new Promise(resolve=>mock.close(resolve)); }
});

test('45/52: wrong credentials, forged/expired tokens and operator injection are rejected', async () => {
  const {default:jwt}=await import('jsonwebtoken');
  await request(app).post('/api/v1/auth/login').send({email:citizen.email,password:'Wrong-password-12345'}).expect(401);
  await request(app).post('/api/v1/auth/login').send({email:{$ne:null},password}).expect(400);
  for(const options of [{expiresIn:-1},{expiresIn:60,audience:'wrong-audience'}]) {
    const token=jwt.sign({sid:String(new mongoose.Types.ObjectId())},'synthetic-test-secret-32-characters-minimum',{subject:String(citizen._id),issuer:'smart-village-api',audience:'smart-village-web',...options});
    await auth(request(app).get('/api/v1/auth/me'),token).expect(401);
  }
  await auth(request(app).get('/api/v1/auth/me'),jwt.sign({sid:'fake'},'wrong-secret')).expect(401);
});

test('46: invalid complaint fields cannot create or escalate a complaint', async () => {
  const count=await Complaint.countDocuments();
  for(const change of [{priority:'critical'},{status:'closed'},{citizenId:String(stranger._id)},{title:''},{category:'invalid'},{location:{type:'Point',coordinates:[181,0]}}]) await auth(request(app).post('/api/v1/complaints'),citizen.token).send({...complaintBody,...change}).expect(400);
  assert.equal(await Complaint.countDocuments(),count);
  const c=await createComplaint();assert.equal(c.citizenId,String(citizen._id));assert.equal(c.status,'submitted');assert.equal(c.priority,'medium');
});

test('47: oversized uploads and unapproved readers are rejected; images are reencoded privately', async () => {
  const c=await createComplaint();
  await auth(request(app).post(`/api/v1/complaints/${c._id}/attachments`),citizen.token).attach('image',Buffer.alloc(5*1024*1024+1),'oversize.jpg').expect(413);
  const png=await sharp({create:{width:10,height:10,channels:3,background:'#abcdef'}}).png().toBuffer();
  const upload=await auth(request(app).post(`/api/v1/complaints/${c._id}/attachments`),citizen.token).attach('image',png,'photo.png').expect(201);
  const path=`/api/v1/attachments/${upload.body.data._id}/download`;
  await request(app).get(path).expect(401);await auth(request(app).get(path),foreignAdmin.token).expect(404);
  const download=await auth(request(app).get(path),citizen.token).expect(200);
  assert.equal(download.headers['cache-control'],'private, no-store');
  const metadata=await sharp(download.body).metadata();assert.equal(metadata.format,'jpeg');assert.equal(metadata.exif,undefined);
  await act(c,'verify',admin);
  await auth(request(app).post(`/api/v1/complaints/${c._id}/attachments`),citizen.token).attach('image',png,'late.png').expect(403);
});

test('48: map locations preserve longitude/latitude and respect ownership', async () => {
  const c=await createComplaint();
  const own=await auth(request(app).get('/api/v1/map/complaints?bbox=77,28,78,29'),citizen.token).expect(200);
  const feature=own.body.features.find(f=>f.id===c._id);assert.ok(feature);assert.deepEqual(feature.geometry.coordinates,[77.2,28.6]);
  const other=await auth(request(app).get('/api/v1/map/complaints?bbox=77,28,78,29'),stranger.token).expect(200);assert.ok(!other.body.features.some(f=>f.id===c._id));
  for(const bbox of ['78,29,77,28','77,28,NaN,29','-181,28,78,29']) await auth(request(app).get(`/api/v1/map/complaints?bbox=${bbox}`),admin.token).expect(400);
});

test('49/50/53: citizen photo through department evidence, resolution and admin closure', async () => {
  const c=await createComplaint();
  const image=await sharp({create:{width:12,height:12,channels:3,background:'#456789'}}).png().toBuffer();
  await auth(request(app).post(`/api/v1/complaints/${c._id}/attachments`),citizen.token).attach('image',image,'citizen.png').expect(201);
  await act(c,'close',admin,{},409);await act(c,'verify',staff,{},403);await act(c,'verify',admin);
  await act(c,'assign',admin,{departmentId:String(department._id),assignedStaffId:String(staff._id)});
  await act(c,'start',citizen,{},403);await act(c,'start',outsider,{},404);await act(c,'start',staff);
  await act(c,'resolve',staff,{remarks:'Only citizen photo exists'},400);
  await auth(request(app).post(`/api/v1/complaints/${c._id}/attachments`),staff.token).attach('image',image,'repair.png').expect(201);
  await act(c,'resolve',staff,{remarks:'Valve replaced and leak checked'});await act(c,'close',staff,{},403);await act(c,'close',admin);
  const tracked=await auth(request(app).get(`/api/v1/complaints/${c._id}`),citizen.token).expect(200);assert.equal(tracked.body.data.status,'closed');
  const events=await ComplaintEvent.find({complaintId:c._id}).sort({createdAt:1});assert.deepEqual(events.map(e=>e.toStatus),['submitted','verified','assigned','in_progress','resolved','closed']);
  assert.ok(await Notification.countDocuments({complaintId:c._id,recipientId:citizen._id})>=6);
  const photos=await Attachment.find({complaintId:c._id});assert.deepEqual(photos.map(a=>a.purpose).sort(),['complaint_photo','resolution_evidence']);
});

test('52: malformed requests, oversized bodies, security headers, CORS and auth rate limits', async () => {
  await auth(request(app).get('/api/v1/complaints/not-an-id'),citizen.token).expect(400);
  await auth(request(app).post('/api/v1/complaints'),citizen.token).set('Content-Type','application/json').send('{broken').expect(400);
  await auth(request(app).post('/api/v1/complaints'),citizen.token).send({...complaintBody,description:'x'.repeat(110000)}).expect(413);
  const response=await request(app).get('/health').expect(200);assert.equal(response.headers['x-content-type-options'],'nosniff');assert.ok(response.headers['content-security-policy']);assert.equal(response.headers['x-powered-by'],undefined);
  const cors=await request(app).get('/health').set('Origin','https://untrusted.example').expect(200);assert.notEqual(cors.headers['access-control-allow-origin'],'https://untrusted.example');
  const limited=createApp({NODE_ENV:'test',JWT_SECRET:'synthetic-test-secret-32-characters-minimum',JWT_ISSUER:'smart-village-api',JWT_AUDIENCE:'smart-village-web',CORS_ORIGIN:'http://localhost:5173',VILLAGE_ID:String(village._id)});
  for(let i=0;i<50;i++)await request(limited).post('/api/v1/auth/login').send({}).expect(400);
  await request(limited).post('/api/v1/auth/login').send({}).expect(429);
});

test('automation routes verified reports, deduplicates urgent/overdue alerts and never resolves complaints', async () => {
  const {runComplaintAutomation}=await import('../src/automation.js');
  const c=await createComplaint();await act(c,'verify',admin);
  await Complaint.updateOne({_id:c._id},{$set:{priority:'critical'}});
  const future=new Date(Date.now()+8*3600000);
  await runComplaintAutomation(future);
  let saved=await Complaint.findById(c._id);
  assert.equal(saved.status,'assigned');assert.equal(String(saved.departmentId),String(department._id));assert.equal(saved.autoAssigned,true);assert.ok(saved.automationDueAt);assert.ok(saved.lastReminderAt);
  const count=await Notification.countDocuments({complaintId:c._id,type:{$in:['urgent_alert','overdue_reminder']}});assert.ok(count>0);
  await runComplaintAutomation(future);assert.equal(await Notification.countDocuments({complaintId:c._id,type:{$in:['urgent_alert','overdue_reminder']}}),count);
  assert.equal(await ComplaintEvent.countDocuments({complaintId:c._id,eventType:'auto_assigned'}),1);
  assert.equal((await Complaint.findById(c._id)).status,'assigned');
  await act(saved,'start',staff);await act(saved,'resolve',staff,{remarks:'Automation cannot waive repair evidence'},400);
});
test('automation leaves ambiguous departments and unverified reports for Admin review',async()=>{
 const {runComplaintAutomation}=await import('../src/automation.js');
 const extra=await Department.create({villageId:village._id,name:'Second Water Team',categories:['water']});
 const c=await createComplaint();await act(c,'verify',admin);const submitted=await createComplaint();
 await runComplaintAutomation();assert.equal((await Complaint.findById(c._id)).status,'verified');assert.equal((await Complaint.findById(submitted._id)).status,'submitted');
 await Department.updateOne({_id:extra._id},{$set:{isActive:false}});
});

test('automation heartbeat requires authentication and reports worker state without private records',async()=>{
 await request(app).get('/api/v1/automation/status').expect(401);
 const r=await auth(request(app).get('/api/v1/automation/status'),citizen.token).expect(200);
 assert.equal(r.body.data.intervalSeconds,60);assert.equal(r.body.data.started,false);assert.equal(r.body.data.lastCheckedAt,null);
 assert.equal(JSON.stringify(r.body).includes('password'),false);
});

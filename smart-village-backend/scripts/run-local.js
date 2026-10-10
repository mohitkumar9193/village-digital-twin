import {startComplaintAutomation} from '../src/automation.js';
import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { connectDatabase } from '../src/db.js';
import { createApp } from '../src/app.js';
import * as models from '../src/models.js';
import { seedGisDemo } from './seed-gis-demo.js';
import { configureKothriVillage } from './configure-kothri.js';

// Local development only: persistent replica-set data, synthetic village, no Atlas credentials.
const root = resolve('data/local');
await mkdir(root, { recursive: true });
let settings;
try { settings = JSON.parse(await readFile(resolve(root, 'settings.json'), 'utf8')); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  settings = { jwtSecret: randomBytes(48).toString('hex'), adminEmail: 'admin@demo.village.local', adminPassword: randomBytes(24).toString('base64url') };
  await writeFile(resolve(root, 'settings.json'), JSON.stringify(settings, null, 2), { flag: 'wx' });
}
const dbPath = resolve(root, 'mongodb');
await mkdir(dbPath, { recursive: true });
let mongo, server, aiProcess, stopAutomation;
try {
  mongo = await MongoMemoryReplSet.create({
    binary: { downloadDir: resolve('../../work/mongodb-binaries') },
    instanceOpts: [{ dbPath, port: 27018 }],
    replSet: { count: 1, name: 'sv-local', storageEngine: 'wiredTiger', dbName: 'smart_village_local' },
  });
  await connectDatabase(mongo.getUri('smart_village_local'));
  await Promise.all(Object.values(models).map(model => model.init()));
  let admin = await models.User.findOne({ email: settings.adminEmail });
  if (!admin) {
    await mongoose.connection.transaction(async session => {
      const [village] = await models.Village.create([{ name: 'Local Demo Village (synthetic)' }], { session });
      [admin] = await models.User.create([{ name: 'Local Demo Administrator', email: settings.adminEmail, passwordHash: await bcrypt.hash(settings.adminPassword, 12), role: 'admin', villageId: village._id }], { session });
    });
  }
  await seedGisDemo(admin.villageId);
  // Dedicated local demo accounts. Credentials remain in ignored local settings, never in the browser bundle.
  const demoVillage = await models.Village.findOne({ _id: admin.villageId, isDemo: true });
  if (demoVillage) {
    if (!settings.citizenEmail || !settings.staffEmail) {
      settings.citizenEmail ||= 'citizen@demo.village.local'; settings.citizenPassword ||= randomBytes(24).toString('base64url');
      settings.staffEmail ||= 'staff@demo.village.local'; settings.staffPassword ||= randomBytes(24).toString('base64url');
      await writeFile(resolve(root, 'settings.json'), JSON.stringify(settings, null, 2));
    }
    const department = await models.Department.findOne({ villageId: admin.villageId, name: 'Demo Public Works' });
    for (const role of ['citizen', 'staff']) {
      const email = settings[`${role}Email`];
      const existing = await models.User.findOne({ email });
      if (existing && (existing.role !== role || String(existing.villageId) !== String(admin.villageId))) throw new Error('Demo account conflicts with an existing account');
      if (!existing) await models.User.create({ name: role === 'citizen' ? 'Demo Citizen' : 'Demo Department Staff', email, passwordHash: await bcrypt.hash(settings[`${role}Password`], 12), role, villageId: admin.villageId, ...(role === 'staff' ? { departmentId: department._id } : {}) });
    }
  }
  await configureKothriVillage(admin.villageId);
  if (!settings.aiServiceKey) { settings.aiServiceKey = randomBytes(32).toString('hex'); await writeFile(resolve(root, 'settings.json'), JSON.stringify(settings, null, 2)); }
  aiProcess = spawn(process.env.AI_PYTHON || 'python', ['-m','uvicorn','service:app','--host','127.0.0.1','--port','8001'], { cwd: resolve('../smart-village-ai'), windowsHide: true, env: { ...process.env, AI_SERVICE_KEY: settings.aiServiceKey }, stdio: ['ignore','inherit','inherit'] });
  aiProcess.on('error', () => console.error('Python AI service could not start. Install its requirements and set AI_PYTHON if needed.'));
const config = { LOCAL_DEMO: true, AI_SERVICE_URL: process.env.AI_SERVICE_URL || 'http://127.0.0.1:8001', AI_SERVICE_KEY: settings.aiServiceKey, FRONTEND_DIR: resolve('../smart-village-frontend/dist'), NODE_ENV: 'development', JWT_SECRET: settings.jwtSecret, JWT_ISSUER: 'smart-village-api', JWT_AUDIENCE: 'smart-village-web', VILLAGE_ID: String(admin.villageId), CORS_ORIGIN: 'http://localhost:4000', UPLOAD_DIR: resolve('data/uploads') };
  server = createApp(config).listen(4000, '127.0.0.1', () => console.log('Local backend running: http://localhost:4000 (synthetic local village; persistent local database).'));
  stopAutomation=startComplaintAutomation();
  server.on('error', async error => { console.error(`HTTP startup failed: ${error.code}`); await mongoose.disconnect(); await mongo.stop({ doCleanup: false }); process.exitCode = 1; });
} catch (error) {
  console.error(`Local startup failed: ${error.message}`);
  await mongoose.disconnect(); if (mongo) await mongo.stop({ doCleanup: false }); process.exitCode = 1;
}
let stopping = false;
async function shutdown() {
  if (stopping) return; stopping = true;
  stopAutomation?.();
  if (aiProcess) aiProcess.kill();
  if (server) await new Promise(resolveClose => server.close(resolveClose));
  await mongoose.disconnect(); if (mongo) await mongo.stop({ doCleanup: false });
}
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);

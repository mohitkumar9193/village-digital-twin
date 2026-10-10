import {startComplaintAutomation} from './automation.js';
import mongoose from 'mongoose';
import { readConfig } from './config.js';
import { connectDatabase } from './db.js';
import { createApp } from './app.js';
import * as models from './models.js';
try {
  const config = readConfig();
  await connectDatabase(config.MONGODB_URI);
  await Promise.all(Object.values(models).map(model => model.init()));
  const server = createApp(config).listen(config.PORT, () => console.log(`Smart Village API: http://localhost:${config.PORT}`));
  const stopAutomation=startComplaintAutomation();
  async function shutdown() { stopAutomation(); server.close(async () => { await mongoose.disconnect(); process.exit(0); }); setTimeout(() => process.exit(1), 10000).unref(); }
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
} catch (error) {
  console.error(error.name === 'ZodError' ? 'Invalid environment configuration. Check .env against .env.example.' : 'Startup failed. Check MongoDB connectivity and replica-set configuration.');
  process.exitCode = 1;
}

import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { connectDatabase } from '../src/db.js';
import { Village, User } from '../src/models.js';
try {
  const env = z.object({ MONGODB_URI: z.string().min(1), ADMIN_EMAIL: z.string().email().transform(v => v.toLowerCase()), ADMIN_PASSWORD: z.string().min(12).max(72).refine(v => Buffer.byteLength(v) <= 72), VILLAGE_NAME: z.string().trim().min(2) }).parse(process.env);
  await connectDatabase(env.MONGODB_URI); await User.init();
  if (await User.exists({ email: env.ADMIN_EMAIL })) throw new Error('Admin account already exists');
  let village;
  await mongoose.connection.transaction(async session => {
    [village] = await Village.create([{ name: env.VILLAGE_NAME }], { session });
    await User.create([{ name: 'Village Administrator', email: env.ADMIN_EMAIL, passwordHash: await bcrypt.hash(env.ADMIN_PASSWORD, 12), role: 'admin', villageId: village._id }], { session });
  });
  console.log(`Created village and admin. Set VILLAGE_ID=${village._id} in .env; remove ADMIN_PASSWORD afterward.`);
} catch { console.error('Bootstrap failed. Validate environment values, database connectivity, and whether admin already exists.'); process.exitCode = 1; }
finally { await mongoose.disconnect(); }

import 'dotenv/config';
import { z } from 'zod';

export function readConfig(env = process.env) {
  return z.object({
    AI_SERVICE_URL: z.string().url().optional(),
    AI_SERVICE_KEY: z.string().min(32).optional(),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    MONGODB_URI: z.string().min(1),
    JWT_SECRET: z.string().min(32).refine(v => !v.startsWith('replace-'), 'Replace the example JWT secret'),
    JWT_ISSUER: z.string().default('smart-village-api'),
    JWT_AUDIENCE: z.string().default('smart-village-web'),
    CORS_ORIGIN: z.string().url().default('http://localhost:5173'),
    UPLOAD_DIR: z.string().min(1).default('data/uploads'),
    VILLAGE_ID: z.string().regex(/^[a-f\d]{24}$/i),
  }).parse(env);
}

import {getAutomationStatus,checkComplaintAutomation} from './automation.js';
import {timingSafeEqual} from 'node:crypto';
import { aiRouter } from './ai.js';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import mongoose,{postgresMode} from './database.js';
import { ZodError } from 'zod';
import { authRouter, authentication } from './auth.js';
import { complaintRouter } from './complaints.js';
import { resourceRouter } from './resources.js';
import { notificationRouter, analyticsRouter } from './reporting.js';
import { attachmentRouter } from './attachments.js';
import { gisRouter } from './gis.js';
import { demoRouter } from './demo.js';
export function createApp(config) {
  const app = express(); app.disable('x-powered-by'); if(config.SERVERLESS)app.set('trust proxy',1);
  app.use((req, res, next) => { req.requestId = randomUUID(); res.setHeader('X-Request-Id', req.requestId); next(); });
  app.use(helmet({ referrerPolicy: { policy: 'strict-origin-when-cross-origin' }, contentSecurityPolicy: { directives: { 'img-src': ["'self'", 'data:', 'blob:', 'https://tile.openstreetmap.org'], 'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], 'font-src': ["'self'", 'https://fonts.gstatic.com'] } } }));
  app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
  app.use(rateLimit({ windowMs: 60000, limit: 200, standardHeaders: 'draft-8', legacyHeaders: false }));
  app.use(express.json({ limit: '100kb' })); app.use(cookieParser());
  if (config.FRONTEND_DIR) app.use(express.static(config.FRONTEND_DIR));
  app.get('/', (req, res) => res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Smart Village Backend</title></head><body><main><h1>Smart Village Backend</h1><p>The Phase 3 API server is running. Citizen, admin, and department dashboards will be built in the frontend phase.</p><p><a href="/health">Server health</a> · <a href="/ready">MongoDB connection status</a></p><h2>Available APIs</h2><ul><li>JWT login and registration: /api/v1/auth</li><li>Complaints and private evidence: /api/v1/complaints</li><li>Public assets: /api/v1/assets</li><li>Notifications: /api/v1/notifications</li><li>Analytics: /api/v1/analytics/summary</li><li>GIS map data: /api/v1/map/assets</li></ul><p>Protected APIs require a bearer access token. Use the README and docs/requests.http for API examples.</p><p>The local launcher uses a clearly labelled synthetic village, not a government or live village dataset.</p></main></body></html>`));
  app.get(['/health','/api/health'], (req, res) => res.json({ status: 'ok' }));
  app.get(['/ready','/api/ready'], (req, res) => res.status(mongoose.connection.readyState === 1 ? 200 : 503).json({ database: mongoose.connection.readyState === 1 ? 'connected' : 'unavailable' }));
  const authenticate = authentication(config);
  app.use('/api/v1/auth', authRouter(config, authenticate));
  if (config.LOCAL_DEMO === true && config.NODE_ENV === 'development') app.use('/api/v1/demo', demoRouter(config));
  app.get('/api/cron/reminders',async(req,res)=>{const expected='Bearer '+(config.CRON_SECRET||'');const supplied=req.headers.authorization||'';if(!config.CRON_SECRET||Buffer.byteLength(expected)!==Buffer.byteLength(supplied)||!timingSafeEqual(Buffer.from(expected),Buffer.from(supplied)))return res.status(401).json({error:{message:'Cron authentication required'}});await checkComplaintAutomation();res.json({data:getAutomationStatus()});});
  app.use('/api/v1', authenticate);
  if(config.SERVERLESS)app.use('/api/v1',async(req,res,next)=>{try{if(['POST','PATCH'].includes(req.method)||req.path==='/automation/status')await checkComplaintAutomation();next();}catch(error){next(error);}});
  app.get('/api/v1/automation/status',(req,res)=>res.json({data:getAutomationStatus()}));
  app.use('/api/v1/ai', aiRouter(config));
  app.use('/api/v1/complaints', complaintRouter());
  app.use('/api/v1/notifications', notificationRouter());
  app.use('/api/v1/analytics', analyticsRouter());
  app.use('/api/v1', resourceRouter());
  app.use('/api/v1', attachmentRouter(config));
  app.use('/api/v1', gisRouter());
  app.use((req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found', requestId: req.requestId } }));
  app.use((err, req, res, next) => {
    let status = err.status || 500; let code = err.code || 'INTERNAL_ERROR'; let message = status < 500 ? err.message : 'An unexpected error occurred'; let fields;
    if (err instanceof ZodError) { status = 400; code = 'VALIDATION_ERROR'; message = 'Invalid request'; fields = err.issues.map(i => ({ field: i.path.join('.'), message: i.message })); }
    else if (err.code === 11000) { status = 409; code = 'DUPLICATE_RECORD'; message = 'Record already exists'; }
    else if (err.name === 'ValidationError' || err.name === 'CastError' || err.name === 'StrictModeError') { status = 400; code = 'VALIDATION_ERROR'; message = 'Invalid record data'; }
    else if (err.type === 'entity.parse.failed') { status = 400; code = 'INVALID_JSON'; message = 'Malformed JSON body'; }
    else if (err.name === 'MulterError') { status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400; code = 'UPLOAD_ERROR'; message = `Upload one image field, no extra fields, up to ${postgresMode?4:5} MB`; }
    if (status >= 500) console.error(JSON.stringify({ requestId: req.requestId, name: err.name, code: String(err.code || 'INTERNAL_ERROR') }));
    res.status(status).json({ error: { code, message, ...(fields ? { fields } : {}), requestId: req.requestId } });
  });
  return app;
}

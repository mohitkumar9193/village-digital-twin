import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import mongoose from 'mongoose';
import { z } from 'zod';
import { User, Session, Village, Department } from './models.js';
import { ApiError, validate } from './common.js';
const digest = value => createHash('sha256').update(value).digest('hex');
const credentials = z.object({ email: z.string().email().max(254).transform(v => v.toLowerCase()), password: z.string().min(12).max(72).refine(v => Buffer.byteLength(v) <= 72, 'Password exceeds bcrypt byte limit') }).strict();
const publicUser = u => ({ id: u._id, name: u.name, email: u.email, role: u.role, villageId: u.villageId, departmentId: u.departmentId });
const cookieName = 'sv_refresh';
function cookieOptions(config) { return { httpOnly: true, secure: config.NODE_ENV === 'production', sameSite: 'strict', path: '/api/v1/auth', maxAge: 7 * 86400000 }; }
export function authentication(config) {
  return async (req, res, next) => {
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) throw new ApiError(401, 'UNAUTHENTICATED', 'Bearer access token required');
    let payload;
    try { payload = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'], issuer: config.JWT_ISSUER, audience: config.JWT_AUDIENCE }); }
    catch { throw new ApiError(401, 'INVALID_TOKEN', 'Access token is invalid or expired'); }
    if (!mongoose.isValidObjectId(payload.sub) || !mongoose.isValidObjectId(payload.sid)) throw new ApiError(401, 'INVALID_TOKEN', 'Invalid access token');
    const session = await Session.findOne({ _id: payload.sid, userId: payload.sub, revokedAt: null, expiresAt: { $gt: new Date() } });
    const user = session && await User.findOne({ _id: payload.sub, isActive: true });
    if (!user) throw new ApiError(401, 'SESSION_REVOKED', 'Session is no longer active');
    if (!await Village.exists({ _id: user.villageId, isActive: true })) throw new ApiError(403, 'VILLAGE_UNAVAILABLE', 'Village is inactive');
    if (user.role === 'staff' && (!user.departmentId || !await Department.exists({ _id: user.departmentId, villageId: user.villageId, isActive: true }))) throw new ApiError(403, 'DEPARTMENT_UNAVAILABLE', 'Staff department is unavailable');
    req.user = user; req.authSession = session; next();
  };
}
export function authRouter(config, authenticate) {
  const router = Router();
  router.use(rateLimit({ windowMs: 15 * 60000, limit: 50, standardHeaders: 'draft-8', legacyHeaders: false }));
  const accessToken = (user, session) => jwt.sign({ sid: String(session._id) }, config.JWT_SECRET, { subject: String(user._id), expiresIn: '15m', issuer: config.JWT_ISSUER, audience: config.JWT_AUDIENCE, algorithm: 'HS256' });
  async function issue(user, res) {
    const secret = randomBytes(32).toString('hex');
    const session = await Session.create({ userId: user._id, tokenHash: digest(secret), expiresAt: new Date(Date.now() + 7 * 86400000) });
    res.cookie(cookieName, `${session._id}.${secret}`, cookieOptions(config));
    return { accessToken: accessToken(user, session), tokenType: 'Bearer', expiresIn: 900, user: publicUser(user) };
  }
  function checkOrigin(req) {
    if (req.headers.origin !== config.CORS_ORIGIN) throw new ApiError(403, 'INVALID_ORIGIN', 'Trusted frontend Origin header required');
  }
  router.post('/register', async (req, res) => {
    const body = validate(credentials.extend({ name: z.string().trim().min(2).max(100) }), req.body);
    if (!await Village.exists({ _id: config.VILLAGE_ID, isActive: true })) throw new ApiError(503, 'VILLAGE_UNAVAILABLE', 'Configured village is unavailable');
    const user = await User.create({ name: body.name, email: body.email, passwordHash: await bcrypt.hash(body.password, 12), role: 'citizen', villageId: config.VILLAGE_ID });
    res.status(201).json({ data: await issue(user, res) });
  });
  router.post('/login', async (req, res) => {
    const body = validate(credentials, req.body);
    const user = await User.findOne({ email: body.email, isActive: true }).select('+passwordHash');
    // A dummy hash makes missing accounts perform a bcrypt check too.
    const hash = user?.passwordHash || '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxBv6hBk7SXeNPBtV5SrYpUyqKq';
    if (!await bcrypt.compare(body.password, hash) || !user) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
    res.json({ data: await issue(user, res) });
  });
  router.post('/refresh', async (req, res) => {
    checkOrigin(req);
    const parts = req.cookies[cookieName]?.split('.');
    if (!parts || parts.length !== 2 || !mongoose.isValidObjectId(parts[0]) || !/^[a-f\d]{64}$/.test(parts[1])) throw new ApiError(401, 'INVALID_SESSION', 'Refresh cookie required');
    const session = await Session.findById(parts[0]).select('+tokenHash');
    if (!session || session.revokedAt || session.expiresAt <= new Date()) throw new ApiError(401, 'INVALID_SESSION', 'Refresh session expired');
    if (!timingSafeEqual(Buffer.from(session.tokenHash, 'hex'), Buffer.from(digest(parts[1]), 'hex'))) {
      await Session.updateOne({ _id: session._id }, { $set: { revokedAt: new Date() } });
      throw new ApiError(401, 'TOKEN_REUSE', 'Refresh token reuse detected; log in again');
    }
    const user = await User.findOne({ _id: session.userId, isActive: true });
    if (!user) throw new ApiError(401, 'INVALID_SESSION', 'User is unavailable');
    const secret = randomBytes(32).toString('hex');
    const rotated = await Session.findOneAndUpdate({ _id: session._id, tokenHash: session.tokenHash, revokedAt: null }, { $set: { tokenHash: digest(secret) } }, { new: true });
    if (!rotated) throw new ApiError(401, 'INVALID_SESSION', 'Refresh token already rotated');
    res.cookie(cookieName, `${session._id}.${secret}`, cookieOptions(config));
    res.json({ data: { accessToken: accessToken(user, session), tokenType: 'Bearer', expiresIn: 900, user: publicUser(user) } });
  });
  router.get('/me', authenticate, (req, res) => res.json({ data: publicUser(req.user) }));
  router.patch('/me', authenticate, async (req, res) => {
    const body = validate(z.object({ name: z.string().trim().min(2).max(100) }).strict(), req.body);
    req.user.name = body.name; await req.user.save(); res.json({ data: publicUser(req.user) });
  });
  router.post('/logout', authenticate, async (req, res) => {
    await Session.updateOne({ _id: req.authSession._id }, { $set: { revokedAt: new Date() } });
    res.clearCookie(cookieName, { ...cookieOptions(config), maxAge: undefined }); res.status(204).end();
  });
  router.post('/logout-all', authenticate, async (req, res) => {
    await Session.updateMany({ userId: req.user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
    res.clearCookie(cookieName, { ...cookieOptions(config), maxAge: undefined }); res.status(204).end();
  });
  router.post('/change-password', authenticate, async (req, res) => {
    const body = validate(z.object({ currentPassword: z.string().max(72), newPassword: credentials.shape.password }).strict(), req.body);
    const user = await User.findById(req.user._id).select('+passwordHash');
    if (!await bcrypt.compare(body.currentPassword, user.passwordHash)) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Current password is incorrect');
    await mongoose.connection.transaction(async session => {
      user.passwordHash = await bcrypt.hash(body.newPassword, 12); await user.save({ session });
      await Session.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } }, { session });
    });
    res.clearCookie(cookieName, { ...cookieOptions(config), maxAge: undefined }); res.status(204).end();
  });
  return router;
}

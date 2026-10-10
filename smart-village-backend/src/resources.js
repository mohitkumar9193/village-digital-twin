import { Router } from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Asset, Department, User, AuditLog, Village } from './models.js';
import { ApiError, allow, validate, id, categories, geometryInput, paging, sendList } from './common.js';
const text = z.string().trim().min(2).max(160);
const assetBody = z.object({ assetCode: z.string().trim().min(2).max(60), name: text, assetType: z.enum(['road', 'school', 'hospital', 'panchayat_office', 'water_tank', 'street_light', 'drainage', 'government_building', 'community_center', 'other']), geometry: geometryInput, condition: z.enum(['unknown', 'good', 'fair', 'poor', 'critical']).default('unknown'), departmentId: id.optional(), dataSource: z.string().trim().min(3).max(500), isDemo: z.boolean().default(false), lastInspectedAt: z.iso.datetime().optional() }).strict();
async function validDepartment(departmentId, villageId) {
  if (departmentId && !await Department.exists({ _id: departmentId, villageId, isActive: true })) throw new ApiError(400, 'INVALID_DEPARTMENT', 'Department is unavailable in this village');
}
export function resourceRouter() {
  const router = Router();
  router.get('/villages/:id', async (req, res) => {
    validate(id, req.params.id);
    if (String(req.user.villageId) !== req.params.id.toLowerCase()) throw new ApiError(404, 'NOT_FOUND', 'Village not found');
    res.json({ data: await Village.findById(req.user.villageId) });
  });
  router.get('/categories', (req, res) => res.json({ data: categories }));
  router.get('/departments', async (req, res) => res.json({ data: await Department.find({ villageId: req.user.villageId, isActive: true }).sort({ name: 1 }) }));
  router.post('/departments', allow('admin'), async (req, res) => {
    const body = validate(z.object({ name: text, categories: z.array(z.enum(categories)).min(1).max(categories.length) }).strict(), req.body);
    res.status(201).json({ data: await Department.create({ ...body, villageId: req.user.villageId }) });
  });
  router.patch('/departments/:id', allow('admin'), async (req, res) => {
    validate(id, req.params.id);
    const body = validate(z.object({ name: text.optional(), categories: z.array(z.enum(categories)).min(1).max(categories.length).optional() }).strict().refine(v => Object.keys(v).length > 0), req.body);
    const data = await Department.findOneAndUpdate({ _id: req.params.id, villageId: req.user.villageId }, { $set: body }, { new: true, runValidators: true });
    if (!data) throw new ApiError(404, 'NOT_FOUND', 'Department not found'); res.json({ data });
  });
  router.get('/users', allow('admin'), async (req, res) => {
    const { page, limit, skip } = paging(req.query);
    const filter = { villageId: req.user.villageId };
    const [data, total] = await Promise.all([User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit), User.countDocuments(filter)]);
    sendList(res, data, total, page, limit);
  });
  router.post('/users', allow('admin'), async (req, res) => {
    const body = validate(z.object({ name: text, email: z.string().email().max(254).transform(v => v.toLowerCase()), password: z.string().min(12).max(72).refine(v => Buffer.byteLength(v) <= 72), departmentId: id }).strict(), req.body);
    await validDepartment(body.departmentId, req.user.villageId);
    let data;
    await mongoose.connection.transaction(async session => {
      [data] = await User.create([{ name: body.name, email: body.email, passwordHash: await bcrypt.hash(body.password, 12), departmentId: body.departmentId, role: 'staff', villageId: req.user.villageId }], { session });
      await AuditLog.create([{ villageId: req.user.villageId, actorId: req.user._id, action: 'staff_created', entityId: data._id }], { session });
    });
    const output = data.toObject(); delete output.passwordHash; res.status(201).json({ data: output });
  });
  router.patch('/users/:id', allow('admin'), async (req, res) => {
    validate(id, req.params.id);
    const body = validate(z.object({ name: text.optional(), isActive: z.boolean().optional() }).strict().refine(v => Object.keys(v).length > 0), req.body);
    // Department and role changes require a separate reassignment policy; not accepted here.
    let data;
    await mongoose.connection.transaction(async session => {
      data = await User.findOneAndUpdate({ _id: req.params.id, villageId: req.user.villageId, role: { $ne: 'admin' } }, { $set: body }, { new: true, runValidators: true, session });
      if (!data) throw new ApiError(404, 'NOT_FOUND', 'Non-admin user not found');
      await AuditLog.create([{ villageId: req.user.villageId, actorId: req.user._id, action: 'user_updated', entityId: data._id, details: body }], { session });
    });
    res.json({ data });
  });
  router.get('/assets', async (req, res) => {
    const { page, limit, skip } = paging(req.query);
    const filters = validate(z.object({ assetType: assetBody.shape.assetType.optional(), condition: z.enum(['unknown', 'good', 'fair', 'poor', 'critical']).optional(), isActive: z.enum(['true', 'false']).optional() }), req.query);
    const filter = { villageId: req.user.villageId, isActive: filters.isActive !== 'false' };
    if (filters.assetType) filter.assetType = filters.assetType;
    if (filters.condition) filter.condition = filters.condition;
    const [data, total] = await Promise.all([Asset.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit), Asset.countDocuments(filter)]);
    sendList(res, data, total, page, limit);
  });
  router.get('/assets/:id', async (req, res) => {
    validate(id, req.params.id);
    const data = await Asset.findOne({ _id: req.params.id, villageId: req.user.villageId });
    if (!data) throw new ApiError(404, 'NOT_FOUND', 'Asset not found'); res.json({ data });
  });
  router.post('/assets', allow('admin'), async (req, res) => {
    const body = validate(assetBody, req.body); await validDepartment(body.departmentId, req.user.villageId);
    let data;
    await mongoose.connection.transaction(async session => {
      [data] = await Asset.create([{ ...body, villageId: req.user.villageId }], { session });
      await AuditLog.create([{ villageId: req.user.villageId, actorId: req.user._id, action: 'asset_created', entityId: data._id }], { session });
    });
    res.status(201).json({ data });
  });
  router.patch('/assets/:id', allow('admin'), async (req, res) => {
    validate(id, req.params.id);
    const body = validate(assetBody.omit({ condition: true, isDemo: true }).partial().extend({ condition: z.enum(['unknown', 'good', 'fair', 'poor', 'critical']).optional(), isDemo: z.boolean().optional(), isActive: z.boolean().optional() }).refine(v => Object.keys(v).length > 0), req.body);
    await validDepartment(body.departmentId, req.user.villageId);
    let data;
    await mongoose.connection.transaction(async session => {
      data = await Asset.findOneAndUpdate({ _id: req.params.id, villageId: req.user.villageId }, { $set: body }, { new: true, runValidators: true, session });
      if (!data) throw new ApiError(404, 'NOT_FOUND', 'Asset not found');
      await AuditLog.create([{ villageId: req.user.villageId, actorId: req.user._id, action: 'asset_updated', entityId: data._id, details: body }], { session });
    });
    res.json({ data });
  });
  router.get('/audit-logs', allow('admin'), async (req, res) => {
    const { page, limit, skip } = paging(req.query); const filter = { villageId: req.user.villageId };
    const [data, total] = await Promise.all([AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit), AuditLog.countDocuments(filter)]);
    sendList(res, data, total, page, limit);
  });
  return router;
}

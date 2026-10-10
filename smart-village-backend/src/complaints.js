import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Complaint, ComplaintEvent, Notification, Department, User, Asset, Attachment, Village, Area } from './models.js';
import { ApiError, allow, validate, id, categories, priorities, pointInput, paging, sendList, scope } from './common.js';

async function notify(complaint, event, session) {
  const recipients = await User.find({ villageId: complaint.villageId, isActive: true, $or: [{ _id: complaint.citizenId }, { role: 'admin' }, ...(complaint.departmentId ? [{ role: 'staff', departmentId: complaint.departmentId }] : [])] }).session(session).select('_id');
  if (recipients.length) await Notification.insertMany(recipients.map(user => ({ recipientId: user._id, villageId: complaint.villageId, complaintId: complaint._id, eventId: event._id, type: event.eventType, message: `${complaint.trackingNumber}: ${event.eventType.replaceAll('_', ' ')}` })), { session });
}
async function record(complaint, user, eventType, fromStatus, remarks, session) {
  const [event] = await ComplaintEvent.create([{ complaintId: complaint._id, villageId: complaint.villageId, actorId: user._id, eventType, fromStatus, toStatus: complaint.status, remarks, departmentId: complaint.departmentId, assignedStaffId: complaint.assignedStaffId }], { session });
  await notify(complaint, event, session);
}
export async function getComplaint(user, complaintId, session) {
  validate(id, complaintId);
  const query = Complaint.findOne({ _id: complaintId, ...scope(user) });
  if (session) query.session(session);
  const complaint = await query;
  if (!complaint) throw new ApiError(404, 'NOT_FOUND', 'Complaint not found');
  return complaint;
}
const command = z.object({ version: z.number().int().nonnegative(), remarks: z.string().trim().min(3).max(2000).optional() }).strict();
export function complaintRouter() {
  const router = Router();
  router.post('/', allow('citizen'), async (req, res) => {
    const body = validate(z.object({ title: z.string().trim().min(5).max(160), description: z.string().trim().min(10).max(5000), category: z.enum(categories), location: pointInput, assetId: id.optional(), areaId: id.optional() }).strict(), req.body);
    if (body.assetId && !await Asset.exists({ _id: body.assetId, villageId: req.user.villageId, isActive: true })) throw new ApiError(400, 'INVALID_ASSET', 'Asset is unavailable in your village');
    const village = await Village.findOne({ _id: req.user.villageId, isActive: true });
    if (!village) throw new ApiError(503, 'VILLAGE_UNAVAILABLE', 'Village is unavailable');
    if (village.boundary && !await Village.exists({ _id: village._id, boundary: { $geoIntersects: { $geometry: body.location } } })) throw new ApiError(400, 'OUTSIDE_VILLAGE', 'Complaint location is outside the configured village boundary');
    if (body.areaId) {
      const area = await Area.findOne({ _id: body.areaId, villageId: req.user.villageId });
      if (!area || (area.boundary && !await Area.exists({ _id: area._id, boundary: { $geoIntersects: { $geometry: body.location } } }))) throw new ApiError(400, 'INVALID_AREA', 'Area is unavailable or does not contain this location');
    }
    let complaint;
    await mongoose.connection.transaction(async session => {
      [complaint] = await Complaint.create([{ ...body, citizenId: req.user._id, villageId: req.user.villageId, trackingNumber: `SV-${randomUUID()}` }], { session });
      await record(complaint, req.user, 'submitted', undefined, undefined, session);
    });
    res.status(201).json({ data: complaint });
  });
  router.get('/', async (req, res) => {
    const { page, limit, skip } = paging(req.query);
    const filters = validate(z.object({ status: z.enum(Complaint.schema.path('status').enumValues).optional(), category: z.enum(categories).optional(), departmentId: id.optional(), areaId: id.optional() }), req.query);
    const filter = { ...filters, ...scope(req.user) };
    const [data, total] = await Promise.all([Complaint.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit), Complaint.countDocuments(filter)]);
    sendList(res, data, total, page, limit);
  });
  router.get('/:id', async (req, res) => res.json({ data: await getComplaint(req.user, req.params.id) }));
  router.get('/:id/events', async (req, res) => {
    const complaint = await getComplaint(req.user, req.params.id);
    const { page, limit, skip } = paging(req.query);
    const filter = { complaintId: complaint._id };
    const [data, total] = await Promise.all([ComplaintEvent.find(filter).sort({ createdAt: 1, _id: 1 }).skip(skip).limit(limit), ComplaintEvent.countDocuments(filter)]);
    sendList(res, data, total, page, limit);
  });
  const actions = {
    verify: { roles: ['admin'], from: ['submitted'], to: 'verified' },
    reject: { roles: ['admin'], from: ['submitted', 'verified'], to: 'rejected', reason: true },
    assign: { roles: ['admin'], from: ['verified', 'assigned', 'in_progress', 'reopened'], to: 'assigned' },
    start: { roles: ['staff'], from: ['assigned', 'reopened'], to: 'in_progress' },
    progress: { roles: ['staff'], from: ['in_progress'], to: 'in_progress', reason: true },
    resolve: { roles: ['staff'], from: ['in_progress'], to: 'resolved', reason: true },
    close: { roles: ['admin'], from: ['resolved'], to: 'closed' },
    reopen: { roles: ['admin'], from: ['resolved', 'closed'], to: 'reopened', reason: true },
    'reopen-requests': { roles: ['citizen'], from: ['resolved', 'closed'], reason: true },
    priority: { roles: ['admin'], from: ['submitted', 'verified', 'assigned', 'in_progress', 'reopened'], reason: true },
  };
  for (const [action, policy] of Object.entries(actions)) {
    const schema = action === 'assign' ? command.extend({ departmentId: id, assignedStaffId: id.optional() }) : action === 'priority' ? command.extend({ priority: z.enum(priorities) }) : command;
    const handler = async (req, res) => {
      const body = validate(schema, req.body);
      if (policy.reason && !body.remarks) throw new ApiError(400, 'REMARKS_REQUIRED', 'Remarks are required');
      let updated;
      await mongoose.connection.transaction(async session => {
        const complaint = await getComplaint(req.user, req.params.id, session);
        if (complaint.version !== body.version) throw new ApiError(409, 'VERSION_CONFLICT', 'Reload the latest complaint before updating');
        if (!policy.from.includes(complaint.status)) throw new ApiError(409, 'INVALID_TRANSITION', `Cannot ${action} a ${complaint.status} complaint`);
        const changes = { status: policy.to || complaint.status };
        if (action === 'assign') {
          const department = await Department.findOne({ _id: body.departmentId, villageId: req.user.villageId, isActive: true }).session(session);
          if (!department || !department.categories.includes(complaint.category)) throw new ApiError(400, 'INVALID_DEPARTMENT', 'Department must support this complaint category');
          if (body.assignedStaffId && !await User.exists({ _id: body.assignedStaffId, villageId: req.user.villageId, departmentId: department._id, role: 'staff', isActive: true }).session(session)) throw new ApiError(400, 'INVALID_STAFF', 'Staff must belong to the assigned department');
          changes.departmentId = department._id; changes.assignedStaffId = body.assignedStaffId || null;
        }
        if (action === 'priority') { changes.priority = body.priority; changes.automationDueAt = new Date((complaint.resolutionCycleStartedAt || complaint.createdAt).getTime() + ({low:168,medium:72,high:24,critical:4}[body.priority])*3600000); }
        if (action === 'resolve') {
          // Evidence from an earlier resolution is insufficient after reopening.
          if (!await Attachment.exists({ complaintId: complaint._id, purpose: 'resolution_evidence', createdAt: { $gte: complaint.resolutionCycleStartedAt || complaint.createdAt } }).session(session)) throw new ApiError(400, 'EVIDENCE_REQUIRED', 'Upload resolution evidence for the current work cycle');
          changes.resolvedAt = new Date(); changes.resolutionRemarks = body.remarks;
        }
        if (action === 'close') changes.closedAt = new Date();
        if (action === 'reopen') { changes.resolvedAt = null; changes.closedAt = null; changes.resolutionRemarks = null; changes.resolutionCycleStartedAt = new Date(); changes.automationDueAt = null; changes.lastReminderAt = null; }
        updated = await Complaint.findOneAndUpdate({ _id: complaint._id, version: body.version }, { $set: changes, $inc: { version: 1 } }, { new: true, runValidators: true, session });
        if (!updated) throw new ApiError(409, 'VERSION_CONFLICT', 'Complaint changed; reload and retry');
        await record(updated, req.user, action.replaceAll('-', '_'), complaint.status, body.remarks, session);
      });
      res.json({ data: updated });
    };
    if (action === 'priority') router.patch('/:id/priority', allow(...policy.roles), handler);
    else router.post(`/:id/${action}`, allow(...policy.roles), handler);
  }
  return router;
}

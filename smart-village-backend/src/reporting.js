import { Router } from 'express';
import { z } from 'zod';
import { Complaint, Notification } from './models.js';
import { allow, ApiError, validate, id, scope, paging, sendList } from './common.js';
export function notificationRouter() {
  const router = Router();
  router.get('/', async (req, res) => {
    const { page, limit, skip } = paging(req.query);
    const unread = validate(z.enum(['true', 'false']).optional(), req.query.unread);
    const filter = { recipientId: req.user._id };
    if (unread === 'true') filter.readAt = null;
    if (unread === 'false') filter.readAt = { $ne: null };
    const [data, total] = await Promise.all([Notification.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit), Notification.countDocuments(filter)]);
    sendList(res, data, total, page, limit);
  });
  router.post('/read-all', async (req, res) => {
    const result = await Notification.updateMany({ recipientId: req.user._id, readAt: null }, { $set: { readAt: new Date() } });
    res.json({ data: { updated: result.modifiedCount } });
  });
  router.patch('/:id/read', async (req, res) => {
    validate(id, req.params.id);
    const data = await Notification.findOneAndUpdate({ _id: req.params.id, recipientId: req.user._id }, { $set: { readAt: new Date() } }, { new: true });
    if (!data) throw new ApiError(404, 'NOT_FOUND', 'Notification not found'); res.json({ data });
  });
  return router;
}
export function analyticsRouter() {
  const router = Router(); router.use(allow('admin', 'staff'));
  router.use((req, res, next) => {
    const body = validate(z.object({ from: z.iso.datetime().optional(), to: z.iso.datetime().optional() }), req.query);
    const filter = scope(req.user);
    if (body.from || body.to) {
      const from = body.from ? new Date(body.from) : new Date(Date.now() - 365 * 86400000);
      const to = body.to ? new Date(body.to) : new Date();
      if (from > to || to - from > 366 * 86400000) throw new ApiError(400, 'INVALID_DATE_RANGE', 'Date range must be ordered and at most 366 days');
      filter.createdAt = { $gte: from, $lte: to };
    }
    req.analyticsFilter = filter; next();
  });
  router.get('/summary', async (req, res) => {
    const counts = await Complaint.aggregate([{ $match: req.analyticsFilter }, { $group: { _id: '$status', count: { $sum: 1 } } }]);
    const statuses = Object.fromEntries(Complaint.schema.path('status').enumValues.map(s => [s, 0]));
    for (const row of counts) statuses[row._id] = row.count;
    res.json({ data: { total: Object.values(statuses).reduce((a, b) => a + b, 0), pending: statuses.submitted + statuses.verified + statuses.assigned + statuses.reopened, inProgress: statuses.in_progress, resolved: statuses.resolved, closed: statuses.closed, rejected: statuses.rejected, statuses } });
  });
  router.get('/categories', async (req, res) => res.json({ data: await Complaint.aggregate([{ $match: req.analyticsFilter }, { $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { count: -1 } }]) }));
  router.get('/areas', async (req, res) => res.json({ data: await Complaint.aggregate([{ $match: req.analyticsFilter }, { $group: { _id: '$areaId', count: { $sum: 1 } } }, { $lookup: { from: 'areas', localField: '_id', foreignField: '_id', as: 'area' } }, { $project: { areaId: '$_id', name: { $ifNull: [{ $arrayElemAt: ['$area.name', 0] }, 'Unspecified'] }, count: 1 } }, { $sort: { count: -1 } }]) }));
  router.get('/trends', async (req, res) => {
    const interval = validate(z.enum(['week', 'month']).default('month'), req.query.interval);
    res.json({ data: await Complaint.aggregate([{ $match: req.analyticsFilter }, { $group: { _id: { $dateTrunc: { date: '$createdAt', unit: interval, timezone: 'Asia/Kolkata', startOfWeek: 'monday' } }, submitted: { $sum: 1 } } }, { $sort: { _id: 1 } }]), meta: { interval, timezone: 'Asia/Kolkata', measure: 'Complaints grouped by submission date; missing periods have zero submissions' } });
  });
  router.get('/departments', async (req, res) => {
    res.json({ data: await Complaint.aggregate([
      { $match: req.analyticsFilter },
      { $group: { _id: '$departmentId', assignedTotal: { $sum: 1 }, resolvedOrClosed: { $sum: { $cond: [{ $in: ['$status', ['resolved', 'closed']] }, 1, 0] } }, averageResolutionHours: { $avg: { $cond: [{ $and: [{ $ne: ['$resolvedAt', null] }, { $in: ['$status', ['resolved', 'closed']] }] }, { $divide: [{ $subtract: ['$resolvedAt', '$createdAt'] }, 3600000] }, null] } } } },
      { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'department' } },
      { $project: { departmentId: '$_id', name: { $ifNull: [{ $arrayElemAt: ['$department.name', 0] }, 'Unassigned'] }, assignedTotal: 1, resolvedOrClosed: 1, averageResolutionHours: 1, resolutionRate: { $divide: ['$resolvedOrClosed', '$assignedTotal'] } } },
    ]), meta: { attribution: 'Current assigned department; duration is submission to most recent resolution', dateFilter: 'Submission date' } });
  });
  router.get('/density', async (req, res) => {
    const cellSize = validate(z.coerce.number().min(0.001).max(0.1).default(0.01), req.query.cellSize);
    res.json({ data: await Complaint.aggregate([{ $match: req.analyticsFilter }, { $group: { _id: { longitudeCell: { $floor: { $divide: [{ $arrayElemAt: ['$location.coordinates', 0] }, cellSize] } }, latitudeCell: { $floor: { $divide: [{ $arrayElemAt: ['$location.coordinates', 1] }, cellSize] } } }, count: { $sum: 1 } } }]), meta: { cellSizeDegrees: cellSize, description: 'Counts in geographic grid cells, not population-adjusted risk' } });
  });
  return router;
}

import { Router } from 'express';
import { z } from 'zod';
import { Area, Village, Asset, Complaint } from './models.js';
import { ApiError, allow, validate, id, geometryInput, scope } from './common.js';
const polygon = geometryInput.refine(v => ['Polygon', 'MultiPolygon'].includes(v.type), 'Boundary must be Polygon or MultiPolygon');
const areaInput = z.object({ name: z.string().trim().min(2).max(100), boundary: polygon.optional(), dataSource: z.string().trim().min(3).max(500), isDemo: z.boolean().default(false) }).strict();
export function gisRouter() {
  const router = Router();
  router.get('/villages/:id/boundary', async (req, res) => {
    validate(id, req.params.id);
    if (req.params.id.toLowerCase() !== String(req.user.villageId)) throw new ApiError(404, 'NOT_FOUND', 'Village not found');
    const village = await Village.findById(req.user.villageId);
    res.json({ data: village?.boundary || null, meta: { configured: Boolean(village?.boundary) } });
  });
  router.patch('/villages/:id/boundary', allow('admin'), async (req, res) => {
    validate(id, req.params.id);
    const body = validate(z.object({ boundary: polygon }).strict(), req.body);
    if (req.params.id.toLowerCase() !== String(req.user.villageId)) throw new ApiError(404, 'NOT_FOUND', 'Village not found');
    const data = await Village.findByIdAndUpdate(req.user.villageId, { $set: body }, { new: true }); res.json({ data: data.boundary });
  });
  router.get('/areas', async (req, res) => res.json({ data: await Area.find({ villageId: req.user.villageId }).sort({ name: 1 }).limit(500) }));
  router.post('/areas', allow('admin'), async (req, res) => {
    const body = validate(areaInput, req.body); res.status(201).json({ data: await Area.create({ ...body, villageId: req.user.villageId }) });
  });
  router.patch('/areas/:id', allow('admin'), async (req, res) => {
    validate(id, req.params.id);
    const body = validate(areaInput.omit({ isDemo: true }).partial().extend({ isDemo: z.boolean().optional() }).refine(v => Object.keys(v).length > 0), req.body);
    const data = await Area.findOneAndUpdate({ _id: req.params.id, villageId: req.user.villageId }, { $set: body }, { new: true, runValidators: true });
    if (!data) throw new ApiError(404, 'NOT_FOUND', 'Area not found'); res.json({ data });
  });
  for (const [endpoint, model, geometry] of [['assets', Asset, 'geometry'], ['complaints', Complaint, 'location']]) {
    router.get(`/map/${endpoint}`, async (req, res) => {
      const bounds = validate(z.string().transform(v => v.split(',').map(Number)).pipe(z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90), z.number().min(-180).max(180), z.number().min(-90).max(90)]).refine(v => v[0] < v[2] && v[1] < v[3], 'Ordered bounding box required')), req.query.bbox);
      const [west, south, east, north] = bounds;
      const filter = endpoint === 'complaints' ? scope(req.user) : { villageId: req.user.villageId, isActive: true };
      filter[geometry] = { $geoIntersects: { $geometry: { type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] } } };
      const docs = await model.find(filter).limit(501);
      const features = docs.slice(0, 500).map(d => ({ type: 'Feature', id: String(d._id), geometry: d[geometry], properties: endpoint === 'assets' ? { name: d.name, assetType: d.assetType, condition: d.condition, isDemo: d.isDemo } : { trackingNumber: d.trackingNumber, category: d.category, status: d.status, priority: d.priority } }));
      res.json({ type: 'FeatureCollection', features, meta: { truncated: docs.length > 500, limit: 500 } });
    });
  }
  return router;
}

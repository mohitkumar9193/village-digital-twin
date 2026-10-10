import { Router } from 'express';
import { Village, Asset, Complaint } from './models.js';
// Read-only synthetic records only. This route is mounted exclusively by the loopback local launcher.
export function demoRouter(config) {
  const router = Router();
  router.get('/snapshot', async (req, res) => {
    const village = await Village.findOne({ _id: config.VILLAGE_ID, isDemo: true }).select('name boundary isDemo');
    if (!village) return res.status(404).json({ error: { code: 'DEMO_UNAVAILABLE', message: 'Demo village unavailable' } });
    const [assets, complaints] = await Promise.all([
      Asset.find({ villageId: village._id, isDemo: true, isActive: true }).select('name assetCode assetType geometry condition dataSource lastInspectedAt isDemo').limit(500).lean(),
      Complaint.find({ villageId: village._id, isDemo: true }).select('title description trackingNumber category location status priority createdAt resolvedAt isDemo assetId').sort({ createdAt: -1 }).limit(500).lean(),
    ]);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ data: { village, assets, complaints }, meta: { mode: 'demo', source: 'Synthetic GIS demonstration stored in local MongoDB. Not an official village survey.', fetchedAt: new Date().toISOString() } });
  });
  return router;
}

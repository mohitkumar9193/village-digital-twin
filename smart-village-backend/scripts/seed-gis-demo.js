import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { Village, User, Department, Asset, Complaint, ComplaintEvent } from '../src/models.js';
const source = 'Synthetic GIS demonstration';
const point = (lng, lat) => ({ type: 'Point', coordinates: [lng, lat] });
export async function seedGisDemo(villageId) {
  const village = await Village.findById(villageId);
  if (!village || !village.name.includes('(synthetic)')) return; // Never modify a real village.
  const boundary = { type: 'Polygon', coordinates: [[[75.704, 26.968], [75.721, 26.968], [75.722, 26.982], [75.704, 26.982], [75.704, 26.968]]] };
  const assetData = [
    ['R01', 'Main village road', 'road', { type: 'LineString', coordinates: [[75.705, 26.974], [75.710, 26.9748], [75.716, 26.975], [75.720, 26.977]] }, 'fair'],
    ['R02', 'North connecting road', 'road', { type: 'LineString', coordinates: [[75.710, 26.969], [75.710, 26.9748], [75.712, 26.9805]] }, 'poor'],
    ['S01', 'Village primary school', 'school', point(75.708, 26.977), 'good'],
    ['S02', 'Government secondary school', 'school', point(75.7165, 26.979), 'good'],
    ['H01', 'Primary health centre', 'hospital', point(75.714, 26.973), 'good'],
    ['W01', 'North water tank', 'water_tank', point(75.711, 26.9795), 'poor'],
    ['W02', 'South water tank', 'water_tank', point(75.707, 26.970), 'good'],
    ['L01', 'Street light · main junction', 'street_light', point(75.710, 26.9748), 'poor'],
    ['L02', 'Street light · school lane', 'street_light', point(75.708, 26.976), 'good'],
    ['L03', 'Street light · east road', 'street_light', point(75.7175, 26.976), 'good'],
    ['D01', 'East drainage channel', 'drainage', { type: 'LineString', coordinates: [[75.7185, 26.9695], [75.7185, 26.974], [75.720, 26.9775]] }, 'fair'],
    ['P01', 'Gram panchayat office', 'panchayat_office', point(75.7125, 26.9755), 'good'],
    ['C01', 'Community centre', 'community_center', point(75.7145, 26.9775), 'good'],
  ];
  await mongoose.connection.transaction(async session => {
    await Village.updateOne({ _id: villageId }, { $set: { isDemo: true, ...(!village.boundary ? { boundary } : {}) } }, { session });
    let citizen = await User.findOne({ email: 'gis-fixture@demo.village.local' }).session(session);
    if (!citizen) [citizen] = await User.create([{ name: 'Synthetic GIS fixture citizen', email: 'gis-fixture@demo.village.local', passwordHash: await bcrypt.hash(new mongoose.Types.ObjectId().toString(), 12), role: 'citizen', villageId }], { session });
    let department = await Department.findOne({ villageId, name: 'Demo Public Works' }).session(session);
    if (!department) [department] = await Department.create([{ villageId, name: 'Demo Public Works', categories: ['roads', 'water', 'electricity', 'sanitation', 'drainage', 'street_lights', 'other'] }], { session });
    const assets = {};
    for (const [code, name, assetType, geometry, condition] of assetData) {
      const assetCode = `DEMO-${code}`;
      assets[code] = await Asset.findOneAndUpdate({ villageId, assetCode, isDemo: true }, { $setOnInsert: { villageId, assetCode, name, assetType, geometry, condition, departmentId: department._id, dataSource: source, isDemo: true, lastInspectedAt: new Date('2026-10-01T09:00:00Z') } }, { upsert: true, new: true, session });
    }
    const complaints = [
      ['001', 'Water leak near north tank', 'water', 75.7112, 26.9793, 'in_progress', 'high', 'W01'],
      ['002', 'Damaged surface on north road', 'roads', 75.7108, 26.9778, 'assigned', 'high', 'R02'],
      ['003', 'Street light not working', 'street_lights', 75.7102, 26.9746, 'submitted', 'medium', 'L01'],
      ['004', 'Drainage channel needs cleaning', 'drainage', 75.7187, 26.973, 'verified', 'medium', 'D01'],
      ['005', 'Waste collection delayed', 'sanitation', 75.715, 26.977, 'resolved', 'low', 'C01'],
      ['006', 'Water supply restored', 'water', 75.7072, 26.9702, 'closed', 'low', 'W02'],
    ];
    for (const [code, title, category, lng, lat, status, priority, assetCode] of complaints) {
      const trackingNumber = `DEMO-GIS-${code}`;
      if (await Complaint.exists({ trackingNumber }).session(session)) continue;
      const [complaint] = await Complaint.create([{ trackingNumber, villageId, citizenId: citizen._id, title, description: `${title}. Synthetic scenario for the Digital Twin demonstration; not a real citizen report.`, category, location: point(lng, lat), status, priority, assetId: assets[assetCode]._id, ...(status !== 'submitted' ? { departmentId: department._id } : {}), isDemo: true, ...(status === 'resolved' || status === 'closed' ? { resolvedAt: new Date(), resolutionRemarks: 'Synthetic demo resolution; not evidence of real work.' } : {}), ...(status === 'closed' ? { closedAt: new Date() } : {}) }], { session });
      await ComplaintEvent.create([{ complaintId: complaint._id, villageId, actorId: citizen._id, eventType: 'demo_fixture_import', toStatus: status, remarks: 'Synthetic initial state, not a historical workflow event.' }], { session });
    }
  });
}

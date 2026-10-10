import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import mongoose,{postgresMode} from './database.js';
import {sql} from './postgres.js';
import { Attachment, Complaint } from './models.js';
import { getComplaint } from './complaints.js';
import { ApiError, id, validate } from './common.js';
export function attachmentRouter(config) {
  const router = Router();
  const root = resolve(config.UPLOAD_DIR || 'data/uploads');
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: (postgresMode?4:5) * 1024 * 1024, files: 1, fields: 0, parts: 1 } }).single('image');
  router.post('/complaints/:id/attachments', async (req, res, next) => {
    const complaint = await getComplaint(req.user, req.params.id);
    if (!(req.user.role === 'citizen' && complaint.status === 'submitted') && !(req.user.role === 'staff' && complaint.status === 'in_progress')) throw new ApiError(403, 'UPLOAD_FORBIDDEN', 'Citizens upload before verification; staff upload during work');
    next();
  }, upload, async (req, res) => {
    if (!req.file) throw new ApiError(400, 'IMAGE_REQUIRED', 'Multipart field image is required');
    let image;
    try {
      const processor = sharp(req.file.buffer, { limitInputPixels: 20000000, failOn: 'warning' });
      const metadata = await processor.metadata();
      if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) > 1) throw new Error('Unsupported format');
      image = await processor.rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    } catch { throw new ApiError(400, 'INVALID_IMAGE', `Provide a valid static JPEG, PNG, or WebP image up to ${postgresMode?4:5} MB and 20 megapixels`); }
    const storageKey = `${randomUUID()}.jpg`; const path = resolve(root, storageKey);
    if(!postgresMode){await mkdir(root, { recursive: true }); await writeFile(path, image, { flag: 'wx' });}
    let attachment;
    try {
      await mongoose.connection.transaction(async session => {
        const complaint = await getComplaint(req.user, req.params.id, session);
        const purpose = req.user.role === 'citizen' ? 'complaint_photo' : 'resolution_evidence';
        const expectedStatus = purpose === 'complaint_photo' ? 'submitted' : 'in_progress';
        if (complaint.status !== expectedStatus) throw new ApiError(409, 'INVALID_TRANSITION', 'Complaint status changed; reload and retry');
        if (await Attachment.countDocuments({ complaintId: complaint._id }).session(session) >= 20) throw new ApiError(400, 'ATTACHMENT_LIMIT', 'Maximum 20 images per complaint');
        // Write the same document as transitions to serialize concurrent upload/status changes.
        const result = await Complaint.updateOne({ _id: complaint._id, version: complaint.version }, { $inc: { version: 1 } }, { session, timestamps: false });
        if (!result.modifiedCount) throw new ApiError(409, 'VERSION_CONFLICT', 'Complaint changed; retry upload');
        [attachment] = await Attachment.create([{ complaintId: complaint._id, villageId: complaint.villageId, uploadedBy: req.user._id, purpose, storageKey, sizeBytes: image.length }], { session });
        if(postgresMode)await sql('INSERT INTO village_images(id,image) VALUES($1,$2)',[String(attachment._id),image]);
      });
    } catch (error) { if(!postgresMode)await unlink(path).catch(() => {}); throw error; }
    const data = attachment.toObject(); delete data.storageKey;
    res.status(201).json({ data, meta: { reloadComplaint: true } });
  });
  router.get('/complaints/:id/attachments', async (req, res) => {
    const complaint = await getComplaint(req.user, req.params.id);
    res.json({ data: await Attachment.find({ complaintId: complaint._id }).select('-storageKey').sort({ createdAt: 1 }) });
  });
  router.get('/attachments/:id/download', async (req, res) => {
    validate(id, req.params.id);
    const attachment = await Attachment.findById(req.params.id);
    if (!attachment) throw new ApiError(404, 'NOT_FOUND', 'Attachment not found');
    await getComplaint(req.user, String(attachment.complaintId));
    res.setHeader('Cache-Control', 'private, no-store');
    if(postgresMode){const row=(await sql('SELECT image FROM village_images WHERE id=$1',[String(attachment._id)])).rows[0];if(!row)throw new ApiError(404,'IMAGE_UNAVAILABLE','Image file is unavailable');return res.type('image/jpeg').send(Buffer.from(row.image));}
    res.type('image/jpeg').sendFile(resolve(root, attachment.storageKey), error => {
      if (!error) return;
      if (!res.headersSent) res.status(404).json({ error: { code: 'IMAGE_UNAVAILABLE', message: 'Image file is unavailable', requestId: req.requestId } });
      else res.end();
    });
  });
  return router;
}

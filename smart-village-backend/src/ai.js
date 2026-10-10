import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Complaint, Asset } from './models.js';
import { allow, ApiError } from './common.js';

const resultSchema = z.object({ suggested_priority:z.enum(['low','medium','high','critical']), attention_level:z.enum(['low','medium','high','critical']), model_version:z.string().max(100), synthetic:z.boolean(), class_scores:z.record(z.string(),z.number().min(0).max(1)), reasons:z.array(z.string().max(500)).max(20), recommendations:z.array(z.string().max(500)).max(20), warnings:z.array(z.string().max(500)).max(20), features:z.record(z.string(),z.union([z.string(),z.number()])) });
const schema = new mongoose.Schema({villageId:{type:mongoose.Schema.Types.ObjectId,required:true},complaintId:{type:mongoose.Schema.Types.ObjectId,required:true},result:mongoose.Schema.Types.Mixed,sourceVersion:Number,generatedAt:Date},{timestamps:true});
schema.index({villageId:1,complaintId:1},{unique:true});
export const AiRecommendation = mongoose.model('AiRecommendation',schema);

export async function callAi(config,path,body) {
  if (!config.AI_SERVICE_URL || !config.AI_SERVICE_KEY) throw new ApiError(503,'AI_UNAVAILABLE','AI service is not configured');
  try {
    const response=await fetch(`${config.AI_SERVICE_URL}${path}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-AI-Key':config.AI_SERVICE_KEY},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(8000)});
    if (!response.ok) throw new Error('Service rejected request');
    return await response.json();
  } catch { throw new ApiError(503,'AI_UNAVAILABLE','AI service is unavailable. Existing complaint management remains available.'); }
}
export async function complaintFeatures(complaint,now=new Date()) {
  const asset=complaint.assetId?await Asset.findOne({_id:complaint.assetId,villageId:complaint.villageId}).lean():null;
  const recent=await Complaint.countDocuments({villageId:complaint.villageId,_id:{$ne:complaint._id},category:complaint.category,createdAt:{$gte:new Date(now.getTime()-30*86400000),$lte:now}});
  return {category:complaint.category,asset_condition:asset?.condition||'unknown',age_hours:Math.max(0,(now-new Date(complaint.createdAt))/3600000),recent_category_reports:recent};
}
export function aiRouter(config) {
  const router=Router(); router.use(allow('admin'));
  router.get('/model',async(req,res)=>res.json({data:await callAi(config,'/model')}));
  router.get('/recommendations',async(req,res)=>{
    const active=await Complaint.find({villageId:req.user.villageId,status:{$nin:['closed','resolved','rejected']}}).select('_id version').lean();
    const records=await AiRecommendation.find({villageId:req.user.villageId,complaintId:{$in:active.map(c=>c._id)}}).sort({generatedAt:-1}).limit(100).lean();
    res.json({data:records.map(r=>({...r,stale:r.sourceVersion!==active.find(c=>String(c._id)===String(r.complaintId))?.version || Date.now()-new Date(r.generatedAt)>3600000})),total:active.length});
  });
  router.post('/recommendations/refresh',async(req,res)=>{
    z.object({}).strict().parse(req.body||{});
    const complaints=await Complaint.find({villageId:req.user.villageId,status:{$nin:['closed','resolved','rejected']}}).sort({createdAt:-1}).limit(100).lean();
    const generatedAt=new Date();
    // Complete inference before saving a batch, so an unavailable service cannot publish a partial result.
    const results=[];
    for (const complaint of complaints) {
      const result=resultSchema.parse(await callAi(config,'/predict',await complaintFeatures(complaint,generatedAt)));
      results.push({complaint,result});
    }
    for (const {complaint,result} of results) await AiRecommendation.updateOne({villageId:req.user.villageId,complaintId:complaint._id},{$set:{result,generatedAt,sourceVersion:complaint.version}},{upsert:true});
    res.json({data:{processed:results.length,limit:100,generatedAt}});
  });
  return router;
}

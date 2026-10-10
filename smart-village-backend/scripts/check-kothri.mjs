import mongoose from 'mongoose';
import { configureKothriVillage } from './configure-kothri.js';
import { User, Village } from '../src/models.js';
await mongoose.connect('mongodb://127.0.0.1:27018/smart_village_local?replicaSet=sv-local');
try {
 const admin=await User.findOne({email:'admin@demo.village.local'});
 await configureKothriVillage(admin.villageId);
 const village=await Village.findById(admin.villageId);
 const inside=await Village.exists({_id:admin.villageId,boundary:{$geoIntersects:{$geometry:{type:'Point',coordinates:[76.8297921,23.0739629]}}}});
 const outside=await Village.exists({_id:admin.villageId,boundary:{$geoIntersects:{$geometry:{type:'Point',coordinates:[75.713,26.975]}}}});
 if(!inside||outside) throw new Error('Service extent check failed');
 console.log(JSON.stringify({name:village.name,kothriAccepted:Boolean(inside),oldJaipurRejected:!outside}));
} finally { await mongoose.disconnect(); }

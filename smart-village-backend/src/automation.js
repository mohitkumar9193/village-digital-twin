import mongoose from 'mongoose';
import {Complaint,ComplaintEvent,Notification,Department,User,Village} from './models.js';
export const responseHours={low:168,medium:72,high:24,critical:4};
const active=['submitted','verified','assigned','in_progress','reopened'];
async function eventAndNotify(c,type,message,session,fromStatus=c.status){
 const [event]=await ComplaintEvent.create([{complaintId:c._id,villageId:c.villageId,eventType:type,fromStatus,toStatus:c.status,remarks:message,departmentId:c.departmentId}],{session});
 const people=await User.find({villageId:c.villageId,isActive:true,$or:[{_id:c.citizenId},{role:'admin'},...(c.departmentId?[{role:'staff',departmentId:c.departmentId}]:[])]}).session(session).select('_id');
 if(people.length)await Notification.insertMany(people.map(u=>({recipientId:u._id,villageId:c.villageId,complaintId:c._id,eventId:event._id,type,message:`${c.trackingNumber}: ${message}`})),{session});
}
export async function runComplaintAutomation(now=new Date()){
 const villages=await Village.find({isActive:true,automationEnabled:{$ne:false}}).select('_id');
 const ids=await Complaint.find({villageId:{$in:villages.map(v=>v._id)},isDemo:{$ne:true},status:{$in:active}}).select('_id').limit(500);
 for(const item of ids)await mongoose.connection.transaction(async session=>{
  let c=await Complaint.findOne({_id:item._id,status:{$in:active}}).session(session);if(!c)return;
  if(!c.automationDueAt){c.automationDueAt=new Date((c.resolutionCycleStartedAt||c.createdAt).getTime()+responseHours[c.priority]*3600000);await Complaint.updateOne({_id:c._id},{$set:{automationDueAt:c.automationDueAt}},{session,timestamps:false});}
  if(c.status==='verified'&&!c.departmentId){
   const departments=await Department.find({villageId:c.villageId,isActive:true,categories:c.category}).session(session).limit(2);
   if(departments.length===1&&await User.exists({villageId:c.villageId,departmentId:departments[0]._id,role:'staff',isActive:true}).session(session)){
    c=await Complaint.findOneAndUpdate({_id:c._id,status:'verified',version:c.version},{$set:{departmentId:departments[0]._id,status:'assigned',autoAssigned:true},$inc:{version:1}},{new:true,session});
    if(!c)return;await eventAndNotify(c,'auto_assigned',`Automatically assigned to ${departments[0].name} after Admin verification.`,session,'verified');
   }
  }
  if(['high','critical'].includes(c.priority)&&c.urgentAlertPriority!==c.priority){
   await Complaint.updateOne({_id:c._id},{$set:{urgentAlertPriority:c.priority}},{session,timestamps:false});
   await eventAndNotify(c,'urgent_alert',`${c.priority.toUpperCase()} priority: prompt staff attention required.`,session);
  }
  if(c.automationDueAt<=now&&(!c.lastReminderAt||now-c.lastReminderAt>=86400000)){
   await Complaint.updateOne({_id:c._id},{$set:{lastReminderAt:now}},{session,timestamps:false});
   await eventAndNotify(c,'overdue_reminder','Response target overdue. Admin and department staff should review this unresolved complaint.',session);
  }
 });
 return ids.length;
}
const workerStatus={started:false,running:false,lastCheckedAt:null,lastErrorAt:null,checkedComplaints:0};
export function getAutomationStatus(){return {...workerStatus,intervalSeconds:60};}
export function startComplaintAutomation(){
 workerStatus.started=true;
 let running=false;
 const tick=async()=>{if(running)return;running=true;workerStatus.running=true;try{workerStatus.checkedComplaints=await runComplaintAutomation();workerStatus.lastCheckedAt=new Date();workerStatus.lastErrorAt=null;}catch(error){workerStatus.lastErrorAt=new Date();console.error('Complaint automation failed:',error.name);}finally{running=false;workerStatus.running=false;}};
 void tick();const timer=setInterval(tick,60000);timer.unref();return ()=>{clearInterval(timer);workerStatus.started=false;};
}

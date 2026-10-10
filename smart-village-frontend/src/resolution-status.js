export const resolutionStatus = {
 submitted: {label:'Not resolved',detail:'Waiting for Admin verification.',tone:'pending',step:0},
 verified: {label:'Not resolved',detail:'Verified by Admin; waiting for department assignment.',tone:'pending',step:1},
 assigned: {label:'Not resolved',detail:'Assigned to a department; work has not started.',tone:'pending',step:2},
 in_progress: {label:'Work in progress',detail:'Department staff have started work. Resolution is still pending.',tone:'working',step:3},
 resolved: {label:'Resolved — awaiting Admin review',detail:'The department reported completion. Open the complaint to review repair photos and remarks.',tone:'resolved',step:4},
 closed: {label:'Resolved & closed',detail:'Admin reviewed the resolution and closed the complaint.',tone:'closed',step:5},
 reopened: {label:'Not resolved — reopened',detail:'The complaint was reopened and requires further department action.',tone:'pending',step:2},
 rejected: {label:'Rejected — not resolved',detail:'Admin rejected this report. Open the timeline to read the reason.',tone:'rejected',step:null},
};

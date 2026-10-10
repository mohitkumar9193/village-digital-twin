import React,{useEffect,useRef,useState} from 'react';
import {Bell,Volume2,X} from 'lucide-react';
import {date} from './portal-ui.jsx';
import {alarmNotes,alarmDuration} from './alarm-sound.js';
export default function ResolutionAlarm({session,notifications,busy,refresh,navigate}){
 const context=useRef(null),played=useRef(new Set()),voices=useRef([]),endTimer=useRef(null);
 const [ringing,setRinging]=useState(false);
 const [sound,setSound]=useState(false),[error,setError]=useState(''),[dismissed,setDismissed]=useState(()=>{try{return new Set(JSON.parse(localStorage.getItem(`resolution-alerts-${session.user.id}`)||'[]'));}catch{return new Set();}});
 const alerts=notifications.filter(n=>['resolve','close'].includes(n.type)&&!n.readAt&&!dismissed.has(n._id));
 function stopAlarm(){clearTimeout(endTimer.current);for(const voice of voices.current){try{voice.stop();}catch{}voice.disconnect();}voices.current=[];setRinging(false);}
 async function unlock(){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw new Error('Sound is unavailable in this browser.');context.current ||= new Audio();await context.current.resume();if(context.current.state!=='running')throw new Error('Click Test 30-second alarm to allow sound.');}
 async function chime(){try{await unlock();stopAlarm();const start=context.current.currentTime;for(const note of alarmNotes(alarmDuration)){
  const oscillator=context.current.createOscillator(),gain=context.current.createGain();oscillator.type='sine';oscillator.frequency.value=note.frequency;
  const at=start+note.offset;gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.085,at+.025);gain.gain.exponentialRampToValueAtTime(.0001,at+note.length);
  oscillator.connect(gain);gain.connect(context.current.destination);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};oscillator.start(at);oscillator.stop(at+note.length);voices.current.push(oscillator);
 }setRinging(true);endTimer.current=setTimeout(stopAlarm,alarmDuration*1000);setError('');return true;}catch(e){setError(e.message);return false;}}

 useEffect(()=>{const update=()=>{if(document.visibilityState==='visible')refresh();};const timer=setInterval(update,30000);window.addEventListener('focus',update);return()=>{clearInterval(timer);window.removeEventListener('focus',update);};},[refresh]);
 useEffect(()=>{if(!sound||busy)return;const fresh=alerts.filter(n=>!played.current.has(n._id));if(fresh.length)void chime().then(ok=>{if(ok)fresh.forEach(n=>played.current.add(n._id));});},[notifications,sound,busy,dismissed]);
 useEffect(()=>()=>{clearTimeout(endTimer.current);context.current?.close();},[]);
 function dismiss(id){stopAlarm();const next=new Set(dismissed);next.add(id);setDismissed(next);try{localStorage.setItem(`resolution-alerts-${session.user.id}`,JSON.stringify([...next].slice(-200)));}catch{}}
 return <section className="resolution-alarm"><div className="alarm-controls"><Bell size={20}/><strong>Resolution alerts</strong><button className="secondary-button" onClick={async()=>{if(sound){stopAlarm();setSound(false);return;}try{await unlock();setSound(true);setError('');}catch(e){setError(e.message);}}}><Volume2 size={16}/>{sound?'Sound on — mute':'Enable alarm sound'}</button><button className="text-button" onClick={chime}>Test 30-second alarm</button>{ringing&&<><span role="status">Gentle chime playing · 30 seconds</span><button className="secondary-button" onClick={stopAlarm}>Stop alarm</button></>}<small>Alerts appear here when staff mark a complaint resolved or Admin closes it. A gentle 30-second melody plays for new resolution alerts when sound is enabled. Sound works while this page is open; use Stop alarm to end it early.</small></div>{error&&<p role="alert">{error}</p>}{alerts.map(n=><div className="resolved-alert" role="alert" key={n._id}><Bell size={25}/><div><strong>{n.type==='close'?'Complaint resolved & closed':'Complaint marked resolved — awaiting Admin review'}</strong><p>{n.message}</p><small>{date(n.createdAt)}</small></div><button className="primary-button" onClick={()=>navigate(`complaint/${n.complaintId}`)}>View repair evidence</button><button className="icon-button" aria-label="Dismiss resolution alert" onClick={()=>dismiss(n._id)}><X size={18}/></button></div>)}</section>;
}

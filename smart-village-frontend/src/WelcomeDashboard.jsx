import React from 'react';
import {ArrowUpRight,MapPin,ClipboardList,Bell} from 'lucide-react';

export default function WelcomeDashboard({navigate}){
 const features=[{icon:ClipboardList,tone:'coral',title:'Your voice, real action',text:'Report a village issue and follow every step toward resolution.',button:'Report an issue',route:'submit'},{icon:MapPin,tone:'blue',title:'A village you can explore',text:'Find mapped roads, schools, the panchayat and health centre.',button:'Explore the village',route:'map'},{icon:Bell,tone:'purple',title:'Stay in the loop',text:'Sign in to receive updates when your complaint moves forward.',button:'View your updates',route:'notifications'}];
 return <div className="welcome-dashboard"><div className="welcome-intro"><div><h1>Village dashboard</h1></div></div><div className="welcome-features compact-actions">{features.map(({icon:Icon,...f})=><button key={f.title} className={`compact-action ${f.tone}`} onClick={()=>navigate(f.route)}><span className="compact-action-icon"><Icon size={20}/></span><span>{f.button}</span><ArrowUpRight size={16}/></button>)}</div><section className="welcome-bottom"><div><h3>Report. Track. Resolve.</h3></div><button className="secondary-button" onClick={()=>navigate('login')}>Open your workspace <ArrowUpRight size={16}/></button></section></div>;
}

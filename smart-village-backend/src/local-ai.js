import forest from './ai-forest.json' with {type:'json'};
import {z} from 'zod';
const schema=z.object({category:z.enum(['roads','water','electricity','sanitation','drainage','street_lights','other']),asset_condition:z.enum(['unknown','good','fair','poor','critical']),age_hours:z.number().min(0).max(100000),recent_category_reports:z.number().int().min(0).max(100000)}).strict();
export const modelMetadata=forest.report;
export function predictPriority(input){
 const values=schema.parse(input);
 const features=forest.categories.flatMap((options,i)=>options.map(option=>option===values[i===0?'category':'asset_condition']?1:0));
 features.push(Math.fround(values.age_hours),Math.fround(values.recent_category_reports));
 const shares=forest.classes.map(()=>0);
 for(const tree of forest.trees){let node=0;while(tree.left[node]!==-1)node=features[tree.feature[node]]<=tree.threshold[node]?tree.left[node]:tree.right[node];const total=tree.values[node].reduce((a,b)=>a+b,0);tree.values[node].forEach((v,i)=>shares[i]+=v/total/forest.trees.length);}
 const priority=forest.classes[shares.indexOf(Math.max(...shares))];
 const recommendations=['Verify the reported issue and its impact with the responsible department.'];
 if(['high','critical'].includes(priority))recommendations.push('Request prompt departmental inspection; let an administrator confirm urgency.');
 if(['poor','critical'].includes(values.asset_condition))recommendations.push('Inspect the linked asset and record an updated condition assessment.');
 if(values.recent_category_reports>=5)recommendations.push('Review recurring reports for a shared cause before planning repairs.');
 const warnings=['Demo model trained on synthetic labels. Scores are uncalibrated model class shares, not safety probabilities.'];
 if(values.asset_condition==='unknown')warnings.push('Asset condition is unavailable; inspect it before making a priority decision.');
 for(const [field,limits]of Object.entries(forest.report.training_ranges))if(values[field]<limits[0]||values[field]>limits[1])warnings.push(`${field} is outside the synthetic training range.`);
 return {suggested_priority:priority,attention_level:priority,model_version:forest.report.model_version,synthetic:true,class_scores:Object.fromEntries(forest.classes.map((label,i)=>[label,Number(shares[i].toFixed(4))])),reasons:[`Category: ${values.category.replaceAll('_',' ')}`,`Current linked asset condition: ${values.asset_condition}`,`Report age: ${values.age_hours.toFixed(1)} hours`,`Other same-category reports in preceding 30 days: ${values.recent_category_reports}`],recommendations,warnings,features:values};
}

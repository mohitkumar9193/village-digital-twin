// Read-only checks of the actual running Python model, not the mocked API fixture.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const url=process.env.AI_SERVICE_URL||'http://127.0.0.1:8001';
let key=process.env.AI_SERVICE_KEY;
if (!key) key=JSON.parse(await readFile(new URL('../data/local/settings.json',import.meta.url),'utf8')).aiServiceKey;
if (!key) throw new Error('Configure AI_SERVICE_KEY or start the local project first');
const headers={'Content-Type':'application/json','X-AI-Key':key};
let passed=0;
async function check(name,fn) {await fn();passed++;console.log(`PASS ${name}`);}
async function predict(body){const r=await fetch(`${url}/predict`,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});return {status:r.status,data:await r.json()};}
const base={category:'other',asset_condition:'good',age_hours:1,recent_category_reports:0};
await check('service readiness',async()=>assert.equal((await fetch(`${url}/health`)).status,200));
await check('missing service key rejected',async()=>assert.equal((await fetch(`${url}/model`)).status,401));
await check('incorrect service key rejected',async()=>assert.equal((await fetch(`${url}/model`,{headers:{'X-AI-Key':'wrong'}})).status,401));
await check('model metadata and synthetic evaluation',async()=>{const r=await fetch(`${url}/model`,{headers});assert.equal(r.status,200);const m=await r.json();assert.equal(m.synthetic,true);assert.equal(m.train_rows+m.test_rows,m.clean_rows);assert.ok(m.accuracy>m.baseline_accuracy);});
for (const [expected,body] of [['low',base],['medium',{...base,category:'water'}],['high',{...base,category:'water',asset_condition:'poor'}],['critical',{...base,category:'water',asset_condition:'critical',age_hours:90,recent_category_reports:6}]]) {
  await check(`actual ${expected} priority inference`,async()=>{const r=await predict(body);assert.equal(r.status,200);assert.equal(r.data.suggested_priority,expected);assert.equal(r.data.synthetic,true);assert.ok(r.data.recommendations.length);assert.ok(Math.abs(Object.values(r.data.class_scores).reduce((a,b)=>a+b,0)-1)<.001);});
}
await check('invalid inputs and extra fields rejected',async()=>{for(const fields of [{age_hours:-1},{category:'invalid'},{asset_condition:'unsafe'},{recent_category_reports:1.5},{approved_priority:'critical'}])assert.equal((await predict({...base,...fields})).status,422);});
await check('unknown condition and training-range limitations disclosed',async()=>{const r=await predict({...base,asset_condition:'unknown',age_hours:900});assert.equal(r.status,200);assert.ok(r.data.warnings.some(w=>w.includes('unavailable')));assert.ok(r.data.warnings.some(w=>w.includes('outside')));});
await check('prediction reproducibility',async()=>assert.deepEqual((await predict(base)).data,(await predict(base)).data));
console.log(`AI checks: ${passed} passed; no application records were modified.`);

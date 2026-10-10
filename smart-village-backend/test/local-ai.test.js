import {test} from 'node:test';
import assert from 'node:assert/strict';
import cases from './fixtures/ai-parity.json' with {type:'json'};
import {predictPriority} from '../src/local-ai.js';
test('Node inference matches all 480 held-out Scikit-learn predictions and scores',()=>{
 for(const item of cases){const result=predictPriority(item.input);assert.equal(result.suggested_priority,item.priority);for(const [label,score]of Object.entries(item.scores))assert.ok(Math.abs(result.class_scores[label]-score)<=0.000051);assert.equal(result.synthetic,true);}
});

import sys,json
from pathlib import Path

import joblib,pandas as pd
root=Path(__file__).resolve().parent
m=joblib.load(root/'artifacts/model.joblib')
encoder=m.named_steps['features'].transformers_[0][1]
clf=m.named_steps['classifier']
trees=[]
for estimator in clf.estimators_:
 t=estimator.tree_
 trees.append({'left':t.children_left.tolist(),'right':t.children_right.tolist(),'feature':t.feature.tolist(),'threshold':t.threshold.tolist(),'values':t.value[:,0,:].tolist()})
out={'categories':[x.tolist() for x in encoder.categories_],'classes':clf.classes_.tolist(),'trees':trees,'report':json.loads((root/'artifacts/analysis.json').read_text())}
(root.parent/'smart-village-backend/src/ai-forest.json').write_text(json.dumps(out,separators=(',',':')))
features=['category','asset_condition','age_hours','recent_category_reports']
df=pd.read_csv(root/'data/complaints_clean.csv').tail(480)[features]
cases=[]
for row,priority,scores in zip(df.to_dict('records'),m.predict(df),m.predict_proba(df)):
 cases.append({'input':row,'priority':str(priority),'scores':dict(zip(clf.classes_.tolist(),scores.tolist()))})
(root.parent/'smart-village-backend/test/fixtures/ai-parity.json').write_text(json.dumps(cases))
print('Exported',len(trees),'trees and',len(cases),'Python parity cases')


"""Reproducible synthetic demonstration. No real citizen records are included."""
from pathlib import Path
import json
import numpy as np
import pandas as pd
import joblib
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestClassifier
from sklearn.dummy import DummyClassifier
from sklearn.metrics import accuracy_score, f1_score, confusion_matrix
from sklearn.inspection import permutation_importance

ROOT = Path(__file__).parent
FEATURES = ['category', 'asset_condition', 'age_hours', 'recent_category_reports']

def train():
    rng = np.random.default_rng(42)
    rows = []
    for i in range(2400):
        category = rng.choice(['roads','water','electricity','sanitation','drainage','street_lights','other'])
        condition = rng.choice(['unknown','good','fair','poor','critical'])
        age = round(float(rng.exponential(48)), 2)
        recent = int(rng.poisson(3))
        score = {'unknown':0,'good':0,'fair':1,'poor':3,'critical':5}[condition] + (category in ['water','electricity','drainage']) + (age >= 72) + (recent >= 5)
        priority = ['low','medium','high','critical'][0 if score < 1 else 1 if score < 3 else 2 if score < 6 else 3]
        if rng.random() < .06:
            priority = rng.choice(['low','medium','high','critical'])
        rows.append(dict(sample_id=f'SYN-{i:05}', observed_at=(pd.Timestamp('2025-01-01',tz='UTC')+pd.Timedelta(hours=i*3)).isoformat(), category=category, asset_condition=condition, age_hours=age, recent_category_reports=recent, priority=priority, is_synthetic=True))
    raw = pd.DataFrame(rows)
    # Deliberate duplicates/missing values exercise the cleaning pipeline.
    raw.loc[::79,'asset_condition'] = None
    raw = pd.concat([raw,raw.iloc[:20]],ignore_index=True)
    data_dir = ROOT/'data'; data_dir.mkdir(exist_ok=True)
    raw.to_csv(data_dir/'historical_complaints_synthetic.csv',index=False)
    clean = raw.drop_duplicates('sample_id').copy()
    clean['observed_at'] = pd.to_datetime(clean['observed_at'],utc=True,errors='coerce')
    clean['asset_condition'] = clean['asset_condition'].fillna('unknown').str.strip().str.lower()
    for field in ['age_hours','recent_category_reports']:
        clean[field] = pd.to_numeric(clean[field],errors='coerce')
    clean = clean.dropna(subset=['observed_at',*FEATURES,'priority'])
    clean = clean[(clean.age_hours >= 0) & (clean.recent_category_reports >= 0)].sort_values('observed_at')
    clean.to_csv(data_dir/'complaints_clean.csv',index=False)
    cut = int(len(clean)*.8)
    xtrain, xtest = clean.iloc[:cut][FEATURES], clean.iloc[cut:][FEATURES]
    ytrain, ytest = clean.iloc[:cut].priority, clean.iloc[cut:].priority
    model = Pipeline([('features',ColumnTransformer([('category',OneHotEncoder(handle_unknown='ignore'),FEATURES[:2]),('numbers','passthrough',FEATURES[2:])])),('classifier',RandomForestClassifier(n_estimators=160,min_samples_leaf=4,class_weight='balanced',random_state=42,n_jobs=2))])
    model.fit(xtrain,ytrain)
    predicted = model.predict(xtest)
    baseline = DummyClassifier(strategy='most_frequent').fit(xtrain,ytrain)
    importance = permutation_importance(model,xtest,ytest,n_repeats=5,random_state=42,scoring='f1_macro')
    report = dict(model_version='synthetic-rf-v1',synthetic=True,target='Suggested operational priority; not incident probability or future failure prediction',warning='Synthetic evaluation only. Validate on independently labelled real complaints before operational use.',raw_rows=len(raw),clean_rows=len(clean),duplicates_removed=len(raw)-len(clean),missing_condition_filled=int(raw.asset_condition.isna().sum()),train_rows=cut,test_rows=len(xtest),split='Chronological 80/20; no target, resolution, or status features',accuracy=accuracy_score(ytest,predicted),macro_f1=f1_score(ytest,predicted,average='macro'),baseline_accuracy=accuracy_score(ytest,baseline.predict(xtest)),class_counts=clean.priority.value_counts().to_dict(),category_counts=clean.category.value_counts().to_dict(),confusion_labels=list(model.classes_),confusion_matrix=confusion_matrix(ytest,predicted,labels=model.classes_).tolist(),feature_importance=[dict(name=f,value=round(float(v),4)) for f,v in zip(FEATURES,importance.importances_mean)],training_ranges={f:[float(clean[f].min()),float(clean[f].max())] for f in FEATURES[2:]})
    (ROOT/'artifacts').mkdir(exist_ok=True)
    joblib.dump(model,ROOT/'artifacts/model.joblib')
    (ROOT/'artifacts/analysis.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    print(json.dumps(report,indent=2))

if __name__ == '__main__':
    train()

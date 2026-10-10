import json
import os
import secrets
from pathlib import Path
import joblib
import pandas as pd
from fastapi import FastAPI, Header, HTTPException, Depends
from pydantic import BaseModel, Field, ConfigDict
from typing import Literal
from train import FEATURES

ROOT = Path(__file__).parent
model = joblib.load(ROOT/'artifacts/model.joblib')
report = json.loads((ROOT/'artifacts/analysis.json').read_text())
app = FastAPI(title='Village complaint priority assistant')

def authorize(x_ai_key: str = Header(default='')):
    expected = os.environ.get('AI_SERVICE_KEY','')
    if not expected or not secrets.compare_digest(expected,x_ai_key):
        raise HTTPException(401,'Invalid service credential')

class Features(BaseModel):
    model_config = ConfigDict(extra='forbid')
    category: Literal['roads','water','electricity','sanitation','drainage','street_lights','other']
    asset_condition: Literal['unknown','good','fair','poor','critical']
    age_hours: float = Field(ge=0,le=100000)
    recent_category_reports: int = Field(ge=0,le=100000)

@app.get('/health')
def health():
    return {'status':'ready','model_version':report['model_version']}

@app.get('/model',dependencies=[Depends(authorize)])
def metadata():
    return report

@app.post('/predict',dependencies=[Depends(authorize)])
def predict(features: Features):
    values = features.model_dump()
    frame = pd.DataFrame([values],columns=FEATURES)
    priority = str(model.predict(frame)[0])
    probabilities = model.predict_proba(frame)[0]
    reasons = [f"Category: {values['category'].replace('_',' ')}",f"Current linked asset condition: {values['asset_condition']}",f"Report age: {values['age_hours']:.1f} hours",f"Other same-category reports in preceding 30 days: {values['recent_category_reports']}"]
    actions = ['Verify the reported issue and its impact with the responsible department.']
    if priority in ['high','critical']:
        actions.append('Request prompt departmental inspection; let an administrator confirm urgency.')
    if values['asset_condition'] in ['poor','critical']:
        actions.append('Inspect the linked asset and record an updated condition assessment.')
    if values['recent_category_reports'] >= 5:
        actions.append('Review recurring reports for a shared cause before planning repairs.')
    warnings = ['Demo model trained on synthetic labels. Scores are uncalibrated model class shares, not safety probabilities.']
    if values['asset_condition'] == 'unknown':
        warnings.append('Asset condition is unavailable; inspect it before making a priority decision.')
    for field,limits in report['training_ranges'].items():
        if values[field] < limits[0] or values[field] > limits[1]:
            warnings.append(f'{field} is outside the synthetic training range.')
    return {'suggested_priority':priority,'attention_level':priority,'model_version':report['model_version'],'synthetic':True,'class_scores':{str(k):round(float(v),4) for k,v in zip(model.classes_,probabilities)},'reasons':reasons,'recommendations':actions,'warnings':warnings,'features':values}

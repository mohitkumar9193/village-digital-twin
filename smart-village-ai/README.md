# Complaint priority assistant

Predicts suggested operational priority (low/medium/high/critical). Risk means attention level here; no accident probability, future infrastructure failure, or complaint-volume forecast is claimed. Recommendations are transparent rules driven by the prediction and observed inputs. An administrator retains responsibility for verification and approved priority.

## Dataset and training

Run `python -m pip install -r requirements.txt`, then `python train.py` in this directory. Python 3.12 is used for the included artifact. Use the pinned requirements when loading it, or retrain with your installed versions.

The generator uses seed 42 and creates 2,400 synthetic observations dated January–October 2025. Labels follow published rules in train.py with 6% random label noise. These are simulated observations, not village history. Raw CSV includes 20 deliberate duplicates and missing condition values; Pandas deduplicates IDs, parses UTC timestamps, normalizes conditions, fills unknown conditions, converts numeric fields, rejects invalid rows and sorts chronologically. Clean CSV and analysis JSON are included.

Inputs: category, current asset condition, report age in hours and number of other same-category village complaints in the preceding 30 days. Category volume is village-wide, not a geographic hotspot or a count of confirmed incidents. Synthetic rows simulate these as-of inputs independently; production must record genuine feature snapshots and expert priority labels.

The RandomForest pipeline one-hot encodes categorical inputs, uses balanced classes, and splits chronologically 80/20: 1,920 training and 480 holdout rows. No approved priority, resolution outcome, description, identity or status is a predictor. Holdout accuracy 94.8%, macro F1 0.943; majority baseline accuracy 37.7%. These metrics measure reproduction of synthetic rules only. The analysis file contains class/category counts, confusion matrix, observed ranges and holdout permutation importance. Permutation importance measures model dependence, not causation (https://scikit-learn.org/stable/modules/permutation_importance).

## Services

The local Node launcher starts `python -m uvicorn service:app --host 127.0.0.1 --port 8001`. Set `AI_PYTHON` to your Python/venv executable if needed. It passes a locally generated service key from ignored backend settings to the Python process. Install requirements and train before starting the backend. No browser receives the key.

Production: run Python separately, set an unpredictable `AI_SERVICE_KEY` on both services and `AI_SERVICE_URL` in Node. Use private networking; protect transport when hosts differ. Health is public; all model and inference endpoints require X-AI-Key, using FastAPI header validation (https://fastapi.tiangolo.com/reference/security/).

Python endpoints:
- GET /health: readiness and version.
- GET /model: training metadata/analysis.
- POST /predict: validated feature object; priority, class scores, observed-input explanations, recommendations and limitations.

Node endpoints (JWT plus admin role and village scope):
- GET /api/v1/ai/model
- GET /api/v1/ai/recommendations
- POST /api/v1/ai/recommendations/refresh with `{}`

Refresh covers the newest 100 active reports (excludes resolved/closed/rejected). Counts exclude the current record, future dates and records older than 30 days. Asset condition is the current snapshot at prediction time. MongoDB stores suggestions separately with source complaint version, generation time and model provenance. Suggestions are flagged stale after complaint edits or one hour; refresh after asset changes too. Approved complaint priorities and lifecycle records are never modified by inference. Service failures return 503 without generating fabricated results. Class scores are uncalibrated tree-vote shares, not a validated risk probability. Unknown conditions and out-of-range values are disclosed. Existing management APIs work during AI downtime.

## Validation before real use

Collect consented, deidentified real feature snapshots with independently reviewed priority labels; assess temporal holdout results, per-class recall, fairness, missingness, drift, calibration and departmental review outcomes. Do not treat synthetic validation as deployment approval. Do not load untrusted joblib artifacts.

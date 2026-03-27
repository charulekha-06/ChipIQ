# ChipIQ + uart-verilog Integration

This ChipIQ instance is integrated with data generated from the uart-verilog regression and analysis flow.

## Data flow

1. Run or refresh uart-verilog dataset generation under `dataset/`.
2. Run `chipiq/scripts/refreshIntegratedData.ps1`.
3. Start ChipIQ app from `chipiq/`.

Integrated payload folder:

- `chipiq/public/integrated-data/dataset_summary.json`
- `chipiq/public/integrated-data/regression_results.json`
- `chipiq/public/integrated-data/rtl_commits.json`
- `chipiq/public/integrated-data/coverage_data.json`
- `chipiq/public/integrated-data/bug_reports_inferred.json`
- `chipiq/public/integrated-data/module_summary.json`
- `chipiq/public/integrated-data/bug_trend_monthly.json`

## Run

```powershell
cd chipiq
npm install
npm run dev
```

## Run Backend (FastAPI)

```powershell
cd chipiq/backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8020
```

## Full-Stack Run

1. Start backend on port `8020` from `chipiq/backend`.
2. Start frontend on port `5173` from `chipiq`.
3. Frontend pages call backend APIs from `http://localhost:8020`.
4. If backend is offline, frontend falls back to `public/integrated-data`.

API base is configured via `.env.local`:

```text
VITE_API_BASE=http://localhost:8020
```

## Real Model Endpoints

- `GET /api/forecast/ARIMA?horizon=2`
- `GET /api/forecast/LSTM?horizon=2`
- `GET /api/forecast/PROPHET?horizon=2`

Each endpoint returns live model output including `series`, `rmse`, `confidence`, and `trendLabel`.

## Build

```powershell
cd chipiq
npm run build
```

## Notes

- Dashboard, Bug Prediction, RTL Analysis, Simulator, and Reports now load integrated data from `public/integrated-data`.
- Dashboard, Bug Prediction, RTL Analysis, Simulator, and Reports now use backend API (`/api/data/all`) with static fallback.
- Bug Prediction model tabs now call real backend forecasts (ARIMA, LSTM, Prophet).
- If integrated files are missing, pages fall back to built-in sample values.

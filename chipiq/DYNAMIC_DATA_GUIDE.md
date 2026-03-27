# ChipIQ Dynamic Data Upload Guide

## Overview
Your app now supports uploading **any CSV or JSON file** and automatically adapts to work with any dataset. No code changes needed for different data schemas.

## How It Works

### 1. Upload a File
- Go to **Data Upload** page
- Drag & drop a CSV or JSON file
- App auto-detects:
  - Column names
  - Data types (numeric, date, categorical)
  - Semantic meaning (is this a "date" column? "bug count"? etc.)

### 2. Backend Processing
- File upload endpoint: `POST /api/upload`
- File is parsed and analyzed
- Schema is auto-detected
- Data stored in-memory and ready for use
- Returns preview of first 3 rows

### 3. Forecasting Works Automatically
- Bug Prediction page now uses **uploaded data** instead of hardcoded JSON
- App auto-detects:
  - Date column (looks for: date, month, time, timestamp)
  - Value column (looks for: bugs, count, value, total, amount)
- ARIMA/LSTM/Prophet forecasting works on any numeric time series

### 4. Dashboard Adapts
- Dashboard pages can use uploaded data
- Shows actual column names and values from your file
- Works with any number of rows/columns

## Example Datasets

### Example 1: Bug Trend CSV
```
month,bugs,severity,module
2024-01,5,high,CPU_CORE
2024-02,8,high,CPU_CORE
2024-03,6,medium,DDR_CTRL
```
✅ Auto-detected: month=date, bugs=value

### Example 2: Custom JSON
```json
[
  {"date": "2024-01-01", "issue_count": 15, "subsystem": "USB_PHY"},
  {"date": "2024-02-01", "issue_count": 12, "subsystem": "PCIe_MAC"}
]
```
✅ Auto-detected: date=date, issue_count=value, subsystem=module

## Backend API

### Upload File
```bash
POST /api/upload
Content-Type: multipart/form-data
file: <CSV or JSON file>

Response: {
  success: true,
  table_name: "my_data",
  schema: {...},
  preview: [{...}, {...}],
  file_info: {rows, columns, timestamp}
}
```

### Get Upload Status
```bash
GET /api/upload-status

Response: {
  has_uploaded_data: true,
  uploaded_tables: ["bug_trend", "coverage_data"],
  file_info: {...},
  schema: {...}
}
```

### Reset to Defaults
```bash
POST /api/upload-reset

Response: {success: true, message: "..."}
```

## What's Auto-Detected

### Column Types
- **numeric** — numbers (0, 1.5, -10, etc.)
- **date** — dates/times (2024-01, 01/01/2024, etc.)
- **categorical** — limited unique values (module names, severity levels)
- **text** — free-form text

### Semantic Roles
- **date** — column with temporal data
- **value** — numeric series to forecast/analyze
- **module** — system/component name
- **severity** — criticality level

### Column Name Hints
- Date patterns: `date`, `month`, `time`, `timestamp`, `created`, `updated`, `day`
- Value patterns: `count`, `value`, `number`, `amount`, `bugs`, `issues`, `total`
- Module patterns: `module`, `component`, `subsystem`, `block`, `system`
- Severity patterns: `severity`, `level`, `priority`, `status`, `criticality`

## Forecasting with Uploaded Data

### Current Implementation
1. User uploads CSV/JSON with date + numeric columns
2. App auto-detects which columns to use
3. Forecast endpoint (`/api/forecast/ARIMA`) loads the data dynamically
4. Returns forecast in standard format

### Data Expansion
If you have < 8 data points, app interpolates to 8 for model training. This works without bias for synthetic expansion.

## Next Steps (Optional Enhancements)

1. **Column Mapping UI** — Allow users to manually map columns if auto-detection fails
   - User selects: "Which column is the date?" → preview of upcoming work

2. **Multiple Tables** — Support uploading multiple files and combining them
   - Could correlate bug_trends.csv with coverage_data.csv

3. **Dashboard Customization** — Let users select which columns to display
   - "Show module_summary?" + "Which columns?"

4. **Export/Report** — Generate PDF reports based on uploaded data

5. **Data Validation** — Add quality checks
   - Alert if date column has duplicates
   - Warn if numeric column has negative values for bug counts

## Testing

### Test File: bug_data.csv
```csv
month,bug_count
2024-01,3
2024-02,5
2024-03,7
2024-04,6
2024-05,8
```

1. Upload to Data Upload page
2. Go to Bug Prediction page
3. See forecasts for ARIMA/LSTM/PROPHET
4. Switch tabs — data appears instantly
5. Check Dashboard — see your data

### Reset
Click "Reset to Defaults" to go back to original hardcoded data anytime.

## Architecture

```
Frontend Upload UI (DataUpload.jsx)
    ↓
POST /api/upload (main.py)
    ↓
DataStore.upload_file (datastore.py)
    ↓
SchemaDetector.detect_schema (datastore.py)
    ↓
In-Memory Store (uploaded_data dict)
    ↓
GET /api/forecast/{model} uses data_store.extract_numeric_series()
    ↓
Brain Prediction.jsx shows real forecasts
```

## Summary
You now have a fully **data-agnostic** app that works with ANY time series dataset in CSV or JSON format. Upload, auto-detect, forecast, visualize. No coding needed!

# Multi-Source Data Connectors Guide

Your app now supports **5 different data source connectors** for verification data that doesn't come in CSV format.

## Available Connectors

###  Git Connector
**Purpose:** Extract RTL commits and code changes  
**Formats Supported:** Any Git repository  
**What It Extracts:**
- Commit hash, author, email, date
- Message (commit description)
- Files changed, insertions, deletions

**API Usage:**
```bash
# Connect
POST /api/connect/git
{
  "connector_type": "git",
  "config": {
    "repo_path": "/path/to/chipiq-rtl"
  }
}

# Ingest
POST /api/ingest/git
```

**Example Response:**
```json
{
  "table_name": "rtl_commits",
  "rows_ingested": 47,
  "columns": ["hash", "author", "email", "date", "message", "files_changed", "insertions", "deletions"],
  "source": "git"
}
```

### Jira Connector
**Purpose:** Fetch bug reports and issues from Jira  
**Formats Supported:** Any Jira Cloud or On-Premise instance  
**What It Extracts:**
- Issue key (e.g., SOC-123)
- Title, type, status, priority
- Component, created date, updated date

**API Usage:**
```bash
POST /api/connect/jira
{
  "connector_type": "jira",
  "config": {
    "base_url": "https://jira.company.com",
    "username": "user@company.com",
    "api_token": "your_api_token_here",
    "project_key": "SOC"
  }
}

POST /api/ingest/jira
```

**How to Get Jira API Token:**
1. Go to account.atlassian.com/manage-account/security
2. Create API token
3. Use email + API token in connector config

**Example Response:**
```json
{
  "table_name": "bug_reports",
  "rows_ingested": 23,
  "columns": ["key", "title", "type", "status", "priority", "component", "created", "updated"],
  "source": "jira"
}
```

### Coverage Connector
**Purpose:** Parse code coverage reports  
**Formats Supported:** COBERTURA XML format (standard for many tools)  
**What It Extracts:**
- Package, class names
- Line coverage %, branch coverage %
- Average coverage

**Tools That Export COBERTURA:**
- Istanbul/nyc (JavaScript)
- JaCoCo (Java)
- OpenCover (.NET)
- gcov (C/C++)
- Pytest (Python with plugin)

**API Usage:**
```bash
POST /api/connect/coverage
{
  "connector_type": "coverage",
  "config": {
    "file_path": "/path/to/coverage.xml"
  }
}

POST /api/ingest/coverage
```

**Example Response:**
```json
{
  "table_name": "coverage_data",
  "rows_ingested": 127,
  "columns": ["package", "class", "line_coverage", "branch_coverage", "average_coverage"],
  "source": "coverage"
}
```

### Log Analyzer Connector
**Purpose:** Extract meaningful events from text logs  
**Formats Supported:** Any text log file  
**What It Extracts:**
- Timestamp, severity (error/warning/info)
- Message text
- Line number

**Automatically Detects:**
- ERROR/ERROR:/ FAIL patterns → "error" severity
- WARNING/WARN: patterns → "warning" severity
- Timestamps in various formats

**API Usage:**
```bash
POST /api/connect/logs
{
  "connector_type": "logs",
  "config": {
    "file_path": "/path/to/simulation.log"
  }
}

POST /api/ingest/logs
```

**Example Response:**
```json
{
  "table_name": "simulation_logs",
  "rows_ingested": 347,
  "columns": ["timestamp", "severity", "message", "line_number"],
  "source": "logs",
  "message": "Extracted 347 events from log (12 errors)"
}
```

### Regression Results Connector
**Purpose:** Parse test execution results  
**Formats Supported:** JUnit XML or JSON  
**What It Extracts:**
- Test suite, test name, class
- Pass/Fail/Skip status
- Duration in seconds

**Tools That Export This Format:**
- pytest
- JUnit
- mocha (with reporter)
- testng
- Custom test frameworks

**API Usage:**
```bash
POST /api/connect/regression
{
  "connector_type": "regression",
  "config": {
    "file_path": "/path/to/results.xml"
  }
}

POST /api/ingest/regression
```

**Example Response:**
```json
{
  "table_name": "regression_results",
  "rows_ingested": 156,
  "columns": ["suite", "test_name", "class", "status", "duration_sec"],
  "source": "regression"
}
```

## Integration Flow

```
User Upload (CSV/JSON)              Multi-Source Connectors
        ↓                            ↓ ↓ ↓ ↓ ↓
    DataStore                    (Git, Jira, Coverage, Logs, Regression)
        ↓
    Unified Table Format
        ↓
    Bug Prediction (Forecasting)
    Dashboard (Visualization)
    Alerts (Monitoring)
```

## Full Workflow Example

**Scenario:** You have verification data from 5 different sources and want to analyze them together.

### Step 1: Upload regression test results (XML)
```bash
POST /api/connect/regression
{"config": {"file_path": "regression_results.xml"}}

POST /api/ingest/regression
→ "regression_results" table: 156 rows
```

### Step 2: Get Jira bug data
```bash
POST /api/connect/jira
{"config": {
  "base_url": "https://jira.company.com",
  "username": "you@company.com",
  "api_token": "xyz...",
  "project_key": "SOC"
}}

POST /api/ingest/jira
→ "bug_reports" table: 23 rows
```

### Step 3: Parse code coverage
```bash
POST /api/connect/coverage
{"config": {"file_path": "coverage.xml"}}

POST /api/ingest/coverage
→ "coverage_data" table: 127 rows
```

### Step 4: View in Dashboard
- GET /api/data/all
  - Returns: bug_reports, regression_results, coverage_data, rtl_commits (if using git), simulation_logs (if using logs)

### Step 5: Do Forecasting
- GET /api/forecast/ARIMA
  - Forecasts based on best-available numeric series from all sources

## Error Handling

### Connection Failed
```json
{
  "success": false,
  "error": "Failed to connect to git repository"
}
```

**Solutions:**
- Check file/URL path
- Verify credentials (username, API token)
- Ensure file exists and is readable

### No Data Found
```json
{
  "success": false,
  "message": "No commits found in repository"
}
```

**Solutions:**
- Verify data exists in source
- Check date range (Git fetches last year by default)
- Check permissions

### Format Not Recognized
```json
{
  "success": false,
  "message": "Unsupported format (use .xml or .json)"
}
```

**Solutions:**
- Export data in correct format
- See tool-specific export instructions above

## Common Scenarios

### Scenario 1: Daily Regression Tracking
1. Connect to regression test outputs (JUnit XML)
2. Track test pass rate over time
3. Use Bug Prediction to forecast failures

### Scenario 2: Coverage Monitoring
1. Parse COBERTURA XML from CI/CD pipeline
2. Track coverage by module over time
3. Alert on coverage drops

### Scenario 3: Git Analytics
1. Extract commit history
2. Visualize code churn per module
3. Correlate with bug discovery patterns

### Scenario 4: Log-Based Error Detection
1. Stream simulation logs
2. Extract error counts per test
3. Predict flaky tests

### Scenario 5: Multi-Source Correlation
1. Pull data from: Jira (bugs) + Regression (tests) + Coverage (code quality)
2. Correlate: "Do more commits → more bugs? less tests → more failures?"
3. Predict: "If we don't increase coverage by 10%, we'll have 30% more bugs"

## Limitations & Future Enhancements

**Current:**
- Single file ingestion per source type
- In-memory storage (cleared on server restart)
- Read-only (no pushing data back to sources)

**Future:**
- Real-time streaming from APIs
- Database connectors (MySQL, PostgreSQL)
- Salesforce/ServiceNow tickets
- Custom Python scripts for data transformation
- Scheduled ingestion (every night, every hour, etc.)
- Data persistence to database
- Web UI for configuration management

## API Reference

### List Connectors
```bash
GET /api/connectors

Response:
{
  "available": {
    "git": "Extract RTL commits from Git repository",
    "jira": "Fetch bug reports from Jira",
    "coverage": "Parse code coverage (COBERTURA XML)",
    "logs": "Analyze simulation or test logs",
    "regression": "Parse regression test results (JUnit XML or JSON)"
  }
}
```

### Connection Status
Check `/api/health` to see available connectors in status response.

---

That's it! You can now pull verification data from **any source** and analyze it in ChipIQ. 🎉

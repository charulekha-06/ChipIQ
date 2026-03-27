const DATA_BASE = '/integrated-data';
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8020';

export { API_BASE };

async function readJson(name, fallback) {
  try {
    const res = await fetch(`${DATA_BASE}/${name}`);
    if (!res.ok) {
      return fallback;
    }
    return await res.json();
  } catch {
    return fallback;
  }
}

async function loadFromStaticFiles() {
  const [
    datasetSummary,
    moduleSummary,
    bugTrendMonthly,
    regressionResults,
    rtlCommits,
    coverageData,
    bugReportsInferred,
  ] = await Promise.all([
    readJson('dataset_summary.json', {}),
    readJson('module_summary.json', []),
    readJson('bug_trend_monthly.json', []),
    readJson('regression_results.json', []),
    readJson('rtl_commits.json', []),
    readJson('coverage_data.json', []),
    readJson('bug_reports_inferred.json', []),
  ]);

  return {
    datasetSummary,
    moduleSummary,
    bugTrendMonthly,
    regressionResults,
    rtlCommits,
    coverageData,
    bugReportsInferred,
  };
}

async function loadFromBackend() {
  const res = await fetch(`${API_BASE}/api/data/all`);
  if (!res.ok) {
    throw new Error(`Backend request failed: ${res.status}`);
  }
  return res.json();
}

export async function getModelForecast(modelName, horizon = 2) {
  const res = await fetch(`${API_BASE}/api/forecast/${encodeURIComponent(modelName)}?horizon=${horizon}`);
  if (!res.ok) {
    throw new Error(`Forecast request failed: ${res.status}`);
  }
  return res.json();
}

export async function loadIntegrationData() {
  try {
    return await loadFromBackend();
  } catch {
    // Keep UI available if backend is offline.
    return loadFromStaticFiles();
  }
}

export function moduleStatusToColor(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'CRITICAL') return 'red';
  if (s === 'HIGH') return 'orange';
  if (s === 'MEDIUM') return 'yellow';
  return 'green';
}

export function toBugTrendSeries(bugTrendMonthly) {
  if (!Array.isArray(bugTrendMonthly) || bugTrendMonthly.length === 0) {
    return [];
  }

  const history = bugTrendMonthly.map((row) => ({
    date: row.month,
    actual: Number(row.bugs || 0),
    forecast: null,
  }));

  const last = history[history.length - 1]?.actual ?? 0;
  history.push({
    date: 'next-1',
    actual: null,
    forecast: Math.max(0, Math.round(last * 1.1)),
  });
  history.push({
    date: 'next-2',
    actual: null,
    forecast: Math.max(0, Math.round(last * 1.05)),
  });

  return history;
}

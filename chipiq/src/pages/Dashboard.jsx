import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  HiOutlineCloudUpload,
  HiOutlineExclamation,
  HiOutlineTrendingUp,
  HiOutlineChevronDown,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
} from 'react-icons/hi';
import { TbBugOff, TbAnalyze } from 'react-icons/tb';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { loadIntegrationData, moduleStatusToColor, toBugTrendSeries } from '../services/integrationData';
import './Dashboard.css';

const clampPct = (value) => Math.max(0, Math.min(100, value));

const alerts = [
  { text: 'P0 regression failure in USB_PHY TX path', module: 'USB_PHY', time: '2m ago', status: 'red' },
  { text: 'CPU_CORE branch coverage below threshold', module: 'CPU_CORE', time: '18m ago', status: 'red' },
  { text: 'Critical bug #291 approaching 7-day SLA', module: 'DDR_CTRL', time: '45m ago', status: 'red' },
  { text: 'DDR_CTRL timing violation in stress sim', module: 'DDR_CTRL', time: '1h ago', status: 'orange' },
];

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: '#FFFFFF',
        border: '1px solid rgba(0,0,0,0.1)',
        borderRadius: '8px',
        padding: '10px 14px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      }}>
        <p style={{ color: '#64748b', fontSize: '11px', marginBottom: '4px' }}>{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ color: p.color, fontSize: '12px', fontWeight: 600 }}>
            {p.name}: {p.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function Dashboard() {
  const [integration, setIntegration] = useState(null);
  const isLoading = integration === null;

  useEffect(() => {
    let mounted = true;
    loadIntegrationData().then((data) => {
      if (mounted) {
        setIntegration(data);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const dynamicRiskModules = useMemo(() => {
    const rows = integration?.moduleSummary;
    if (!Array.isArray(rows) || rows.length === 0) {
      return [];
    }
    return rows.map((mod) => ({
      name: mod.name,
      risk: mod.status,
      bugs: Number(mod.openBugs || 0),
      cov: Number(mod.coverage || 0),
      color: moduleStatusToColor(mod.status),
    }));
  }, [integration]);

  const dynamicBugTrend = useMemo(() => {
    const trend = toBugTrendSeries(integration?.bugTrendMonthly);
    return trend;
  }, [integration]);

  const totalBugs = Array.isArray(integration?.bugReportsInferred) ? integration.bugReportsInferred.length : null;
  const openCriticalBugs = dynamicRiskModules
    .filter((m) => m.risk === 'CRITICAL')
    .reduce((sum, m) => sum + m.bugs, 0);

  const avgCoverage = dynamicRiskModules.length > 0
    ? Math.round(dynamicRiskModules.reduce((sum, m) => sum + m.cov, 0) / dynamicRiskModules.length)
    : null;
  const pass = Number(integration?.datasetSummary?.regression_pass || 0);
  const total = Number(integration?.datasetSummary?.regression_total || 0);
  const passRate = total > 0 ? Math.round((pass / total) * 100) : null;

  const tapeoutScore = avgCoverage !== null && passRate !== null
    ? Math.round((avgCoverage + passRate) / 2)
    : null;

  const actualTrend = dynamicBugTrend.filter((d) => d.actual !== null);
  const weeklyDelta = actualTrend.length >= 2
    ? Number(actualTrend[actualTrend.length - 1].actual || 0) - Number(actualTrend[actualTrend.length - 2].actual || 0)
    : null;

  const bugTrendHealth = openCriticalBugs > 0 ? clampPct(100 - openCriticalBugs * 8) : null;
  const criticalHealth = openCriticalBugs > 0 ? clampPct(100 - openCriticalBugs * 10) : null;

  const coverageGap = avgCoverage !== null ? Math.max(0, 95 - avgCoverage) : null;
  const daysRemaining = coverageGap !== null ? Math.max(1, openCriticalBugs + Math.ceil(coverageGap / 2)) : null;
  const estCompletion = daysRemaining !== null
    ? new Date(Date.now() + daysRemaining * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '--';

  const circumference = 2 * Math.PI * 65;
  const dashOffset = tapeoutScore !== null ? circumference - (tapeoutScore / 100) * circumference : circumference;

  return (
    <div className="dashboard">
      {/* Stat Cards */}
      <div className="stat-cards">
        <div className="stat-card blue">
          <div className="stat-card-label">Total Bugs Found</div>
          <div className="stat-card-value">{totalBugs ?? '--'}</div>
          <div className="stat-card-sub up">
            <HiOutlineTrendingUp /> {weeklyDelta === null ? 'from integrated data' : `${weeklyDelta >= 0 ? '+' : ''}${weeklyDelta} last interval`}
          </div>
        </div>

        <div className="stat-card red">
          <div className="stat-card-label">Open Critical Bugs</div>
          <div className="stat-card-value">{isLoading ? '--' : openCriticalBugs}</div>
          <div className="stat-card-sub up">
            <HiOutlineTrendingUp /> {isLoading ? 'from integrated data' : 'current snapshot'}
          </div>
        </div>

        <div className="stat-card yellow">
          <div className="stat-card-label">Tapeout Readiness</div>
          <div className="stat-card-value">{tapeoutScore ?? '--'}<span style={{ fontSize: '18px', fontWeight: 400, color: '#000000' }}>/100</span></div>
          <div className="stat-card-sub warn">
            <HiOutlineExclamation /> {tapeoutScore !== null && tapeoutScore >= 80 ? 'Ready' : 'Conditional'}
          </div>
        </div>

        <div className="stat-card green">
          <div className="stat-card-label">Est. Completion</div>
          <div className="stat-card-value" style={{ fontSize: '22px', letterSpacing: '-0.5px' }}>{estCompletion}</div>
          <div className="stat-card-sub neutral">
            {daysRemaining !== null ? `${daysRemaining} days remaining` : 'waiting for data'}
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="charts-section">
        <div className="chart-card">
          <div className="chart-card-header">
            <h3>Bug Discovery Trend + Forecast</h3>
            <p>Last 30 days · AI forecast next 7 days</p>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={dynamicBugTrend} margin={{ top: 15, right: 10, left: -15, bottom: 0 }}>
              <defs>
                <linearGradient id="forecastShade" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#000000" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#000000" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: '#000000' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#000000' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="actual"
                stroke="#D32F2F"
                strokeWidth={2}
                fill="none"
                name="Actual"
                connectNulls={false}
                dot={false}
              />
              <Area
                type="monotone"
                dataKey="forecast"
                stroke="#000000"
                strokeWidth={2}
                strokeDasharray="6 4"
                fill="url(#forecastShade)"
                name="AI Forecast"
                connectNulls={false}
                dot={{ r: 4, fill: '#000000', stroke: '#0f172a', strokeWidth: 1 }}
              />
            </AreaChart>
          </ResponsiveContainer>
          <div className="chart-legend">
            <div className="legend-item">
              <span className="legend-line solid"></span>
              Actual
            </div>
            <div className="legend-item">
              <span className="legend-line dashed"></span>
              AI Forecast
            </div>
          </div>
        </div>

        <div className="chart-card tapeout-card">
          <h3>Tapeout Readiness</h3>
          <div className="tapeout-content-v2">
            <div className="tapeout-gauge-v2">
              <svg viewBox="0 0 150 150">
                <circle className="gauge-bg" cx="75" cy="75" r="65" />
                <circle
                  className="gauge-fill yellow"
                  cx="75" cy="75" r="65"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                />
              </svg>
              <div className="gauge-center">
                <div className="gauge-value">{tapeoutScore}</div>
                <div className="gauge-label">TAPEOUT SCORE</div>
              </div>
            </div>

            <div className="tapeout-metrics-v2">
              <div className="metric-row-v2">
                <span className="metric-label">Bug trend</span>
                <div className="metric-bar-container">
                  <div className="metric-bar cyan" style={{ width: `${bugTrendHealth ?? 0}%` }}></div>
                </div>
                <span className="metric-value">{bugTrendHealth ?? '--'}%</span>
              </div>
              <div className="metric-row-v2">
                <span className="metric-label">Coverage</span>
                <div className="metric-bar-container">
                  <div className="metric-bar cyan" style={{ width: `${avgCoverage ?? 0}%` }}></div>
                </div>
                <span className="metric-value">{avgCoverage ?? '--'}%</span>
              </div>
              <div className="metric-row-v2">
                <span className="metric-label">Critical bugs</span>
                <div className="metric-bar-container">
                  <div className="metric-bar red" style={{ width: `${criticalHealth ?? 0}%` }}></div>
                </div>
                <span className="metric-value">{criticalHealth ?? '--'}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RTL Module Risk Heatmap */}
      <div className="section-card heatmap-section">
        <div className="section-header">
          <div className="header-left">
            <h3>RTL Module Risk Heatmap</h3>
            <span>8 modules · click to inspect</span>
          </div>
          <div className="header-right">
            <div className="filter-dropdown">Risk <HiOutlineChevronDown /></div>
            <div className="filter-dropdown">Coverage <HiOutlineChevronDown /></div>
            <div className="filter-dropdown">Bugs <HiOutlineChevronDown /></div>
          </div>
        </div>

        <div className="detailed-risk-grid">
          {dynamicRiskModules.map((mod) => (
            <div key={mod.name} className={`detailed-risk-card ${mod.color}`}>
              <div className="card-top">
                <span className="mod-name">{mod.name}</span>
                <span className={`risk-badge ${mod.color}`}>{mod.risk}</span>
              </div>
              <div className="card-stats">
                <span>Bugs: {mod.bugs}</span>
                <span>Cov: {mod.cov}%</span>
              </div>
              <div className="card-progress">
                <div className={`progress-fill ${mod.color}`} style={{ width: `${mod.cov}%` }}></div>
              </div>
            </div>
          ))}
          <button className="carousel-btn left"><HiOutlineChevronLeft /></button>
          <button className="carousel-btn right"><HiOutlineChevronRight /></button>
        </div>
      </div>

      <div className="bottom-grid detailed">
        {/* Verification Progress */}
        <div className="section-card progress-section">
          <div className="section-header">
            <div className="header-left">
              <h3>Verification Progress</h3>
              <span>Coverage by module</span>
            </div>
          </div>
          <div className="progress-list">
            {dynamicRiskModules.map((mod) => (
              <div key={mod.name} className="progress-row">
                <div className="row-info">
                  <span className="row-name">{mod.name}</span>
                  <span className={`row-value ${mod.color}`}>{mod.cov}%</span>
                </div>
                <div className="row-bar-bg">
                  <div className={`row-bar-fill ${mod.color}`} style={{ width: `${mod.cov}%` }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Alerts */}
        <div className="section-card alerts-section">
          <div className="section-header">
            <div className="header-left">
              <h3>Recent Alerts</h3>
              <span>Last 24 hours</span>
            </div>
          </div>
          <div className="detailed-alerts-list">
            {alerts.map((alert, i) => (
              <div key={i} className="detailed-alert-item">
                <div className={`alert-dot ${alert.status}`}></div>
                <div className="alert-content">
                  <div className="alert-top">
                    <p>{alert.text}</p>
                    <span className="alert-time">{alert.time}</span>
                  </div>
                  <span className="alert-module">{alert.module}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

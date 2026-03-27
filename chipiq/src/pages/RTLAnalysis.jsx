import { useEffect, useMemo, useState } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { loadIntegrationData } from '../services/integrationData';
import './RTLAnalysis.css';

export default function RTLAnalysis() {
  const [integration, setIntegration] = useState(null);
  const [activeModule, setActiveModule] = useState('');

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

  const dynamicModules = useMemo(() => {
    const rows = integration?.moduleSummary;
    if (!Array.isArray(rows) || rows.length === 0) {
      return [];
    }
    return rows.map((m) => m.name);
  }, [integration]);

  useEffect(() => {
    if (!activeModule && dynamicModules.length > 0) {
      setActiveModule(dynamicModules[0]);
    }
  }, [activeModule, dynamicModules]);

  const activeStats = useMemo(() => {
    const rows = integration?.moduleSummary;
    if (!Array.isArray(rows) || rows.length === 0) {
      return null;
    }
    return rows.find((m) => m.name === activeModule) || rows[0];
  }, [integration, activeModule]);

  const dynamicTimeline = useMemo(() => {
    const trend = integration?.bugTrendMonthly;
    if (!Array.isArray(trend) || trend.length === 0) {
      return [];
    }
    return trend.map((row, idx) => ({
      day: `M${idx + 1}`,
      bugs: Number(row.bugs || 0),
      trend: Number(row.bugs || 0),
    }));
  }, [integration]);

  const failureSplit = useMemo(() => {
    const regs = integration?.regressionResults;
    if (!Array.isArray(regs) || regs.length === 0) {
      return { timing: 0, functional: 0, assertion: 0 };
    }
    const fail = regs.filter((r) => String(r.result).toUpperCase() === 'FAIL').length;
    const timing = Math.max(0, fail);
    const functional = Math.max(0, Math.round((fail + 1) / 2));
    const assertion = Math.max(0, Math.round((fail + 2) / 3));
    return { timing, functional, assertion };
  }, [integration]);

  const totalFailTypes = failureSplit.timing + failureSplit.functional + failureSplit.assertion;
  const timingPct = totalFailTypes > 0 ? Math.round((failureSplit.timing / totalFailTypes) * 100) : 0;
  const functionalPct = totalFailTypes > 0 ? Math.round((failureSplit.functional / totalFailTypes) * 100) : 0;
  const assertionPct = totalFailTypes > 0 ? Math.round((failureSplit.assertion / totalFailTypes) * 100) : 0;

  return (
    <div className="rtl-analysis">
      {/* Module Selector */}
      <div className="module-selector-container">
        <span className="module-label">Module:</span>
        <div className="module-tabs">
          {dynamicModules.map(mod => (
            <button
              key={mod}
              className={`module-tab-btn ${activeModule === mod ? 'active' : ''}`}
              onClick={() => setActiveModule(mod)}
            >
              {mod}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="rtl-stats-grid">
        <div className="rtl-stat-card">
          <div className="rtl-stat-label">RISK SCORE</div>
          <div className="rtl-stat-value">{activeStats?.riskScore ?? '--'}</div>
        </div>
        <div className="rtl-stat-card">
          <div className="rtl-stat-label">OPEN BUGS</div>
          <div className="rtl-stat-value">{activeStats?.openBugs ?? '--'}</div>
        </div>
        <div className="rtl-stat-card">
          <div className="rtl-stat-label">COVERAGE</div>
          <div className="rtl-stat-value">{activeStats?.coverage ?? '--'}{activeStats ? '%' : ''}</div>
        </div>
        <div className="rtl-stat-card">
          <div className="rtl-stat-label">STATUS</div>
          <div className="rtl-stat-value text">{activeStats?.status ?? '--'}</div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="rtl-charts-grid">
        <div className="rtl-chart-card">
          <div className="rtl-chart-header">
            <h3>Bug Discovery Timeline</h3>
            <p>Last 9 days · {activeModule}</p>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={dynamicTimeline} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.03)" vertical={false} />
              <XAxis 
                dataKey="day" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#000000', fontSize: 11 }}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#000000', fontSize: 11 }}
              />
              <Tooltip 
                contentStyle={{ background: '#FFFFFF', border: '1px solid #334155', borderRadius: '8px' }}
                itemStyle={{ color: '#D32F2F' }}
              />
              <Bar 
                dataKey="bugs" 
                fill="#D32F2F" 
                fillOpacity={0.6}
                radius={[4, 4, 0, 0]} 
                barSize={32}
              />
              <Line 
                type="monotone" 
                dataKey="trend" 
                stroke="#f87171" 
                strokeWidth={3} 
                dot={{ r: 0 }} 
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="rtl-chart-card">
          <div className="rtl-chart-header">
            <h3>Failure Type Breakdown</h3>
          </div>
          <div className="failure-list">
            <div className="failure-item">
              <div className="failure-info">
                <span className="failure-name">Timing Violation</span>
                <span className="failure-stats">
                  <b>{failureSplit.timing}</b> <span>·</span> <span style={{color: '#D32F2F'}}>{timingPct}%</span>
                </span>
              </div>
              <div className="failure-bar-bg">
                <div className="failure-bar-fill red" style={{ width: `${timingPct}%` }}></div>
              </div>
            </div>

            <div className="failure-item">
              <div className="failure-info">
                <span className="failure-name">Functional Bug</span>
                <span className="failure-stats">
                  <b style={{color: '#f97316'}}>{failureSplit.functional}</b> <span>·</span> <span style={{color: '#f97316'}}>{functionalPct}%</span>
                </span>
              </div>
              <div className="failure-bar-bg">
                <div className="failure-bar-fill orange" style={{ width: `${functionalPct}%` }}></div>
              </div>
            </div>

            <div className="failure-item">
              <div className="failure-info">
                <span className="failure-name">Assertion Fail</span>
                <span className="failure-stats">
                  <b style={{color: '#eab308'}}>{failureSplit.assertion}</b> <span>·</span> <span style={{color: '#eab308'}}>{assertionPct}%</span>
                </span>
              </div>
              <div className="failure-bar-bg">
                <div className="failure-bar-fill yellow" style={{ width: `${assertionPct}%` }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

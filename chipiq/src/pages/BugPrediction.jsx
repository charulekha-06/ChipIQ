import React, { useEffect, useMemo, useRef, useState } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { HiOutlineChevronLeft, HiOutlineChevronRight } from 'react-icons/hi';
import { getModelForecast, loadIntegrationData, moduleStatusToColor } from '../services/integrationData';
import './BugPrediction.css';

const MODEL_CONFIG = {
  ARIMA: {
    shortHorizonScales: [1.1, 1.05],
    confidenceBand: 0.25,
    rmse: 4.2,
    confidenceAdjust: 0,
    trendLabel: 'Rising',
  },
  LSTM: {
    shortHorizonScales: [1.18, 1.12],
    confidenceBand: 0.18,
    rmse: 3.6,
    confidenceAdjust: -2,
    trendLabel: 'Rising Fast',
  },
  Prophet: {
    shortHorizonScales: [1.06, 1.02],
    confidenceBand: 0.22,
    rmse: 4.8,
    confidenceAdjust: 1,
    trendLabel: 'Rising',
  },
};

const clampPct = (value) => Math.max(0, Math.min(100, value));

function buildForecastFromTrend(trendRows, modelName) {
  const cfg = MODEL_CONFIG[modelName] || MODEL_CONFIG.ARIMA;
  const points = trendRows.map((row) => ({
    date: row.month,
    historical: Number(row.bugs || 0),
    predicted: null,
    upper: null,
    lower: null,
  }));

  const last = points[points.length - 1]?.historical || 0;
  const firstPred = Math.max(0, Math.round(last * cfg.shortHorizonScales[0]));
  const secondPred = Math.max(0, Math.round(last * cfg.shortHorizonScales[1]));
  const band = cfg.confidenceBand;

  points.push({
    date: 'next-1',
    historical: null,
    predicted: firstPred,
    upper: Math.round(firstPred * (1 + band)),
    lower: Math.max(0, Math.round(firstPred * (1 - band))),
  });
  points.push({
    date: 'next-2',
    historical: null,
    predicted: secondPred,
    upper: Math.round(secondPred * (1 + band)),
    lower: Math.max(0, Math.round(secondPred * (1 - band))),
  });

  return points;
}

function buildForecastFromFallback(historyRows, modelName) {
  const cfg = MODEL_CONFIG[modelName] || MODEL_CONFIG.ARIMA;
  const cloned = historyRows.map((row) => ({ ...row }));
  const lastHistorical = [...cloned].reverse().find((row) => row.historical !== null)?.historical || 0;
  const futureRows = cloned.filter((row) => row.historical === null);
  const band = cfg.confidenceBand;

  futureRows.forEach((row, idx) => {
    const scale = cfg.shortHorizonScales[Math.min(idx, cfg.shortHorizonScales.length - 1)] || cfg.shortHorizonScales[1];
    const predicted = Math.max(0, Math.round(lastHistorical * scale));
    row.predicted = predicted;
    row.upper = Math.round(predicted * (1 + band));
    row.lower = Math.max(0, Math.round(predicted * (1 - band)));
  });

  return cloned;
}

export default function BugPrediction() {
  const [activeModel, setActiveModel] = useState('ARIMA');
  const [integration, setIntegration] = useState(null);
  const [serverForecast, setServerForecast] = useState(null);
  const [forecastError, setForecastError] = useState('');
  const [forecastLoading, setForecastLoading] = useState(false);
  const forecastRequestRef = useRef(0);

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

  useEffect(() => {
    let mounted = true;
    const requestId = ++forecastRequestRef.current;
    setForecastLoading(true);
    setServerForecast(null);
    setForecastError('');

    getModelForecast(activeModel, 2)
      .then((payload) => {
        if (mounted && requestId === forecastRequestRef.current) {
          setServerForecast(payload);
          setForecastLoading(false);
        }
      })
      .catch((err) => {
        if (mounted && requestId === forecastRequestRef.current) {
          setServerForecast(null);
          setForecastError(String(err?.message || 'Forecast API unavailable'));
          setForecastLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [activeModel]);

  const dynamicForecastData = useMemo(() => {
    if (Array.isArray(serverForecast?.series) && serverForecast.series.length > 0) {
      return serverForecast.series;
    }

    const trend = integration?.bugTrendMonthly;
    if (Array.isArray(trend) && trend.length > 0) {
      if (forecastLoading) {
        return trend.map((row) => ({
          date: row.month,
          historical: Number(row.bugs || 0),
          predicted: null,
          upper: null,
          lower: null,
        }));
      }

      const cfgModel = activeModel in MODEL_CONFIG ? activeModel : 'ARIMA';
      return buildForecastFromTrend(trend, cfgModel);
    }

    return [];
  }, [serverForecast, forecastLoading, integration, activeModel]);

  const dynamicHighRiskModules = useMemo(() => {
    const modules = integration?.moduleSummary;
    if (!Array.isArray(modules) || modules.length === 0) {
      return [];
    }

    return [...modules]
      .sort((a, b) => Number(b.riskScore || 0) - Number(a.riskScore || 0))
      .slice(0, 5)
      .map((mod) => ({
        name: mod.name,
        score: Number(mod.riskScore || 0),
        commit: 'from uart-verilog',
        velocity: `${Number(mod.openBugs || 0)}/cycle`,
        status: mod.status,
        color: moduleStatusToColor(mod.status),
      }));
  }, [integration]);

  const predictedValues = dynamicForecastData.filter((d) => d.predicted !== null);
  const predicted7d = predictedValues.length > 0
    ? predictedValues.reduce((sum, d) => sum + Number(d.predicted || 0), 0)
    : null;

  const baseConfidence = integration?.datasetSummary?.regression_total
    ? Math.round((Number(integration.datasetSummary.regression_pass || 0) / Number(integration.datasetSummary.regression_total || 1)) * 100)
    : null;

  const modelCfg = MODEL_CONFIG[activeModel] || MODEL_CONFIG.ARIMA;
  const confidence = forecastLoading
    ? '--'
    : (serverForecast?.confidence ?? (baseConfidence !== null ? clampPct(baseConfidence + modelCfg.confidenceAdjust) : '--'));
  const modelRmse = forecastLoading ? '--' : (serverForecast?.rmse ?? '--');
  const trendText = forecastLoading ? 'Loading...' : (serverForecast?.trendLabel ?? '--');

  return (
    <div className="page bug-prediction">
      <div className="page-header-row">
        <div className="model-selector-container">
          <span className="selector-label">Model:</span>
          <div className="model-tabs">
            {['ARIMA', 'LSTM', 'Prophet'].map(model => (
              <button 
                key={model} 
                className={`model-tab ${activeModel === model ? 'active' : ''}`}
                onClick={() => setActiveModel(model)}
              >
                {model}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="prediction-stats-grid">
        <div className="prediction-stat-card">
          <span className="p-stat-label">Predicted (7d)</span>
          <div className="p-stat-value red">{forecastLoading ? '...' : (predicted7d === null ? '--' : `+${predicted7d}`)}</div>
        </div>
        <div className="prediction-stat-card">
          <span className="p-stat-label">Confidence</span>
          <div className="p-stat-value yellow">{forecastLoading ? confidence : `${confidence}%`}</div>
        </div>
        <div className="prediction-stat-card">
          <span className="p-stat-label">Trend</span>
          <div className="p-stat-value red">↑ {trendText}</div>
        </div>
        <div className="prediction-stat-card">
          <span className="p-stat-label">Model RMSE</span>
          <div className="p-stat-value">{modelRmse}</div>
        </div>
      </div>

      <div className="chart-section-wrapper">
        <div className="chart-container-card">
          <div className="chart-header">
            <h3>4-Week Forecast</h3>
            <p>
              Historical + AI prediction with confidence band
              {forecastLoading ? ' (loading selected model...)' : ''}
              {forecastError ? ` (fallback mode: ${forecastError})` : ''}
            </p>
          </div>
          
          <div className="forecast-chart-box">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={dynamicForecastData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#000000" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#000000" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748b', fontSize: 10 }}
                />
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                <Tooltip 
                  contentStyle={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '8px' }}
                  itemStyle={{ fontSize: '12px' }}
                />
                
                {/* Confidence Band */}
                <Area 
                  type="monotone" 
                  dataKey="upper" 
                  stroke="none" 
                  fill="#000000" 
                  fillOpacity={0.05} 
                  connectNulls 
                />
                <Area 
                  type="monotone" 
                  dataKey="lower" 
                  stroke="none" 
                  fill="#000000" 
                  fillOpacity={0.05} 
                  connectNulls 
                />
                
                {/* Historical Line */}
                <Area 
                  type="monotone" 
                  dataKey="historical" 
                  stroke="#06b6d4" 
                  strokeWidth={2} 
                  fill="none" 
                />
                
                {/* Predicted Line */}
                <Area 
                  type="monotone" 
                  dataKey="predicted" 
                  stroke="#000000" 
                  strokeWidth={2} 
                  strokeDasharray="5 5" 
                  fill="url(#colorForecast)" 
                  connectNulls 
                />
              </AreaChart>
            </ResponsiveContainer>
            
            <button className="carousel-btn left"><HiOutlineChevronLeft /></button>
            <button className="carousel-btn right"><HiOutlineChevronRight /></button>
          </div>
        </div>
      </div>

      <div className="risk-modules-section">
        <div className="section-card no-margin">
          <div className="section-header">
            <h3>Top 5 Predicted High-Risk Modules</h3>
          </div>
          <div className="modules-table-container">
            <table className="modules-table">
              <thead>
                <tr>
                  <th>MODULE</th>
                  <th>RISK SCORE</th>
                  <th>LAST COMMIT</th>
                  <th>BUG VELOCITY</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {dynamicHighRiskModules.map((mod, i) => (
                  <tr key={i}>
                    <td className="font-bold">{mod.name}</td>
                    <td className={`score ${mod.color}`}>{mod.score}</td>
                    <td className="text-dim">{mod.commit}</td>
                    <td className={mod.velocity.startsWith('+') ? 'red' : mod.velocity === 'Stable' ? 'text-dim' : 'green'}>
                      {mod.velocity}
                    </td>
                    <td>
                      <span className={`status-badge ${mod.color}`}>{mod.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

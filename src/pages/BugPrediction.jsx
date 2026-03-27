import React, { useState } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine 
} from 'recharts';
import { HiOutlineChevronLeft, HiOutlineChevronRight } from 'react-icons/hi';
import './BugPrediction.css';

const forecastData = [
  { date: 'Feb 25', historical: 5, predicted: null, upper: null, lower: null },
  { date: 'Mar 4', historical: 11, predicted: null, upper: null, lower: null },
  { date: 'Mar 11', historical: 8, predicted: null, upper: null, lower: null },
  { date: 'Mar 18', historical: 16, predicted: null, upper: null, lower: null },
  { date: 'Mar 25', historical: 24, predicted: 24, upper: 24, lower: 24 },
  { date: 'Apr 1', historical: null, predicted: 20, upper: 26, lower: 14 },
  { date: 'Apr 8', historical: null, predicted: 22, upper: 28, lower: 16 },
  { date: 'Apr 15', historical: null, predicted: 15, upper: 22, lower: 8 },
  { date: 'Apr 22', historical: null, predicted: 13, upper: 20, lower: 6 },
];

const highRiskModules = [
  { name: 'USB_PHY', score: 94, commit: '2h ago', velocity: '+3/day', status: 'CRITICAL', color: 'red' },
  { name: 'CPU_CORE', score: 88, commit: '5h ago', velocity: '+2/day', status: 'CRITICAL', color: 'red' },
  { name: 'DDR_CTRL', score: 71, commit: '1d ago', velocity: '+1/day', status: 'HIGH', color: 'orange' },
  { name: 'PCIe_MAC', score: 65, commit: '2d ago', velocity: 'Stable', status: 'HIGH', color: 'orange' },
  { name: 'AXI_BUS', score: 44, commit: '3d ago', velocity: '-1/day', status: 'MEDIUM', color: 'yellow' },
];

export default function BugPrediction() {
  const [activeModel, setActiveModel] = useState('ARIMA');

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
          <div className="p-stat-value red">+12</div>
        </div>
        <div className="prediction-stat-card">
          <span className="p-stat-label">Confidence</span>
          <div className="p-stat-value yellow">81%</div>
        </div>
        <div className="prediction-stat-card">
          <span className="p-stat-label">Trend</span>
          <div className="p-stat-value red">↑ Rising</div>
        </div>
        <div className="prediction-stat-card">
          <span className="p-stat-label">Model RMSE</span>
          <div className="p-stat-value">4.2</div>
        </div>
      </div>

      <div className="chart-section-wrapper">
        <div className="chart-container-card">
          <div className="chart-header">
            <h3>4-Week Forecast</h3>
            <p>Historical + AI prediction with confidence band</p>
          </div>
          
          <div className="forecast-chart-box">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={forecastData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
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
                {highRiskModules.map((mod, i) => (
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

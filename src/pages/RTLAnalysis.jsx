import { useState } from 'react';
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
import './RTLAnalysis.css';

const timelineData = [
  { day: 'D1', bugs: 4, trend: 4 },
  { day: 'D2', bugs: 6, trend: 6 },
  { day: 'D3', bugs: 8, trend: 8 },
  { day: 'D4', bugs: 7, trend: 7 },
  { day: 'D5', bugs: 9, trend: 9 },
  { day: 'D6', bugs: 11, trend: 11 },
  { day: 'D7', bugs: 10, trend: 10 },
  { day: 'D8', bugs: 12, trend: 12 },
  { day: 'D9', bugs: 14, trend: 14 },
];

const modules = [
  'USB_PHY', 'CPU_CORE', 'DDR_CTRL', 'PCIe_MAC', 
  'AXI_BUS', 'CLK_GEN', 'UART', 'SPI'
];

export default function RTLAnalysis() {
  const [activeModule, setActiveModule] = useState('USB_PHY');

  return (
    <div className="rtl-analysis">
      {/* Module Selector */}
      <div className="module-selector-container">
        <span className="module-label">Module:</span>
        <div className="module-tabs">
          {modules.map(mod => (
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
          <div className="rtl-stat-value">94</div>
        </div>
        <div className="rtl-stat-card">
          <div className="rtl-stat-label">OPEN BUGS</div>
          <div className="rtl-stat-value">14</div>
        </div>
        <div className="rtl-stat-card">
          <div className="rtl-stat-label">COVERAGE</div>
          <div className="rtl-stat-value">72%</div>
        </div>
        <div className="rtl-stat-card">
          <div className="rtl-stat-label">STATUS</div>
          <div className="rtl-stat-value text">CRITICAL</div>
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
            <ComposedChart data={timelineData} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
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
                  <b>6</b> <span>·</span> <span style={{color: '#D32F2F'}}>43%</span>
                </span>
              </div>
              <div className="failure-bar-bg">
                <div className="failure-bar-fill red" style={{ width: '43%' }}></div>
              </div>
            </div>

            <div className="failure-item">
              <div className="failure-info">
                <span className="failure-name">Functional Bug</span>
                <span className="failure-stats">
                  <b style={{color: '#f97316'}}>5</b> <span>·</span> <span style={{color: '#f97316'}}>36%</span>
                </span>
              </div>
              <div className="failure-bar-bg">
                <div className="failure-bar-fill orange" style={{ width: '36%' }}></div>
              </div>
            </div>

            <div className="failure-item">
              <div className="failure-info">
                <span className="failure-name">Assertion Fail</span>
                <span className="failure-stats">
                  <b style={{color: '#eab308'}}>3</b> <span>·</span> <span style={{color: '#eab308'}}>21%</span>
                </span>
              </div>
              <div className="failure-bar-bg">
                <div className="failure-bar-fill yellow" style={{ width: '21%' }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

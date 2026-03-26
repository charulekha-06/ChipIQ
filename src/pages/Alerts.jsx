import React, { useState } from 'react';
import './Alerts.css';

const alertData = [
  {
    id: 1,
    date: 'TODAY',
    text: 'P0 regression failure in USB_PHY TX path',
    module: 'USB_PHY',
    time: '2m ago',
    status: 'red'
  },
  {
    id: 2,
    date: 'TODAY',
    text: 'CPU_CORE branch coverage below threshold',
    module: 'CPU_CORE',
    time: '18m ago',
    status: 'red'
  },
  {
    id: 3,
    date: 'TODAY',
    text: 'Critical bug #291 approaching 7-day SLA',
    module: 'DDR_CTRL',
    time: '45m ago',
    status: 'red'
  },
  {
    id: 4,
    date: 'TODAY',
    text: 'DDR_CTRL timing violation in stress sim',
    module: 'DDR_CTRL',
    time: '1h ago',
    status: 'orange'
  },
  {
    id: 5,
    date: 'YESTERDAY',
    text: 'PCIe_MAC link training intermittent failure',
    module: 'PCIe_MAC',
    time: '1d ago',
    status: 'orange'
  },
  {
    id: 6,
    date: 'YESTERDAY',
    text: 'AI model predicts +12 bugs in next 7 days',
    module: 'FORECAST',
    time: '1d ago',
    status: 'orange'
  }
];

export default function Alerts() {
  const [activeFilter, setActiveFilter] = useState('All');
  const filters = [
    { label: 'All', count: 7 },
    { label: 'Critical', count: 3 },
    { label: 'High', count: 2 },
    { label: 'Medium', count: 2 }
  ];

  return (
    <div className="page alerts-page">
      <div className="alerts-filters">
        {filters.map((f) => (
          <button
            key={f.label}
            className={`filter-tab ${activeFilter === f.label ? 'active' : ''}`}
            onClick={() => setActiveFilter(f.label)}
          >
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      <div className="alerts-container-card">
        {['TODAY', 'YESTERDAY'].map(date => (
          <div key={date} className="date-group">
            <div className="date-header">{date}</div>
            <div className="alerts-list">
              {alertData.filter(a => a.date === date).map((alert) => (
                <div key={alert.id} className="alert-item">
                  <div className={`alert-dot ${alert.status}`}></div>
                  <div className="alert-main">
                    <div className="alert-text-row">
                      <p className="alert-text">{alert.text}</p>
                      <span className="alert-time">{alert.time}</span>
                      <button className="dismiss-btn">Dismiss</button>
                    </div>
                    <div className="alert-module-tag">{alert.module}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

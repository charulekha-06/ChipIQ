import { HiOutlineArrowRight } from 'react-icons/hi';
import './DataPipeline.css';

export default function DataPipeline() {
  const sources = [
    { name: 'VCS Simulator', type: 'Log Stream', status: 'active', sync: '12s ago', records: '14,204' },
    { name: 'Questa Sim', type: 'Log Stream', status: 'active', sync: '45s ago', records: '8,910' },
    { name: 'Git Repository', type: 'Webhook', status: 'active', sync: '2m ago', records: '1,203' },
    { name: 'Coverage DB', type: 'SQL Batch', status: 'active', sync: '5m ago', records: '3,401' },
    { name: 'Bug Tracker JIRA', type: 'REST API', status: 'active', sync: '10m ago', records: '312' },
    { name: 'Waveform Dumps', type: 'File Upload', status: 'warning', sync: '1h ago', records: '87' },
    { name: 'Email Reports', type: 'IMAP Sync', status: 'inactive', sync: '6h ago', records: '24' },
  ];

  return (
    <div className="pipeline-page">
      {/* Status Banner */}
      <div className="pipeline-status-banner">
        <div className="status-active-pulse"></div>
        <span className="status-text-primary">Pipeline Active</span>
        <span className="status-divider">·</span>
        <span className="status-metric">Last batch: <span className="status-val" style={{ color: '#e2e8f0' }}>2 min ago</span></span>
        <span className="status-divider">·</span>
        <span className="status-metric">Throughput: <span className="status-val" style={{ color: 'var(--cyan)' }}>~1,200 events/sec</span></span>
        <span className="status-divider">·</span>
        <span className="status-metric">Lag: <span className="status-val" style={{ color: '#22c55e' }}>18ms</span></span>
      </div>

      {/* Architecture Flow */}
      <div className="pipeline-panel">
        <div className="panel-header">
          <div className="panel-title">
            <h3>Data Flow Architecture</h3>
            <p>End-to-end ingestion pipeline</p>
          </div>
        </div>

        <div className="flow-container">
          <div className="flow-node source">
            <span className="node-title">Sources</span>
            <span className="node-desc">VCS · Questa · Git</span>
          </div>
          <HiOutlineArrowRight className="flow-arrow" />
          
          <div className="flow-node queue">
            <span className="node-title">Kafka</span>
            <span className="node-desc">Event Streaming</span>
          </div>
          <HiOutlineArrowRight className="flow-arrow" />
          
          <div className="flow-node etl">
            <span className="node-title">Spark ETL</span>
            <span className="node-desc">Transform + Enrich</span>
          </div>
          <HiOutlineArrowRight className="flow-arrow" />
          
          <div className="flow-node db">
            <span className="node-title">TimescaleDB</span>
            <span className="node-desc">Vector + Time-series</span>
          </div>
          <HiOutlineArrowRight className="flow-arrow" />

          <div className="flow-node ai">
            <span className="node-title">AI Engine</span>
            <span className="node-desc">ARIMA · LSTM ·<br />Prophet</span>
          </div>
        </div>
      </div>

      {/* Data Sources Table */}
      <div className="pipeline-panel">
        <div className="panel-header">
          <div className="panel-title">
            <h3>Data Sources</h3>
            <p>7 sources · 5 active</p>
          </div>
          <button className="add-source-btn">+ Add Source</button>
        </div>

        <table className="sources-table">
          <thead>
            <tr>
              <th>SOURCE</th>
              <th>TYPE</th>
              <th>STATUS</th>
              <th>LAST SYNC</th>
              <th>RECORDS</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((src, i) => (
              <tr key={i}>
                <td className="source-name">{src.name}</td>
                <td className="source-type">{src.type}</td>
                <td>
                  <span className={`status-indicator ${src.status}`}>
                    <span className="dot"></span>
                    {src.status}
                  </span>
                </td>
                <td className="source-sync">{src.sync}</td>
                <td className="source-records">{src.records}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}

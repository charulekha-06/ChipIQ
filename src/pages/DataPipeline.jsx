import { HiOutlinePlus, HiOutlineChevronRight } from 'react-icons/hi';
import './DataPipeline.css';

const flowSteps = [
  { title: 'Sources', subtitle: 'VCS · Questa · Git', color: 'cyan' },
  { title: 'Kafka', subtitle: 'Event Streaming', color: 'yellow' },
  { title: 'Spark ETL', subtitle: 'Transform + Enrich', color: 'orange' },
  { title: 'TimescaleDB', subtitle: 'Vector + Time-series', color: 'green' },
  { title: 'AI Engine', subtitle: 'ARIMA · LSTM · Prophet', color: 'cyan' },
];

const sources = [
  { name: 'VCS Simulator', type: 'Log Stream', status: 'active', lastSync: '12s ago', records: '14,204' },
  { name: 'Questa Sim', type: 'Log Stream', status: 'active', lastSync: '45s ago', records: '8,910' },
  { name: 'Git Repository', type: 'Webhook', status: 'active', lastSync: '2m ago', records: '1,203' },
  { name: 'Coverage DB', type: 'SQL Batch', status: 'active', lastSync: '5m ago', records: '3,401' },
  { name: 'Bug Tracker JIRA', type: 'REST API', status: 'active', lastSync: '10m ago', records: '312' },
  { name: 'Waveform Dumps', type: 'File Upload', status: 'warning', lastSync: '1h ago', records: '87' },
  { name: 'Email Reports', type: 'IMAP Sync', status: 'inactive', lastSync: '6h ago', records: '24' },
];

export default function DataPipeline() {
  return (
    <div className="pipeline-page">
      {/* Status Banner */}
      <div className="pipeline-status-banner">
        <div className="status-indicator">
          <span className="status-dot"></span>
          Pipeline Active
        </div>
        <div className="pipeline-metrics">
          <span>Last batch: <b>2 min ago</b></span>
          <span>Throughput: <b className="metric-cyan">~1,200 events/sec</b></span>
          <span>Lag: <b className="metric-green">18ms</b></span>
        </div>
      </div>

      {/* Flow Architecture */}
      <div className="data-flow-section">
        <div className="intel-header">
          <h3>Data Flow Architecture</h3>
          <p>End-to-end ingestion pipeline</p>
        </div>
        <div className="flow-container">
          {flowSteps.map((step, index) => (
            <div key={step.title} style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div className={`flow-step ${step.color}`}>
                <span className="step-title">{step.title}</span>
                <span className="step-subtitle">{step.subtitle}</span>
              </div>
              {index < flowSteps.length - 1 && <HiOutlineChevronRight className="flow-arrow" />}
            </div>
          ))}
        </div>
      </div>

      {/* Data Sources */}
      <div className="data-sources-section">
        <div className="sources-header">
          <div className="intel-header">
            <h3>Data Sources</h3>
            <p>7 sources · 5 active</p>
          </div>
          <button className="btn-add-source">
            <HiOutlinePlus /> Add Source
          </button>
        </div>

        <table className="sources-table">
          <thead>
            <tr>
              <th>Source</th>
              <th>Type</th>
              <th>Status</th>
              <th>Last Sync</th>
              <th>Records</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.name}>
                <td className="source-name">{s.name}</td>
                <td className="source-type">{s.type}</td>
                <td>
                  <div className="status-row">
                    <span className={`dot ${s.status}`}></span>
                    {s.status}
                  </div>
                </td>
                <td style={{ color: 'var(--text-dim)' }}>{s.lastSync}</td>
                <td className="records-val">{s.records}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

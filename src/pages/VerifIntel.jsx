import { HiOutlineArrowRight, HiOutlineCheck } from 'react-icons/hi';
import './VerifIntel.css';

const bottlenecks = [
  { mod: 'USB_PHY', pct: 40, label: '40% of all failures', color: '#ef4444' },
  { mod: 'CPU_CORE', pct: 28, label: '28% - coverage gaps', color: '#f97316' },
  { mod: 'DDR_CTRL', pct: 18, label: '18% - timing + ECC', color: '#eab308' },
  { mod: 'PCIe_MAC', pct: 9, label: '9% - link training', color: '#22d3ee' },
  { mod: 'Others', pct: 5, label: '5% - minor issues', color: '#64748b' },
];

const clusters = [
  { id: 18, title: 'Timing Path Failures', tags: ['USB_PHY', 'DDR_CTRL'], priority: 'CRITICAL', color: 'red' },
  { id: 14, title: 'Coverage Gaps', tags: ['CPU_CORE', 'DDR_CTRL'], priority: 'CRITICAL', color: 'red' },
  { id: 9, title: 'Protocol Violations', tags: ['PCIe_MAC', 'AXI_BUS'], priority: 'HIGH', color: 'orange' },
  { id: 5, title: 'ECC / Parity Errors', tags: ['DDR_CTRL'], priority: 'HIGH', color: 'yellow' },
  { id: 3, title: 'Clocking Anomalies', tags: ['CLK_GEN', 'CPU_CORE'], priority: 'MEDIUM', color: 'yellow' },
  { id: 2, title: 'Baud / UART Edge', tags: ['UART'], priority: 'LOW', color: 'green' },
];

const staffing = [
  { mod: 'USB_PHY', current: 1, recommended: 3, status: '+2 needed', note: '14 bugs, 72% coverage — most critical blocker' },
  { mod: 'CPU_CORE', current: 1, recommended: 2, status: '+1 needed', note: 'Branch predictor coverage hole needs focused effort' },
  { mod: 'DDR_CTRL', current: 1, recommended: 1, status: 'Staffed', note: 'On track — maintain current assignment', done: true },
];

const recommendations = [
  { id: 1, mod: 'USB_PHY', test: 'TX path stress test @ 5Gbps corner temps', effort: '2 days', impact: 'high' },
  { id: 2, mod: 'CPU_CORE', test: 'Branch predictor directed coverage sweep', effort: '1.5 days', impact: 'high' },
  { id: 3, mod: 'DDR_CTRL', test: 'Refresh storm + ECC inject test', effort: '1 day', impact: 'high' },
  { id: 4, mod: 'PCIe_MAC', test: 'Gen3 link training compliance sweep', effort: '1 day', impact: 'medium' },
  { id: 5, mod: 'AXI_BUS', test: 'Arbitration fairness corner case tests', effort: '0.5 days', impact: 'medium' },
];

export default function VerifIntel() {
  return (
    <div className="verif-intel">
      {/* Bottleneck Analysis */}
      <div className="intel-card">
        <div className="intel-header">
          <h3>Bottleneck Analysis</h3>
          <p>Modules contributing to failure rate</p>
        </div>
        <div className="bottleneck-list">
          {bottlenecks.map(b => (
            <div key={b.mod} className="bottleneck-item">
              <div className="bottleneck-top">
                <span className="bottleneck-name">{b.mod}</span>
                <span className="bottleneck-info" style={{ color: b.color }}>{b.label}</span>
              </div>
              <div className="bottleneck-bar-bg">
                <div className="bottleneck-bar-fill" style={{ width: `${b.pct}%`, background: b.color }}></div>
              </div>
              <div className="bottleneck-pct" style={{ color: b.color }}>{b.pct}%</div>
            </div>
          ))}
        </div>
      </div>

      {/* Grid: Clusters and Staffing */}
      <div className="intel-grid">
        <div className="intel-card">
          <div className="intel-header">
            <h3>Root Cause Clusters</h3>
          </div>
          <div className="cluster-list">
            {clusters.map(c => (
              <div key={c.id} className={`cluster-item ${c.color}`}>
                <div className="cluster-count">{c.id}</div>
                <div className="cluster-content">
                  <span className="cluster-title">{c.title}</span>
                  <div className="cluster-tags">
                    {c.tags.map(t => <span key={t} className="cluster-tag">{t}</span>)}
                  </div>
                </div>
                <span className={`cluster-priority ${c.color}`}>{c.priority}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="intel-card">
          <div className="intel-header">
            <h3>Engineer Focus Suggestions</h3>
            <p>AI-recommended resource allocation</p>
          </div>
          <div className="focus-list">
            {staffing.map(s => (
              <div key={s.mod} className="focus-card">
                <div className="focus-header">
                  <span className="focus-mod">{s.mod}</span>
                  <span className={`focus-status ${s.done ? 'staffed' : 'needed'}`}>
                    {s.status} {s.done && <HiOutlineCheck />}
                  </span>
                </div>
                <div className="focus-allocation">
                  <div className="alloc-box">
                    <span className="alloc-label">Current</span>
                    <span className="alloc-val">{s.current}</span>
                  </div>
                  <HiOutlineArrowRight className="alloc-arrow" />
                  <div className="alloc-box" style={{ border: !s.done ? '1px solid var(--cyan)' : 'none' }}>
                    <span className="alloc-label">Recommended</span>
                    <span className="alloc-val" style={{ color: !s.done ? 'var(--cyan)' : 'inherit' }}>{s.recommended}</span>
                  </div>
                </div>
                <div className="focus-footer">{s.note}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* AI Test Recommendations */}
      <div className="intel-card">
        <div className="intel-header">
          <h3>AI Test Recommendations</h3>
          <p>Prioritized by impact on tapeout readiness</p>
        </div>
        <div className="recommend-table-container">
          <table className="recommend-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Module</th>
                <th>Recommended Test</th>
                <th>Effort</th>
                <th>Impact</th>
              </tr>
            </thead>
            <tbody>
              {recommendations.map(r => (
                <tr key={r.id}>
                  <td className="rec-id">{r.id}</td>
                  <td className={`rec-mod ${r.impact === 'high' ? 'red' : 'orange'}`}>{r.mod}</td>
                  <td className="rec-test">{r.test}</td>
                  <td className="rec-effort">{r.effort}</td>
                  <td>
                    <span className={`impact-badge ${r.impact}`}>{r.impact}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

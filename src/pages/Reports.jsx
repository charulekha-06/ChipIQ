import { HiOutlineDocumentReport } from 'react-icons/hi';
import './Page.css';

export default function Reports() {
  return (
    <div className="page">
      <div className="page-header">
        <h2>Reports</h2>
        <p>Generate and view comprehensive verification reports for stakeholders.</p>
      </div>
      <div className="page-placeholder">
        <div className="page-placeholder-icon red">
          <HiOutlineDocumentReport />
        </div>
        <h3>Verification Reports</h3>
        <p>Create detailed reports with charts, metrics, and actionable insights. Export to PDF, Excel, or share via a live dashboard link.</p>
        <div className="feature-chips">
          <span className="feature-chip">PDF Export</span>
          <span className="feature-chip">Auto-Generate</span>
          <span className="feature-chip">Custom Templates</span>
          <span className="feature-chip">Scheduled Reports</span>
        </div>
      </div>
    </div>
  );
}

import { HiOutlineShieldCheck } from 'react-icons/hi';
import './Page.css';

export default function TapeoutReadiness() {
  return (
    <div className="page">
      <div className="page-header">
        <h2>Tapeout Readiness</h2>
        <p>Track your chip's progress toward tapeout with automated readiness scoring.</p>
      </div>
      <div className="page-placeholder">
        <div className="page-placeholder-icon cyan">
          <HiOutlineShieldCheck />
        </div>
        <h3>Tapeout Readiness Tracker</h3>
        <p>Monitor verification coverage, outstanding bugs, timing closure, and other critical milestones on your path to tapeout.</p>
        <div className="feature-chips">
          <span className="feature-chip">Readiness Score</span>
          <span className="feature-chip">Milestone Tracking</span>
          <span className="feature-chip">Coverage Gates</span>
          <span className="feature-chip">Sign-off Checklist</span>
        </div>
      </div>
    </div>
  );
}

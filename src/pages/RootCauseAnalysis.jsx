import { TbAnalyze } from 'react-icons/tb';
import './Page.css';

export default function RootCauseAnalysis() {
  return (
    <div className="page">
      <div className="page-header">
        <h2>Root Cause Analysis</h2>
        <p>Automatically identify the root causes of verification failures using AI.</p>
      </div>
      <div className="page-placeholder">
        <div className="page-placeholder-icon purple">
          <TbAnalyze />
        </div>
        <h3>AI-Driven Root Cause Engine</h3>
        <p>Trace failures back to their origin with automated dependency analysis, log correlation, and intelligent pattern matching.</p>
        <div className="feature-chips">
          <span className="feature-chip">Dependency Graph</span>
          <span className="feature-chip">Log Correlation</span>
          <span className="feature-chip">Pattern Matching</span>
          <span className="feature-chip">Fix Suggestions</span>
        </div>
      </div>
    </div>
  );
}

import { TbBugOff } from 'react-icons/tb';
import './Page.css';

export default function BugPrediction() {
  return (
    <div className="page">
      <div className="page-header">
        <h2>Bug Prediction</h2>
        <p>AI-powered prediction of potential bugs across chip modules using historical data.</p>
      </div>
      <div className="page-placeholder">
        <div className="page-placeholder-icon green">
          <TbBugOff />
        </div>
        <h3>Smart Bug Prediction Engine</h3>
        <p>Leverage machine learning models trained on your verification history to predict where bugs are most likely to occur.</p>
        <div className="feature-chips">
          <span className="feature-chip">ML Models</span>
          <span className="feature-chip">Confidence Scores</span>
          <span className="feature-chip">Module Mapping</span>
          <span className="feature-chip">Trend Analysis</span>
        </div>
      </div>
    </div>
  );
}

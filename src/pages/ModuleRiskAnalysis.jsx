import { HiOutlineExclamation } from 'react-icons/hi';
import './Page.css';

export default function ModuleRiskAnalysis() {
  return (
    <div className="page">
      <div className="page-header">
        <h2>Module Risk Analysis</h2>
        <p>Assess and visualize risk levels across all chip modules with AI-driven insights.</p>
      </div>
      <div className="page-placeholder">
        <div className="page-placeholder-icon orange">
          <HiOutlineExclamation />
        </div>
        <h3>Comprehensive Risk Assessment</h3>
        <p>Identify high-risk areas in your chip design with multi-factor analysis including complexity, code churn, and historical defect density.</p>
        <div className="feature-chips">
          <span className="feature-chip">Risk Heatmap</span>
          <span className="feature-chip">Factor Weighting</span>
          <span className="feature-chip">Historical Comparison</span>
          <span className="feature-chip">Export Reports</span>
        </div>
      </div>
    </div>
  );
}

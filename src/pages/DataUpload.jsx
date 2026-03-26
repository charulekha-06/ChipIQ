import { HiOutlineCloudUpload } from 'react-icons/hi';
import './Page.css';

export default function DataUpload() {
  return (
    <div className="page">
      <div className="page-header">
        <h2>Data Upload</h2>
        <p>Upload verification data, regression logs, and test results for AI analysis.</p>
      </div>
      <div className="page-placeholder">
        <div className="page-placeholder-icon blue">
          <HiOutlineCloudUpload />
        </div>
        <h3>Upload Verification Data</h3>
        <p>Drag and drop your verification files or click to browse. Supports CSV, JSON, VCD, and custom log formats.</p>
        <div className="feature-chips">
          <span className="feature-chip">Batch Upload</span>
          <span className="feature-chip">Format Validation</span>
          <span className="feature-chip">Auto-Parse</span>
          <span className="feature-chip">History</span>
        </div>
      </div>
    </div>
  );
}

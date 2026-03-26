import { HiOutlineCog } from 'react-icons/hi';
import './Page.css';

export default function Settings() {
  return (
    <div className="page">
      <div className="page-header">
        <h2>Settings</h2>
        <p>Configure your ChipIQ workspace, integrations, and user preferences.</p>
      </div>
      <div className="page-placeholder">
        <div className="page-placeholder-icon gray">
          <HiOutlineCog />
        </div>
        <h3>System Configuration</h3>
        <p>Manage model parameters, data source connections, notification preferences, team access, and workspace settings.</p>
        <div className="feature-chips">
          <span className="feature-chip">Model Config</span>
          <span className="feature-chip">Integrations</span>
          <span className="feature-chip">Notifications</span>
          <span className="feature-chip">Team Access</span>
        </div>
      </div>
    </div>
  );
}

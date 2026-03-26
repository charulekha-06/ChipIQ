import { useState } from 'react';
import { 
  HiOutlineLink, 
  HiOutlineBell, 
  HiOutlineChip, 
  HiOutlineUser,
  HiOutlineCheckCircle
} from 'react-icons/hi';
import './Settings.css';

export default function Settings() {
  const [model, setModel] = useState('ARIMA');
  const [slackAlerts, setSlackAlerts] = useState(true);
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [autoRetrain, setAutoRetrain] = useState(true);

  return (
    <div className="settings-page">
      {/* Integrations */}
      <div className="settings-section">
        <div className="settings-header">
          <HiOutlineLink />
          <h3>Integrations</h3>
        </div>
        <div className="settings-list">
          <div className="settings-item">
            <div className="settings-item-info">
              <h4>Git Repository (GitHub)</h4>
              <p>github.com/acme/project-alpha — webhook active</p>
            </div>
            <div className="status-badge connected">Connected ✓</div>
          </div>
          <div className="settings-item">
            <div className="settings-item-info">
              <h4>JIRA Bug Tracker</h4>
              <p>acme.atlassian.net — syncing every 10 min</p>
            </div>
            <div className="status-badge connected">Connected ✓</div>
          </div>
          <div className="settings-item">
            <div className="settings-item-info">
              <h4>Slack Workspace</h4>
              <p>acme-chip-alerts channel</p>
            </div>
            <div className="status-badge connected">Connected ✓</div>
          </div>
          <div className="settings-item">
            <div className="settings-item-info">
              <h4>CI/CD Pipeline (Jenkins)</h4>
              <p>jenkins.acme-int.net</p>
            </div>
            <button className="btn-connect">Connect</button>
          </div>
        </div>
      </div>

      {/* Alerts & Notifications */}
      <div className="settings-section">
        <div className="settings-header">
          <HiOutlineBell />
          <h3>Alerts & Notifications</h3>
        </div>
        <div className="settings-list">
          <div className="settings-item">
            <div className="settings-item-info">
              <h4>Slack Alerts</h4>
              <p>Send alerts to #chip-alerts channel</p>
            </div>
            <label className="toggle-switch">
              <input type="checkbox" checked={slackAlerts} onChange={() => setSlackAlerts(!slackAlerts)} />
              <span className="slider"></span>
            </label>
          </div>
          <div className="settings-item">
            <div className="settings-item-info">
              <h4>Email Alerts</h4>
              <p>Send digest to team@acme.com</p>
            </div>
            <label className="toggle-switch">
              <input type="checkbox" checked={emailAlerts} onChange={() => setEmailAlerts(!emailAlerts)} />
              <span className="slider"></span>
            </label>
          </div>
          <div className="settings-item">
            <div className="settings-item-info">
              <h4>Critical Only</h4>
              <p>Only alert on P0/P1 severity bugs</p>
            </div>
            <label className="toggle-switch">
              <input type="checkbox" checked={criticalOnly} onChange={() => setCriticalOnly(!criticalOnly)} />
              <span className="slider"></span>
            </label>
          </div>
        </div>
      </div>

      {/* AI Model Settings */}
      <div className="settings-section">
        <div className="settings-header">
          <HiOutlineChip />
          <h3>AI Model Settings</h3>
        </div>
        <div className="settings-list">
          <div className="settings-item">
            <div className="settings-item-info">
              <h4>Default Forecast Model</h4>
              <p>Used for bug prediction charts</p>
            </div>
            <div className="segmented-control">
              {['ARIMA', 'LSTM', 'Prophet'].map(m => (
                <button 
                  key={m} 
                  className={`segment-btn ${model === m ? 'active' : ''}`}
                  onClick={() => setModel(m)}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div className="settings-item">
            <div className="settings-item-info">
              <h4>Auto-Retrain Model</h4>
              <p>Retrain weekly on latest data</p>
            </div>
            <label className="toggle-switch">
              <input type="checkbox" checked={autoRetrain} onChange={() => setAutoRetrain(!autoRetrain)} />
              <span className="slider"></span>
            </label>
          </div>
          <div className="settings-item">
            <div className="settings-item-info">
              <h4>Confidence Threshold</h4>
              <p>Minimum confidence to show predictions</p>
            </div>
            <span className="threshold-val">75%</span>
          </div>
        </div>
      </div>

      {/* Account */}
      <div className="settings-section">
        <div className="settings-header">
          <HiOutlineUser />
          <h3>Account</h3>
        </div>
        <div className="settings-list">
          <div className="settings-item">
            <div className="settings-item-info">
              <h4>User</h4>
              <p>Logged in as AK</p>
            </div>
            <span className="account-val">AK · Admin</span>
          </div>
          <div className="settings-item">
            <div className="settings-item-info">
              <h4>Project</h4>
              <p>Currently active chip project</p>
            </div>
            <select className="project-select">
              <option>Project Alpha v2.1</option>
              <option>Project Beta v1.0</option>
              <option>Legacy Core v4.5</option>
            </select>
          </div>
        </div>
      </div>

      <div className="settings-footer">
        <button className="btn-save">Save Settings</button>
      </div>
    </div>
  );
}

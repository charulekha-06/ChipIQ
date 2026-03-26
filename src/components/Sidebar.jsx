import { 
  HiOutlineViewGrid,
  HiOutlineBeaker,
  HiOutlineTerminal,
  HiOutlineLightBulb,
  HiOutlineCheckCircle,
  HiOutlineBell,
  HiOutlineDatabase,
  HiOutlineDocumentText,
  HiOutlineLightningBolt,
  HiOutlineCog,
  HiOutlineChevronDown
} from 'react-icons/hi';
import './Sidebar.css';

import { NavLink } from 'react-router-dom';

const navItems = [
  { path: '/', label: 'Dashboard', icon: HiOutlineViewGrid },
  { path: '/bug-prediction', label: 'Bug Prediction', icon: HiOutlineBeaker },
  { path: '/rtl-analysis', label: 'RTL Analysis', icon: HiOutlineTerminal },
  { path: '/verif-intel', label: 'Verif Intel', icon: HiOutlineLightBulb },
  { path: '/tapeout-readiness', label: 'Tapeout', icon: HiOutlineCheckCircle },
  { path: '/alerts', label: 'Alerts', icon: HiOutlineBell, badge: 7 },
  { path: '/data-pipeline', label: 'Data Pipeline', icon: HiOutlineDatabase },
  { path: '/reports', label: 'Reports', icon: HiOutlineDocumentText },
  { path: '/simulator', label: 'Simulator', icon: HiOutlineLightningBolt },
  { path: '/settings', label: 'Settings', icon: HiOutlineCog },
];

export default function Navbar() {
  return (
    <nav className="navbar">
      <div className="navbar-top">
        <div className="navbar-left">
          <NavLink to="/" className="navbar-logo">
            <span className="logo-text">ChipIQ</span>
          </NavLink>
        </div>

        <div className="navbar-center">
          {/* Project selector removed */}
        </div>

        <div className="navbar-right">
          <div className="live-status">
            <span className="status-dot"></span>
            Live
          </div>

          <button className="nav-action-btn" title="Notifications">
            <HiOutlineBell size={20} />
          </button>

          <div className="nav-user-avatar">AK</div>
        </div>
      </div>

      <div className="navbar-bottom">
        <div className="nav-tabs">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
              end={item.path === '/'}
            >
              <item.icon className="nav-tab-icon" />
              {item.label}
              {item.badge && <span className="nav-tab-badge">{item.badge}</span>}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  );
}

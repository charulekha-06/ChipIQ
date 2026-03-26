import { NavLink } from 'react-router-dom';
import { HiOutlineBell, HiOutlineChevronDown } from 'react-icons/hi';
import './Sidebar.css';

const navItems = [
  { path: '/', label: 'Dashboard' },
  { path: '/bug-prediction', label: 'Bug Prediction' },
  { path: '/rtl-analysis', label: 'RTL Analysis', color: 'cyan' },
  { path: '/verif-intel', label: 'Verif Intel', color: 'yellow' },
  { path: '/tapeout-readiness', label: 'Tapeout', color: 'grey' },
  { path: '/alerts', label: 'Alerts', badge: 7, color: 'grey' },
  { path: '/data-pipeline', label: 'Data Pipeline', color: 'yellow' },
  { path: '/reports', label: 'Reports', color: 'yellow' },
  { path: '/simulator', label: 'Simulator 🔥', color: 'yellow' },
  { path: '/settings', label: 'Settings', color: 'yellow' },
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
              className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''} ${item.color || ''}`}
              end={item.path === '/'}
            >
              {item.label}
              {item.badge && <span className="nav-tab-badge">{item.badge}</span>}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  );
}

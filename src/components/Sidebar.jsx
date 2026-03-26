import { NavLink } from 'react-router-dom';
import { HiOutlineBell, HiOutlineChevronDown } from 'react-icons/hi';
import './Sidebar.css';

const navItems = [
  { path: '/', label: 'Dashboard' },
  { path: '/bug-prediction', label: 'Bug Prediction' },
  { path: '/tapeout-readiness', label: 'Tapeout Readiness' },
  { path: '/alerts', label: 'Alerts', badge: 7 },
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
              {item.label}
              {item.badge && <span className="nav-tab-badge">{item.badge}</span>}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  );
}

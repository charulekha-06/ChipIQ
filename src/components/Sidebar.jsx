import { NavLink } from 'react-router-dom';
import {
  HiOutlineViewGrid,
  HiOutlineCloudUpload,
  HiOutlineExclamation,
  HiOutlineShieldCheck,
  HiOutlineDocumentReport,
  HiOutlineCog,
  HiOutlineBell,
  HiOutlineSearch,
} from 'react-icons/hi';
import { TbBugOff, TbAnalyze } from 'react-icons/tb';
import { VscCircuitBoard } from 'react-icons/vsc';
import './Sidebar.css';

const navItems = [
  { path: '/', label: 'Dashboard', icon: <HiOutlineViewGrid /> },
  { path: '/data-upload', label: 'Data Upload', icon: <HiOutlineCloudUpload /> },
  { path: '/bug-prediction', label: 'Bug Prediction', icon: <TbBugOff /> },
  { path: '/module-risk', label: 'Module Risk Analysis', icon: <HiOutlineExclamation /> },
  { path: '/tapeout-readiness', label: 'Tapeout Readiness', icon: <HiOutlineShieldCheck /> },
  { path: '/root-cause', label: 'Root Cause Analysis', icon: <TbAnalyze /> },
  { path: '/reports', label: 'Reports', icon: <HiOutlineDocumentReport /> },
];

export default function Navbar() {
  return (
    <nav className="navbar">
      <div className="navbar-left">
        <NavLink to="/" className="navbar-logo">
          <div className="logo-icon">
            <VscCircuitBoard />
          </div>
          <span className="logo-text">ChipIQ</span>
        </NavLink>

        <div className="nav-tabs">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
              end={item.path === '/'}
            >
              <span className="nav-tab-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </div>
      </div>

      <div className="navbar-right">
        <div className="system-status">
          <span className="status-dot"></span>
          Online
        </div>

        <button className="nav-action-btn" title="Search">
          <HiOutlineSearch />
        </button>

        <button className="nav-action-btn" title="Notifications">
          <HiOutlineBell />
          <span className="nav-notification-dot"></span>
        </button>

        <NavLink
          to="/settings"
          className="nav-action-btn"
          title="Settings"
        >
          <HiOutlineCog />
        </NavLink>

        <div className="nav-user">
          <div className="nav-user-avatar">JE</div>
          <div className="nav-user-info">
            <span>John Engineer</span>
            <span>Verification Lead</span>
          </div>
        </div>
      </div>
    </nav>
  );
}

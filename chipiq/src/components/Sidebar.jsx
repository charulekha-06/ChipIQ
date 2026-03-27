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
  HiOutlineChevronDown,
  HiOutlineSparkles,
  HiOutlineSearchCircle,
  HiOutlineCloudUpload
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
  { path: '/data-upload', label: 'Data Upload', icon: HiOutlineCloudUpload },
  { path: '/data-pipeline', label: 'Data Pipeline', icon: HiOutlineDatabase },
  { path: '/reports', label: 'Reports', icon: HiOutlineDocumentText },
  { path: '/simulator', label: 'Simulator', icon: HiOutlineLightningBolt },
  { path: '/ai-generator', label: 'AI Generator', icon: HiOutlineSparkles },
  { path: '/root-cause', label: 'Root Cause AI', icon: HiOutlineSearchCircle },
  { path: '/settings', label: 'Settings', icon: HiOutlineCog },
];

const ROLES = {
  engineer: { allowedTabs: ['/', '/bug-prediction', '/simulator', '/rtl-analysis', '/data-upload', '/alerts', '/ai-generator', '/root-cause', '/data-pipeline', '/reports'] },
  lead: { allowedTabs: ['/', '/bug-prediction', '/rtl-analysis', '/simulator', '/data-upload', '/alerts', '/ai-generator', '/root-cause', '/reports', '/data-pipeline', '/tapeout-readiness'] },
  manager: { allowedTabs: ['/', '/bug-prediction', '/verif-intel', '/tapeout-readiness', '/alerts', '/reports', '/root-cause', '/rtl-analysis', '/data-pipeline'] },
  admin: { allowedTabs: ['/', '/bug-prediction', '/rtl-analysis', '/verif-intel', '/tapeout-readiness', '/alerts', '/data-pipeline', '/reports', '/simulator', '/settings', '/ai-generator', '/root-cause', '/data-upload'] }
};

export default function Navbar({ user, onLogout }) {
  const allowed = user ? ROLES[user.role].allowedTabs : [];
  const filteredNav = navItems.filter(item => allowed.includes(item.path));
  const restrictedCount = navItems.length - filteredNav.length;

  const getInitials = (name) => {
    if(!name) return 'U';
    return name.split(' ').map(n=>n[0]).join('').toUpperCase();
  };

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


          <button className="nav-action-btn" title="Notifications">
            <HiOutlineBell size={20} />
          </button>

          <div className="nav-user-avatar" onClick={onLogout} style={{ cursor: 'pointer' }} title="Logout">
            {getInitials(user?.name)}
          </div>
        </div>
      </div>

      <div className="navbar-bottom">
        <div className="nav-tabs">
          {filteredNav.map((item) => (
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

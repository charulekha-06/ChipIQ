import { useState } from 'react';
import { useAuth, roles } from '../context/AuthContext';
import { 
  HiOutlineUser, 
  HiOutlineUserGroup, 
  HiOutlineAcademicCap, 
  HiOutlineShieldCheck 
} from 'react-icons/hi';
import './Login.css';

export default function Login() {
  const { login } = useAuth();
  const [selectedRole, setSelectedRole] = useState(roles.ENGINEER);

  const handleLogin = (e) => {
    e.preventDefault();
    login(selectedRole);
  };

  const roleOptions = [
    { id: roles.ENGINEER, name: 'Engineer', icon: HiOutlineUser },
    { id: roles.LEAD, name: 'Lead', icon: HiOutlineUserGroup },
    { id: roles.MANAGER, name: 'Manager', icon: HiOutlineAcademicCap },
    { id: roles.ADMIN, name: 'Admin', icon: HiOutlineShieldCheck },
  ];

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <span className="login-logo">Chip<span>IQ</span></span>
          <p>Sign in to access verification dashboard</p>
        </div>

        <form className="login-form" onSubmit={handleLogin}>
          <div className="role-selector">
            {roleOptions.map((role) => (
              <div 
                key={role.id}
                className={`role-card ${selectedRole === role.id ? 'active' : ''}`}
                onClick={() => setSelectedRole(role.id)}
              >
                <role.icon className="role-icon" />
                <span className="role-name">{role.name}</span>
              </div>
            ))}
          </div>

          <button type="submit" className="btn-login">
            Access Dashboard
          </button>
        </form>
      </div>
    </div>
  );
}

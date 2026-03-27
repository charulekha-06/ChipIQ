import React, { useState, useEffect } from 'react';
import './Login.css';

const DEMO_USERS = {
  'engineer@chipiq.io': { password: 'eng123', role: 'engineer', name: 'R. Sharma' },
  'lead@chipiq.io': { password: 'lead123', role: 'lead', name: 'J. Chen' },
  'manager@chipiq.io': { password: 'mgr123', role: 'manager', name: 'S. Patel' },
  'admin@chipiq.io': { password: 'admin123', role: 'admin', name: 'A. Kumar' },
};

const ROLES_INFO = {
  engineer: { icon: '🔧', label: 'VERIFICATION ENGINEER', desc: 'Core RTL analysis & simulation', tabs: 6, color: '#D32F2F', bg: 'rgba(211, 47, 47, 0.1)' },
  lead: { icon: '🧠', label: 'PROJECT / TECH LEAD', desc: 'Team oversight & intelligence', tabs: 8, color: '#000000', bg: 'rgba(255, 191, 0, 0.1)' },
  manager: { icon: '📊', label: 'MANAGER / STAKEHOLDER', desc: 'High-level reports & tapeout', tabs: 5, color: '#111111', bg: 'rgba(63, 185, 80, 0.1)' },
  admin: { icon: '⚙️', label: 'ADMIN / ML ENGINEER', desc: 'Full system & model access', tabs: 10, color: '#F85149', bg: 'rgba(248, 81, 73, 0.1)' }
};

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('');
  
  const [remember, setRemember] = useState(false);
  const [userFocus, setUserFocus] = useState(false);
  const [passFocus, setPassFocus] = useState(false);
  const [roleFocus, setRoleFocus] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [dots, setDots] = useState([]);

  useEffect(() => {
    const generatedDots = Array.from({ length: 28 }).map((_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 1 + Math.random() * 2,
      duration: 3 + Math.random() * 4,
      delay: Math.random() * 5
    }));
    setDots(generatedDots);
  }, []);

  const inputBorder = (focused) => focused ? '1px solid #D32F2F' : '1px solid #000000';
  const inputGlow = (focused) => focused ? '0 0 0 2px rgba(0,229,255,0.2), 0 0 10px rgba(0,229,255,0.1)' : 'none';

  const handleLogin = (e) => {
    if (e) e.preventDefault();
    if (!username || !password || !role) {
      setError("Please fill in all fields including your role.");
      return;
    }
    setError("");
    setLoading(true);

    setTimeout(() => {
      const userKey = username.toLowerCase();
      const user = DEMO_USERS[userKey];
      
      if (!user) {
        setError("Username not found. Check credentials.");
        setLoading(false);
        return;
      }
      if (user.password !== password) {
        setError("Incorrect password. Please try again.");
        setLoading(false);
        return;
      }
      if (user.role !== role) {
        setError(`Role mismatch. Your account is registered as: ${ROLES_INFO[user.role].label}`);
        setLoading(false);
        return;
      }

      setLoading(false);
      onLogin({ name: user.name, role: user.role, email: userKey });
    }, 1400);
  };

  const fillDemo = (demoKey) => {
    const user = DEMO_USERS[demoKey];
    setUsername(demoKey);
    setPassword(user.password);
    setRole(user.role);
    setError('');
  };

  return (
    <div className="login-container">
      <div className="bg-dots">
        {dots.map(dot => (
          <div 
            key={dot.id}
            className="floating-dot"
            style={{
              left: `${dot.x}%`,
              top: `${dot.y}%`,
              width: `${dot.size}px`,
              height: `${dot.size}px`,
              animationDuration: `${dot.duration}s`,
              animationDelay: `${dot.delay}s`
            }}
          />
        ))}
      </div>

      <div className="login-card">
        <div className="login-header">
          <h1 className="login-title">Welcome to ChipIQ</h1>
          <p className="login-subtitle">Semiconductor Verification AI Platform</p>
        </div>

        {error && (
          <div className="error-panel">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form className="login-form" onSubmit={handleLogin}>
          <div className="input-group">
            <label>Username</label>
            <input 
              type="text" 
              className="input-field" 
              placeholder="engineer@chipiq.io"
              value={username}
              onChange={e => setUsername(e.target.value)}
              onFocus={() => setUserFocus(true)}
              onBlur={() => setUserFocus(false)}
              style={{ border: inputBorder(userFocus), boxShadow: inputGlow(userFocus) }}
            />
          </div>

          <div className="input-group">
            <label>Password</label>
            <input 
              type={showPass ? 'text' : 'password'} 
              className="input-field" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              onFocus={() => setPassFocus(true)}
              onBlur={() => setPassFocus(false)}
              style={{ border: inputBorder(passFocus), boxShadow: inputGlow(passFocus) }}
            />
            <button 
              type="button" 
              className="password-toggle" 
              onClick={() => setShowPass(!showPass)}
              tabIndex="-1"
            >
              {showPass ? '🙈' : '👁'}
            </button>
          </div>

          <div className="input-group">
            <label>Role</label>
            <select 
              className="input-field role-select"
              value={role}
              onChange={e => setRole(e.target.value)}
              onFocus={() => setRoleFocus(true)}
              onBlur={() => setRoleFocus(false)}
              style={{ border: inputBorder(roleFocus), boxShadow: inputGlow(roleFocus) }}
            >
              <option value="" disabled>Select your role...</option>
              <option value="engineer">🔧 Verification Engineer</option>
              <option value="lead">🧠 Project / Tech Lead</option>
              <option value="manager">📊 Manager / Stakeholder</option>
              <option value="admin">⚙️ Admin / ML Engineer</option>
            </select>
          </div>

          {role && ROLES_INFO[role] && (
            <div className="role-pill" style={{ backgroundColor: ROLES_INFO[role].bg, border: `1px solid ${ROLES_INFO[role].color}` }}>
              <div className="role-pill-left">
                <span style={{ fontSize: '16px' }}>{ROLES_INFO[role].icon}</span>
                <span style={{ color: ROLES_INFO[role].color, fontFamily: 'monospace', fontWeight: 600 }}>{ROLES_INFO[role].label}</span>
              </div>
              <span style={{ color: '#000000', fontSize: '11px' }}>{ROLES_INFO[role].tabs} TABS</span>
            </div>
          )}



          <button 
            type="submit" 
            className="login-btn" 
            disabled={loading}
            onMouseEnter={e => {
              if(!loading) {
                e.currentTarget.style.backgroundColor = '#000000';
              }
            }}
            onMouseLeave={e => {
              if(!loading) {
                e.currentTarget.style.backgroundColor = '#D32F2F';
              }
            }}
          >
            {loading ? (
              <>
                <div className="spinner"></div>
                <span>Authenticating...</span>
              </>
            ) : "Login to ChipIQ"}
          </button>
        </form>

        <div className="demo-panel">
          <div className="demo-title">Demo Credentials</div>
          <div className="demo-grid">
            <div className="demo-row" onClick={() => fillDemo('engineer@chipiq.io')}>
              <span style={{ color: '#D32F2F' }}>Engineer</span>
              <span style={{ color: '#000000' }}>eng123</span>
            </div>
            <div className="demo-row" onClick={() => fillDemo('lead@chipiq.io')}>
              <span style={{ color: '#000000' }}>Lead</span>
              <span style={{ color: '#000000' }}>lead123</span>
            </div>
            <div className="demo-row" onClick={() => fillDemo('manager@chipiq.io')}>
              <span style={{ color: '#111111' }}>Manager</span>
              <span style={{ color: '#000000' }}>mgr123</span>
            </div>
            <div className="demo-row" onClick={() => fillDemo('admin@chipiq.io')}>
              <span style={{ color: '#F85149' }}>Admin</span>
              <span style={{ color: '#000000' }}>admin123</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

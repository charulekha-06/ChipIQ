import React, { useState, useEffect, useRef, useCallback } from 'react';
import './Login.css';
import {
  HiOutlineTerminal,
  HiOutlineChartBar,
  HiOutlineChip,
  HiOutlineShieldCheck,
  HiOutlineKey,
  HiOutlineUser,
  HiOutlineSearch,
  HiOutlineRefresh,
  HiOutlineCamera,
  HiChevronUp,
  HiChevronDown,
  HiArrowLeft,
  HiExclamation,
  HiEye,
  HiEyeOff,
  HiCheck
} from 'react-icons/hi';
import { API_BASE } from '../services/integrationData';

const FACE_API = API_BASE;

const DEMO_USERS = {
  'engineer@chipiq.io': { password: 'eng123', role: 'engineer', name: 'R. Sharma' },
  'lead@chipiq.io': { password: 'lead123', role: 'lead', name: 'J. Chen' },
  'manager@chipiq.io': { password: 'mgr123', role: 'manager', name: 'S. Patel' },
  'admin@chipiq.io': { password: 'admin123', role: 'admin', name: 'A. Kumar' },
};

const ROLES_INFO = {
  engineer: { icon: <HiOutlineTerminal size={18} />, label: 'VERIFICATION ENGINEER', tabs: 6, color: '#D32F2F', bg: 'rgba(211, 47, 47, 0.1)' },
  lead:     { icon: <HiOutlineChartBar size={18} />, label: 'PROJECT / TECH LEAD',   tabs: 8, color: '#000000', bg: 'rgba(255, 191, 0, 0.1)' },
  manager:  { icon: <HiOutlineChip size={18} />, label: 'MANAGER / STAKEHOLDER', tabs: 5, color: '#111111', bg: 'rgba(63, 185, 80, 0.1)' },
  admin:    { icon: <HiOutlineShieldCheck size={18} />, label: 'ADMIN / ML ENGINEER',   tabs: 10, color: '#F85149', bg: 'rgba(248, 81, 73, 0.1)' },
};

// Remove role-pill rendering block from JSX

// ─── Face Login Component ────────────────────────────────────────────────────
function FaceLogin({ onLogin, onBack }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [faceStatus, setFaceStatus] = useState('idle'); // idle | scanning | success | error
  const [faceMsg, setFaceMsg] = useState('Position your face in the frame');
  const [countdown, setCountdown] = useState(null);
  const [enrollMode, setEnrollMode] = useState(false);
  const [enrollEmail, setEnrollEmail] = useState('');
  const [enrollStatus, setEnrollStatus] = useState('');

  // Start camera
  useEffect(() => {
    let active = true;
    navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } })
      .then(stream => {
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => setFaceStatus('error') || setFaceMsg('Camera access denied. Please allow camera.'));
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.9);
  }, []);

  const handleVerify = useCallback(async () => {
    setFaceStatus('scanning');
    setFaceMsg('Scanning... Hold still');

    // Countdown 3→1
    for (let i = 3; i >= 1; i--) {
      setCountdown(i);
      await new Promise(r => setTimeout(r, 700));
    }
    setCountdown(null);

    const imageBase64 = captureFrame();
    if (!imageBase64) {
      setFaceStatus('error');
      setFaceMsg('Failed to capture image');
      return;
    }

    try {
      const res = await fetch(`${FACE_API}/api/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: imageBase64 }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setFaceStatus('success');
        setFaceMsg(`Welcome, ${data.name}! (${data.confidence}% match)`);
        streamRef.current?.getTracks().forEach(t => t.stop());
        setTimeout(() => onLogin({ name: data.name, role: data.role, email: data.email }), 1000);
      } else {
        setFaceStatus('error');
        setFaceMsg(data.detail || 'Face not recognized. Try again.');
      }
    } catch {
      setFaceStatus('error');
      setFaceMsg('Cannot reach auth server. Is the backend running?');
    }
  }, [captureFrame, onLogin]);

  const handleEnroll = useCallback(async () => {
    if (!enrollEmail) { setEnrollStatus('Select a user to enroll'); return; }
    setEnrollStatus('Capturing...');

    const imageBase64 = captureFrame();
    if (!imageBase64) { setEnrollStatus('Capture failed'); return; }

    try {
      const res = await fetch(`${FACE_API}/api/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: enrollEmail, image_base64: imageBase64 }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setEnrollStatus(`OK: ${data.message}`);
      } else {
        setEnrollStatus(`ERROR: ${data.detail}`);
      }
    } catch {
      setEnrollStatus('ERROR: Cannot reach backend server.');
    }
  }, [captureFrame, enrollEmail]);

  const retry = () => {
    setFaceStatus('idle');
    setFaceMsg('Position your face in the frame');
  };

  const borderColor = faceStatus === 'success' ? '#22c55e'
    : faceStatus === 'error' ? '#ef4444'
    : faceStatus === 'scanning' ? '#D32F2F'
    : '#000000';

  return (
    <div className="face-login-wrapper">
      <div className="face-camera-section">
        <div className="face-frame" style={{ borderColor }}>
          <video ref={videoRef} autoPlay playsInline muted className="face-video" />
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {/* Corner decorations */}
          <div className="face-corner tl" style={{ borderColor }} />
          <div className="face-corner tr" style={{ borderColor }} />
          <div className="face-corner bl" style={{ borderColor }} />
          <div className="face-corner br" style={{ borderColor }} />

          {/* Scanning line */}
          {faceStatus === 'scanning' && <div className="scan-line" />}

          {/* Countdown */}
          {countdown && <div className="countdown-overlay">{countdown}</div>}

          {/* Success overlay */}
          {faceStatus === 'success' && (
            <div className="face-success-overlay"><HiCheck size={34} /></div>
          )}
        </div>

        <p className={`face-status-msg ${faceStatus}`}>{faceMsg}</p>

        <div className="face-btn-row">
          {faceStatus === 'idle' && (
            <button className="face-btn scan" onClick={handleVerify}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <HiOutlineSearch size={16} />
                Scan Face to Login
              </span>
            </button>
          )}
          {faceStatus === 'scanning' && (
            <button className="face-btn scanning" disabled>
              <span className="spinner" /> Verifying...
            </button>
          )}
          {faceStatus === 'error' && (
            <button className="face-btn scan" onClick={retry}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <HiOutlineRefresh size={16} />
                Try Again
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Enroll section */}
      <div className="enroll-section">
        <button
          className="enroll-toggle"
          onClick={() => setEnrollMode(!enrollMode)}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            {enrollMode ? <HiChevronUp size={16} /> : <HiChevronDown size={16} />}
            {enrollMode ? 'Hide Enrollment' : 'First time? Enroll your face'}
          </span>
        </button>

        {enrollMode && (
          <div className="enroll-panel">
            <p className="enroll-note">Select your account, look at camera, then click Enroll.</p>
            <select
              className="input-field"
              value={enrollEmail}
              onChange={e => setEnrollEmail(e.target.value)}
              style={{ marginBottom: '10px' }}
            >
              <option value="">— Select your account —</option>
              {Object.entries(DEMO_USERS).map(([email, u]) => (
                <option key={email} value={email}>
                  {u.name} ({u.role})
                </option>
              ))}
            </select>
            <button className="face-btn enroll" onClick={handleEnroll}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <HiOutlineCamera size={16} />
                Capture & Enroll
              </span>
            </button>
            {enrollStatus && (
              <p className={`enroll-status ${enrollStatus.startsWith('OK:') ? 'ok' : 'err'}`}>
                {enrollStatus}
              </p>
            )}
          </div>
        )}
      </div>

      <button className="back-to-password" onClick={onBack}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <HiArrowLeft size={16} />
          Use password instead
        </span>
      </button>
    </div>
  );
}

// ─── Main Login Component ────────────────────────────────────────────────────
export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('');
  const [userFocus, setUserFocus] = useState(false);
  const [passFocus, setPassFocus] = useState(false);
  const [roleFocus, setRoleFocus] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [dots, setDots] = useState([]);
  const [loginMode, setLoginMode] = useState('password'); // 'password' | 'face'

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
  const inputGlow   = (focused) => focused ? '0 0 0 2px rgba(211,47,47,0.15)' : 'none';

  const handleLogin = (e) => {
    if (e) e.preventDefault();
    if (!username || !password || !role) {
      setError('Please fill in all fields including your role.');
      return;
    }
    setError('');
    setLoading(true);
    setTimeout(() => {
      const userKey = username.toLowerCase();
      const user = DEMO_USERS[userKey];
      if (!user) { setError('Username not found.'); setLoading(false); return; }
      if (user.password !== password) { setError('Incorrect password.'); setLoading(false); return; }
      if (user.role !== role) { setError(`Role mismatch — your role is: ${ROLES_INFO[user.role].label}`); setLoading(false); return; }
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
          <div key={dot.id} className="floating-dot" style={{
            left: `${dot.x}%`, top: `${dot.y}%`,
            width: `${dot.size}px`, height: `${dot.size}px`,
            animationDuration: `${dot.duration}s`, animationDelay: `${dot.delay}s`
          }} />
        ))}
      </div>

      <div className="login-card" style={{ maxWidth: loginMode === 'face' ? '480px' : '440px' }}>
        <div className="login-header">
          <h1 className="login-title">Welcome to ChipIQ</h1>

          {/* Mode Switcher */}
          <div className="login-mode-tabs">
            <button
              className={`mode-tab ${loginMode === 'password' ? 'active' : ''}`}
              onClick={() => setLoginMode('password')}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <HiOutlineKey size={16} />
                Password
              </span>
            </button>
            <button
              className={`mode-tab ${loginMode === 'face' ? 'active' : ''}`}
              onClick={() => setLoginMode('face')}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <HiOutlineUser size={16} />
                Face ID
              </span>
            </button>
          </div>
        </div>

        {loginMode === 'face' ? (
          <FaceLogin onLogin={onLogin} onBack={() => setLoginMode('password')} />
        ) : (
          <>
            {error && (
              <div className="error-panel">
                <span><HiExclamation size={16} /></span><span>{error}</span>
              </div>
            )}

            <form className="login-form" onSubmit={handleLogin}>
              <div className="input-group">
                <label>Username</label>
                <input
                  type="text" className="input-field" placeholder="engineer@chipiq.io"
                  value={username} onChange={e => setUsername(e.target.value)}
                  onFocus={() => setUserFocus(true)} onBlur={() => setUserFocus(false)}
                  style={{ border: inputBorder(userFocus), boxShadow: inputGlow(userFocus) }}
                />
              </div>

              <div className="input-group">
                <label>Password</label>
                <input
                  type={showPass ? 'text' : 'password'} className="input-field"
                  value={password} onChange={e => setPassword(e.target.value)}
                  onFocus={() => setPassFocus(true)} onBlur={() => setPassFocus(false)}
                  style={{ border: inputBorder(passFocus), boxShadow: inputGlow(passFocus) }}
                />
                <button type="button" className="password-toggle"
                  onClick={() => setShowPass(!showPass)} tabIndex="-1">
                  {showPass ? <HiEyeOff size={16} /> : <HiEye size={16} />}
                </button>
              </div>

              <div className="input-group">
                <label>Role</label>
                <select className="input-field role-select" value={role}
                  onChange={e => setRole(e.target.value)}
                  onFocus={() => setRoleFocus(true)} onBlur={() => setRoleFocus(false)}
                  style={{ border: inputBorder(roleFocus), boxShadow: inputGlow(roleFocus) }}>
                  <option value="" disabled>Select your role...</option>
                  <option value="engineer">Verification Engineer</option>
                  <option value="lead">Project / Tech Lead</option>
                  <option value="manager">Manager / Stakeholder</option>
                  <option value="admin">Admin / ML Engineer</option>
                </select>
              </div>

              <button type="submit" className="login-btn" disabled={loading}
                onMouseEnter={e => { if (!loading) e.currentTarget.style.backgroundColor = '#000000'; }}
                onMouseLeave={e => { if (!loading) e.currentTarget.style.backgroundColor = '#D32F2F'; }}>
                {loading ? (<><div className="spinner" /><span>Authenticating...</span></>) : 'Login to ChipIQ'}
              </button>
            </form>

            <div className="demo-panel">
              <div className="demo-title">Demo Credentials</div>
              <div className="demo-grid">
                {[
                  ['engineer@chipiq.io', 'Engineer', '#D32F2F', 'eng123'],
                  ['lead@chipiq.io', 'Lead', '#000000', 'lead123'],
                  ['manager@chipiq.io', 'Manager', '#111111', 'mgr123'],
                  ['admin@chipiq.io', 'Admin', '#F85149', 'admin123'],
                ].map(([email, label, color, pass]) => (
                  <div key={email} className="demo-row" onClick={() => fillDemo(email)}>
                    <span style={{ color }}>{label}</span>
                    <span style={{ color: '#000000' }}>{pass}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export const roles = {
  ENGINEER: 'engineer',
  LEAD: 'lead',
  MANAGER: 'manager',
  ADMIN: 'admin',
};

// Access permissions based on the provided matrix
export const rolePermissions = {
  [roles.ENGINEER]: ['/', '/bug-prediction', '/rtl-analysis', '/verif-intel', '/alerts', '/simulator'],
  [roles.LEAD]: ['/', '/bug-prediction', '/rtl-analysis', '/verif-intel', '/tapeout-readiness', '/alerts', '/reports', '/simulator'],
  [roles.MANAGER]: ['/', '/tapeout-readiness', '/alerts', '/reports'],
  [roles.ADMIN]: ['/', '/bug-prediction', '/rtl-analysis', '/verif-intel', '/tapeout-readiness', '/alerts', '/data-pipeline', '/reports', '/simulator', '/settings'],
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedUser = localStorage.getItem('chipiq_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  const login = (role) => {
    const newUser = { name: 'AK', role };
    setUser(newUser);
    localStorage.setItem('chipiq_user', JSON.stringify(newUser));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('chipiq_user');
  };

  const hasAccess = (path) => {
    if (!user) return false;
    // Special case for dashboard root
    if (path === '/') return true;
    const permissions = rolePermissions[user.role] || [];
    return permissions.includes(path);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, hasAccess, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

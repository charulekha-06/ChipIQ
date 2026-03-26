import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import BugPrediction from './pages/BugPrediction';
import ModuleRiskAnalysis from './pages/ModuleRiskAnalysis';
import TapeoutReadiness from './pages/TapeoutReadiness';
import RootCauseAnalysis from './analysis/RootCauseAnalysis';
import Alerts from './pages/Alerts';
import Settings from './pages/Settings';
import RTLAnalysis from './pages/RTLAnalysis';
import VerifIntel from './pages/VerifIntel';
import Reports from './pages/Reports';
import Simulator from './pages/Simulator';
import DataPipeline from './pages/DataPipeline';
import Login from './pages/Login';
import { AuthProvider, useAuth } from './context/AuthContext';

const ProtectedRoute = ({ children, requiredRole }) => {
  const { user, loading, hasAccess } = useAuth();
  
  if (loading) return null;
  if (!user) return <Navigate to="/login" />;
  
  const currentPath = window.location.pathname;
  if (!hasAccess(currentPath)) return <Navigate to="/" />;
  
  return children;
};

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={
            <ProtectedRoute>
              <Layout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/bug-prediction" element={<BugPrediction />} />
                  <Route path="/module-risk" element={<ModuleRiskAnalysis />} />
                  <Route path="/rtl-analysis" element={<RTLAnalysis />} />
                  <Route path="/verif-intel" element={<VerifIntel />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/simulator" element={<Simulator />} />
                  <Route path="/data-pipeline" element={<DataPipeline />} />
                  <Route path="/tapeout-readiness" element={<TapeoutReadiness />} />
                  <Route path="/root-cause" element={<RootCauseAnalysis />} />
                  <Route path="/alerts" element={<Alerts />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="*" element={<Navigate to="/" />} />
                </Routes>
              </Layout>
            </ProtectedRoute>
          } />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

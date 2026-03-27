import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import DataUpload from './pages/DataUpload';
import BugPrediction from './pages/BugPrediction';
import ModuleRiskAnalysis from './pages/ModuleRiskAnalysis';
import TapeoutReadiness from './pages/TapeoutReadiness';
import RootCauseAnalysis from './pages/RootCauseAnalysis';
import Alerts from './pages/Alerts';
import Settings from './pages/Settings';
import RTLAnalysis from './pages/RTLAnalysis';
import VerifIntel from './pages/VerifIntel';
import Reports from './pages/Reports';
import Simulator from './pages/Simulator';
import DataPipeline from './pages/DataPipeline';
import Login from './pages/Login';
import AITestGenerator from './pages/AITestGenerator';

export default function App() {
  const [user, setUser] = useState(null);

  if (!user) {
    return <Login onLogin={setUser} />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout user={user} onLogout={() => setUser(null)} />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/data-upload" element={<DataUpload />} />
          <Route path="/bug-prediction" element={<BugPrediction />} />
          <Route path="/module-risk" element={<ModuleRiskAnalysis />} />
          <Route path="/rtl-analysis" element={<RTLAnalysis />} />
          <Route path="/verif-intel" element={<VerifIntel />} />
          <Route path="/data-pipeline" element={<DataPipeline />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/simulator" element={<Simulator />} />
          <Route path="/ai-generator" element={<AITestGenerator />} />
          <Route path="/tapeout-readiness" element={<TapeoutReadiness />} />
          <Route path="/root-cause" element={<RootCauseAnalysis />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

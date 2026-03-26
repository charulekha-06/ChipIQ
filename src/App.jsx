import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import DataUpload from './pages/DataUpload';
import BugPrediction from './pages/BugPrediction';
import ModuleRiskAnalysis from './pages/ModuleRiskAnalysis';
import TapeoutReadiness from './pages/TapeoutReadiness';
import RootCauseAnalysis from './pages/RootCauseAnalysis';
import Reports from './pages/Reports';
import Settings from './pages/Settings';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/data-upload" element={<DataUpload />} />
          <Route path="/bug-prediction" element={<BugPrediction />} />
          <Route path="/module-risk" element={<ModuleRiskAnalysis />} />
          <Route path="/tapeout-readiness" element={<TapeoutReadiness />} />
          <Route path="/root-cause" element={<RootCauseAnalysis />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

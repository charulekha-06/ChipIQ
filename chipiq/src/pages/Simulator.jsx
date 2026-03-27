import { useEffect, useMemo, useState } from 'react';
import { HiOutlinePlay, HiOutlineLightningBolt, HiOutlineFire, HiOutlineAdjustments, HiOutlineChartBar } from 'react-icons/hi';
import { loadIntegrationData } from '../services/integrationData';
import './Simulator.css';

export default function Simulator() {
  const [integration, setIntegration] = useState(null);
  const [engineers, setEngineers] = useState(0);
  const [cycles, setCycles] = useState(0);
  const [module, setModule] = useState('');
  const [isSimulated, setIsSimulated] = useState(false);

  useEffect(() => {
    let mounted = true;
    loadIntegrationData().then((data) => {
      if (mounted) {
        setIntegration(data);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const moduleOptions = useMemo(() => {
    const rows = integration?.moduleSummary;
    if (!Array.isArray(rows) || rows.length === 0) {
      return [];
    }
    return rows.map((r) => r.name);
  }, [integration]);

  useEffect(() => {
    if (!module && moduleOptions.length > 0) {
      setModule(moduleOptions[0]);
    }
  }, [module, moduleOptions]);

  const baselineTapeout = useMemo(() => {
    const pass = Number(integration?.datasetSummary?.regression_pass || 0);
    const total = Number(integration?.datasetSummary?.regression_total || 0);
    if (total === 0) {
      return null;
    }
    return Math.round((pass / total) * 100);
  }, [integration]);

  const projectedTapeout = baselineTapeout === null ? null : Math.min(100, baselineTapeout + engineers + Math.round(cycles / 2));
  const baselineCov = integration?.moduleSummary?.[0]?.coverage !== undefined
    ? Number(integration.moduleSummary[0].coverage)
    : null;
  const projectedCov = baselineCov === null ? null : Math.min(100, baselineCov + Math.round(cycles / 3));
  const criticalFixed = Math.min(10, Math.round((engineers + cycles) / 3));
  const daysToTapeout = projectedTapeout === null ? null : Math.max(5, 30 - engineers - Math.round(cycles / 2));

  const handleRunSimulation = () => {
    setIsSimulated(true);
  };

  const showTapeoutBaseline = baselineTapeout !== null && projectedTapeout !== null && baselineTapeout !== projectedTapeout;
  const showCoverageBaseline = baselineCov !== null && projectedCov !== null && baselineCov !== projectedCov;
  const tapeoutChanged = baselineTapeout !== null && projectedTapeout !== null && baselineTapeout !== projectedTapeout;

  return (
    <div className="simulator-page">
      {/* Header Banner */}
      {!isSimulated ? (
        <div className="simulation-banner">
          <HiOutlineFire className="banner-icon" color="#000000" />
          <div className="banner-content">
            <span className="banner-title">Scenario Simulator — What-If Analysis</span>
            <span className="banner-subtitle">Adjust inputs to see how resource changes affect tapeout readiness</span>
          </div>
        </div>
      ) : (
        <div className="simulation-banner complete">
          <HiOutlineLightningBolt className="banner-icon" color="var(--cyan)" />
          <div className="banner-content">
            <span className="banner-title">Simulation complete — based on historical velocity data</span>
          </div>
        </div>
      )}

      <div className="simulator-grid">
        {/* Input Pane */}
        <div className="sim-pane">
          <h3>Simulation Inputs</h3>

          <div className="input-group">
            <div className="input-header">
              <div className="input-label-box">
                <h4>Additional Engineers</h4>
                <p>Engineers added to verification team</p>
              </div>
              <div className="input-val-box">
                <span className="input-val">{engineers}</span>
                <span className="input-unit">engineers</span>
              </div>
            </div>
            <input 
              type="range" 
              min="0" 
              max="6" 
              value={engineers} 
              className="sim-slider"
              onChange={(e) => setEngineers(parseInt(e.target.value))}
            />
            <div className="slider-labels">
              <span>0 engineers</span>
              <span>6 engineers</span>
            </div>
          </div>

          <div className="input-group">
            <div className="input-header">
              <div className="input-label-box">
                <h4>Extra Test Cycles</h4>
                <p>Additional regression cycles per week</p>
              </div>
              <div className="input-val-box">
                <span className="input-val">{cycles}</span>
                <span className="input-unit">cycles</span>
              </div>
            </div>
            <input 
              type="range" 
              min="0" 
              max="10" 
              value={cycles} 
              className="sim-slider"
              onChange={(e) => setCycles(parseInt(e.target.value))}
            />
            <div className="slider-labels">
              <span>0 cycles</span>
              <span>10 cycles</span>
            </div>
          </div>

          <div className="input-group">
            <div className="input-label-box">
              <h4>Priority Module Fix</h4>
              <p>Focus engineering effort on this module</p>
            </div>
            <div className="module-select-grid">
              {moduleOptions.map(m => (
                <button 
                  key={m} 
                  className={`module-select-btn ${module === m ? 'active' : ''}`}
                  onClick={() => setModule(m)}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <button className="btn-run-sim" onClick={handleRunSimulation}>
            <HiOutlinePlay /> Run Simulation
          </button>
        </div>

        {/* Results Pane */}
        <div className="sim-pane">
          {!isSimulated ? (
            <div className="results-empty">
              <HiOutlineAdjustments className="target-icon" />
              <p>Adjust the inputs on the left<br />and click Run Simulation</p>
            </div>
          ) : (
            <div className="results-content">
              <div className="res-grid">
                {/* ... existing result cards ... */}
                <div className="res-card">
                  <div className="res-label">TAPEOUT SCORE</div>
                  <div className="res-main">
                    {showTapeoutBaseline ? <span className="res-baseline">{baselineTapeout}</span> : null}
                    <span className="res-val">{projectedTapeout ?? '--'}</span>
                  </div>
                </div>
                <div className="res-card">
                  <div className="res-label">DAYS TO TAPEOUT</div>
                  <div className="res-main">
                    <span className="res-val">{daysToTapeout === null ? '--' : `${daysToTapeout}d`}</span>
                  </div>
                </div>
                <div className="res-card">
                  <div className="res-label">COVERAGE</div>
                  <div className="res-main">
                    {showCoverageBaseline ? <span className="res-baseline">{`${baselineCov}%`}</span> : null}
                    <span className="res-val cyan">{projectedCov === null ? '--' : `${projectedCov}%`}</span>
                  </div>
                </div>
                <div className="res-card">
                  <div className="res-label">CRITICAL BUGS FIXED</div>
                  <div className="res-main">
                    <span className="res-val">{criticalFixed}</span>
                  </div>
                </div>
              </div>

              <div className="ai-analysis-box">
                <div className="ai-header">
                  <HiOutlineChartBar />
                  <span>AI ANALYSIS</span>
                </div>
                <p className="ai-text">
                  Adding <b>{engineers} engineers</b> and <b>{cycles} test cycles</b> with focus on <b>{module || '--'}</b>{' '}
                  {baselineTapeout === null || projectedTapeout === null ? (
                    <>provides an estimated tapeout score of <span className="impact-score">--</span> based on integrated project data.</>
                  ) : tapeoutChanged ? (
                    <>updates tapeout estimate from <span className="impact-from">{baselineTapeout}</span> to <span className="impact-score">{projectedTapeout}</span> based on integrated project data.</>
                  ) : (
                    <>keeps the tapeout estimate unchanged at <span className="impact-score">{projectedTapeout}</span> based on integrated project data.</>
                  )}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

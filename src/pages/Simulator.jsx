import { useState } from 'react';
import { HiOutlinePlay, HiOutlineLightningBolt, HiOutlineFire, HiOutlineAdjustments, HiOutlineChartBar } from 'react-icons/hi';
import './Simulator.css';

export default function Simulator() {
  const [engineers, setEngineers] = useState(0);
  const [cycles, setCycles] = useState(0);
  const [module, setModule] = useState('USB_PHY');
  const [isSimulated, setIsSimulated] = useState(false);

  const handleRunSimulation = () => {
    setIsSimulated(true);
  };

  return (
    <div className="simulator-page">
      {/* Header Banner */}
      {!isSimulated ? (
        <div className="simulation-banner">
          <HiOutlineFire className="banner-icon" color="#f59e0b" />
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
              {['USB_PHY', 'CPU_CORE', 'DDR_CTRL', 'PCIe_MAC'].map(m => (
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
                    <span className="res-baseline">67</span>
                    <span className="res-val">73</span>
                  </div>
                </div>
                <div className="res-card">
                  <div className="res-label">DAYS TO TAPEOUT</div>
                  <div className="res-main">
                    <span className="res-baseline">19d</span>
                    <span className="res-val">19d</span>
                  </div>
                </div>
                <div className="res-card">
                  <div className="res-label">COVERAGE</div>
                  <div className="res-main">
                    <span className="res-baseline">87%</span>
                    <span className="res-val cyan">90%</span>
                  </div>
                </div>
                <div className="res-card">
                  <div className="res-label">CRITICAL BUGS FIXED</div>
                  <div className="res-main">
                    <span className="res-baseline">0</span>
                    <span className="res-val">0</span>
                  </div>
                </div>
              </div>

              <div className="ai-analysis-box">
                <div className="ai-header">
                  <HiOutlineChartBar />
                  <span>AI ANALYSIS</span>
                </div>
                <p className="ai-text">
                  Adding <b>{engineers} engineers</b> and <b>{cycles} test cycles</b> with focus on <b>{module}</b> improves tapeout from <span className="res-baseline">67</span> → <span className="impact-score">73</span> <span className="status-dot-yellow"></span> Approaching threshold.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

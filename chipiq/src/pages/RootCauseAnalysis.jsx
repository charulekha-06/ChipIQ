import React, { useState, useEffect, useRef } from 'react';
import { HiOutlineSearchCircle, HiOutlineDocumentDownload, HiExclamationCircle, HiOutlineRefresh } from 'react-icons/hi';
import './RootCauseAnalysis.css';

const MOCK_LOGS = [
  { line: 4518, type: 'normal', text: 'UVM_INFO @ 4490ns: uvm_test_top.env.agent.monitor [MON] Transfer collected: ADDR=0x1A04, DATA=0x44' },
  { line: 4519, type: 'normal', text: 'UVM_INFO @ 4500ns: uvm_test_top.env.scoreboard [SCB] Match found for ADDR=0x1A04' },
  { line: 4520, type: 'normal', text: 'UVM_INFO @ 4510ns: uvm_test_top.env.agent.driver [DRV] Initiating READ transaction on AXI_BUS' },
  { line: 4521, type: 'warning', text: 'UVM_WARNING @ 4515ns: uvm_test_top.env.agent.monitor [MON] ARREADY went low unexpectedly' },
  { line: 4522, type: 'error', text: 'UVM_FATAL @ 4520ns: uvm_test_top.env.agent.driver [AXI_TIMEOUT] Valid/Ready handshake timed out after 50 clock cycles.' },
  { line: 4523, type: 'normal', text: 'UVM_INFO @ 4520ns: reporter [RNTST] Test aborted due to fatal error.' },
  { line: 4524, type: 'normal', text: '--- UVM Report Summary ---' },
  { line: 4525, type: 'normal', text: '** Report counts by severity' },
  { line: 4526, type: 'normal', text: 'UVM_INFO :   412' },
  { line: 4527, type: 'warning', text: 'UVM_WARNING :  1' },
  { line: 4528, type: 'error', text: 'UVM_FATAL :    1' }
];

export default function RootCauseAnalysis() {
  const [state, setState] = useState('initial'); // 'initial', 'scanning', 'results'
  const [dragActive, setDragActive] = useState(false);
  const [scanProgress, setScanProgress] = useState([]);
  const errorRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      startAnalysis();
    }
  };

  const startAnalysis = () => {
    setState('scanning');
    
    // Simulate log scanning text updates
    const logChunks = [
      "Parsing log file encoding...",
      "Extracting UVM severity events...",
      "Found 412 INFO, 1 WARNING, 1 FATAL...",
      "Isolating cycle timeline 4500ns - 4520ns...",
      "Querying LLM with surrounding context...",
      "Synthesizing root cause diagnosis..."
    ];
    
    let index = 0;
    const updateLogs = setInterval(() => {
      setScanProgress(prev => [...prev, logChunks[index]]);
      index++;
      if(index === logChunks.length) {
        clearInterval(updateLogs);
      }
    }, 400);

    // End scan after 3.5 seconds
    setTimeout(() => {
      setState('results');
    }, 3500);
  };

  useEffect(() => {
    if (state === 'results' && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [state]);

  return (
    <div className="rca-container">
      <div className="rca-header">
        <h1 className="rca-title"><HiOutlineSearchCircle color="#D32F2F" size={28} /> AI Log Anomaly Detector</h1>
        <p className="rca-subtitle">Upload simulation log files (.log, .txt, .fsdb) for automated error isolation and AI diagnostics.</p>
      </div>

      {state === 'initial' && (
        <div 
          className={`drop-zone ${dragActive ? 'active' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={startAnalysis}
        >
          <HiOutlineDocumentDownload size={64} color={dragActive ? '#D32F2F' : '#000000'} />
          <div className="drop-text">Drag & Drop Simulation Log</div>
          <div className="drop-subtext">or click to manually upload the file (e.g. `sim_vsim.log`)</div>
        </div>
      )}

      {state === 'scanning' && (
        <div className="scanning-container">
          <div className="scan-line"></div>
          <HiOutlineSearchCircle color="#D32F2F" size={64} className="rotating-icon" />
          <div className="scan-text">ANALYZING LOG FILE...</div>
          <div className="scan-logs">
            {scanProgress.map((txt, i) => <div key={i}>{txt}</div>)}
          </div>
        </div>
      )}

      {state === 'results' && (
        <div className="results-split">
          
          <div className="log-viewer-panel">
            <div className="panel-header">
              <span>sim_vsim_aximaster.log</span>
              <button className="reset-btn" onClick={() => { setState('initial'); setScanProgress([]); }}>
                <HiOutlineRefresh /> Analyze Another Log
              </button>
            </div>
            <div className="log-content">
              {MOCK_LOGS.map((log) => (
                <div 
                  key={log.line} 
                  className={`log-line ${log.type}`}
                  ref={log.type === 'error' && log.line === 4522 ? errorRef : null}
                >
                  <span className="line-number">{log.line}</span>
                  <span className="log-text">{log.text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="ai-diagnosis-panel">
            <div className="panel-header" style={{ borderBottomColor: '#000000' }}>
              <span style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                <HiOutlineSearchCircle color="#D32F2F" /> AI Root Cause Diagnosis
              </span>
            </div>
            <div className="diagnosis-content">
              <div className="diagnosis-badge">
                <HiExclamationCircle /> AXI Valid/Ready Handshake Timed Out
              </div>
              <div className="diagnosis-text">
                <p>The simulation fatally aborted at <strong>4520ns</strong> because the AXI driver initiated a READ transaction, but the slave did not assert <code>ARREADY</code> within the expected 50 clock cycles.</p>
                <p>Prior to the fatal error, at <strong>4515ns</strong>, a monitor warning indicates that <code>ARREADY</code> was observed dropping low unexpectedly in the middle of a burst transmission prep.</p>
                <p><strong>Suggested Action:</strong> Verify that the Memory Controller or target slave is not stalled in an active refresh cycle, or check the slave's <code>arvalid</code> dependency loop to ensure it doesn't block.</p>
              </div>
              <div className="diagnosis-code">
                // Potential fix in slave responder
                always @(posedge clk) begin
                  if (reset)
                    arready &lt;= 1'b0;
                  else if (arvalid &amp;&amp; !stall_condition)
                    arready &lt;= 1'b1; // Ensure stall is cleared
                end
              </div>
              <button className="fix-btn">Create Jira Ticket</button>
            </div>
          </div>

        </div>
      )}

    </div>
  );
}

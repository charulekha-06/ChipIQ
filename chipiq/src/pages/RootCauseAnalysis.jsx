import React, { useState, useEffect, useRef } from 'react';
import { HiOutlineSearchCircle, HiOutlineDocumentDownload, HiExclamationCircle, HiOutlineRefresh } from 'react-icons/hi';
import { API_BASE } from '../services/integrationData';
import './RootCauseAnalysis.css';

const MAX_LINES_RENDER = 800;

function classifyLine(text) {
  const s = String(text || '').toUpperCase();
  if (s.includes('UVM_FATAL') || s.includes('FATAL') || s.includes('ERROR')) return 'error';
  if (s.includes('UVM_WARNING') || s.includes('WARN')) return 'warning';
  return 'normal';
}

function summarizeAndDiagnose(parsedLines) {
  const errors = parsedLines.filter((l) => l.type === 'error');
  const warnings = parsedLines.filter((l) => l.type === 'warning');
  const fatals = parsedLines.filter((l) => /UVM_FATAL|FATAL/i.test(l.text));

  const focus = fatals[0] || errors[0] || warnings[0] || parsedLines[0] || null;
  const focusText = focus?.text || 'No critical issue found';

  const textBlob = parsedLines.map((l) => l.text).join('\n');
  const hasAxiTimeout = /AXI_TIMEOUT|VALID\/?READY|ARREADY|AWREADY|WREADY|RVALID|BVALID/i.test(textBlob);
  const hasResetIssue = /RESET|RST_N|ASSERT.*RESET|DEASSERT.*RESET/i.test(textBlob);
  const hasXprop = /\bX\b|UNKNOWN|UNINITIALIZED|X-PROP/i.test(textBlob);
  const hasScoreboardMismatch = /MISMATCH|SCOREBOARD.*FAIL|COMPARE.*FAIL/i.test(textBlob);

  let title = 'General Verification Failure Detected';
  let probableCause = 'One or more transactions failed to complete within expected protocol or timing constraints.';
  let suggestedAction = 'Inspect first error context and validate reset, handshake, and testbench-driver timing assumptions.';
  let codeHint = `// Generic debug guard\nalways @(posedge clk) begin\n  if (reset) begin\n    error_seen <= 1'b0;\n  end\nend`;

  if (hasAxiTimeout) {
    title = 'AXI Handshake / Timeout Anomaly';
    probableCause = 'The log indicates a stall in VALID/READY handshake progression, causing transaction timeout.';
    suggestedAction = 'Check slave ready generation and remove combinational dependency loops between valid/ready paths.';
    codeHint = `// Example: avoid handshake deadlock\nalways @(posedge clk) begin\n  if (reset) begin\n    arready <= 1'b0;\n  end else if (arvalid && !stall_condition) begin\n    arready <= 1'b1;\n  end\nend`;
  } else if (hasResetIssue) {
    title = 'Reset Sequencing Issue';
    probableCause = 'Signals appear active before reset is fully released or stable, causing invalid state transitions.';
    suggestedAction = 'Gate protocol activity until reset deassertion has been synchronized for at least 2 clock cycles.';
    codeHint = `// Reset stabilization guard\nreg [1:0] rst_sync;\nalways @(posedge clk) begin\n  rst_sync <= {rst_sync[0], rst_n};\n  if (!rst_sync[1]) begin\n    start_txn <= 1'b0;\n  end\nend`;
  } else if (hasXprop) {
    title = 'X-Propagation / Uninitialized Signal';
    probableCause = 'Unknown values propagated into control logic and triggered non-deterministic behavior.';
    suggestedAction = 'Initialize all control flops and add assertions to block X-state usage in handshake/control paths.';
    codeHint = `// Assertion example\nassert property (@(posedge clk) disable iff (!rst_n) !$isunknown(state));`;
  } else if (hasScoreboardMismatch) {
    title = 'Scoreboard Data Mismatch';
    probableCause = 'Observed transaction stream diverges from expected model at compare points.';
    suggestedAction = 'Capture seed, transaction IDs, and expected-vs-actual payload at first mismatch cycle for replay.';
    codeHint = `// Debug print around mismatch\nif (mismatch) begin\n  $display("ID=%0d EXP=%h ACT=%h", txn_id, exp_data, act_data);\nend`;
  }

  return {
    title,
    probableCause,
    suggestedAction,
    codeHint,
    focusText,
    firstIssueLine: focus?.line || null,
    counts: {
      info: parsedLines.length - warnings.length - errors.length,
      warning: warnings.length,
      error: errors.length,
      fatal: fatals.length,
    },
  };
}

export default function RootCauseAnalysis() {
  const [state, setState] = useState('initial'); // 'initial', 'scanning', 'results'
  const [dragActive, setDragActive] = useState(false);
  const [scanProgress, setScanProgress] = useState([]);
  const [isCheckingLake, setIsCheckingLake] = useState(false);
  const [lakeMessage, setLakeMessage] = useState('');
  const [fileName, setFileName] = useState('');
  const [parsedLogs, setParsedLogs] = useState([]);
  const [diagnosis, setDiagnosis] = useState(null);
  const [isCreatingTicket, setIsCreatingTicket] = useState(false);
  const [ticketStatus, setTicketStatus] = useState(null);
  const [ticketError, setTicketError] = useState('');
  const fileInputRef = useRef(null);
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
      analyzeFile(e.dataTransfer.files[0]);
    }
  };

  const handleManualSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileInput = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      analyzeFile(file);
    }
  };

  const analyzeLines = (lines, sourceName = 'centralized.log') => {
    setState('scanning');
    setScanProgress([]);
    setTicketError('');
    setTicketStatus(null);
    setFileName(sourceName);

    const sliced = (Array.isArray(lines) ? lines : []).slice(0, MAX_LINES_RENDER);
    const parsed = sliced.map((entry, idx) => ({
      line: Number(entry?.line || idx + 1),
      type: entry?.severity === 'error' ? 'error' : entry?.severity === 'warning' ? 'warning' : classifyLine(entry?.text || ''),
      text: String(entry?.text || ''),
    })).filter((r) => r.text);

    setParsedLogs(parsed);
    setDiagnosis(summarizeAndDiagnose(parsed));

    const logChunks = [
      'Loading centralized log stream...',
      'Extracting UVM severity events...',
      'Classifying warning and fatal segments...',
      'Pinpointing first failure context...',
      'Correlating protocol keywords and timing clues...',
      'Generating root-cause diagnosis and fix hints...'
    ];

    let index = 0;
    const updateLogs = setInterval(() => {
      setScanProgress(prev => [...prev, logChunks[index]]);
      index++;
      if (index === logChunks.length) {
        clearInterval(updateLogs);
      }
    }, 300);

    setTimeout(() => {
      setState('results');
    }, 1900);
  };

  const analyzeFile = async (file) => {
    const content = await file.text();
    const rawLines = content.split(/\r?\n/).filter(Boolean);
    const parsedRaw = rawLines.map((line, idx) => ({
      line: idx + 1,
      text: line,
    }));
    analyzeLines(parsedRaw, file.name || 'uploaded.log');
  };

  useEffect(() => {
    if (state === 'results' && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [state]);

  useEffect(() => {
    const loadFromLake = async () => {
      setIsCheckingLake(true);
      setLakeMessage('Checking centralized data lake for latest simulation log...');
      try {
        const res = await fetch(`${API_BASE}/api/rca/latest-log`);
        if (!res.ok) {
          throw new Error('No centralized log available yet.');
        }
        const data = await res.json();
        if (!Array.isArray(data?.lines) || data.lines.length === 0) {
          throw new Error('Centralized log source is empty.');
        }
        setLakeMessage(`Loaded ${data.lines.length} lines from centralized source.`);
        analyzeLines(data.lines, data.fileName || `${data.table || 'centralized'}.log`);
      } catch (e) {
        setLakeMessage(String(e?.message || e));
      } finally {
        setIsCheckingLake(false);
      }
    };

    loadFromLake();
  }, []);

  const handleCreateJiraTicket = async () => {
    if (!diagnosis) return;

    setIsCreatingTicket(true);
    setTicketError('');
    setTicketStatus(null);

    const summary = `[ChipIQ RCA] ${diagnosis.title} in ${fileName || 'simulation log'}`;
    const description = [
      `Source file: ${fileName || 'uploaded.log'}`,
      ``,
      `Counts: info=${diagnosis?.counts?.info ?? 0}, warning=${diagnosis?.counts?.warning ?? 0}, error=${diagnosis?.counts?.error ?? 0}, fatal=${diagnosis?.counts?.fatal ?? 0}`,
      ``,
      `First issue context:`,
      `${diagnosis.focusText || '--'}`,
      ``,
      `Probable Cause:`,
      `${diagnosis.probableCause || '--'}`,
      ``,
      `Suggested Action:`,
      `${diagnosis.suggestedAction || '--'}`,
      ``,
      `Code Hint:`,
      `${diagnosis.codeHint || '--'}`,
    ].join('\n');

    try {
      const response = await fetch(`${API_BASE}/api/jira/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary,
          description,
          issue_type: 'Bug',
          labels: ['chipiq', 'rca', 'verification'],
        }),
      });

      if (!response.ok) {
        let detail = `HTTP ${response.status}`;
        try {
          const err = await response.json();
          detail = err?.detail || detail;
        } catch {
          // keep status fallback
        }
        throw new Error(detail);
      }

      const data = await response.json();
      setTicketStatus(data);
    } catch (e) {
      setTicketError(String(e?.message || e));
    } finally {
      setIsCreatingTicket(false);
    }
  };

  return (
    <div className="rca-container">
      <div className="rca-header">
        <h1 className="rca-title"><HiOutlineSearchCircle color="#D32F2F" size={28} /> AI Log Anomaly Detector</h1>
        <p className="rca-subtitle">Uses centralized log data automatically; manual upload is only fallback when lake data is unavailable.</p>
      </div>

      {state === 'initial' && (
        <div className="lake-status-box">
          {isCheckingLake ? 'Checking centralized logs...' : lakeMessage}
        </div>
      )}

      {state === 'initial' && (
        <div 
          className={`drop-zone ${dragActive ? 'active' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={handleManualSelect}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".log,.txt,.fsdb,.rpt"
            onChange={handleFileInput}
            style={{ display: 'none' }}
          />
          <HiOutlineDocumentDownload size={64} color={dragActive ? '#D32F2F' : '#000000'} />
          <div className="drop-text">Drag & Drop Simulation Log</div>
          <div className="drop-subtext">Fallback: click to manually upload only if centralized logs are unavailable (e.g. sim_vsim.log)</div>
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
              <span>{fileName || 'uploaded.log'}</span>
              <button className="reset-btn" onClick={() => { setState('initial'); setScanProgress([]); setParsedLogs([]); setDiagnosis(null); setFileName(''); }}>
                <HiOutlineRefresh /> Analyze Another Log
              </button>
            </div>
            <div className="log-content">
              {parsedLogs.map((log) => (
                <div 
                  key={log.line} 
                  className={`log-line ${log.type}`}
                  ref={diagnosis?.firstIssueLine === log.line ? errorRef : null}
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
                <HiExclamationCircle /> {diagnosis?.title || 'No issue detected'}
              </div>
              <div className="diagnosis-text">
                <p>
                  Parsed <strong>{parsedLogs.length}</strong> lines with <strong>{diagnosis?.counts?.warning ?? 0}</strong> warnings,
                  <strong> {diagnosis?.counts?.error ?? 0}</strong> errors, and <strong>{diagnosis?.counts?.fatal ?? 0}</strong> fatals.
                </p>
                <p><strong>First issue context:</strong> <code>{diagnosis?.focusText || '--'}</code></p>
                <p><strong>Probable Cause:</strong> {diagnosis?.probableCause || '--'}</p>
                <p><strong>Suggested Action:</strong> {diagnosis?.suggestedAction || '--'}</p>
              </div>
              <div className="diagnosis-code">
                {diagnosis?.codeHint || '// No code hint available'}
              </div>
              <button className="fix-btn" onClick={handleCreateJiraTicket} disabled={isCreatingTicket || !diagnosis}>
                {isCreatingTicket ? 'Creating Jira Ticket...' : 'Create Jira Ticket'}
              </button>
              {ticketStatus?.issueKey ? (
                <div className="jira-status success">
                  Created ticket: <strong>{ticketStatus.issueKey}</strong>
                  {ticketStatus.ticketUrl ? (
                    <a href={ticketStatus.ticketUrl} target="_blank" rel="noreferrer"> Open in Jira</a>
                  ) : null}
                </div>
              ) : null}
              {ticketError ? <div className="jira-status error">{ticketError}</div> : null}
            </div>
          </div>

        </div>
      )}

    </div>
  );
}

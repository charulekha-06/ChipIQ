import React, { useState, useEffect } from 'react';
import { HiOutlineCloudUpload, HiOutlineDocumentText, HiOutlineArchive, HiCheck, HiOutlineClock, HiX, HiChevronRight, HiChevronDown } from 'react-icons/hi';
import './DataUpload.css';
import { API_BASE } from '../services/integrationData';

export default function DataUpload() {
  const [activeTab, setActiveTab] = useState('direct');  // 'direct' or 'connectors'
  const [dragActive, setDragActive] = useState(false);
  const [activeUploads, setActiveUploads] = useState([]);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [availableConnectors, setAvailableConnectors] = useState({});
  const [expandedConnector, setExpandedConnector] = useState(null);
  const [connectorInputs, setConnectorInputs] = useState({});
  const [connectorState, setConnectorState] = useState({});

  const connectorIcons = {
    git: HiOutlineArchive,
    jira: HiOutlineDocumentText,
    coverage: HiOutlineCloudUpload,
    logs: HiOutlineClock,
    regression: HiCheck
  };

  // Connector configuration
  const connectorConfig = {
    git: {
      description: 'Extract RTL commits, code changes',
      fields: [{ name: 'repo_path', label: 'Repository Path', example: '/path/to/chipiq-rtl' }]
    },
    jira: {
      description: 'Fetch bug reports and issues',
      fields: [
        { name: 'base_url', label: 'Jira URL', example: 'https://jira.company.com' },
        { name: 'username', label: 'Username', example: 'user@company.com' },
        { name: 'api_token', label: 'API Token', type: 'password' },
        { name: 'project_key', label: 'Project Key', example: 'SOC' }
      ]
    },
    coverage: {
      description: 'Parse COBERTURA coverage reports (XML)',
      fields: [{ name: 'file_path', label: 'XML File Path', example: '/path/to/coverage.xml' }]
    },
    logs: {
      description: 'Extract events from simulation logs',
      fields: [{ name: 'file_path', label: 'Log File Path', example: '/path/to/simulation.log' }]
    },
    regression: {
      description: 'Parse test results (JUnit XML or JSON)',
      fields: [{ name: 'file_path', label: 'Results File', example: '/path/to/results.xml' }]
    }
  };

  useEffect(() => {
    fetchUploadStatus();
    fetchAvailableConnectors();
  }, []);

  const fetchUploadStatus = async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/upload-status`);
      if (resp.ok) {
        const data = await resp.json();
        setUploadStatus(data);
      }
    } catch (err) {
      console.error('Failed to fetch upload status:', err);
    }
  };

  const fetchAvailableConnectors = async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/connectors`);
      if (resp.ok) {
        const data = await resp.json();
        setAvailableConnectors(data.available);
      }
    } catch (err) {
      console.error('Failed to fetch connectors:', err);
    }
  };

  const handleFileUpload = async (files) => {
    if (!files || files.length === 0) return;

    for (const file of files) {
      if (!file.name.endsWith('.csv') && !file.name.endsWith('.json')) {
        alert('Please upload CSV or JSON files only');
        continue;
      }

      const uploadId = Date.now() + Math.random();
      const newUpload = {
        id: uploadId,
        name: file.name,
        status: 'uploading',
        progress: 0,
        error: null,
        result: null
      };

      setActiveUploads(prev => [...prev, newUpload]);

      try {
        const formData = new FormData();
        formData.append('file', file);

        const resp = await fetch(`${API_BASE}/api/upload`, {
          method: 'POST',
          body: formData
        });

        const result = await resp.json();

        setActiveUploads(prev => prev.map(u => 
          u.id === uploadId 
            ? {
                ...u,
                status: result.success ? 'completed' : 'error',
                progress: 100,
                error: result.message,
                result: result.success ? result : null
              }
            : u
        ));

        if (result.success) {
          fetchUploadStatus();
        }
      } catch (error) {
        setActiveUploads(prev => prev.map(u =>
          u.id === uploadId
            ? { ...u, status: 'error', progress: 100, error: error.message }
            : u
        ));
      }
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type !== 'dragleave' && e.type !== 'drop');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    handleFileUpload(e.dataTransfer.files);
  };

  const handleReset = async () => {
    if (window.confirm('Clear all uploaded data and revert to defaults?')) {
      try {
        await fetch(`${API_BASE}/api/upload-reset`, { method: 'POST' });
        setUploadStatus(null);
        setActiveUploads([]);
        fetchUploadStatus();
      } catch (err) {
        alert('Reset failed: ' + err.message);
      }
    }
  };

  const updateConnectorInput = (connectorType, fieldName, value) => {
    setConnectorInputs(prev => ({
      ...prev,
      [connectorType]: {
        ...(prev[connectorType] || {}),
        [fieldName]: value
      }
    }));
  };

  const handleConnectAndIngest = async (connectorType) => {
    const config = connectorInputs[connectorType] || {};

    setConnectorState(prev => ({
      ...prev,
      [connectorType]: { status: 'loading', message: 'Connecting...' }
    }));

    try {
      const connectResp = await fetch(`${API_BASE}/api/connect/${connectorType}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connector_type: connectorType, config })
      });

      const connectData = await connectResp.json();
      if (!connectResp.ok || !connectData.success) {
        throw new Error(connectData.detail || connectData.message || 'Connection failed');
      }

      setConnectorState(prev => ({
        ...prev,
        [connectorType]: { status: 'loading', message: 'Connected. Ingesting data...' }
      }));

      const ingestResp = await fetch(`${API_BASE}/api/ingest/${connectorType}`, {
        method: 'POST'
      });
      const ingestData = await ingestResp.json();
      if (!ingestResp.ok || !ingestData.success) {
        throw new Error(ingestData.detail || ingestData.message || 'Ingestion failed');
      }

      setConnectorState(prev => ({
        ...prev,
        [connectorType]: {
          status: 'success',
          message: `Ingested ${ingestData.rows_ingested} rows into ${ingestData.table_name}`
        }
      }));

      fetchUploadStatus();
    } catch (error) {
      setConnectorState(prev => ({
        ...prev,
        [connectorType]: {
          status: 'error',
          message: error.message
        }
      }));
    }
  };

  return (
    <div className="upload-container">
      <div className="upload-header">
        <h1 className="upload-title"><HiOutlineCloudUpload color="#D32F2F" size={28} /> Data Hub</h1>
        <p className="upload-subtitle">
          Multiple ingestion methods: CSV/JSON files, Git, Jira, code coverage, test logs, and regression results.
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="tab-navigation" style={{
        display: 'flex',
        gap: '16px',
        marginBottom: '24px',
        borderBottom: '1px solid #ddd',
        paddingBottom: '12px'
      }}>
        <button
          onClick={() => setActiveTab('direct')}
          style={{
            padding: '8px 16px',
            background: activeTab === 'direct' ? '#D32F2F' : 'transparent',
            color: activeTab === 'direct' ? '#fff' : '#666',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: activeTab === 'direct' ? '600' : '400'
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <HiOutlineCloudUpload size={16} />
            Upload Files (CSV/JSON)
          </span>
        </button>
        <button
          onClick={() => setActiveTab('connectors')}
          style={{
            padding: '8px 16px',
            background: activeTab === 'connectors' ? '#D32F2F' : 'transparent',
            color: activeTab === 'connectors' ? '#fff' : '#666',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: activeTab === 'connectors' ? '600' : '400'
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <HiOutlineArchive size={16} />
            Data Connectors (5)
          </span>
        </button>
      </div>

      {/* ─── TAB: Direct Upload ─────────────────────────────────────────────── */}
      {activeTab === 'direct' && (
        <div className="upload-main-grid">
          <div className="upload-left">
            <div 
              className={`massive-drop-zone ${dragActive ? 'active' : ''}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClickCapture={() => document.getElementById('fileInput')?.click()}
            >
              <input
                id="fileInput"
                type="file"
                multiple
                accept=".csv,.json"
                onChange={(e) => handleFileUpload(e.target.files)}
                style={{ display: 'none' }}
              />
              <div className="drop-icon-wrapper">
                <HiOutlineCloudUpload size={48} color="#D32F2F" />
              </div>
              <div className="drop-title">Drag & Drop Files Here</div>
              <div className="drop-desc">Upload CSV or JSON files. App auto-detects columns and schema.</div>
              
              <div className="supported-formats">
                <span className="format-badge">.csv</span>
                <span className="format-badge">.json</span>
              </div>
            </div>

            {activeUploads.length > 0 && (
              <div className="active-uploads-panel">
                <h3 className="panel-title"><HiOutlineClock /> Uploads</h3>
                {activeUploads.map(job => (
                  <div key={job.id} className="upload-job">
                    <div className="job-header">
                      <div className="job-filename">
                        <HiOutlineDocumentText color="#666" size={18} />
                        <div>
                          <div>{job.name}</div>
                          <small>{job.status}</small>
                        </div>
                      </div>
                      <div>
                        {job.status === 'completed' && <HiCheck color="#4caf50" size={20} />}
                        {job.status === 'error' && <HiX color="#f44336" size={20} />}
                        {job.status === 'uploading' && <HiOutlineClock color="#2196f3" size={20} />}
                      </div>
                    </div>
                    {job.error && <div style={{ color: '#f44336', fontSize: '0.85em', marginTop: '4px' }}>{job.error}</div>}
                    {job.result && (
                      <div style={{ marginTop: '8px', fontSize: '0.85em', color: '#666' }}>
                        <div>Table: <strong>{job.result.table_name}</strong></div>
                        <div>{job.result.file_info.rows} rows × {job.result.file_info.columns} columns</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="upload-right">
            <div className="history-header">
              <h3 className="panel-title" style={{ margin: 0 }}><HiCheck /> Uploaded Data</h3>
              {uploadStatus?.has_uploaded_data && (
                <button 
                  onClick={handleReset}
                  style={{
                    padding: '6px 12px',
                    background: '#f44336',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.85em'
                  }}
                >
                  Reset to Defaults
                </button>
              )}
            </div>
            <div className="history-list">
              {uploadStatus?.has_uploaded_data ? (
                uploadStatus.uploaded_tables.map(table => (
                  <div key={table} className="history-item">
                    <div className="history-icon">
                      <HiOutlineArchive size={20} />
                    </div>
                    <div className="history-details">
                      <div className="history-name">{table}</div>
                      <div className="history-meta">
                        <span>{uploadStatus.file_info[table]?.rows} rows</span>
                        <span>•</span>
                        <span>{uploadStatus.file_info[table]?.columns} columns</span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
                  <p>No files uploaded yet.</p>
                  <p style={{ fontSize: '0.9em' }}>Upload a CSV or JSON file to get started.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB: Data Connectors ────────────────────────────────────────────── */}
      {activeTab === 'connectors' && (
        <div className="connectors-container">
          <p style={{ color: '#666', marginBottom: '20px' }}>
            Connect to your verification data sources directly. No file conversion needed!
          </p>

          <div className="connectors-grid" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '16px'
          }}>
            {Object.entries(connectorConfig).map(([connectorType, config]) => (
              (() => {
                const ConnectorIcon = connectorIcons[connectorType] || HiOutlineDocumentText;
                return (
              <div
                key={connectorType}
                style={{
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  padding: '16px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
                  e.currentTarget.style.borderColor = '#D32F2F';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.borderColor = '#ddd';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ marginRight: '12px', display: 'flex', alignItems: 'center' }}>
                    <ConnectorIcon size={28} color="#D32F2F" />
                  </div>
                  <div>
                    <h4 style={{ margin: '0 0 4px 0', textTransform: 'uppercase', fontSize: '0.9em', fontWeight: '600' }}>
                      {connectorType}
                    </h4>
                    <p style={{ margin: 0, fontSize: '0.85em', color: '#666' }}>
                      {config.description}
                    </p>
                    {availableConnectors[connectorType] === false && (
                      <p style={{ margin: '4px 0 0 0', fontSize: '0.75em', color: '#f44336' }}>
                        Connector unavailable on backend
                      </p>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => setExpandedConnector(expandedConnector === connectorType ? null : connectorType)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    background: '#f5f5f5',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.85em',
                    color: '#D32F2F',
                    fontWeight: '500'
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    {expandedConnector === connectorType ? <HiChevronDown size={16} /> : <HiChevronRight size={16} />}
                    {expandedConnector === connectorType ? 'Hide Config' : 'Show Config'}
                  </span>
                </button>

                {expandedConnector === connectorType && (
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #eee' }}>
                    {config.fields.map(field => (
                      <div key={field.name} style={{ marginBottom: '10px' }}>
                        <label style={{ display: 'block', fontSize: '0.85em', fontWeight: '500', marginBottom: '4px' }}>
                          {field.label}
                        </label>
                        <input
                          type={field.type || 'text'}
                          placeholder={field.example}
                          value={(connectorInputs[connectorType] && connectorInputs[connectorType][field.name]) || ''}
                          onChange={(e) => updateConnectorInput(connectorType, field.name, e.target.value)}
                          style={{
                            width: '100%',
                            padding: '8px',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            fontSize: '0.85em',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>
                    ))}
                    <button
                      onClick={() => handleConnectAndIngest(connectorType)}
                      disabled={connectorState[connectorType]?.status === 'loading' || availableConnectors[connectorType] === false}
                      style={{
                        width: '100%',
                        padding: '8px',
                        background: connectorState[connectorType]?.status === 'loading' ? '#9e9e9e' : '#D32F2F',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: connectorState[connectorType]?.status === 'loading' ? 'not-allowed' : 'pointer',
                        fontSize: '0.85em',
                        fontWeight: '600',
                        marginTop: '10px'
                      }}
                    >
                      {connectorState[connectorType]?.status === 'loading' ? 'Working...' : 'Connect & Ingest'}
                    </button>
                    {connectorState[connectorType]?.message && (
                      <p style={{
                        fontSize: '0.78em',
                        marginTop: '8px',
                        color: connectorState[connectorType]?.status === 'error' ? '#f44336' : '#666'
                      }}>
                        {connectorState[connectorType].message}
                      </p>
                    )}
                    <p style={{ fontSize: '0.75em', color: '#999', marginTop: '8px', fontStyle: 'italic' }}>
                      See CONNECTORS_GUIDE.md for detailed instructions
                    </p>
                  </div>
                )}
              </div>
              );
              })()
            ))}
          </div>

          <div style={{ marginTop: '24px', padding: '16px', background: '#f0f7ff', borderRadius: '8px', borderLeft: '4px solid #2196f3' }}>
            <h4 style={{ margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <HiOutlineDocumentText size={20} color="#2196f3" />
              How It Works
            </h4>
            <p style={{ margin: 0, fontSize: '0.9em', color: '#333' }}>
              Select a connector, provide configuration (URLs, credentials, file paths), and click "Connect & Ingest". 
              Data is automatically extracted and normalized into tables ready for analysis and forecasting.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

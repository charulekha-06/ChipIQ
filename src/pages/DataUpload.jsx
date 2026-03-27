import React, { useState, useEffect } from 'react';
import { HiOutlineCloudUpload, HiOutlineDocumentText, HiOutlineArchive, HiCheck, HiOutlineClock } from 'react-icons/hi';
import './DataUpload.css';

const HISTORY = [
  { id: 1, name: 'regression_nightly_v2.fsdb', size: '14.2 GB', date: 'Today, 08:32 AM', status: 'completed' },
  { id: 2, name: 'cpu_core_rtl_patch.v', size: '2.4 MB', date: 'Yesterday, 14:15 PM', status: 'completed' },
  { id: 3, name: 'uvm_testbenches_archived.tar.gz', size: '840 MB', date: 'Mar 24, 11:05 AM', status: 'completed' }
];

export default function DataUpload() {
  const [dragActive, setDragActive] = useState(false);
  const [activeUploads, setActiveUploads] = useState([]);

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
    
    // Simulate accepting files
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newUploads = Array.from(e.dataTransfer.files).map((file, i) => ({
        id: Date.now() + i,
        name: file.name,
        size: (Math.random() * 5 + 0.1).toFixed(2) + ' GB',
        progress: 0,
        speed: Math.floor(Math.random() * 120 + 30) + ' MB/s'
      }));
      
      setActiveUploads(prev => [...prev, ...newUploads]);
    } else {
      // Mock upload if clicked
      const mock = {
        id: Date.now(),
        name: `soc_verification_dump_${Math.floor(Math.random()*100)}.fsdb`,
        size: '8.4 GB',
        progress: 0,
        speed: '145 MB/s'
      };
      setActiveUploads(prev => [...prev, mock]);
    }
  };

  useEffect(() => {
    if (activeUploads.length === 0) return;

    const interval = setInterval(() => {
      setActiveUploads(current => {
        let allDone = true;
        const updated = current.map(job => {
          if (job.progress < 100) {
            allDone = false;
            const boost = Math.floor(Math.random() * 8) + 2;
            return { ...job, progress: Math.min(job.progress + boost, 100) };
          }
          return job;
        });
        
        if (allDone) clearInterval(interval);
        return updated;
      });
    }, 500);

    return () => clearInterval(interval);
  }, [activeUploads]);

  return (
    <div className="upload-container">
      <div className="upload-header">
        <h1 className="upload-title"><HiOutlineCloudUpload color="#D32F2F" size={28} /> Verification Data Hub</h1>
        <p className="upload-subtitle">Securely transfer massive simulation waveforms, RTL patches, and testbench archives to the cloud compute cluster.</p>
      </div>

      <div className="upload-main-grid">
        <div className="upload-left">
          
          <div 
            className={`massive-drop-zone ${dragActive ? 'active' : ''}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={handleDrop}
          >
            <div className="drop-icon-wrapper">
              <HiOutlineCloudUpload size={48} color="#D32F2F" />
            </div>
            <div className="drop-title">Drag & Drop Assets Here</div>
            <div className="drop-desc">Supports multi-gigabyte uploads with automatic resume capability and delta compression.</div>
            
            <div className="supported-formats">
              <span className="format-badge">.fsdb</span>
              <span className="format-badge">.v / .sv</span>
              <span className="format-badge">.tar.gz</span>
              <span className="format-badge">.log</span>
            </div>
          </div>

          {activeUploads.length > 0 && (
            <div className="active-uploads-panel">
              <h3 className="panel-title"><HiOutlineClock /> Active Transfers ({activeUploads.length})</h3>
              {activeUploads.map(job => (
                <div key={job.id} className="upload-job">
                  <div className="job-header">
                    <div className="job-filename">
                      {job.name.endsWith('.fsdb') ? <HiOutlineArchive color="#000000"/> : <HiOutlineDocumentText color="#111111"/>}
                      {job.name}
                    </div>
                    <div className="job-stats">
                      {job.progress < 100 ? `${job.speed} • ${job.progress}% of ${job.size}` : <span style={{color: '#111111'}}>Completed</span>}
                    </div>
                  </div>
                  <div className="job-progress-bg">
                    <div className="job-progress-fill" style={{ width: `${job.progress}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>

        <div className="upload-right">
          <div className="history-header">
            <h3 className="panel-title" style={{ margin: 0 }}><HiCheck /> Upload History</h3>
          </div>
          <div className="history-list">
            {HISTORY.map(item => (
              <div key={item.id} className="history-item">
                <div className="history-icon">
                  {item.name.endsWith('.fsdb') || item.name.endsWith('.tar.gz') ? <HiOutlineArchive size={20} /> : <HiOutlineDocumentText size={20} />}
                </div>
                <div className="history-details">
                  <div className="history-name">{item.name}</div>
                  <div className="history-meta">
                    <span>{item.size}</span>
                    <span>•</span>
                    <span>{item.date}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

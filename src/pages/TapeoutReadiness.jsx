import React from 'react';
import { HiOutlineCheckCircle, HiOutlineExclamationCircle, HiOutlineXCircle, HiOutlineLightningBolt, HiOutlineChartBar, HiOutlineShieldCheck, HiOutlineDownload } from 'react-icons/hi';
import html2pdf from 'html2pdf.js';
import './TapeoutReadiness.css';

export default function TapeoutReadiness() {
  const tapeoutScore = 67;
  const circumference = 2 * Math.PI * 65;
  const dashOffset = circumference - (tapeoutScore / 100) * circumference;

  const exportPDF = () => {
    const element = document.querySelector('.tapeout-readiness-page');
    if (!element) return;
    const opt = {
      margin: 0.5,
      filename: `tapeout_readiness_${new Date().toISOString().split('T')[0]}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'in', format: 'a4', orientation: 'landscape' }
    };
    html2pdf().set(opt).from(element).save();
  };

  return (
    <div className="page tapeout-readiness-page">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
         <button onClick={exportPDF} style={{ background: '#111111', color: '#000000', border: 'none', padding: '10px 16px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600 }}>
           <HiOutlineDownload size={16} /> Export to PDF
         </button>
      </div>
      <div className="readiness-main-grid">
        {/* Left: Score Gauge */}
        <div className="gauge-panel-card">
          <span className="panel-label">TAPEOUT READINESS SCORE</span>
          
          <div className="large-gauge-container">
            <svg viewBox="0 0 150 150">
              <defs>
                <linearGradient id="largeGaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#D32F2F" />
                  <stop offset="50%" stopColor="#000000" />
                  <stop offset="100%" stopColor="#111111" />
                </linearGradient>
              </defs>
              <circle className="gauge-bg" cx="75" cy="75" r="65" />
              <circle
                className="gauge-fill"
                cx="75" cy="75" r="65"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                stroke="url(#largeGaugeGradient)"
              />
            </svg>
            <div className="gauge-center">
              <div className="gauge-value">{tapeoutScore}</div>
              <div className="gauge-label">TAPEOUT SCORE</div>
            </div>
          </div>

          <div className="gauge-status-text">
            <p>Score below 80.</p>
            <p className="dim">Not ready for tapeout.</p>
          </div>
        </div>

        {/* Right: Breakdown and Checklist */}
        <div className="details-panel">
          <div className="section-card no-margin mb-20">
            <div className="section-header">
              <h3>Score Breakdown</h3>
            </div>
            <div className="breakdown-list">
              <div className="breakdown-row">
                <span className="row-label">Bug Trend</span>
                <div className="row-bar-bg"><div className="row-bar-fill blue" style={{ width: '60%' }}></div></div>
                <span className="row-value blue">60%</span>
              </div>
              <div className="breakdown-row">
                <span className="row-label">Coverage</span>
                <div className="row-bar-bg"><div className="row-bar-fill cyan" style={{ width: '87%' }}></div></div>
                <span className="row-value cyan">87%</span>
              </div>
              <div className="breakdown-row">
                <span className="row-label">Critical Bugs</span>
                <div className="row-bar-bg"><div className="row-bar-fill red" style={{ width: '30%' }}></div></div>
                <span className="row-value red">30%</span>
              </div>
            </div>
          </div>

          <div className="section-card no-margin">
            <div className="section-header">
              <h3>Tapeout Checklist</h3>
            </div>
            <div className="checklist-container">
              <div className="checklist-item pass">
                <HiOutlineCheckCircle className="check-icon" />
                <div className="check-content">
                  <p className="check-title">Regression pass rate &gt; 90%</p>
                  <p className="check-sub">Currently 93.2% — PASS</p>
                </div>
              </div>
              <div className="checklist-item pass">
                <HiOutlineCheckCircle className="check-icon" />
                <div className="check-content">
                  <p className="check-title">No P0 bugs open &gt; 7 days</p>
                  <p className="check-sub">All P0s resolved within SLA</p>
                </div>
              </div>
              <div className="checklist-item warn">
                <HiOutlineExclamationCircle className="check-icon" />
                <div className="check-content">
                  <p className="check-title">Coverage &lt; 95% target</p>
                  <p className="check-sub">Currently 87% — needs +8%</p>
                </div>
              </div>
              <div className="checklist-item fail">
                <HiOutlineXCircle className="check-icon" />
                <div className="check-content">
                  <p className="check-title">7 Critical bugs still open</p>
                  <p className="check-sub">Must be 0 for green light</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="recommendations-section">
        <h3>AI Recommendations</h3>
        <div className="recommendations-grid">
          <div className="rec-card">
            <div className="rec-header">
              <HiOutlineLightningBolt className="rec-icon orange" />
              <span>AI INSIGHT</span>
            </div>
            <p>Focus on USB_PHY first — 14 open bugs and only 72% coverage are the biggest blockers to tapeout.</p>
          </div>
          <div className="rec-card">
            <div className="rec-header">
              <HiOutlineChartBar className="rec-icon purple" />
              <span>FORECAST</span>
            </div>
            <p>At current velocity, critical bug closure will take ~8 days. Assign 2 additional engineers to hit the Apr 14 deadline.</p>
          </div>
          <div className="rec-card">
            <div className="rec-header">
              <HiOutlineShieldCheck className="rec-icon cyan" />
              <span>COVERAGE</span>
            </div>
            <p>CPU_CORE and DDR_CTRL have the largest coverage gaps. Prioritize directed tests for memory path corner cases.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

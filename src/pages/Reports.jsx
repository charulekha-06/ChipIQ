import {
  HiOutlineBugAnt,
  HiOutlineExclamationTriangle,
  HiOutlineChartBar,
  HiOutlineCheckCircle,
  HiOutlineCalendar,
  HiOutlineCube
} from 'react-icons/hi2'; // Using hi2 for more comprehensive icons like BugAnt
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import html2pdf from 'html2pdf.js';
import './Reports.css';

const bugActivityData = [
  { month: 'Oct', added: 28, fixed: 18 },
  { month: 'Nov', added: 35, fixed: 25 },
  { month: 'Dec', added: 42, fixed: 38 },
  { month: 'Jan', added: 52, fixed: 44 },
  { month: 'Feb', added: 45, fixed: 50 },
  { month: 'Mar', added: 62, fixed: 48 },
];

const coverageTrendData = [
  { month: 'Oct', coverage: 74 },
  { month: 'Nov', coverage: 77 },
  { month: 'Dec', coverage: 80 },
  { month: 'Jan', coverage: 82 },
  { month: 'Feb', coverage: 85 },
  { month: 'Mar', coverage: 89 },
];

const reports = [
  { id: 'bug', title: 'Bug Report', desc: 'All open + closed bugs with severity breakdown', icon: <HiOutlineBugAnt />, color: 'red' },
  { id: 'risk', title: 'Risk Report', desc: 'Module risk scores, trends, AI predictions', icon: <HiOutlineExclamationTriangle />, color: 'orange' },
  { id: 'cov', title: 'Coverage Report', desc: 'Functional + code coverage by module with gaps', icon: <HiOutlineChartBar />, color: 'cyan' },
  { id: 'tape', title: 'Tapeout Report', desc: 'Readiness score, checklist, recommended actions', icon: <HiOutlineCheckCircle />, color: 'yellow' },
  { id: 'week', title: 'Weekly Summary', desc: 'Auto-generated weekly executive summary', icon: <HiOutlineCalendar />, color: 'green' },
  { id: 'full', title: 'Full Export', desc: 'Complete dataset — bugs, coverage, risk, commits (CSV)', icon: <HiOutlineCube />, color: 'grey' },
];

export default function Reports() {
  const exportPDF = (title) => {
    const element = document.querySelector('.reports-page');
    if (!element) return;
    const opt = {
      margin: 0.5,
      filename: `${title.toLowerCase().replace(/ /g, '_')}_report.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'in', format: 'a4', orientation: 'landscape' }
    };
    html2pdf().set(opt).from(element).save();
  };

  return (
    <div className="reports-page">
      {/* Stats Grid */}
      <div className="reports-stats-grid">
        <div className="report-stat-card">
          <div className="report-stat-label">BUGS ADDED (7D)</div>
          <div className="report-stat-value red">+18</div>
        </div>
        <div className="report-stat-card">
          <div className="report-stat-label">BUGS FIXED (7D)</div>
          <div className="report-stat-value green">12</div>
        </div>
        <div className="report-stat-card">
          <div className="report-stat-label">NET CHANGE (7D)</div>
          <div className="report-stat-value orange">+6</div>
        </div>
        <div className="report-stat-card">
          <div className="report-stat-label">RISK CHANGE (7D)</div>
          <div className="report-stat-value orange">↑ +5%</div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="reports-charts-grid">
        <div className="report-chart-card">
          <div className="report-chart-header">
            <h3>Bug Activity — Monthly</h3>
            <p>Bugs added vs. fixed per month</p>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={bugActivityData} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.03)" vertical={false} />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#000000', fontSize: 11 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#000000', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #334155', borderRadius: '8px' }} />
              <Bar dataKey="added" fill="#D32F2F" radius={[4, 4, 0, 0]} barSize={24} />
              <Bar dataKey="fixed" fill="#111111" radius={[4, 4, 0, 0]} barSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="report-chart-card">
          <div className="report-chart-header">
            <h3>Coverage Trend</h3>
            <p>Overall coverage % over 6 months</p>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={coverageTrendData} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.03)" vertical={false} />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#000000', fontSize: 11 }} />
              <YAxis domain={[65, 100]} axisLine={false} tickLine={false} tick={{ fill: '#000000', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #334155', borderRadius: '8px' }} />
              <Line type="monotone" dataKey="coverage" stroke="#D32F2F" strokeWidth={3} dot={{ fill: '#D32F2F', strokeWidth: 2, r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Download Reports Section */}
      <div className="download-reports-section">
        <div className="intel-header">
          <h3>Download Reports</h3>
          <p>Export verification data for stakeholders</p>
        </div>
        <div className="download-grid">
          {reports.map((report) => (
            <div key={report.id} className="download-card">
              <span className="download-icon">{report.icon}</span>
              <div>
                <h4>{report.title}</h4>
                <p>{report.desc}</p>
              </div>
              <a href="#" className={`download-btn ${report.color}`} onClick={(e) => { e.preventDefault(); exportPDF(report.title); }}>
                ↓ Download PDF
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import { Outlet } from 'react-router-dom';
import Navbar from './Sidebar';
import './Layout.css';

export default function Layout({ user, onLogout }) {
  return (
    <div className="app-layout">
      <Navbar user={user} onLogout={onLogout} />
      <main className="main-content">
        <div className="page-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

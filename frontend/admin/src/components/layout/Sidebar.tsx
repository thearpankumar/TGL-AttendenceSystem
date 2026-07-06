import { NavLink } from 'react-router-dom';
import { LogOut, Shield, Sun, Moon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../hooks/useTheme';
import { useFlaggedCount } from '../../hooks/useFlaggedCount';
import { navLinks } from './navLinks';

const Sidebar = () => {
  const { admin, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const flaggedCount = useFlaggedCount();

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <Shield size={20} />
          <span>SentriX</span>
        </div>
        <button className="theme-toggle-btn" onClick={toggleTheme} aria-label="Toggle theme">
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
      <nav className="sidebar-nav">
        {navLinks.map(({ to, label, icon: Icon, end, danger }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `sidebar-link${isActive ? ' active' : ''}${danger ? ' danger' : ''}`
            }
          >
            <Icon size={18} />
            {label}
            {to === '/flagged' && flaggedCount > 0 && (
              <span className="sidebar-badge">{flaggedCount > 99 ? '99+' : flaggedCount}</span>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">
        <span className="sidebar-username">{admin?.username}</span>
        <button className="btn btn-secondary btn-small" onClick={logout}>
          <LogOut size={14} />
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;

import { useState } from 'react';
import type { ReactNode } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import MobileDrawer from './MobileDrawer';
import { useSidebar } from '../../hooks/useSidebar';

const AppShell = ({ children }: { children: ReactNode }) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { collapsed, toggle } = useSidebar();

  return (
    <div className={`app-shell${collapsed ? ' sidebar-collapsed' : ''}`}>
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <Topbar onMenuClick={() => setDrawerOpen(true)} />
      {drawerOpen && <MobileDrawer onClose={() => setDrawerOpen(false)} />}
      <main className="app-main">{children}</main>
    </div>
  );
};

export default AppShell;

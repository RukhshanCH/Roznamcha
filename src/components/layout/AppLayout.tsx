import { useAtom } from 'jotai';
import { sidebarCollapsedAtom } from '@/store/atoms';
import Sidebar from './Sidebar';
import HeaderBar from './HeaderBar';

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [collapsed] = useAtom(sidebarCollapsedAtom);

  return (
    <div className="app-layout">
      <Sidebar />
      <div className={`main-content ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <HeaderBar />
        <div className="content-area">{children}</div>
      </div>
    </div>
  );
}

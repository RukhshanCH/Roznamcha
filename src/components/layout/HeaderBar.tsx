import { useAtom } from 'jotai';
import { Menu, Search, Bell, User, ChevronDown } from 'lucide-react';
import { sidebarCollapsedAtom } from '@/store/atoms';

export default function HeaderBar() {
  const [collapsed, setCollapsed] = useAtom(sidebarCollapsedAtom);

  return (
    <header className="header-bar">
      <div className="header-left">
        <button
          className="header-btn"
          onClick={() => setCollapsed(!collapsed)}
          aria-label="Toggle sidebar"
        >
          <Menu />
        </button>
      </div>
      <div className="header-right">
        <button className="header-btn" aria-label="Search">
          <Search />
        </button>
        <button className="header-btn notification-btn" aria-label="Notifications">
          <Bell />
          <span className="notification-badge">3</span>
        </button>
        <div className="user-profile">
          <div className="user-avatar">
            <User size={18} />
          </div>
          <span className="user-name">ایمن</span>
          <ChevronDown className="user-chevron" />
        </div>
      </div>
    </header>
  );
}

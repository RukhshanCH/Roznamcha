import { useAtom } from 'jotai';
import { Menu, Search } from 'lucide-react';
import { sidebarCollapsedAtom, searchAtom } from '@/store/atoms';

export default function HeaderBar() {
  const [collapsed, setCollapsed] = useAtom(sidebarCollapsedAtom);
  const [search, setSearch] = useAtom(searchAtom);
  
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
        <div style={{position: "relative"}}>
          <label htmlFor='search'> <Search className='search-icon' /> </label>
          <input id="search" className="header-btn search-bar" aria-label="Search" type="text" placeholder="اندراجات تلاش کریں" value={search} onChange={(e) => setSearch(e.target.value)}/>
        </div>
        {/* <button className="header-btn notification-btn" aria-label="Notifications">
          <Bell />
          <span className="notification-badge">3</span>
        </button>
        <div className="user-profile">
          <div className="user-avatar">
            <User size={18} />
          </div>
          <span className="user-name">ایمن</span>
          <ChevronDown className="user-chevron" />
        </div> */}
      </div>
    </header>
  );
}

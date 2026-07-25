import { useAtom } from 'jotai';
import { Menu, Search, User } from 'lucide-react';
import { sidebarCollapsedAtom, searchAtom } from '@/store/atoms';
import { useSetting } from '@/hooks/useSetting';
import { Link } from 'react-router-dom';

export default function HeaderBar() {
  const [collapsed, setCollapsed] = useAtom(sidebarCollapsedAtom);
  const [search, setSearch] = useAtom(searchAtom);

  const [companyName] = useSetting(
    "companyName",
    "Company Name"
  );
  const [profilePic] = useSetting<string | null>("profilePic", null);
  return (
    <header className="header-bar">
      <div className="header-left">
        <button
          className="header-btn"
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-label="Toggle sidebar"
        >
          <Menu />
        </button>
      </div>
      <div className="header-right">
        {/* <button className="header-btn notification-btn" aria-label="Notifications">
          <Bell />
          <span className="notification-badge">3</span>
        </button> */}
        <div className="user-profile">
          <Link to={'/settings'} className="header">
            {
              profilePic ? (
                <img src={profilePic} alt="User Avatar" className='logo' />
              ) : (
                <User className='logo' />
              )
            }
            <span className="user-name">{companyName}</span>
          </Link>
        </div>
        <div style={{ position: "relative" }}>
          <label htmlFor='search'> <Search className='search-icon' /> </label>
          <input id="search" className="header-btn search-bar" aria-label="Search" type="text" placeholder="اندراجات تلاش کریں" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
    </header>
  );
}

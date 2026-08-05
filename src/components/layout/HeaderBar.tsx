import { useAtom } from 'jotai';
import { Menu, Search, User } from 'lucide-react';
import { sidebarCollapsedAtom, searchAtom } from '@/store/atoms';
import { useSetting } from '@/hooks/useSetting';
import { Link } from 'react-router-dom';
import { useState } from 'react';

export default function HeaderBar() {
  const [, setCollapsed] = useAtom(sidebarCollapsedAtom);
  const [search, setSearch] = useAtom(searchAtom);
  const [isFocus, setIsFocus] = useState(false);

  const [companyName] = useSetting(
    "companyName",
    "Company Name"
  );
  const [profilePic] = useSetting<string | null>("profilePic", null);

  const handleClick = () => {
    const search = document.getElementById("search");

    if (search) {
      search.focus();
      setIsFocus(true);
    }
  };

  return (
    <header className="header-bar">
      <div className="header-left">
        <button
          className="header-btn" data-sidebar-toggle aria-label="Toggle menu"
          type="button"
          onClick={() => setCollapsed(prev => !prev)}
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
                <User className='logo user' />
              )
            }
            <span id="user-name" className={`user-name ${isFocus ? 'user-hide' : ''}`}>{companyName}</span>
          </Link>
        </div>
        <div style={{ position: "relative" }}>
          <label htmlFor='search'> <Search className='search-icon' /> </label>
          <input onClick={handleClick} onFocus={() => setIsFocus(true)} onBlur={() => setIsFocus(false)} id="search" className="header-btn search-bar" aria-label="Search" type="text" placeholder="اندراجات تلاش کریں" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
    </header>
  );
}

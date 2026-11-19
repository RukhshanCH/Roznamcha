import { useAtom } from 'jotai';
import { AlertTriangle, Cloud, CloudOff, LogOut, Menu, RefreshCw, Search, User } from 'lucide-react';
import {
  sidebarCollapsedAtom,
  searchAtom,
  syncRequestAtom,
  syncStatusAtom,
  userAtom,
} from '@/store/atoms';
import { useSetting } from '@/hooks/useSetting';
import { Link } from '@/router';
import { useState } from 'react';
import { useAtomValue } from 'jotai';
import { signOutUser } from '@/hooks/useAuth';
import { resolveSyncConflict } from '@/db/cloudSync';

export default function HeaderBar() {
  const [, setCollapsed] = useAtom(sidebarCollapsedAtom);
  const [search, setSearch] = useAtom(searchAtom);
  const user = useAtomValue(userAtom);
  const [syncStatus, setSyncStatus] = useAtom(syncStatusAtom);
  const [, requestSync] = useAtom(syncRequestAtom);
  const [isFocus, setIsFocus] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const [conflictError, setConflictError] = useState('');

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

  const handleSignOut = async () => {
    setSignOutError('');
    try {
      await signOutUser();
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : 'Could not sign out.');
    }
  };

  const resolveConflict = async (
    conflict: (typeof syncStatus.conflicts)[number],
    choice: 'local' | 'cloud',
  ) => {
    if (!user?.id) return;
    setConflictError('');
    try {
      await resolveSyncConflict(user.id, conflict, choice);
      requestSync((value) => value + 1);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not resolve the sync conflict.';
      setConflictError(message);
      setSyncStatus((state) => ({ ...state, error: message, phase: 'error' }));
    }
  };

  const syncLabel = {
    idle: 'Sync not started',
    syncing: 'Syncing',
    synced: 'All changes synced',
    pending: `${syncStatus.queued} changes waiting to sync`,
    offline: `Offline - ${syncStatus.queued} changes waiting`,
    error: syncStatus.error || 'Sync failed',
    conflict: `${syncStatus.conflicts.length} sync conflicts need review`,
  }[syncStatus.phase];
  const SyncIcon = syncStatus.phase === 'offline'
    ? CloudOff
    : syncStatus.phase === 'conflict' || syncStatus.phase === 'error'
      ? AlertTriangle
      : Cloud;

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
        <div className={`sync-status sync-status-${syncStatus.phase}`} aria-live="polite">
          <SyncIcon size={18} aria-hidden="true" />
          <span>{syncLabel}</span>
          {(syncStatus.phase === 'error' || syncStatus.phase === 'pending' || syncStatus.phase === 'offline') && (
            <button
              type="button"
              className="sync-status-retry"
              aria-label="Retry cloud sync"
              title="Retry cloud sync"
              onClick={() => requestSync((value) => value + 1)}
            >
              <RefreshCw size={16} aria-hidden="true" />
            </button>
          )}
          {syncStatus.conflicts.length > 0 && (
            <details className="sync-conflicts">
              <summary>Review</summary>
              <ul>
                {syncStatus.conflicts.map((conflict) => (
                  <li key={conflict.key}>
                    <span>{conflict.store} record {conflict.localId ?? ''}</span>
                    <button type="button" onClick={() => void resolveConflict(conflict, 'cloud')}>
                      Use cloud
                    </button>
                    <button type="button" onClick={() => void resolveConflict(conflict, 'local')}>
                      Keep this device
                    </button>
                  </li>
                ))}
              </ul>
              {conflictError && <p role="alert">{conflictError}</p>}
            </details>
          )}
        </div>
        <button
          className="header-btn"
          type="button"
          aria-label={`Sign out${user?.email ? ` ${user.email}` : ''}`}
          title={signOutError || 'Sign out'}
          onClick={handleSignOut}
        >
          <LogOut />
        </button>
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

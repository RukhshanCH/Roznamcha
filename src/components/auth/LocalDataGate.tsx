import { useEffect, useState, type ReactNode } from 'react';
import { useAtomValue } from 'jotai';
import { LoaderCircle } from 'lucide-react';
import { signOutUser } from '@/hooks/useAuth';
import { userAtom } from '@/store/atoms';
import { initDB } from '@/db/indexedDB';
import {
  completeEmptyMigration,
  getMigrationPreview,
  getLocalMigrationState,
  getSyncInstallationId,
  migrateLegacyData,
  type MigrationPreview,
  type MigrationProgress,
} from '@/db/localMigration';
import { setActiveSyncContext, setActiveSyncUser } from '@/db/syncContext';
import '@/styles/migration.css';

type GateState = 'loading' | 'confirm' | 'migrating' | 'ready' | 'blocked' | 'error';

function totalRecords(preview: MigrationPreview): number {
  return Object.values(preview.counts).reduce((total, count) => total + count, 0);
}

export default function LocalDataGate({ children }: { children: ReactNode }) {
  const user = useAtomValue(userAtom);
  const userId = user?.id;
  const [state, setState] = useState<GateState>('loading');
  const [preparedUserId, setPreparedUserId] = useState<string | null>(null);
  const [preview, setPreview] = useState<MigrationPreview | null>(null);
  const [progress, setProgress] = useState<MigrationProgress | null>(null);
  const [confirmedUserId, setConfirmedUserId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setActiveSyncUser(null);

    const currentUserId = userId;
    if (!currentUserId) {
      return () => { active = false; };
    }

    function updateState(currentUserId: string, nextState: GateState) {
      if (!active) return;
      setPreparedUserId(currentUserId);
      setState(nextState);
    }

    async function prepare(currentUserId: string) {
      try {
        await initDB();
        const [localState, localPreview] = await Promise.all([
          getLocalMigrationState(currentUserId),
          getMigrationPreview(currentUserId),
        ]);
        if (!active) return;

        if (localPreview.pendingForAnotherUser) {
          setPreview(localPreview);
          setError('Local data migration was started for another account. Sign in to that account to resume it.');
          updateState(currentUserId, 'blocked');
          return;
        }

        if (localPreview.alreadyVerified && localState?.ownerUserId === currentUserId) {
          setActiveSyncContext(currentUserId, await getSyncInstallationId());
          updateState(currentUserId, 'ready');
          return;
        }

        if (!localPreview.hasLegacyData) {
          await completeEmptyMigration(currentUserId);
          if (!active) return;
          setActiveSyncContext(currentUserId, await getSyncInstallationId());
          updateState(currentUserId, 'ready');
          return;
        }

        setPreview(localPreview);
        if (localState?.status === 'running' || localState?.status === 'failed') {
          updateState(currentUserId, 'migrating');
          await migrateLegacyData(currentUserId, true, (nextProgress) => {
            if (active) setProgress(nextProgress);
          });
          if (!active) return;
          setActiveSyncContext(currentUserId, await getSyncInstallationId());
          updateState(currentUserId, 'ready');
          return;
        }
        updateState(currentUserId, 'confirm');
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Could not prepare the local data migration.');
        updateState(currentUserId, 'error');
      }
    }

    void prepare(currentUserId);
    return () => {
      active = false;
      setActiveSyncUser(null);
    };
  }, [retry, userId]);

  async function beginMigration() {
    if (!userId || confirmedUserId !== userId) return;
    setState('migrating');
    setError('');
    setProgress(null);
    try {
      await migrateLegacyData(userId, true, setProgress);
      setActiveSyncContext(userId, await getSyncInstallationId());
      setState('ready');
    } catch (migrationError) {
      setError(migrationError instanceof Error ? migrationError.message : 'Migration failed.');
      setState('error');
    }
  }

  async function retryMigration() {
    setError('');
    setState('loading');
    setRetry((value) => value + 1);
  }

  async function signOut() {
    try {
      await signOutUser();
    } catch (signOutError) {
      setError(signOutError instanceof Error ? signOutError.message : 'Could not sign out.');
    }
  }

  if (state === 'ready' && preparedUserId === userId) return <>{children}</>;

  if (!userId || preparedUserId !== userId) {
    return (
      <main className="migration-page" aria-live="polite">
        <section className="migration-card">
          <LoaderCircle className="migration-spinner" aria-hidden="true" />
          <h1>Checking local data…</h1>
        </section>
      </main>
    );
  }

  return (
    <main className="migration-page" aria-live="polite">
      <section className="migration-card">
        {state === 'loading' && (
          <>
            <LoaderCircle className="migration-spinner" aria-hidden="true" />
            <h1>Checking local data…</h1>
          </>
        )}

        {state === 'confirm' && preview && (
          <>
            <h1>Import this device’s existing data?</h1>
            <p>
              {totalRecords(preview)} local items will be linked to {user?.email || 'this account'}.
              This includes records in the recycle bin and saved settings. The local database will
              remain on this device.
            </p>
            <ul>
              {Object.entries(preview.counts).map(([store, count]) => (
                <li key={store}>
                  {store}: {count}
                  {store !== 'settings' && preview.deletedCounts[store as keyof MigrationPreview['deletedCounts']] > 0
                    ? ` (${preview.deletedCounts[store as keyof MigrationPreview['deletedCounts']]} deleted)`
                    : ''}
                </li>
              ))}
            </ul>
            <label className="migration-confirm">
              <input
                type="checkbox"
                checked={confirmedUserId === userId}
                onChange={(event) => setConfirmedUserId(event.target.checked ? userId ?? null : null)}
              />
              I confirm these local records belong to me and may be linked to this account.
            </label>
            <button type="button" disabled={confirmedUserId !== userId} onClick={beginMigration}>
              Migrate and verify data
            </button>
            <button type="button" className="migration-secondary" onClick={signOut}>
              Sign out
            </button>
          </>
        )}

        {state === 'migrating' && (
          <>
            <LoaderCircle className="migration-spinner" aria-hidden="true" />
            <h1>Syncing your local data…</h1>
            <p>
              {progress
                ? `${progress.store}: ${progress.completed} of ${progress.total}`
                : 'Preparing a resumable upload.'}
            </p>
            <progress
              max={Math.max(progress?.total ?? 1, 1)}
              value={progress?.completed ?? 0}
            />
            <p>Your local data remains available on this device.</p>
          </>
        )}

        {state === 'blocked' && (
          <>
            <h1>Local migration needs the original account</h1>
            <p role="alert">{error}</p>
            <button type="button" onClick={signOut}>Sign out</button>
          </>
        )}

        {state === 'error' && (
          <>
            <h1>Local data was not fully migrated</h1>
            <p role="alert">{error}</p>
            <p>No local records were deleted. Retry to resume the same account’s upload.</p>
            <button type="button" onClick={retryMigration}>Retry migration</button>
            <button type="button" className="migration-secondary" onClick={signOut}>
              Sign out
            </button>
          </>
        )}
      </section>
    </main>
  );
}

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
  MigrationDateValidationError,
  MigrationSettingConflictError,
  repairMigrationRecordDate,
  type MigrationDateIssue,
  type MigrationPreview,
  type MigrationProgress,
} from '@/db/localMigration';
import { setActiveSyncContext, setActiveSyncUser } from '@/db/syncContext';
import '@/styles/migration.css';

type GateState = 'loading' | 'confirm' | 'migrating' | 'setting-conflict' | 'date-repair' | 'ready' | 'blocked' | 'error';

function totalRecords(preview: MigrationPreview): number {
  return Object.values(preview.counts).reduce((total, count) => total + count, 0);
}

function dateIssueKey(issue: MigrationDateIssue): string {
  return `${issue.store}:${issue.localId ?? 'unknown'}`;
}

export default function LocalDataGate({ children }: { children: ReactNode }) {
  const user = useAtomValue(userAtom);
  const userId = user?.id;
  const [state, setState] = useState<GateState>('loading');
  const [preparedUserId, setPreparedUserId] = useState<string | null>(null);
  const [preview, setPreview] = useState<MigrationPreview | null>(null);
  const [progress, setProgress] = useState<MigrationProgress | null>(null);
  const [confirmedUserId, setConfirmedUserId] = useState<string | null>(null);
  const [settingConflict, setSettingConflict] = useState<MigrationSettingConflictError | null>(null);
  const [settingResolutions, setSettingResolutions] = useState<
    Record<string, {
      choice: 'local' | 'cloud';
      cloudVersion: number | null;
      cloudValue: MigrationSettingConflictError['cloudValue'];
    }>
  >({});
  const [error, setError] = useState('');
  const [dateIssues, setDateIssues] = useState<MigrationDateIssue[]>([]);
  const [dateValues, setDateValues] = useState<Record<string, string>>({});
  const [dateRepairError, setDateRepairError] = useState('');
  const [retry, setRetry] = useState(0);

  function showDateRepair(dateError: MigrationDateValidationError) {
    setDateIssues(dateError.issues);
    setDateValues(Object.fromEntries(
      dateError.issues.map((issue) => [dateIssueKey(issue), '']),
    ));
    setDateRepairError('');
  }

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
        if (loadError instanceof MigrationDateValidationError) {
          showDateRepair(loadError);
          updateState(currentUserId, 'date-repair');
          return;
        }
        if (loadError instanceof MigrationSettingConflictError) {
          setSettingConflict(loadError);
          updateState(currentUserId, 'setting-conflict');
          return;
        }
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

  async function runMigration(resolutions: typeof settingResolutions) {
    if (!userId) return;
    setState('migrating');
    setError('');
    setSettingConflict(null);
    setProgress(null);
    try {
      await migrateLegacyData(userId, true, setProgress, resolutions);
      setActiveSyncContext(userId, await getSyncInstallationId());
      setState('ready');
    } catch (migrationError) {
      if (migrationError instanceof MigrationDateValidationError) {
        showDateRepair(migrationError);
        setState('date-repair');
        return;
      }
      if (migrationError instanceof MigrationSettingConflictError) {
        setSettingConflict(migrationError);
        setState('setting-conflict');
        return;
      }
      setError(migrationError instanceof Error ? migrationError.message : 'Migration failed.');
      setState('error');
    }
  }

  async function beginMigration() {
    if (!userId || confirmedUserId !== userId) return;
    await runMigration(settingResolutions);
  }

  async function resolveSettingConflict(choice: 'local' | 'cloud') {
    if (!userId || !settingConflict) return;
    const resolutions = {
      ...settingResolutions,
      [settingConflict.settingKey]: {
        choice,
        cloudVersion: settingConflict.cloudVersion,
        cloudValue: settingConflict.cloudValue,
      },
    };
    setSettingResolutions(resolutions);
    await runMigration(resolutions);
  }

  async function retryMigration() {
    setError('');
    setState('loading');
    setRetry((value) => value + 1);
  }

  async function saveDateCorrection(issue: MigrationDateIssue) {
    if (!userId || issue.localId === null) return;
    const key = dateIssueKey(issue);
    const date = dateValues[key];
    if (!date) {
      setDateRepairError(`Choose the correct date for ${issue.store} record ${issue.localId}.`);
      return;
    }

    try {
      await repairMigrationRecordDate(userId, issue.store, issue.localId, date);
      setDateIssues((current) => current.filter((item) => dateIssueKey(item) !== key));
      setDateValues((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      setDateRepairError('');
    } catch (repairError) {
      setDateRepairError(repairError instanceof Error ? repairError.message : 'Could not save the corrected date.');
    }
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

        {state === 'setting-conflict' && settingConflict && (
          <>
            <h1>Resolve a settings conflict</h1>
            <p>
              The cloud already has a different value for <strong>{settingConflict.settingKey}</strong>.
              Choose which value should be used across your devices. Choosing the local value replaces
              the current cloud value for this setting; choosing the cloud value keeps the existing
              cloud value and uses it on this device.
            </p>
            <p>Local value: <code>{JSON.stringify(settingConflict.localValue)}</code></p>
            <p>Cloud value: <code>{JSON.stringify(settingConflict.cloudValue)}</code></p>
            <button type="button" onClick={() => void resolveSettingConflict('local')}>
              Use local value
            </button>
            <button type="button" className="migration-secondary" onClick={() => void resolveSettingConflict('cloud')}>
              Keep cloud value
            </button>
            <button type="button" className="migration-secondary" onClick={signOut}>
              Sign out
            </button>
          </>
        )}

        {state === 'date-repair' && (
          <>
            <h1>Correct local dates before migration</h1>
            <p>
              These records require a date to migrate. Use a trustworthy source to choose the correct
              date; the app will not guess or use the creation time. Saving changes only the date on
              the selected local record.
            </p>
            {dateIssues.length > 0 && (
              <ul className="migration-date-issues">
                {dateIssues.map((issue) => {
                  const key = dateIssueKey(issue);
                  const inputId = `migration-date-${key}`;
                  return (
                    <li className="migration-date-issue" key={key}>
                      <p>
                        <strong>{issue.store} record {issue.localId ?? '<unknown>'}</strong>
                        {issue.serialNo !== null ? ` (serial ${issue.serialNo})` : ''}
                        {issue.name ? ` — ${issue.name}` : ''}
                      </p>
                      <p>Current date value: <code>{issue.value}</code></p>
                      {issue.localId !== null && (
                        <>
                          <label htmlFor={inputId}>Correct date</label>
                          <input
                            id={inputId}
                            type="date"
                            value={dateValues[key] ?? ''}
                            onChange={(event) => setDateValues((current) => ({
                              ...current,
                              [key]: event.target.value,
                            }))}
                          />
                          <button
                            type="button"
                            disabled={!dateValues[key]}
                            onClick={() => void saveDateCorrection(issue)}
                          >
                            Save this date
                          </button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {dateRepairError && <p role="alert">{dateRepairError}</p>}
            {dateIssues.length === 0 && (
              <button type="button" onClick={() => void runMigration(settingResolutions)}>
                Retry migration
              </button>
            )}
            <button type="button" className="migration-secondary" onClick={signOut}>
              Sign out
            </button>
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

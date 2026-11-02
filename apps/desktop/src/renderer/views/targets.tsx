import { useEffect, useState } from 'preact/hooks';
import type { BrowserStatus, Target } from '../../shared/api-types.js';
import { errorMessage } from '../api.js';
import type { ViewProps } from '../app.js';
import { ErrorText, Notice, ViewHeading } from '../components/common.js';
import { navigate } from '../router.js';

export function BrowserMissingNotice({ status }: { status?: BrowserStatus }) {
  if (!status || status.installed) return null;
  return (
    <Notice title="A browser is needed to scan websites" tone="warning">
      <p>
        Website scans run in a separate copy of Chromium that Playwright manages. It is not
        installed yet. Go to <a href="#/settings">Settings</a> to download it (about 170 MB) or to
        use one that is already on this computer. Repo folder scans of source files work without it.
      </p>
    </Notice>
  );
}

export function TargetsView({ api, announce, refreshScans }: ViewProps) {
  const [targets, setTargets] = useState<Target[]>([]);
  const [browser, setBrowser] = useState<BrowserStatus>();
  const [url, setUrl] = useState('');
  const [folder, setFolder] = useState('');
  const [urlError, setUrlError] = useState<string>();
  const [folderError, setFolderError] = useState<string>();
  const [listError, setListError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setTargets(await api.targets.list());
    } catch (err) {
      setListError(errorMessage(err));
    }
  };

  useEffect(() => {
    void load();
    api.browsers
      .status()
      .then(setBrowser)
      .catch(() => undefined);
  }, [api]);

  const addUrl = async (event: Event) => {
    event.preventDefault();
    setUrlError(undefined);
    if (!url.trim()) {
      setUrlError('Enter a web address, for example https://example.com/.');
      document.getElementById('target-url')?.focus();
      return;
    }
    try {
      const target = await api.targets.add({ kind: 'url', value: url });
      setUrl('');
      await load();
      announce(`Added ${target.label}.`);
    } catch (err) {
      setUrlError(errorMessage(err));
      document.getElementById('target-url')?.focus();
    }
  };

  const chooseFolder = async () => {
    setFolderError(undefined);
    try {
      const picked = await api.targets.pickFolder();
      if (picked) setFolder(picked);
    } catch (err) {
      setFolderError(errorMessage(err));
    }
  };

  const addFolder = async (event: Event) => {
    event.preventDefault();
    setFolderError(undefined);
    if (!folder.trim()) {
      setFolderError('Choose a folder first, or type its full path.');
      document.getElementById('target-folder')?.focus();
      return;
    }
    try {
      const target = await api.targets.add({ kind: 'repo', value: folder });
      setFolder('');
      await load();
      announce(`Added ${target.label}.`);
    } catch (err) {
      setFolderError(errorMessage(err));
      document.getElementById('target-folder')?.focus();
    }
  };

  const remove = async (target: Target) => {
    setListError(undefined);
    try {
      await api.targets.remove(target.id);
      await load();
      announce(`Removed ${target.label}.`);
      document.getElementById('view-heading')?.focus();
    } catch (err) {
      setListError(errorMessage(err));
    }
  };

  const startScan = async (ids: string[]) => {
    setListError(undefined);
    setBusy(true);
    try {
      const started = await api.scans.start(ids);
      await refreshScans();
      announce(`Started ${started.length} ${started.length === 1 ? 'scan' : 'scans'}.`);
      navigate({ view: 'scans' });
    } catch (err) {
      setListError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ViewHeading>Targets</ViewHeading>
      <p class="lead">
        Add the websites and source repo folders you want to check, then scan them. Scans run on
        this computer.
      </p>
      <BrowserMissingNotice status={browser} />

      <div class="grid-2">
        <form class="card" onSubmit={addUrl} noValidate aria-labelledby="add-url-heading">
          <h2 id="add-url-heading">Add a website</h2>
          <div class="field">
            <label for="target-url">Web address</label>
            <input
              id="target-url"
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder="https://example.com/"
              value={url}
              onInput={(e) => setUrl((e.currentTarget as HTMLInputElement).value)}
              aria-describedby="target-url-hint target-url-error"
              aria-invalid={urlError ? 'true' : undefined}
            />
            <p class="hint" id="target-url-hint">
              Only pages you list are scanned (plus same-site links if crawling is on in Settings).
            </p>
            <ErrorText id="target-url-error" message={urlError} />
          </div>
          <button type="submit" class="button primary">
            Add website
          </button>
        </form>

        <form class="card" onSubmit={addFolder} noValidate aria-labelledby="add-folder-heading">
          <h2 id="add-folder-heading">Add a source repo folder</h2>
          <div class="field">
            <label for="target-folder">Folder</label>
            <div class="input-row">
              <input
                id="target-folder"
                type="text"
                spellcheck={false}
                autoComplete="off"
                placeholder="/path/to/your/project"
                value={folder}
                onInput={(e) => setFolder((e.currentTarget as HTMLInputElement).value)}
                aria-describedby="target-folder-hint target-folder-error"
                aria-invalid={folderError ? 'true' : undefined}
              />
              <button type="button" class="button" onClick={chooseFolder}>
                Choose folder
              </button>
            </div>
            <p class="hint" id="target-folder-hint">
              Source files are read, never run. Built Storybooks are scanned too.
            </p>
            <ErrorText id="target-folder-error" message={folderError} />
          </div>
          <button type="submit" class="button primary">
            Add folder
          </button>
        </form>
      </div>

      <section aria-labelledby="target-list-heading">
        <div class="section-head">
          <h2 id="target-list-heading">{`Your targets (${targets.length})`}</h2>
          {targets.length > 1 ? (
            <button
              type="button"
              class="button"
              disabled={busy}
              onClick={() => startScan(targets.map((t) => t.id))}
            >
              Scan all targets
            </button>
          ) : null}
        </div>
        <ErrorText message={listError} />
        {targets.length === 0 ? (
          <p>No targets yet. Add a website or a folder above.</p>
        ) : (
          <ul class="item-list">
            {targets.map((t) => (
              <li key={t.id} class="item">
                <div class="item-main">
                  <p class="item-title">{t.label}</p>
                  <p class="item-meta">
                    <span class="tag">{t.kind === 'url' ? 'Website' : 'Repo folder'}</span>{' '}
                    <span class="mono break">{t.value}</span>
                  </p>
                </div>
                <div class="item-actions">
                  <button
                    type="button"
                    class="button primary"
                    disabled={busy}
                    onClick={() => startScan([t.id])}
                  >
                    Scan<span class="visually-hidden"> {t.label}</span>
                  </button>
                  <button type="button" class="button" onClick={() => remove(t)}>
                    Remove<span class="visually-hidden"> {t.label}</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

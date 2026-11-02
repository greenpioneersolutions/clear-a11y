import { useEffect, useState } from 'preact/hooks';
import type {
  AiSettings,
  AppInfo,
  BrowserInstallProgress,
  BrowserStatus,
  EnvVarStatus,
  ProviderId,
  ProviderInfo,
  ProviderTestResult,
  Settings,
} from '../../shared/api-types.js';
import { errorMessage } from '../api.js';
import type { ViewProps } from '../app.js';
import { Disclosure, ErrorText, ViewHeading } from '../components/common.js';

function BrowserSection({ api, announce }: Pick<ViewProps, 'api' | 'announce'>) {
  const [status, setStatus] = useState<BrowserStatus>();
  const [progress, setProgress] = useState<BrowserInstallProgress>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    api.browsers
      .status()
      .then(setStatus)
      .catch((err) => setError(errorMessage(err)));
    return api.browsers.onProgress((p) => {
      setProgress(p);
      if (p.phase === 'error') setError(p.message);
    });
  }, [api]);

  const install = async () => {
    setError(undefined);
    setProgress({ phase: 'starting', percent: 0, message: 'Starting the browser download.' });
    announce('Downloading the browser. This can take a few minutes.');
    try {
      const next = await api.browsers.install();
      setStatus(next);
      announce('The browser is installed. You can scan websites now.');
    } catch (err) {
      setError(errorMessage(err));
      announce('The browser download failed.');
    }
  };

  const useFolder = async () => {
    setError(undefined);
    try {
      const next = await api.browsers.useFolder();
      setStatus(next);
      if (next.restartRequired) announce('Folder saved. Restart Clear A11Y to use it.');
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const installing =
    progress && (progress.phase === 'starting' || progress.phase === 'downloading');

  return (
    <section class="card" aria-labelledby="browser-heading">
      <h2 id="browser-heading">Browser for scanning</h2>
      {status?.installed ? (
        <p>
          <span class="tag status-succeeded">Installed</span> Website scans use Playwright&apos;s
          Chromium at <span class="mono break">{status.executablePath}</span>.
        </p>
      ) : (
        <>
          <p>
            <span class="tag status-failed">Not installed</span> Website scans need their own copy
            of Chromium, separate from any browser you use.
          </p>
          <p>
            <strong>What happens if you choose Install browser:</strong> Playwright downloads
            Chromium (about 170 MB) from its download servers (cdn.playwright.dev, with
            playwright.download.prss.microsoft.com as a fallback) and saves it in Playwright&apos;s
            browsers folder on this computer (for example{' '}
            <span class="mono break">~/Library/Caches/ms-playwright</span> on macOS,{' '}
            <span class="mono break">%LOCALAPPDATA%\ms-playwright</span> on Windows,{' '}
            <span class="mono break">~/.cache/ms-playwright</span> on Linux). Nothing else is
            downloaded and nothing is sent about you or your sites.
          </p>
        </>
      )}
      {status?.browsersPath ? (
        <p>
          Browsers folder: <span class="mono break">{status.browsersPath}</span>
          {status.restartRequired ? ' (used after you restart the app)' : ''}
        </p>
      ) : null}
      {progress && progress.phase !== 'error' ? (
        <div class="progress-row">
          <label for="browser-progress">Download</label>
          {progress.percent === undefined ? (
            <progress id="browser-progress" aria-describedby="browser-progress-text" />
          ) : (
            <progress
              id="browser-progress"
              max={100}
              value={progress.percent}
              aria-describedby="browser-progress-text"
            />
          )}
          <span id="browser-progress-text">{progress.message}</span>
        </div>
      ) : null}
      <ErrorText message={error} />
      <div class="button-row">
        {!status?.installed ? (
          <button
            type="button"
            class="button primary"
            disabled={Boolean(installing)}
            onClick={install}
          >
            Install browser
          </button>
        ) : null}
        <button type="button" class="button" onClick={useFolder}>
          Use an existing browser folder
        </button>
      </div>
    </section>
  );
}

function ProviderSection({ api, announce }: Pick<ViewProps, 'api' | 'announce'>) {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [ai, setAi] = useState<AiSettings>({ provider: 'none' });
  const [env, setEnv] = useState<EnvVarStatus[]>([]);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState<string>();
  const [test, setTest] = useState<ProviderTestResult>();
  const [testing, setTesting] = useState(false);

  const info = providers.find((p) => p.id === ai.provider);
  const keyEnv = ai.apiKeyEnv || info?.defaultKeyEnv;

  const refreshEnv = async (next: AiSettings, list: ProviderInfo[]) => {
    const names = new Set<string>();
    if (next.apiKeyEnv) names.add(next.apiKeyEnv);
    for (const p of list) if (p.defaultKeyEnv) names.add(p.defaultKeyEnv);
    try {
      setEnv(await api.providers.envStatus([...names]));
    } catch {
      setEnv([]);
    }
  };

  useEffect(() => {
    Promise.all([api.providers.list(), api.settings.get()])
      .then(async ([list, settings]) => {
        setProviders(list);
        setAi(settings.ai);
        await refreshEnv(settings.ai, list);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [api]);

  const update = (patch: Partial<AiSettings>) => {
    setSaved(undefined);
    setTest(undefined);
    setAi((cur) => ({ ...cur, ...patch }));
  };

  const save = async (event: Event) => {
    event.preventDefault();
    setError(undefined);
    setSaved(undefined);
    const clean: AiSettings = { provider: ai.provider };
    if (ai.provider !== 'none') {
      if (ai.model?.trim()) clean.model = ai.model.trim();
      if (ai.apiKeyEnv?.trim()) clean.apiKeyEnv = ai.apiKeyEnv.trim();
      if (ai.baseUrl?.trim()) clean.baseUrl = ai.baseUrl.trim();
    }
    try {
      const next = await api.settings.set({ ai: clean });
      setAi(next.ai);
      await refreshEnv(next.ai, providers);
      setSaved('Provider settings saved.');
      announce('Provider settings saved.');
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const runTest = async () => {
    setTesting(true);
    setTest(undefined);
    try {
      const result = await api.providers.test();
      setTest(result);
      announce(result.message);
    } catch (err) {
      setTest({ ok: false, message: errorMessage(err) });
    } finally {
      setTesting(false);
    }
  };

  const keySet = env.find((e) => e.name === keyEnv)?.set;

  return (
    <form class="card" onSubmit={save} noValidate aria-labelledby="provider-heading">
      <h2 id="provider-heading">AI provider</h2>
      <p>
        AI judges are optional. With <strong>None</strong> nothing leaves this computer. Bring your
        own model with an API key, cloud credentials or a local Ollama model. Consumer chat
        subscription logins are not supported.
      </p>
      <div class="field">
        <label for="provider">Provider</label>
        <select
          id="provider"
          value={ai.provider}
          aria-describedby="provider-description"
          onChange={(e) =>
            update({ provider: (e.currentTarget as HTMLSelectElement).value as ProviderId })
          }
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <p class="hint" id="provider-description">
          {info?.description || null}
        </p>
      </div>
      {ai.provider !== 'none' ? (
        <>
          <div class="field">
            <label for="model">Model{info?.needsModel ? ' (required)' : ' (optional)'}</label>
            <input
              id="model"
              type="text"
              spellcheck={false}
              autoComplete="off"
              value={ai.model ?? ''}
              onInput={(e) => update({ model: (e.currentTarget as HTMLInputElement).value })}
            />
          </div>
          {info?.defaultKeyEnv ? (
            <div class="field">
              <label for="key-env">API key environment variable</label>
              <input
                id="key-env"
                type="text"
                spellcheck={false}
                autoComplete="off"
                placeholder={info.defaultKeyEnv}
                value={ai.apiKeyEnv ?? ''}
                aria-describedby="key-env-hint"
                onInput={(e) => update({ apiKeyEnv: (e.currentTarget as HTMLInputElement).value })}
              />
              <p class="hint" id="key-env-hint">
                The name of the variable, not the key. Leave empty to use {info.defaultKeyEnv}. The
                app never stores or shows keys: set the variable before you start the app.
              </p>
            </div>
          ) : null}
          {info?.needsBaseUrl || ai.provider === 'ollama' ? (
            <div class="field">
              <label for="base-url">
                Base URL{info?.needsBaseUrl ? ' (required)' : ' (optional)'}
              </label>
              <input
                id="base-url"
                type="url"
                spellcheck={false}
                autoComplete="off"
                placeholder={ai.provider === 'ollama' ? 'http://127.0.0.1:11434' : 'https://'}
                value={ai.baseUrl ?? ''}
                onInput={(e) => update({ baseUrl: (e.currentTarget as HTMLInputElement).value })}
              />
            </div>
          ) : null}
          {keyEnv ? (
            <p class="env-status">
              <span class="mono">{keyEnv}</span> is <strong>{keySet ? 'set' : 'not set'}</strong> in
              the app&apos;s environment.
            </p>
          ) : null}
        </>
      ) : null}
      <Disclosure id="env-list" class="env-details" summary="Which API key variables are set">
        <ul class="env-list">
          {env.map((e) => (
            <li key={e.name}>
              <span class="mono">{e.name}</span>: {e.set ? 'set' : 'not set'}
            </li>
          ))}
        </ul>
      </Disclosure>
      <ErrorText message={error} />
      <p role="status" class="ok-text">
        {saved || null}
      </p>
      <div class="button-row">
        <button type="submit" class="button primary">
          Save provider
        </button>
        <button type="button" class="button" disabled={testing} onClick={runTest}>
          {testing ? 'Testing connection' : 'Test connection'}
        </button>
      </div>
      <p role="status" class={test ? (test.ok ? 'ok-text' : 'error') : 'ok-text'}>
        {test ? test.message : null}
      </p>
    </form>
  );
}

function ScanOptionsSection({ api, announce }: Pick<ViewProps, 'api' | 'announce'>) {
  const [settings, setSettings] = useState<Settings>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    api.settings
      .get()
      .then(setSettings)
      .catch((err) => setError(errorMessage(err)));
  }, [api]);

  const save = async (patch: Partial<Settings['scan']>) => {
    setError(undefined);
    try {
      const next = await api.settings.set({ scan: patch });
      setSettings(next);
      announce('Scan options saved.');
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  if (!settings) return <ErrorText message={error} />;
  return (
    <section class="card" aria-labelledby="scan-options-heading">
      <h2 id="scan-options-heading">Scan options</h2>
      <div class="field checkbox">
        <input
          id="crawl"
          type="checkbox"
          checked={settings.scan.crawl}
          onChange={(e) => save({ crawl: (e.currentTarget as HTMLInputElement).checked })}
        />
        <label for="crawl">Also scan same-site pages linked from each website</label>
      </div>
      <div class="field">
        <label for="max-pages">Most pages per website scan</label>
        <input
          id="max-pages"
          type="number"
          min={1}
          max={200}
          value={settings.scan.maxPages}
          onChange={(e) => {
            const n = Number((e.currentTarget as HTMLInputElement).value);
            if (Number.isInteger(n) && n >= 1 && n <= 200) void save({ maxPages: n });
            else setError('Enter a whole number from 1 to 200.');
          }}
        />
      </div>
      <ErrorText message={error} />
    </section>
  );
}

function CalibrationSection({ api, announce }: Pick<ViewProps, 'api' | 'announce'>) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string>();
  const exportAnswers = async () => {
    setError(undefined);
    try {
      const res = await api.review.export();
      const text = res.saved
        ? `Saved ${res.count} ${res.count === 1 ? 'answer' : 'answers'} to ${res.path}.`
        : 'Export cancelled.';
      setMessage(text);
      announce(text);
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <section class="card" aria-labelledby="calibration-heading">
      <h2 id="calibration-heading">Review answers</h2>
      <p>
        Your yes/no answers are calibration data: they help measure how often each check is right.
        They stay on this computer unless you export them yourself.
      </p>
      <button type="button" class="button" onClick={exportAnswers}>
        Export answers as JSON
      </button>
      <p role="status" class="ok-text">
        {message}
      </p>
      <ErrorText message={error} />
    </section>
  );
}

function AboutSection({ api }: Pick<ViewProps, 'api'>) {
  const [info, setInfo] = useState<AppInfo>();
  useEffect(() => {
    api.app
      .info()
      .then(setInfo)
      .catch(() => undefined);
  }, [api]);
  if (!info) return null;
  return (
    <section class="card" aria-labelledby="about-heading">
      <h2 id="about-heading">About</h2>
      <dl class="facts">
        <dt>Version</dt>
        <dd>{info.version}</dd>
        <dt>Scan history</dt>
        <dd>
          {info.storage === 'sqlite'
            ? 'Saved in a SQLite database'
            : 'Kept only until you quit (SQLite is not available)'}
        </dd>
        <dt>Data folder</dt>
        <dd class="mono break">{info.dataDir}</dd>
        <dt>Runtime</dt>
        <dd>
          Node {info.nodeVersion}
          {info.electronVersion ? `, Electron ${info.electronVersion}` : ''}
        </dd>
      </dl>
    </section>
  );
}

export function SettingsView({ api, announce }: ViewProps) {
  return (
    <>
      <ViewHeading>Settings</ViewHeading>
      <div class="stack">
        <BrowserSection api={api} announce={announce} />
        <ProviderSection api={api} announce={announce} />
        <ScanOptionsSection api={api} announce={announce} />
        <CalibrationSection api={api} announce={announce} />
        <AboutSection api={api} />
      </div>
    </>
  );
}

# The desktop app

Clear A11Y desktop is an Electron app for people who would rather not use a terminal. It runs the same engines as the CLI, on your own computer, and shows the results in an accessible interface. Developer details (build, security model, data formats, tests) are in [`apps/desktop/README.md`](../apps/desktop/README.md).

## Get started

```sh
pnpm install
pnpm nx run desktop:fetch-electron   # once: downloads the Electron binary
pnpm nx run desktop:start
```

`pnpm install` never downloads Electron, so the repo stays installable offline. `fetch-electron` is the one step that does (from Electron's GitHub releases).

The first time you scan a website, the app needs Playwright's Chromium. Settings explains what will be downloaded (about 170 MB) and where it is saved, and only downloads it when you press **Install browser**. Offline, choose **Use an existing browser folder** instead. Scanning a repo folder's source files works without it.

## Using it

1. **Targets.** Add a web address (`https://...`) or a source repo folder. Only what you list is scanned; turn on crawling in Settings to include same-site links.
2. **Scans.** Press **Scan** next to a target, or **Scan all targets**. Scans run one at a time with a progress bar; **Cancel** stops one between pages. Finished scans stay listed.
3. **Report.** Findings grouped by tier:
   - **Violation**: measured in code, high certainty.
   - **Likely issue**: a strong signal with a small chance of being wrong.
   - **Needs review**: a person has to decide.
     Open a finding to see the WCAG criterion, the element, the page, how to fix it and a screenshot. **Show the full HTML report** shows the same report the CLI writes.
4. **Focus path.** Where keyboard focus goes when you press Tab: numbered stops, with backward jumps drawn red, dashed and labelled, followed by the same path as a list.
5. **Review questions.** Answer each `needs-review` question with Yes, No or Skip (Alt+Shift+Y, Alt+Shift+N, Alt+Shift+S), with an optional note. Answers are saved on your computer as calibration data. They help measure how often each check is right; they never change a finding by themselves and are never sent anywhere. Export them from Settings as JSON.
6. **Settings.** The AI provider is **None** by default: nothing leaves your computer. To use AI judges, choose Anthropic, OpenAI, Azure OpenAI or a local Ollama model and enter the **name** of the environment variable that holds your API key. The app never stores keys and never shows them; it only tells you whether the variable is set. Consumer chat subscription logins are not supported (see [providers.md](providers.md)).

Ctrl+1 to Ctrl+6 (Cmd on macOS) open the six pages from anywhere.

## Your data

Everything stays in the app's data folder (on macOS `~/Library/Application Support/Clear A11Y`): your targets, settings, scan results and review answers. Scanned pages open in a separate Playwright browser, never inside the app window.

## Accessibility

The app's own interface is scanned with Clear A11Y in CI and must have zero findings: landmarks, one heading per page, focus moved to the page heading on navigation and announced, visible focus, AA contrast in light and dark, reduced motion, and a layout that works at 320 CSS px.

# Security Policy

## Reporting a vulnerability

**Please do not report security vulnerabilities in public issues, discussions or pull requests.**

Report them privately through GitHub's private vulnerability reporting:

1. Go to the repository's **Security** tab.
2. Choose **Report a vulnerability**.
3. Describe the problem, how to reproduce it, and what an attacker could do with it.

Only the maintainers can see the report. We'll work with you on a fix in a private advisory and credit you when it's published, unless you'd rather stay anonymous.

## What's in scope

Clear A11Y loads untrusted web pages and source repositories, and can send content to AI models you configure. We especially want to hear about:

- **Prompt injection**: page or repo content that steers an AI judge's verdict, hides a real barrier, or makes the tool take actions it shouldn't. Page content must always be treated as data, never as instructions.
- **Path traversal or file disclosure** in the local fixture server, report server or any other server we ship.
- **Server-side request forgery** in the API server: making it fetch internal or unintended addresses.
- **Credential leakage**: API keys, provider credentials or browser auth state written to reports, logs, screenshots, artifacts or telemetry, or sent to the wrong provider.
- **Data sent where it shouldn't go**: screenshots or DOM sent to a remote model the user did not configure.
- **Sandbox escapes** while scanning: a scanned page or repo running code on the host outside the browser or app sandbox.
- **Supply-chain issues** in our build, release or GitHub Actions workflows.

Accessibility barriers in the sites you scan are not security issues; please use the regular issue forms for false positives and missed issues.

## Supported versions

Clear A11Y is pre-1.0. Only the latest release receives security fixes.

| Version      | Supported |
| ------------ | --------- |
| latest (0.x) | Yes       |
| older 0.x    | No        |

## What to expect

These are targets for a volunteer-run project, not guarantees:

- **Acknowledgement** within 3 business days.
- **Initial assessment** (confirmed or not, and severity) within 10 business days.
- **Fix or mitigation** for confirmed high or critical issues within 30 days, or a clear explanation of the timeline if it takes longer.

We'll keep you updated as we go and agree on a disclosure date with you.

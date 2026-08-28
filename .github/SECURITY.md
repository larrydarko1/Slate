# Security Policy

## Security Architecture

Slate is a **local-first desktop application** for macOS and Linux with a fully offline architecture:

- ✅ **No server-side code** — no backend, no accounts, no sign-in, no attack surface behind an API
- ✅ **No network requests** — no data transmission, no telemetry, no tracking, no auto-update
- ✅ **Local-only storage** — spreadsheets are `.slate` files (versioned JSON) saved wherever you choose, written atomically (write to `.tmp`, then `rename`) so a crash mid-save cannot truncate a document you already had
- ✅ **Electron hardening** — `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, and a narrow typed preload bridge whose every channel is a string literal
- ✅ **Content Security Policy** — `default-src 'self'` with no `unsafe-eval`; `media-src`, `worker-src`, `frame-src`, `object-src`, `base-uri` and `form-action` all denied. The only relaxation is `style-src 'unsafe-inline'`, which Vue's `:style` bindings require for per-render canvas transforms and cell formatting
- ✅ **No JavaScript evaluation** — the formula engine has its own tokenizer, parser and evaluator ([src/renderer/composables/spreadsheet/engine/](../src/renderer/composables/spreadsheet/engine/)), so a formula in a `.slate` file is never handed to the JavaScript one
- ✅ **Navigation containment** — `window.open` is denied outright and off-origin navigation is cancelled; both are re-routed to the system browser
- ✅ **Scheme-guarded external URLs** — `shell.openExternal` is reached through one function that admits `http:` and `https:` only, so a cell that looks like a link cannot hand the OS a `file:` or `smb:` URL
- ✅ **Deny-all permissions** — both the request and the check handler refuse every web permission at the session level, so the packaged `file://` build and the dev `http://localhost` build answer identically
- ✅ **Input validation** — every IPC argument arrives as `unknown` and is parsed against a Zod schema in the main process before use ([src/schemas/](../src/schemas/))
- ✅ **Path containment** — the file channels accept only paths that end in `.slate`, contain no `..` segment, and end in a plain filename; content is capped at 50 MB
- ✅ **Enforced in CI** — the invariants above are not conventions. [check-electron-security.mjs](../scripts/check/check-electron-security.mjs) asserts the process model, the navigation and permission handlers, the `openExternal` guard and the absence of unescaped HTML sinks; [check-ipc-standards.mjs](../scripts/check/check-ipc-standards.mjs) proves the channel-ownership table is still true. Both run on every push
- ✅ **Open source** — fully auditable code

## Data Privacy

Slate has no application data directory and no database. Your spreadsheets live only where you save
them, as `.slate` files you can read, move, back up or delete with any file manager.

The one thing Slate writes on its own is a rotating diagnostic log, capped at 1 MB with a single
backup:

- **macOS:** `~/Library/Logs/Slate/main.log`
- **Linux:** `~/.config/Slate/logs/main.log`

Your spreadsheet contents, formulas and charts never leave your device.

## Reporting a Vulnerability

**Do not open a public issue.** Slate has no auto-update — installed copies stay on whatever version
the user downloaded until they choose to replace it. A public report is therefore a working
disclosure against every existing install, and unlike a web app there is no way to push the fix out.

Email the maintainer at <hello@larrydarko.dev> instead. Private reporting on GitHub is not enabled,
so email is the only private channel — reports sent any other way risk being public.

Please include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if applicable)

Expect an acknowledgement within a week. Slate is maintained by one person, so a fix timeline
depends on severity; you will be told which release carries the fix, and credited in it unless you
ask not to be.

## Scope

**A `.slate` file is untrusted input.** People share spreadsheets, and Slate opens them by
double-click via the OS file association. Anything a crafted `.slate` file can do beyond putting
values on a canvas is in scope — that is the primary threat model here.

In scope:

- Preload bridge escapes, or any way for renderer content to reach `require`, Node, or an IPC
  channel the bridge does not expose
- Renderer code execution, including CSP bypass and any path from cell, chart, text-box or table
  content to script execution
- Escaping the formula engine's evaluator into JavaScript execution, or a formula that hangs the
  app (ReDoS, unbounded recursion) rather than returning an error
- IPC handlers acting on input that skipped or defeated its Zod schema
- Reading or writing a file outside what the user selected in a dialog — path traversal through the
  `file:read` / `file:write` channels, or a filename that defeats the plain-name check
- Getting `shell.openExternal` to launch a non-`http(s)` URL
- Any navigation that lands the app window on a remote origin with the preload attached

Out of scope: findings that require an attacker to already have the user's filesystem or OS account.
`.slate` files are plain JSON under the user's own permissions by design, so "another local process
can read a spreadsheet" is the threat model working as intended, not a vulnerability. Slate has no
accounts and no encryption-at-rest, and does not claim either.

Also out of scope: the missing code-signing certificate. Releases are unsigned, the OS warning on
first launch is expected, and the workaround is documented on the release page.

Dependency advisories with no reachable path in Slate's code are tracked in the audit gate's
allowlist ([scripts/check/check-audit.mjs](../scripts/check/check-audit.mjs)) rather than reported
as vulnerabilities. Each entry carries the reason it cannot be fixed here, and CI fails once the
advisory stops being reported — upstream shipped a fix, so the waiver has to go.

## Supported Versions

Security issues are fixed in the latest release only. There are no backports — upgrade is the
remediation path.

## Security Best Practices for Users

- Keep the app updated to the latest version — nothing will prompt you, so check the releases page
- Only download Slate from the official releases page
- Treat a `.slate` file from someone you do not trust the way you would treat any other document
  from that source
- Back up spreadsheets that matter; Slate keeps no version history of its own
- Use OS-level disk encryption if your spreadsheets are sensitive

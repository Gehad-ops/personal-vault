# Sign-up capture and speed upgrade: architecture

## Extension

- `content/form-classifier.js` classifies login, register, change-password, reset and multi-step forms.
- `content/signup-capture.js` wires submit/click and SPA navigation events to pending snapshots.
- `content/signup-generator.js` generates locally from `passwordrules`/`minlength`/`maxlength`/`pattern` using `crypto.getRandomValues` and rejection sampling.
- `content/signup-alias.js`, `content/signup-username.js` provide plus-address/catch-all aliases and username/email suggestions.
- `content/banner.js`, `content/pwgen.js` and `content/ui.js` render the isolated save prompt, generator and banners.
- `background/pending.js` stores pending snapshots in `browser.storage.session` (10-minute TTL, frame-aware, cleared on save/tab close/database lock).
- `background/network.js`, `event.js` decide success/failure and show the save prompt only after a successful outcome.
- `background/keepass.js`, `client.js` own the encrypted native-messaging protocol and desktop actions.
- `popups/` is the redesigned popup, including cached entries, site card, fills and generate-password action.
- `options/` exposes basics, security, advanced, alias, sign-up and username settings.

## Desktop

- `src/gui/EntryPreviewWidget.*` contains the entry details panel and the **Autofill in browser** / **Edit entry** actions.
- `src/browser/BrowserService.*` broadcasts an `autofill-entry` request containing only entry UUID, URL and username.
- The extension resolves the active tab, checks the registrable domain, retrieves the matching credential over the encrypted native channel and sends it to the content script.
- `src/gui/DatabaseWidget.*` owns the left database switcher, right-side preview and separate Add Entry dialog.
- `src/gui/entry/EntryModel.*` and `EntryView.*` add the category column and badge delegate.
- `src/gui/MainWindow.*` adds first-run onboarding and keeps the database sidebar synchronized.
- `src/gui/styles/dark/*` carries the teal design tokens.

## Security boundaries

- No password is sent in the desktop broadcast; the extension retrieves it through its authenticated native connection.
- Autofill requires a matching registrable domain and only uses the active tab.
- Pending secrets never enter `localStorage`, `chrome.storage.sync` or logs.
- Save-prompt approvals require trusted user input.

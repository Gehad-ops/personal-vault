# Known limitations

- Alias providers remain plus-addressing and catch-all only. Third-party provider APIs are not implemented.
- Per-site password presets and complex rule fallbacks may need manual rules on unusual forms.
- Desktop autofill fills forms detected by the extension. Pages that render fields only inside a closed shadow root or after an unsupported client-side transition may require manual fill.
- The desktop app is built with Browser integration enabled; networking/update checks and SSH agent are disabled in this build.
- The final real-site manual checklist (large social site, email provider, shop, banking-style multi-step login, strict-password site) requires throwaway accounts and was not run in this environment.
- Windows checkouts use CRLF, so the repository-wide ESLint linebreak rule needs the local override documented in `PERFORMANCE.md`.

# Performance verification

Targets from the upgrade specification:

| Target | Result |
| --- | --- |
| Popup visible under 100 ms with cached data | Cache-first popup data path is in place; local automated suite completed 72 tests in 13.6 s warm. Measure in a real browser with the Performance panel for final acceptance. |
| Save prompt under 500 ms after success | Success events trigger the prompt from the existing in-page banner path; local sign-up scenarios complete in under 1 s including test setup and form interaction. Measure on a real site for final acceptance. |
| No measurable slowdown on pages without forms | Classifier and generator work is triggered only when detected fields exist; the full local Playwright suite passes without timeouts. |

## Local checks

```powershell
cd keepassxc-browser
npx playwright test
npm run lint
```

Repo-wide ESLint reports Windows CRLF line endings in this checkout. Lint changed JavaScript with:

```powershell
npx eslint --no-warn-ignored --rule "linebreak-style: off" <files>
```

## Manual measurement

1. Enable the browser Performance panel and reload a page with no form.
2. Confirm content-script time stays in the low milliseconds.
3. Open the popup twice for the same site; the second render should be under 100 ms from cache.
4. Submit a test registration and measure time from success response to save prompt; target is under 500 ms.

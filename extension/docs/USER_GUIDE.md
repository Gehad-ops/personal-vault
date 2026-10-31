# New sign-up, alias and autofill guide

## Save prompt

After you submit a registration, password-change or reset form, the extension waits for a successful outcome. On success it shows an editable card with the site, username/email, password, reveal control, strength meter and generate button.

- **Save** stores the entry in the configured group.
- **Save and edit** opens the desktop entry editor.
- If the site reports an error, no save prompt appears.
- The prompt is isolated from the page, so page scripts cannot read or approve it.

Enable or disable detection under **Settings → Sign-up detection**.

## Generated usernames and emails

Registration forms can receive suggested usernames and emails. The suggestion panel can fill both fields and uses a random numeric suffix when the base name is taken.

Plus-addressing aliases use `you+site@example.com`. Catch-all aliases use your configured catch-all domain. No third-party alias service or API key is used.

## Rule-aware passwords

When a form declares `passwordrules`, length limits, a pattern or visible password rules, the extension generates a password locally that satisfies them. Otherwise it keeps using the desktop generator.

## Autofill from the desktop app

Select an entry, then choose **Autofill in browser** in the right-hand details pane or click **Edit entry** to change it first.

The desktop sends only the entry UUID, URL and username to the extension. The extension verifies the active tab's registrable domain, retrieves the matching credential over the encrypted native channel and fills the detected form. If the active tab does not match the entry domain, nothing is filled.

## Settings worth knowing

- Basics: auto-retrieve credentials, auto-fill single entry, auto-submit.
- Security: sign-up detection, auto-save, generate on save, alias domain/provider.
- Advanced: per-site rules, custom login fields, database lock behavior.

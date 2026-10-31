# Personal Vault

A local personal vault for:

- **Passwords** — login, website, password, notes, tags
- **Passkeys** — stored as secure records (relying party, username, credential ID, private key/notes)
- **TOTP** — Base32 secret with live 6-digit code and countdown
- **Cards** — cardholder, number, expiry, CVV, notes

## Run

Double-click **`Start Personal Vault.bat`**.

It starts a local-only web server at `http://127.0.0.1:8765/` and opens your browser. Close the console window to stop it.

## Security

- The vault is encrypted with **AES-256-GCM**.
- The key is derived from your master password with **PBKDF2-SHA256 (210,000 iterations)** and a random salt.
- Only the encrypted blob is stored in the browser's local storage for `127.0.0.1`.
- Secrets are held in memory only while unlocked; **Lock** discards the key.
- Auto-lock defaults to 5 minutes and resets on activity.
- Clipboard is cleared after 10 seconds where the browser allows it.
- Use **Settings → Export encrypted vault** for backups.

## Limits

- Passkeys cannot be used for actual WebAuthn login here; they are stored records. Functional passkeys would need an authenticator/native host.
- Data is stored per browser profile. Use the same browser for the same vault.
- Serve it with the included launcher; opening `index.html` directly can disable Web Crypto on some browsers.

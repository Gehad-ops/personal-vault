# Extension test page

A local page for testing the Personal Vault browser extension. It never sends
credentials anywhere; forms are intercepted and written to an on-page log.

## 1. Start Personal Vault

Run the build the extension should talk to, then unlock the vault:

```powershell
<repo>\desktop\build-mingw\src\personalvault\PersonalVault.exe
```

Starting the app installs/updates the native-messaging manifests. They point at
the `keepassxc-proxy.exe` next to that build. If you move or delete the build,
start the app again from the new location before using the extension.

## 2. Install the extension

Use the unpacked extension folder, not a zip:

`extension\keepassxc-browser`

### Chrome / Chromium / Brave / Edge / Vivaldi

1. Open `chrome://extensions` (or `brave://extensions`, `edge://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select the `extension\keepassxc-browser` folder.
4. Confirm the extension ID is `lbheibjdopdcogknneliefkdjecejlap`.
   The ID is fixed by the `key` in `manifest.json`; do not edit that key.

### Firefox

The checked-in `manifest.json` is the Chromium MV3 manifest. Firefox needs the
MV2 manifest from `dist`:

```powershell
Copy-Item extension\dist\manifest_firefox.json extension\keepassxc-browser\manifest.json -Force
```

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on**.
3. Select `extension\keepassxc-browser\manifest.json`.
4. The temporary add-on disappears when Firefox restarts; load it again if needed.
5. To go back to Chromium, restore the MV3 manifest:

```powershell
Copy-Item extension\dist\manifest_chromium.json extension\keepassxc-browser\manifest.json -Force
```

## 3. Start the test server

From the repository root:

```powershell
python test-page\serve.py
```

Then open:

`http://localhost:8765/`

Use `localhost` over HTTP. Do not open the file with `file://`; extension
content scripts and WebAuthn need a real origin. `localhost` is treated as a
secure context, so the passkey section works there.

## 4. Test checklist

1. Open Personal Vault and unlock the vault.
2. Open the extension popup and connect/associate it with the vault.
3. Reload the test page after connecting.
4. **Login / autofill**: click the extension icon in the username or password
   field, choose an entry, and confirm both fields fill.
5. **Create account**: use the inline key icon to generate a password, submit
   the form, and confirm the save prompt appears. Save it, then check the entry
   in Personal Vault.
6. **Change password**: submit a new password and confirm the update prompt.
7. **Standalone generator**: focus the field, open the extension generator, and
   verify the desktop generator dialog appears with length/character options.
8. **Dynamic form**: inject the form and repeat the autofill test.
9. **TOTP**: use an entry with a TOTP secret and fill the optional TOTP field.
10. **Passkey (optional)**: register a passkey, then sign in with it. If the
    extension does not intercept the request, the browser's own WebAuthn prompt
    is still a valid result for the page.

The signup form posts to /signup and the test server returns HTTP 204, so the
extension sees a successful signup and offers its save prompt. The browser may
also show its own password-save bubble; dismiss that if you are testing the
KeePassXC banner.

## Troubleshooting

- **Extension says Personal Vault is not running**: start the app and unlock the
  vault. The native host is only available while the app is running.
- **No icons on the page**: reload the extension, allow site access for
  `localhost`, and reload the page. Check `chrome://extensions` for errors.
- **Native host not found after rebuilding/moving**: start the app again so it
  rewrites the manifests, then restart the browser.
- **Chrome extension ID is different**: the `key` in `manifest.json` must stay
  intact. A different ID will not match the native host's `allowed_origins`.
- **Passkey prompt does not appear**: the page must be on `localhost` (not an IP
  or `file://`), and passkey support must be enabled in the extension options.
- **Firefox add-on vanished**: temporary add-ons are removed on restart; reload
  `manifest.json` from `about:debugging`.

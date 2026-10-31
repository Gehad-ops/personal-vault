# Personal Vault

A personal password manager built on the KeePassXC core, with a browser extension bridge.

## Contents

- `desktop/` — KeePassXC source tree plus the new **PersonalVault** Qt app.
  - App code: `desktop/src/personalvault/`
  - Core/browser bridge changes: `desktop/src/browser/BrowserService.cpp`
  - Native messaging: `desktop/src/browser/NativeMessageInstaller.cpp`
- `extension/` — `keepassxc-browser` with the pinning/dev manifest and the desktop autofill handler.
- `web/` — earlier local web prototype (standalone, not the target app).

## Build (Windows / MinGW + Qt)

The reference build used:

- Qt `6.8.3` MinGW 64-bit: `C:\Qt\6.8.3\mingw_64`
- MinGW 13.1: `C:\Qt\Tools\mingw1310_64`
- Dependencies in `C:\deps` (Botan 3, minizip, qrencode)

Configure and build:

```powershell
cd desktop
cmake -S . -B build-mingw
cmake --build build-mingw --target PersonalVault -j 6
```

Output: `desktop/build-mingw/bin/PersonalVault.exe`.

`windeployqt` deploys Qt DLLs into the same `bin` folder. `keepassxc-proxy.exe` must also be present there (it is built by the main KeePassXC target).

## Run

```powershell
.\desktop\build-mingw\bin\PersonalVault.exe
```

On first launch pick a `.kdbx` vault. The app remembers recent vaults and only asks for the master password afterwards.

## Browser extension (Brave / Chrome / Chromium)

1. Keep `PersonalVault.exe` running with the vault unlocked.
2. Open `brave://extensions` (or `chrome://extensions`), enable **Developer mode**.
3. **Load unpacked** → select `extension/keepassxc-browser`.
4. The extension ID is pinned to `lbheibjdopdcogknneliefkdjecejlap` by the manifest key.
5. Restart the browser once, then click the extension icon → Connect.

Firefox: use the gecko ID `keepassxc-browser@keepassxc.org` (the source manifest includes both).

The native host is registered as `org.keepassxc.keepassxc_browser` and points at `keepassxc-proxy.exe`; the bridge inside PersonalVault feeds it the open KDBX.

## Known limitations

- Passkey registration/authentication is ported through `BrowserService`, but a full WebAuthn ceremony has not been exercised in a real browser from this repo state.
- The extension's “edit entry” action is a no-op because PersonalVault no longer uses KeePassXC's `DatabaseWidget`.
- The `/web` folder is an earlier prototype with its own local encrypted store; it is not wired to the native app.

## Security notes

- No personal vault files, master passwords, or API tokens are included.
- The `tests/data/*.kdbx` files are upstream KeePassXC test fixtures.
- The extension manifest `key` is a public key used only to pin the dev extension ID.

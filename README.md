# Personal Vault

A personal password manager built on the KeePassXC core, with a browser extension bridge.

## Contents

- `desktop/` - KeePassXC source tree plus the new **PersonalVault** Qt app.
  - App code: `desktop/src/personalvault/`
  - Core/browser bridge changes: `desktop/src/browser/BrowserService.cpp`
  - Native messaging: `desktop/src/browser/NativeMessageInstaller.cpp`
- `extension/` - `keepassxc-browser` with the pinned dev manifest and the desktop autofill handler.

KeePassXC's tests, docs, snap packaging and release tooling are intentionally removed from this branch.
Tests and offline docs are disabled in CMake.

## Build (Windows / MinGW + Qt)

The reference build used:

- Qt `6.8.3` MinGW 64-bit: `C:\Qt\6.8.3\mingw_64`
- MinGW 13.1: `C:\Qt\Tools\mingw1310_64`
- Dependencies in `C:\deps` (Botan 3, minizip, qrencode)

Configure and build:

```powershell
cd desktop
cmake -S . -B build-mingw -G Ninja -DCMAKE_BUILD_TYPE=Release `
  -DCMAKE_PREFIX_PATH="C:/Qt/6.8.3/mingw_64;C:/deps" `
  -DCMAKE_C_COMPILER="C:/Qt/Tools/mingw1310_64/bin/gcc.exe" `
  -DCMAKE_CXX_COMPILER="C:/Qt/Tools/mingw1310_64/bin/c++.exe" `
  -DBOTAN_INCLUDE_DIR="C:/deps/include/botan-3" `
  -DBOTAN_LIBRARY="C:/deps/lib/libbotan-3.a" `
  -DZLIB_INCLUDE_DIR="C:/Qt/Tools/mingw1310_64/x86_64-w64-mingw32/include" `
  -DZLIB_LIBRARY="C:/Qt/Tools/mingw1310_64/x86_64-w64-mingw32/lib/libz.a" `
  -DKPXC_FEATURE_NETWORK=OFF `
  -DKPXC_FEATURE_UPDATES=OFF `
  -DKPXC_FEATURE_SSHAGENT=OFF
cmake --build build-mingw --target PersonalVault -j 6
```

Output: `desktop/build-mingw/src/personalvault/PersonalVault.exe`.

`keepassxc-proxy.exe` must be present next to the app for browser integration. Build the
`KeePassXC` target (or the proxy target) once to produce it.

## Run

```powershell
.\desktop\build-mingw\src\personalvault\PersonalVault.exe
```

On first launch, pick a `.kdbx` vault. Recent vaults are remembered; later launches ask
only for the master password.

## Browser extension (Brave / Chrome / Chromium)

1. Keep `PersonalVault.exe` running with the vault unlocked.
2. Open `brave://extensions` (or `chrome://extensions`) and enable **Developer mode**.
3. **Load unpacked** and select `extension/keepassxc-browser`.
4. The extension ID is pinned to `lbheibjdopdcogknneliefkdjecejlap` by the manifest key.
5. Restart the browser once, then click the extension icon and connect.

Firefox uses the gecko ID `keepassxc-browser@keepassxc.org`; the source manifest includes both.

The native host is registered as `org.keepassxc.keepassxc_browser` and points at
`keepassxc-proxy.exe`. The bridge inside PersonalVault feeds it the open KDBX.

## Known limitations

- Passkey registration/authentication is ported through `BrowserService`, but a full
  WebAuthn ceremony has not been exercised in a real browser from this repo state.
- The extension's "edit entry" action is still a no-op because PersonalVault does not use
  KeePassXC's `DatabaseWidget`.
- Auto-lock settings are not implemented in the new UI.

## Security notes

- No personal vault files, master passwords, or API tokens are included.
- The extension manifest `key` is a public key used only to pin the development extension ID.

## License

The desktop source is derived from KeePassXC and is licensed under GPL-2.0. See `LICENSE`
and the additional license files under `desktop/`.

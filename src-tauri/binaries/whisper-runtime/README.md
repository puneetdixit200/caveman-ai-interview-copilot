# Whisper Runtime Sidecars

This directory is populated by `npm run sidecars:prepare`.

The Tauri build expects a target-specific executable named from the `caveman-whisper`
base path:

- `caveman-whisper-x86_64-pc-windows-msvc.exe`
- `caveman-whisper-x86_64-apple-darwin`
- `caveman-whisper-aarch64-apple-darwin`
- `caveman-whisper-x86_64-unknown-linux-gnu`

Do not commit generated binaries or Windows runtime DLLs. They are rebuilt or
downloaded during local packaging and CI release jobs.

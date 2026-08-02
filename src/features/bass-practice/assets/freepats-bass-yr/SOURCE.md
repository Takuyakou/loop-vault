# FreePats Bass Guitar YR source

- Upstream repository: https://github.com/freepats/electric-bass-YR
- Frozen upstream commit: 8dcb7ea9116f417273ef8c030d15e7b3aa654301
- License: CC0-1.0 (verified from upstream LICENSE.txt and README.txt)
- Instruments: Finger Bass YR and Picked Bass YR
- Conversion: ffmpeg-static 5.2.0; mono PCM s16le WAV, 44.1 kHz; metadata removed; deterministic arguments are in scripts/prepare-freepats-bass-assets.mjs.
- No external CDN or runtime download is used.

The bundled WAV files are deterministic conversions from the upstream FLAC samples listed in mapping.json. Do not replace them without regenerating asset-manifest.json.

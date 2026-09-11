# Icons — Diya, H0–H1

Needed before the install prompt works:

- `icon-192.png`        192×192
- `icon-512.png`        512×512
- `icon-maskable-512.png` 512×512, artwork inside the safe zone (40% radius)
- `apple-touch-icon.png` 180×180

Fastest route: design one 512 square in Figma, export, then
`npx pwa-asset-generator logo.svg ./ --icon-only --favicon`.
Lighthouse will fail "installable" until at least 192 and 512 exist.

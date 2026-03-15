# LOCA Source

This is the recovered editable React/Vite source for the deployed LOCA site.

## Current structure

- `src/App.jsx`: app state and screen routing
- `src/screens/`: major screens
- `src/components/`: shared UI and map components
- `src/data/`: sample data previously trapped inside the bundle
- `src/legacy/styles.css`: preserved production styling
- `public/`: PWA assets copied from the deployed site

## Commands

```bash
npm install
npm run dev
npm run build
npm run preview:host
npm run cap:sync
npm run cap:android
npm run cap:ios
```

On this Windows machine, use `npm.cmd` in PowerShell if `npm` is blocked by execution policy.

## Mobile packaging

- `capacitor.config.json` is set up for Android and iOS packaging.
- Native projects now live in `android/` and `ios/`.
- Use `npm run cap:sync` after web changes to copy the latest build into both native projects.
- Open Android Studio with `npm run cap:android`.
- Open Xcode with `npm run cap:ios` on macOS.

## Local preview

- Browser preview: `http://127.0.0.1:4173/`
- Deep-link preview: `http://127.0.0.1:4173/map/map-seongsu`

## Status

- Build verified on March 15, 2026
- ESLint passes on recovered source files
- The minified legacy app bundle is no longer used

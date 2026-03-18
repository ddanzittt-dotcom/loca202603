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

## Supabase scaffold

- `supabase/loca_v1_schema.sql` contains the first LOCA-tailored schema.
- `src/lib/supabase.js` contains the shared Supabase client.
- `src/lib/auth.js` contains email/OAuth auth helpers.
- `src/lib/mapService.js` contains the first service layer shaped around LOCA's current `maps / features / shares / follows` model.

### Setup

1. Copy `.env.example` to `.env`
2. Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
3. Run `supabase/loca_v1_schema.sql` in the Supabase SQL editor

### Important

- The app UI still runs on the existing localStorage flow today.
- The new Supabase files are scaffolding for the next migration slice, so the current app keeps working while the service layer is wired screen by screen.

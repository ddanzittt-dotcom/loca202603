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
```

On this Windows machine, use `npm.cmd` in PowerShell if `npm` is blocked by execution policy.

## Status

- Build verified on March 15, 2026
- ESLint passes on recovered source files
- The minified legacy app bundle is no longer used

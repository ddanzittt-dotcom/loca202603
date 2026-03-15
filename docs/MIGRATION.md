# LOCA Migration Notes

## Completed

- Recovered the application into normal React/Vite source files.
- Moved bundled sample data into `src/data/sampleData.js`.
- Rebuilt the main screens under `src/screens/`.
- Rebuilt shared UI and map behavior under `src/components/`.
- Removed the minified legacy application bundle from active use.

## Remaining legacy asset

- `src/legacy/styles.css` is still the preserved production stylesheet.

## Next recommended cleanup

1. Split large sheet sections out of `src/App.jsx` if a screen needs heavier iteration.
2. Replace preserved legacy CSS gradually with scoped source styles when visual redesign work starts.
3. Add automated interaction tests for map editing and import/export flows.

# DinoJam

Interactive browser-based T-Rex viewer built with Three.js, animation clips, and shader-based visual themes.

## Requirements

- Node.js 18+ (recommended)
- npm 9+ (or compatible)

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start local server:

   ```bash
   npm run dev
   ```

3. Open the URL printed by `serve` (default: `http://localhost:5173`).

## Available Scripts

- `npm run dev` - serve the project locally
- `npm run start` - alias for `dev`
- `npm run lint` - run ESLint checks
- `npm run lint:fix` - auto-fix ESLint issues where possible
- `npm run format` - format files with Prettier
- `npm run format:check` - verify formatting without changing files

## Continuous Integration

GitHub Actions runs the `CI` workflow on pushes to `main` and on pull requests:

- `npm ci`
- `npm run lint`
- `npm run format:check`

## Project Structure

- `index.html` - app shell and import map
- `style.css` - UI and layout styles
- `src/main.js` - startup flow and render loop
- `src/*.js` - scene setup, model loading, animation, themes, audio, and UI
- `T-Rex.glb` - main 3D model asset

## Asset Attribution (CC BY)

`T-Rex.glb` is based on the Sketchfab model:

- **Title:** Animated Tyrannosaurus Rex Dinosaur Running Loop
- **Author:** LasquetiSpice
- **Source:** [Sketchfab model page](https://sketchfab.com/3d-models/animated-tyrannosaurus-rex-dinosaur-running-loop-38007d947ae74dea83988cb0b08ee053)
- **License:** Creative Commons Attribution (CC BY)

Please keep attribution to the original author and source when redistributing this project or derivative works that include the model.

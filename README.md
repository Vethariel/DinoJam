# DinoJam

Interactive browser-based T-Rex viewer built with Three.js, animation clips, and shader-based visual themes.

## Experience Flow (Current)

- The show starts directly with music + cue sequence.
- Personalization panels are hidden by default.
- Bottom-right UI shows the `DinoJam` title, live status text, and a gear toggle to show/hide customization controls.
- Scene cues loop in sync with the BGM loop.

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
- `music.mp3` - background track used for the show timeline
- `LICENSE-THIRD-PARTY.md` - third-party asset attribution and license notes

## Asset Attribution (CC BY)

`T-Rex.glb` is based on the Sketchfab model:

- **Title:** Animated Tyrannosaurus Rex Dinosaur Running Loop
- **Author:** LasquetiSpice
- **Source:** [Sketchfab model page](https://sketchfab.com/3d-models/animated-tyrannosaurus-rex-dinosaur-running-loop-38007d947ae74dea83988cb0b08ee053)
- **License:** Creative Commons Attribution (CC BY)

Please keep attribution to the original author and source when redistributing this project or derivative works that include the model.

## Music Attribution

`music.mp3` uses the Pixabay track:

- **Title:** Trap Trap Trap Beat
- **Source:** [Pixabay track page](https://pixabay.com/music/trap-trap-trap-beat-514138/)
- **License:** Pixabay Content License (see third-party license notes)

## Sound Effect Attribution

`roar.mp3` uses the Pixabay sound effect:

- **Title:** Movies And Special Effects Dinosaur Roar
- **Source:** [Pixabay effect page](https://pixabay.com/es/sound-effects/pel%c3%adculas-y-efectos-especiales-dinosaur-roar-390283/)
- **License:** Pixabay Content License (see third-party license notes)

## License

- Source code in this repository is licensed under the MIT License (see `LICENSE`).
- Third-party assets (3D model and music) keep their original licenses (see `LICENSE-THIRD-PARTY.md`).

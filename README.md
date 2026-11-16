# 🏁 Apex Circuit 3D

<p align="center">
  <a href="https://apex-circuit-3d.darshillprajapati97.workers.dev"><strong>🌐 PLAY THE LIVE GAME</strong></a>
  &nbsp; • &nbsp;
  <a href="https://github.com/Darshilking208/apex-circuit-3d"><strong>📦 SOURCE CODE</strong></a>
</p>

<p align="center">
  <strong>A browser-based 3D arcade circuit racing game built with React, TypeScript, Three.js, and Vite.</strong>
</p>

Take the wheel, accelerate through a purpose-built circuit, manage your speed through corners, and complete the race while tracking your lap performance.

> This repository contains the source code for Apex Circuit 3D. The project is actively evolving; available gameplay and controls are described below based on the current implementation.

---

## 🎮 Game overview

Apex Circuit 3D combines a Three.js racing world with a React-powered game interface. The game includes a title screen, an active race HUD, pause and game-over screens, a player-controlled car, a chase camera, track boundaries, and lap timing.

### Current gameplay

- **3D racing environment** rendered with Three.js.
- **Player car and driving physics** with acceleration, braking/reverse, steering, and handbrake input.
- **Chase camera** that follows the car as it moves around the circuit.
- **Circuit environment** with track geometry, scenery, and track-side boundaries.
- **Race progression** with checkpoint validation and lap tracking.
- **Race timing** including current lap time, total time, and best lap time.
- **Driving HUD** displaying speed, gear, RPM, lap progress, and race information.
- **Game states** for the title screen, active race, pause menu, and race results.
- **Audio controls** including mute support.
- **Keyboard shortcuts** for driving and in-game actions.
- **Responsive game shell** designed around a full-window 3D canvas.

## 🕹️ Controls

| Key | Action |
| --- | --- |
| `W` / `↑` | Accelerate |
| `S` / `↓` | Brake / reverse |
| `A` / `←` | Steer left |
| `D` / `→` | Steer right |
| `Space` | Handbrake |
| `R` | Reset car |
| `Esc` | Pause / resume |

The on-screen HUD and title/menu screens provide additional game actions where available.

## 🧰 Tech stack

| Technology | Purpose |
| --- | --- |
| [React](https://react.dev/) | UI and game screen state |
| [TypeScript](https://www.typescriptlang.org/) | Application and game logic |
| [Three.js](https://threejs.org/) | 3D scene, camera, meshes, and rendering |
| [Vite](https://vite.dev/) | Development server and production build |
| [Tailwind CSS](https://tailwindcss.com/) | Utility-first styling integration |
| [Lucide React](https://lucide.dev/) | Interface icons |
| [Motion](https://motion.dev/) | UI motion and animation |
| [Bun](https://bun.sh/) | Lockfile / package workflow support |

## 📁 Project structure

```text
apex-circuit-3d/
├── index.html
├── package.json
├── bun.lock
├── vite.config.ts
├── tsconfig.json
├── metadata.json
├── .env.example
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── index.css
    ├── components/
    │   ├── GameModal.tsx
    │   ├── RaceHud.tsx
    │   └── TitleOverlay.tsx
    └── game/
        ├── RacingEngine.ts
        ├── audio.ts
        ├── carMesh.ts
        ├── carPhysics.ts
        ├── raceRules.ts
        ├── textures.ts
        ├── track.ts
        ├── trackAndRules.test.ts
        └── worldBuilder.ts
```

### Architecture at a glance

- `src/App.tsx` connects the game engine to the React interface and coordinates title, playing, paused, and game-over states.
- `src/game/RacingEngine.ts` manages the main racing runtime and communicates HUD updates to the interface.
- `src/game/carPhysics.ts` contains the vehicle movement and handling logic.
- `src/game/carMesh.ts` builds the player's 3D car.
- `src/game/track.ts` and `src/game/worldBuilder.ts` define the circuit and 3D environment.
- `src/game/raceRules.ts` contains race progression rules.
- `src/game/audio.ts` handles game audio.
- `src/components/` contains the title overlay, race HUD, and pause/results modal.

## 🚀 Getting started

### Prerequisites

Install one of the supported JavaScript runtimes:

- [Bun](https://bun.sh/) (the repository includes `bun.lock`), or
- [Node.js](https://nodejs.org/) with npm.

### 1. Clone the repository

```bash
git clone https://github.com/Darshilking208/apex-circuit-3d.git
cd apex-circuit-3d
```

### 2. Install dependencies

Using Bun:

```bash
bun install
```

Or using npm:

```bash
npm install
```

### 3. Start the development server

Using Bun:

```bash
bun run dev
```

Or using npm:

```bash
npm run dev
```

Open the local URL printed by Vite in your browser. The configured development server uses port **3000**.

### 4. Create a production build

Using Bun:

```bash
bun run build
```

Or using npm:

```bash
npm run build
```

### 5. Preview the production build

```bash
bun run preview
```

## ⚙️ Available scripts

| Script | Description |
| --- | --- |
| `dev` | Starts the Vite development server on port 3000 and listens on all interfaces |
| `build` | Creates an optimized production build |
| `preview` | Serves the production build locally for preview |
| `lint` | Runs the TypeScript compiler in no-emit mode |
| `clean` | Removes generated `dist` and `server.js` outputs (the configured command uses `rm -rf`) |

Run a script with `bun run <script>` or `npm run <script>`.

## 🏎️ Playing the game

1. Open the app in a modern desktop browser with WebGL enabled.
2. Select **Start Race** on the title screen.
3. Use the keyboard controls to accelerate, brake, steer, and navigate the circuit.
4. Follow the circuit and pass the checkpoints in order to complete valid laps.
5. Watch your speed, lap number, and lap timer in the HUD.
6. Pause, resume, reset your car, or restart the race using the available controls.

## 🧪 Tests and quality checks

The repository includes race-track and race-rule tests in `src/game/trackAndRules.test.ts`.

The TypeScript check can be run with:

```bash
npm run lint
```

The production build can be checked with:

```bash
npm run build
```

## 🔐 Environment variables

An `.env.example` file is included as a reference for environment configuration. Review it before configuring any optional integrations.

- Never commit real API keys, passwords, access tokens, or private credentials.
- Keep local secrets in an untracked `.env.local` file when required by your setup.
- Only expose variables intended for browser use; client-side environment variables are visible to users.

## 🌐 Browser compatibility

Use a recent version of Chrome, Edge, Firefox, or another WebGL-capable browser. A desktop browser and keyboard are recommended for the intended driving controls.

Performance depends on the device, graphics hardware, browser, and rendering settings.

## 🗺️ Roadmap

Ideas for future development (not claims about features already implemented):

- More circuits and track themes.
- Additional cars and vehicle customization.
- Improved mobile and touch controls.
- Race difficulty and gameplay settings.
- More detailed race statistics and personal bests.
- Optional deployment workflow and hosted game link.

## 🤝 Contributing

Contributions, bug reports, and suggestions are welcome.

1. Fork the repository.
2. Create a branch for your change.
3. Make and test your updates.
4. Open a pull request with a clear explanation of the change.

For bugs, include your browser, operating system, steps to reproduce, and any relevant screenshots or console errors.

## 📄 License

No license file is currently included in this repository. Unless a license is added, the default copyright rules apply; do not assume the code is available for unrestricted reuse.

---

## 👨‍💻 Author

**Darshil K Prajapati**

- GitHub: [@Darshilking208](https://github.com/Darshilking208)
- Project: [Apex Circuit 3D](https://github.com/Darshilking208/apex-circuit-3d)

---

<p align="center">
  <strong>🏁 Apex Circuit 3D — Start your engine. Own the circuit.</strong>
</p>

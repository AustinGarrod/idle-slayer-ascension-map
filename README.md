# Idle Slayer Ascension Map

A static web app for exploring and tracking Idle Slayer's Ascension upgrades. This repository currently contains a minimal React and TypeScript app built with Vite. The interactive map, game-data extraction, progress tracking and GitHub Pages deployment are planned, but are not implemented yet.

The public repository is [AustinGarrod/idle-slayer-ascension-map](https://github.com/AustinGarrod/idle-slayer-ascension-map). The original Mac working directory uses the spelling `idle-slayer-ascention-map`; a fresh clone uses the repository's spelling, `idle-slayer-ascension-map`.

## Windows setup

Install Git and the latest patch release of Node.js 24 LTS. Open PowerShell in the directory where you keep projects, then run:

```powershell
git clone https://github.com/AustinGarrod/idle-slayer-ascension-map.git
cd idle-slayer-ascension-map
corepack.cmd yarn install --immutable
corepack.cmd yarn dev
```

Open the local URL printed by Vite. The `.cmd` commands work in PowerShell without changing its script execution policy. Corepack uses the pinned `yarn@4.13.0` from `package.json`; use the committed `yarn.lock` and immutable installs. The project uses Yarn's `node-modules` linker.

Node.js 24 includes Corepack. If `corepack.cmd` is unavailable in your installation, install it with `npm.cmd install --global corepack` and rerun the commands above. Calling Yarn through Corepack does not require enabling global Yarn shims.

Available commands:

| Command | Purpose |
| --- | --- |
| `yarn dev` | Start the local development server. |
| `yarn typecheck` | Check application and build-configuration TypeScript. |
| `yarn build` | Check types and generate the production site in `dist/`. |
| `yarn preview` | Serve the production build locally after running `yarn build`. |

There is no test framework or lint script in this bootstrap. Add them alongside the behavior they need to verify during implementation.

## Game files for the Windows implementation

The accepted plan uses your Windows Steam installation to establish the complete catalog and game rules. Keep these inputs local; they must never be committed or copied into `public/` or the production build.

Create an ignored working directory:

```powershell
New-Item -ItemType Directory -Force .local-game | Out-Null
```

Copy the installed game folder and its Steam manifest so the result is:

```text
.local-game/
  Idle Slayer/                 # Complete copy of the installed game folder
  appmanifest_1353300.acf      # Steam manifest for the installed game build
```

Use Steam's **Manage → Browse local files** action to locate the game folder. The manifest is in that Steam library's `steamapps` directory, alongside its `common` directory. Do not assume Steam is installed on `C:`; additional libraries may be on another drive.

An implementation agent can also inspect the original installed paths directly instead of copying the files. It should read them without modifying the installation, player saves or game state. This bootstrap does not include an extractor or launch the game.

`.local-game/` is ignored by Git and must remain outside anything served by the app. The development server is configured to deny the local game directory and sensitive files. Commit only reviewed, normalized catalog data, permitted assets, source provenance and the tools needed to reproduce extraction.

## Project guidance

- [AGENTS.md](AGENTS.md) gives future agents the project boundaries, data rules and verification commands.
- [design.md](design.md) defines the initial game-inspired visual direction.
- [Implementation plan](docs/implementation-plan.md) preserves the accepted map behavior and release requirements.

The planned app is entirely static: one local progress profile, no backend, no account system and no analytics. GitHub Pages is the intended host. Hosting is deferred until the map and catalog are verified.

## Sources and attribution

Use the installed game as the primary evidence for tree positions, IDs, requirements and reset rules. The [Idle Slayer Wiki](https://idleslayer.fandom.com/wiki/Idle_Slayer_Wiki) is a supplementary source for descriptions and icons. The [official Idle Slayer website](https://idleslayer.com/) and [official editor screenshot](https://idleslayer.com/img/press-kit/Editor%20Screenshot%202.png) are visual references. [UnityPy](https://github.com/K0lb3/UnityPy#monobehaviour) is an extraction candidate to assess during the Windows implementation.

No game assets or wiki content are bundled in this bootstrap. Before adding them, record their source and attribution or licensing requirements separately from the application code. Do not infer permission to redistribute game binaries from their availability in a local installation.

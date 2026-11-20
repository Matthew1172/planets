# Planets

A minimal Babylon.js viewer for Jol. Drag to orbit and scroll or pinch to zoom.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. A fresh clone displays a lit blue quad sphere. Installing the Jol texture set enables the textured planet and streams enhanced detail as you zoom in.

## Texture layout

Place the complete runtime texture set in `public/textures/`, with `jol-parent/` and `jol-child/` directly inside it. Vite serves these files locally and includes them in `npm run build`. The parent has six 16K faces and each face has four 16K child quadrants. Enhanced tiles begin blending in at 60% center coverage, then the edge tiles load. Keep the full-size PNG masters in a separate `jol-cubemap-16k/` directory for asset work.

## Proposed asset publishing workflow

Push viewer changes with Git. Publish texture versions through GitHub Releases, with separate optional downloads for the PNG masters. Package the runtime tiles by cube face, preserving their paths under `public/textures/`. Include a manifest listing the asset version, layout version, archive names, sizes, and SHA-256 checksums. A publish script can validate and upload a complete set as a draft release before publishing it. A download script can fetch a chosen version, verify it, and install it through a staging directory.

GitHub release files must each be under 2 GiB. The repository is public, so published texture downloads are public too.

# Planets

A minimal Babylon.js viewer for Jol. Drag to orbit and scroll or pinch to zoom.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. A fresh clone displays a lit blue quad sphere. Installing the Jol texture set enables the textured planet and streams enhanced detail as you zoom in.

## Texture layout

The runtime texture set lives in `public/textures/` and is gitignored. Vite serves it locally and copies it into `npm run build`. The viewer expects exactly this structure (faces are `px`, `py`, `pz`, `nx`, `ny`, `nz`):

```text
public/textures/
  jol-parent/
    overview/jol_<face>.png              6 cube faces for the base material
    <face>/<x>-<y>.png                   16 x 16 tiles per face, x and y 0-15
  jol-child/
    <face>/<qx>-<qy>/<x>-<y>.webp        4 quadrants per face (qx, qy 0-1), 16 x 16 tiles each
```

That is 6 overview faces, 1,536 parent tiles and 6,144 child tiles. Every parent and child tile is 1026 x 1026 pixels: a 1024 pixel tile with a 1 pixel border copied from its neighbours. A tile with the wrong size is rejected at load time. Enhanced tiles begin blending in at 60% center coverage, then the edge tiles load.

Keep the full-size PNG masters in `jol-cubemap-16k/` at the repository root (also gitignored). The viewer never reads them.

## Asset publishing workflow

Code and textures travel separately. Viewer changes go through Git as normal. Texture sets are published as GitHub Releases on this repository and installed into `public/textures/` on each machine that runs the viewer. Never commit texture files to Git.

### Versioning

Each texture set is a release tagged `textures-v<N>`, for example `textures-v3`. A tag is never reused; publish a new number instead of replacing assets. The manifest carries a `layout` number that changes only when the directory structure, tile size or file formats above change. A layout change also needs a matching code change.

The repository pins the set the code expects in a committed `textures.lock.json`:

```json
{ "version": "textures-v3", "layout": 1 }
```

Bump this file in the same commit as any code change that depends on new textures.

### Release contents

| Asset | Contents | Required |
| --- | --- | --- |
| `textures-manifest.json` | Version, layout, and the name, byte size and SHA-256 of every archive | Yes |
| `jol-overview.tar` | `jol-parent/overview/` | Yes |
| `jol-<face>.tar` (x6) | `jol-parent/<face>/` and `jol-child/<face>/` | Yes |
| `jol-masters-<face>.tar` (x6) | That face's PNG masters from `jol-cubemap-16k/` | No |

Archive paths are relative to `public/textures/` (or `jol-cubemap-16k/` for masters), so extracting in that directory reproduces the layout. Use plain `tar`: PNG and WebP are already compressed. GitHub limits each release asset to 2 GiB. If a face archive would exceed that, split it per quadrant (`jol-<face>-<qx>-<qy>.tar`) and list the parts in the manifest.

Example manifest:

```json
{
  "version": "textures-v3",
  "layout": 1,
  "created": "2026-11-20T16:00:00Z",
  "archives": [
    { "name": "jol-px.tar", "bytes": 912345678, "sha256": "…", "required": true }
  ]
}
```

### Publishing (asset machine)

Requires the `gh` CLI with write access to this repository (`gh auth login`).

1. Export the finished set into `public/textures/` and the masters into `jol-cubemap-16k/`.
2. Validate before packaging: all 6 overview faces, 1,536 parent PNGs and 6,144 child WebPs exist, every tile is 1026 x 1026, and there are no extra or zero-byte files.
3. Build the archives and `textures-manifest.json` in a temporary directory outside the repository. Record each archive's size and checksum (`shasum -a 256` on macOS, `sha256sum` on Linux).
4. Create a draft release and upload everything:
   ```sh
   gh release create textures-v3 --draft --title "Jol textures v3" --notes "<what changed>" \
     textures-manifest.json jol-*.tar
   ```
5. Check that the draft lists every archive with the expected sizes (`gh release view textures-v3`), then publish it:
   ```sh
   gh release edit textures-v3 --draft=false
   ```
6. Commit the new `textures.lock.json` on a branch and open a pull request. If the new set needs viewer changes, put them in the same PR.

Delete a draft that fails partway (`gh release delete textures-v3 --cleanup-tag`) and start again. Never edit a published release in place.

### Installing (development machine)

1. Pull the code and read the pinned version from `textures.lock.json`.
2. Download the manifest and the required archives into a temporary directory:
   ```sh
   gh release download textures-v3 -R Matthew1172/planets -D "$tmp" \
     -p textures-manifest.json -p 'jol-overview.tar' -p 'jol-[pn][xyz].tar'
   ```
   Add `-p 'jol-masters-*.tar'` only if you need the masters.
3. Check that each archive's size and SHA-256 match the manifest, and that the manifest's `layout` matches the lock file.
4. Extract into a staging directory next to `public/textures/`, then replace `public/textures/` with it in one move. An interrupted install never leaves a mixed set.
5. Run `npm run dev` and confirm the textured planet loads and detail streams in as you zoom.

A `textures:publish` npm script for steps 2 to 5 of publishing and a `textures:fetch` script for installing should wrap these commands. They should use only Node built-ins and `gh`, so they run on both machines.

Published releases are public because this repository is public. Do not publish assets that must stay private.

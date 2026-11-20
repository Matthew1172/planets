# Planets

A Babylon.js planet viewer. Each planet is a JSON config in `public/planets/`; the engine loads one per page. Drag to orbit and scroll or pinch to zoom.

```sh
npm ci
npm run dev    # http://localhost:5173/?planet=jol
npm test       # validates the config loader and every planet config
```

`?planet=<id>` loads `public/planets/<id>.json`; without it the viewer shows `jol`. A planet whose textures are not installed renders as a lit sphere in its `baseColor`, so a fresh clone works without any assets.

## Planet configs

```json
{
  "name": "Jol",
  "description": "A sapphire ocean planet",
  "baseColor": [0.19, 0.45, 0.77],
  "sunDirection": [-1, 1, -1],
  "background": [0.02, 0.03, 0.065],
  "textures": {
    "baseUrl": "../textures/jol/",
    "overview": "jol-parent/overview/jol_{face}.png",
    "detail": {
      "tileSize": 1024,
      "tilesPerFace": 16,
      "parent": "jol-parent/{face}/{x}-{y}.png",
      "child": "jol-child/{face}/{qx}-{qy}/{x}-{y}.webp"
    }
  }
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `name` | Yes | Display name, used in the page title |
| `description` | No | Short phrase for the canvas label |
| `baseColor` | No | RGB 0-1, shown before or without textures. Default grey |
| `sunDirection` | No | Light direction in world space. Default `[-1, 1, -1]` |
| `background` | No | RGB 0-1 clear colour |
| `textures` | No | Omit for an untextured planet |
| `textures.baseUrl` | No | Resolved against the config file's URL; may be absolute (a CDN). Default the config's folder |
| `textures.overview` | With `textures` | Cube face image path; must contain `{face}` |
| `textures.detail` | No | Omit to show only the overview cube map |
| `detail.tileSize` | With `detail` | Tile interior size in pixels |
| `detail.tilesPerFace` | With `detail` | Parent tiles along each face edge (1-64) |
| `detail.parent` | With `detail` | Parent tile path; must contain `{face}`, `{x}`, `{y}` |
| `detail.child` | With `detail` | Child tile path; must contain `{face}`, `{qx}`, `{qy}`, `{x}`, `{y}` |

The file name is the planet id (lowercase letters, digits and hyphens). Faces are `px`, `py`, `pz`, `nx`, `ny`, `nz`. The id is not repeated inside the file, so renaming the file renames the planet. `npm test` rejects invalid configs with the planet and field named; the viewer shows the same message on the page.

### Texture structure

Each planet's textures live in `public/textures/<id>/`, which is gitignored. Vite serves them locally and copies them into `npm run build`. With detail enabled:

- **Overview:** 6 cube face images for the base material, at any size the GPU accepts.
- **Parent tiles:** `tilesPerFace` x `tilesPerFace` tiles per face, `x` and `y` from 0.
- **Child tiles:** twice the parent resolution, split into 4 quadrants per face (`qx`, `qy` 0-1). Each quadrant has `tilesPerFace` x `tilesPerFace` tiles.

Every parent and child tile is `tileSize + 2` pixels square: the interior plus a 1 pixel border copied from its neighbours. The viewer rejects tiles of the wrong size. The format is whatever the browser decodes (PNG, WebP, JPEG), chosen per level by the path's extension. Child tiles begin blending in at 60% center coverage, then the edge tiles load. Level switch distances scale with face resolution (`tilesPerFace * tileSize`).

Jol uses 16 tiles of 1024 px: 1,536 parent PNGs and 6,144 child WebPs, each 1026 x 1026.

Keep full-size masters outside `public/`, in `masters/<id>/` (gitignored). The viewer never reads them.

### Adding a planet

1. Pick an id and add `public/planets/<id>.json`.
2. Install its textures into `public/textures/<id>/` (or point `baseUrl` at wherever they are hosted).
3. Run `npm test`, then open `http://localhost:5173/?planet=<id>`.
4. Commit the config, and its line in `textures.lock.json` once its textures are published.

## Asset publishing workflow

Code, configs and textures travel separately. Viewer code and planet configs go through Git. Each planet's textures are published as GitHub Releases on this repository and installed into `public/textures/<id>/` on machines that need that planet. Never commit texture files to Git.

### Versioning

Each texture set is a release tagged `<id>-textures-v<N>`, for example `jol-textures-v3`. A tag is never reused; publish a new number instead of replacing assets. The planet config describes the layout, so a set that changes tile size, grid, paths or formats ships with a config change.

The repository pins the set each planet expects in a committed `textures.lock.json`:

```json
{
  "jol": "jol-textures-v3",
  "kerbin": "kerbin-textures-v1"
}
```

Bump a planet's entry in the same commit as any config or code change that depends on its new textures.

### Release contents

| Asset | Contents | Required |
| --- | --- | --- |
| `<id>-manifest.json` | Planet id, version, and the name, byte size and SHA-256 of every archive | Yes |
| `<id>-overview.tar` | The overview cube faces | Yes |
| `<id>-<face>.tar` (x6) | That face's parent and child tiles | Yes, with detail |
| `<id>-masters-<face>.tar` (x6) | That face's masters from `masters/<id>/` | No |

Archive paths are relative to `public/textures/<id>/` (or `masters/<id>/`), so extracting in that directory reproduces the layout. Use plain `tar`: PNG and WebP are already compressed. GitHub limits each release asset to 2 GiB. If a face archive would exceed that, split it per quadrant (`<id>-<face>-<qx>-<qy>.tar`) and list the parts in the manifest.

Example manifest:

```json
{
  "planet": "jol",
  "version": "jol-textures-v3",
  "created": "2026-11-20T16:00:00Z",
  "archives": [
    { "name": "jol-px.tar", "bytes": 912345678, "sha256": "…", "required": true }
  ]
}
```

### Publishing (asset machine)

Requires the `gh` CLI with write access to this repository (`gh auth login`).

1. Export the finished set into `public/textures/<id>/` and the masters into `masters/<id>/`. Write or update `public/planets/<id>.json` to match.
2. Validate before packaging: `npm test` passes, every overview face and tile the config implies exists (`6 * tilesPerFace²` parent and 4 times as many child tiles), every tile is `tileSize + 2` square, and there are no extra or zero-byte files.
3. Build the archives and `<id>-manifest.json` in a temporary directory outside the repository. Record each archive's size and checksum (`shasum -a 256` on macOS, `sha256sum` on Linux).
4. Create a draft release and upload everything:
   ```sh
   gh release create jol-textures-v3 --draft --title "Jol textures v3" --notes "<what changed>" \
     jol-manifest.json jol-*.tar
   ```
5. Check that the draft lists every archive with the expected sizes (`gh release view jol-textures-v3`), then publish it:
   ```sh
   gh release edit jol-textures-v3 --draft=false
   ```
6. On a branch, commit the planet's `textures.lock.json` entry and any config change, and open a pull request.

Delete a draft that fails partway (`gh release delete jol-textures-v3 --cleanup-tag`) and start again. Never edit a published release in place.

### Installing (development machine)

Install only the planets you are working on; each is several gigabytes at full detail.

1. Pull the code and read the planet's pinned release from `textures.lock.json`.
2. Download the manifest and the required archives into a temporary directory:
   ```sh
   gh release download jol-textures-v3 -R Matthew1172/planets -D "$tmp" \
     -p 'jol-manifest.json' -p 'jol-overview.tar' -p 'jol-[pn][xyz].tar'
   ```
   Add `-p 'jol-masters-*.tar'` only if you need the masters.
3. Check that each archive's size and SHA-256 match the manifest.
4. Extract into a staging directory next to `public/textures/<id>/`, then replace `public/textures/<id>/` with it in one move. An interrupted install never leaves a mixed set.
5. Open `http://localhost:5173/?planet=<id>` and confirm the textured planet loads and detail streams in as you zoom.

`textures:publish <id>` and `textures:fetch <id>` npm scripts should wrap these steps (fetch with no id could install every locked planet). They should use only Node built-ins and `gh`, so they run on both machines.

Published releases are public because this repository is public. Do not publish assets that must stay private.

import { Constants } from '@babylonjs/core/Engines/constants.js';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js';
import { Vector2 } from '@babylonjs/core/Maths/math.vector.js';
import { cubeFaces } from './planet-config.js';

const centerFraction = 0.6;
const fadeDuration = 180;

function faceForDirection(x, y, z) {
  const absX = Math.abs(x), absY = Math.abs(y), absZ = Math.abs(z);
  if (absX >= absY && absX >= absZ) {
    return x > 0 ? [0, -z / absX, -y / absX] : [3, z / absX, -y / absX];
  }
  if (absY >= absZ) {
    return y > 0 ? [1, x / absY, z / absY] : [4, x / absY, -z / absY];
  }
  return z > 0 ? [2, x / absZ, -y / absZ] : [5, -x / absZ, -y / absZ];
}

// Each face has a parent grid of tilesPerFace x tilesPerFace tiles and a child grid
// with twice the resolution, stored as four quadrants of the same size.
export function createSurfaceDetail({ tileSize, tilesPerFace, parent: parentUrl, child: childUrl }) {
  const parentGrid = tilesPerFace;
  const childGrid = tilesPerFace * 2;
  const paddedSize = tileSize + 2;
  const mapHeight = childGrid * cubeFaces.length * 2;
  const atlasSize = 4 * paddedSize;
  // The level switch thresholds were tuned on 16K faces.
  const pixelScale = tilesPerFace * tileSize / 16384;

  const shader = `
    uniform sampler2D detailAtlas;
    uniform sampler2D overflowAtlas;
    uniform sampler2D tileMap;
    uniform vec2 atlasSizes;
    uniform float storedTileSize;
    uniform float detailLevel;
    uniform float parentReady;

    vec3 faceCoordinates(vec3 p) {
      vec3 magnitude = abs(p);
      if (magnitude.x >= magnitude.y && magnitude.x >= magnitude.z) {
        if (p.x > 0.0) return vec3(-p.zy / magnitude.x, 0.0);
        return vec3(vec2(p.z, -p.y) / magnitude.x, 3.0);
      }
      if (magnitude.y >= magnitude.z) {
        if (p.y > 0.0) return vec3(p.xz / magnitude.y, 1.0);
        return vec3(vec2(p.x, -p.z) / magnitude.y, 4.0);
      }
      if (p.z > 0.0) return vec3(vec2(p.x, -p.y) / magnitude.z, 2.0);
      return vec3(-p.xy / magnitude.z, 5.0);
    }

    vec3 directionFromFace(vec2 p, float face) {
      if (face < 0.5) return vec3(1.0, -p.y, -p.x);
      if (face < 1.5) return vec3(p.x, 1.0, p.y);
      if (face < 2.5) return vec3(p.x, -p.y, 1.0);
      if (face < 3.5) return vec3(-1.0, -p.y, p.x);
      if (face < 4.5) return vec3(p.x, -1.0, -p.y);
      return vec3(-p.x, -p.y, -1.0);
    }

    vec4 tileEntry(vec2 tile, float faceRow) {
      vec2 key = vec2(0.5) + tile + vec2(0.0, faceRow);
      return texture2D(tileMap, key / vec2(${childGrid}.0, ${mapHeight}.0));
    }

    vec3 tileColor(vec2 local, vec4 lookup) {
      vec3 entry = floor(lookup.rgb * 255.0 + 0.5);
      vec2 pixel = entry.xy * (storedTileSize + 2.0) + (local + 0.5) * storedTileSize / ${tileSize}.0 + 1.0;
      return entry.z < 1.5
        ? texture2D(detailAtlas, pixel / atlasSizes.x).rgb
        : texture2D(overflowAtlas, pixel / atlasSizes.y).rgb;
    }

    float childAlpha(vec2 tile, vec3 face) {
      bvec2 below = lessThan(tile, vec2(0.0));
      bvec2 above = greaterThanEqual(tile, vec2(${childGrid}.0));
      if (any(below) || any(above)) {
        vec2 uv = vec2(below.x ? -1.0001 : above.x ? 1.0001 : face.x,
                       below.y ? -1.0001 : above.y ? 1.0001 : face.y);
        vec3 neighbor = faceCoordinates(directionFromFace(uv, face.z));
        tile = clamp(floor((0.5 + 0.5 * neighbor.xy) * ${childGrid}.0), 0.0, ${childGrid - 1}.0);
        face = neighbor;
      }
      return tileEntry(tile, face.z * ${childGrid}.0 + ${mapHeight / 2}.0).a;
    }

    float featherEdge(float alpha, vec2 tile, vec3 face, vec2 offset, float distance) {
      const float feather = ${(tileSize * 180 / 1024).toFixed(1)};
      if (distance >= feather) return alpha;
      float edgeAlpha = min(alpha, childAlpha(tile + offset, face));
      return mix(edgeAlpha, alpha, smoothstep(0.0, feather, distance));
    }

    vec3 sampleSurfaceDetail(vec3 direction, vec3 fallback) {
      if (detailLevel < 1.0) return fallback;

      vec3 face = faceCoordinates(direction);
      vec2 faceUV = clamp(0.5 + 0.5 * face.xy, 0.0, 1.0);
      float faceRow = face.z * ${childGrid}.0;
      float alpha = 0.0;
      vec3 childColor = vec3(0.0);
      if (detailLevel > ${parentGrid}.0) {
        vec2 quadrant = min(floor(2.0 * faceUV), vec2(1.0));
        vec2 texel = (2.0 * faceUV - quadrant) * ${tilesPerFace * tileSize - 1}.0;
        vec2 cell = floor(texel / ${tileSize}.0);
        vec2 tile = cell + quadrant * ${tilesPerFace}.0;
        vec2 local = texel - cell * ${tileSize}.0;
        vec4 child = tileEntry(tile, faceRow + ${mapHeight / 2}.0);
        if (child.a > 0.0) {
          vec2 end = vec2(${tileSize}.0) - step(${tilesPerFace - 1}.0, cell);
          alpha = min(featherEdge(child.a, tile, face, vec2(-1.0, 0.0), local.x),
                      featherEdge(child.a, tile, face, vec2(1.0, 0.0), end.x - local.x));
          alpha = min(alpha, featherEdge(child.a, tile, face, vec2(0.0, -1.0), local.y));
          alpha = min(alpha, featherEdge(child.a, tile, face, vec2(0.0, 1.0), end.y - local.y));
          childColor = tileColor(local, child);
          if (alpha >= 1.0) return childColor;
        }
      }
      if (parentReady > 0.5) {
        vec2 texel = faceUV * ${tilesPerFace * tileSize - 1}.0;
        vec2 tile = floor(texel / ${tileSize}.0);
        vec4 parent = tileEntry(tile, faceRow);
        if (parent.a > 0.0) fallback = tileColor(texel - tile * ${tileSize}.0, parent);
      }
      return mix(fallback, childColor, alpha);
    }
  `;

  function tileCoordinate(coordinate, grid) {
    const uv = Math.max(0, Math.min(1, 0.5 + 0.5 * coordinate));
    const quadrant = grid === childGrid ? Math.min(1, Math.floor(uv * 2)) : 0;
    const local = grid === childGrid ? uv * 2 - quadrant : uv;
    return quadrant * tilesPerFace
      + Math.floor(local * (tileSize * tilesPerFace - 1) / tileSize);
  }

  function desiredGrid(camera, engine, currentGrid) {
    const viewportSize = Math.min(engine.getRenderWidth(), engine.getRenderHeight());
    const altitude = Math.max(camera.radius - 1, 0.001);
    const projectedPixels = viewportSize / (altitude * Math.tan(camera.fov / 2));
    // Hysteresis keeps the texture stable near the switch.
    if (projectedPixels > (currentGrid === childGrid ? 4500 : 5200) * pixelScale) return childGrid;
    if (projectedPixels > (currentGrid ? 2000 : 2500) * pixelScale) return parentGrid;
    return 0;
  }

  function viewportTiles(camera, level, tileAt) {
    const visible = new Map();
    const parents = new Map();
    const center = new Map();
    const view = camera.getViewMatrix().m;
    const projection = camera.getProjectionMatrix().m;
    const { x, y, z } = camera.position;
    const radiusSquared = x*x + y*y + z*z;
    const sampleSteps = 48;

    // Intersect a screen grid with the sphere, then sample a small margin for panning.
    for (let row = -2; row <= sampleSteps + 2; row++) {
      const screenY = 2 * row / sampleSteps - 1;
      const sy = screenY / projection[5];
      for (let column = -2; column <= sampleSteps + 2; column++) {
        const screenX = 2 * column / sampleSteps - 1;
        const sx = screenX / projection[0];
        const dx = view[2] + view[0] * sx + view[1] * sy;
        const dy = view[6] + view[4] * sx + view[5] * sy;
        const dz = view[10] + view[8] * sx + view[9] * sy;
        const dot = x*dx + y*dy + z*dz;
        const lengthSquared = dx*dx + dy*dy + dz*dz;
        const discriminant = dot*dot - lengthSquared * (radiusSquared - 1);
        if (dot >= 0 || discriminant < 0) continue;

        const t = (-dot - Math.sqrt(discriminant)) / lengthSquared;
        const [face, u, v] = faceForDirection(x + t*dx, y + t*dy, z + t*dz);
        const at = grid => tileAt(grid, face, tileCoordinate(u, grid), tileCoordinate(v, grid));
        const tile = at(level);
        const inView = row >= 0 && row <= sampleSteps && column >= 0 && column <= sampleSteps;
        const weight = inView ? 1 : 0;
        visible.set(tile, (visible.get(tile) ?? 0) + weight);
        if (level === childGrid) {
          const distance = Math.max(Math.abs(screenX), Math.abs(screenY));
          if (distance <= centerFraction) center.set(tile, Math.min(center.get(tile) ?? 1, distance));
          const parent = at(parentGrid);
          parents.set(parent, (parents.get(parent) ?? 0) + weight);
        }
      }
    }
    const byCoverage = counts => [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a));
    const centralFirst = [...center.keys()].sort((a, b) => center.get(a) - center.get(b));
    return { visible: byCoverage(visible), parents: byCoverage(parents), center: centralFirst };
  }

  function stream(scene, camera, material, status) {
    const engine = scene.getEngine();
    // Keep roughly the same GPU memory budget as the native-size pages. Wide views
    // use more slots by filtering the same source tiles to smaller GPU footprints.
    const layouts = [1, 2, 4].map(scale => {
      const storedSize = tileSize / scale;
      const stride = storedSize + 2;
      const maxColumns = Math.floor(engine.getCaps().maxTextureSize / stride);
      const columns = [Math.min(7 * scale, maxColumns), Math.min(6 * scale, maxColumns)];
      const firstPageSlots = columns[0] ** 2;
      return { storedSize, stride, columns, firstPageSlots, capacity: firstPageSlots + columns[1] ** 2 };
    });
    let layout;
    let slots = [];
    let ages;
    const pages = [];
    const lookupBytes = new Uint8Array(childGrid * mapHeight * 4);
    const lookup = RawTexture.CreateRGBATexture(lookupBytes, childGrid, mapHeight,
      scene, false, false, Constants.TEXTURE_NEAREST_SAMPLINGMODE);
    lookup.anisotropicFilteringLevel = 1;
    const emptyAtlas = RawTexture.CreateRGBATexture(null, 1, 1, scene, false, false);
    const tileCanvas = document.createElement('canvas');
    const context = tileCanvas.getContext('2d', { willReadFrequently: true });
    const tiles = new Map();
    const resident = new Set();
    const fading = new Map();
    const pending = new Map();
    let level = 0;
    let displayedLevel = 0;
    let displayedParent = false;
    let wanted = new Set();
    let visibleTiles = [];
    let centerTiles = [];
    let parentTiles = [];
    let coverageLimited = false;
    let dirty = false;
    let previousView;

    material.setTexture('detailAtlas', emptyAtlas);
    material.setTexture('overflowAtlas', emptyAtlas);
    material.setTexture('tileMap', lookup);
    material.setFloat('detailLevel', displayedLevel);
    material.setFloat('parentReady', 0);

    function resetCache() {
      slots.fill(null);
      lookupBytes.fill(0);
      resident.clear();
      fading.clear();
      dirty = true;
    }
    engine.onContextRestoredObservable.add(resetCache);

    function configureAtlas(nextLayout) {
      layout = nextLayout;
      slots = Array(layout.capacity).fill(null);
      ages = new Float64Array(slots.length);
      material.setTexture('detailAtlas', emptyAtlas);
      material.setTexture('overflowAtlas', emptyAtlas);
      for (const page of pages) page?.dispose();
      pages.length = 0;
      tileCanvas.width = layout.stride;
      tileCanvas.height = layout.stride;
      context.imageSmoothingQuality = 'high';
      material.setVector2('atlasSizes', new Vector2(...layout.columns.map(count => count * layout.stride)));
      material.setFloat('storedTileSize', layout.storedSize);
      resetCache();
    }

    function tileAt(grid, face, x, y) {
      const layer = face + (grid === childGrid ? cubeFaces.length : 0);
      const key = (layer * childGrid + y) * childGrid + x;
      if (!tiles.has(key)) tiles.set(key, { level: grid, face, x, y, offset: key * 4, retryAt: 0 });
      return tiles.get(key);
    }

    function selectTiles(now) {
      const { visible, parents, center } = viewportTiles(camera, level, tileAt);
      const required = visible.length + parents.length;
      const next = layouts.find(candidate => candidate.capacity >= required) ?? layouts.at(-1);
      if (!layout || (next !== layout && required > layout.capacity)) {
        configureAtlas(next);
      } else {
        const sharper = layouts.find(candidate =>
          candidate.storedSize > layout.storedSize && required < candidate.capacity * 0.7);
        if (sharper) configureAtlas(sharper);
      }
      coverageLimited = visible.length > layout.capacity;
      visibleTiles = coverageLimited ? [] : visible;
      centerTiles = coverageLimited ? [] : center;
      parentTiles = visibleTiles.length + parents.length <= layout.capacity ? parents : [];
      const target = new Set(centerTiles);
      // After the center, interleave the rest with the parent for a consistent fallback.
      for (let i = 0; i < Math.max(visibleTiles.length, parentTiles.length); i++) {
        if (i < parentTiles.length) target.add(parentTiles[i]);
        if (i < visibleTiles.length) target.add(visibleTiles[i]);
      }

      wanted = target;
      for (let slot = 0; slot < slots.length; slot++) {
        if (wanted.has(slots[slot])) ages[slot] = now;
      }
    }

    function drawTile(bitmap) {
      const size = layout.storedSize;
      if (size === tileSize) {
        context.drawImage(bitmap, 0, 0);
        return;
      }
      // Resample the interior and the one-texel gutters separately so bilinear
      // filtering can still reach the neighboring source texels at tile edges.
      const source = [[0, 1], [1, tileSize], [tileSize + 1, 1]];
      const target = [[0, 1], [1, size], [size + 1, 1]];
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 3; x++) {
          context.drawImage(bitmap, source[x][0], source[y][0], source[x][1], source[y][1],
            target[x][0], target[y][0], target[x][1], target[y][1]);
        }
      }
    }

    function findSlot() {
      const empty = slots.indexOf(null);
      if (empty >= 0) return empty;
      let oldest = -1;
      for (let slot = 0; slot < slots.length; slot++) {
        if (!wanted.has(slots[slot]) && (oldest < 0 || ages[slot] < ages[oldest])) oldest = slot;
      }
      return oldest;
    }

    async function loadTile(tile) {
      const controller = new AbortController();
      pending.set(tile, controller);
      let bitmap;
      try {
        const face = cubeFaces[tile.face];
        const url = tile.level === parentGrid ? parentUrl({ face, x: tile.x, y: tile.y })
          : childUrl({ face, qx: Math.floor(tile.x / tilesPerFace), qy: Math.floor(tile.y / tilesPerFace),
            x: tile.x % tilesPerFace, y: tile.y % tilesPerFace });
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`Tile HTTP ${response.status}`);
        bitmap = await createImageBitmap(await response.blob());
        if (controller.signal.aborted || !wanted.has(tile)) return;
        if (bitmap.width !== paddedSize || bitmap.height !== paddedSize) throw new Error('Invalid tile dimensions');

        const slot = findSlot();
        if (slot < 0) return;
        const { columns, firstPageSlots, stride } = layout;
        const page = slot < firstPageSlots ? 0 : 1;
        const index = page === 0 ? slot : slot - firstPageSlots;
        const x = index % columns[page];
        const y = Math.floor(index / columns[page]);
        if (!pages[page]) {
          const size = columns[page] * stride;
          pages[page] = RawTexture.CreateRGBATexture(null, size, size,
            scene, false, false, Constants.TEXTURE_BILINEAR_SAMPLINGMODE);
          pages[page].anisotropicFilteringLevel = 1;
          material.setTexture(page === 0 ? 'detailAtlas' : 'overflowAtlas', pages[page]);
        }

        drawTile(bitmap);
        const { data } = context.getImageData(0, 0, stride, stride);
        engine.updateTextureData(pages[page].getInternalTexture(), data,
          x * stride, y * stride, stride, stride);
        const previous = slots[slot];
        if (previous) {
          resident.delete(previous);
          fading.delete(previous);
          lookupBytes.fill(0, previous.offset, previous.offset + 4);
        }
        slots[slot] = tile;
        ages[slot] = performance.now();
        const isEnhanced = tile.level === childGrid;
        lookupBytes.set([x, y, page + 1, isEnhanced ? 0 : 255], tile.offset);
        if (isEnhanced) fading.set(tile, ages[slot]);
        resident.add(tile);
        dirty = true;
      } catch {
        if (!controller.signal.aborted) tile.retryAt = performance.now() + 4000;
      } finally {
        bitmap?.close();
        pending.delete(tile);
      }
    }

    function requestTiles(candidates, now) {
      for (const tile of candidates) {
        if (pending.size >= 12) break;
        if (!resident.has(tile) && !pending.has(tile) && tile.retryAt <= now) void loadTile(tile);
      }
    }

    scene.onBeforeRenderObservable.add(() => {
      const now = performance.now();
      level = desiredGrid(camera, engine, level);
      if (level === 0) {
        wanted.clear();
        visibleTiles = [];
        centerTiles = [];
        parentTiles = [];
        previousView = undefined;
      } else {
        const view = [level, camera.alpha, camera.beta, camera.radius, camera.fov,
          engine.getRenderWidth(), engine.getRenderHeight()];
        if (!previousView || view.some((value, i) => value !== previousView[i])) {
          selectTiles(now);
          previousView = view;
        }
      }

      const centerReady = centerTiles.reduce((count, tile) => count + Number(resident.has(tile)), 0);
      const centerTarget = Math.ceil(centerTiles.length * centerFraction);
      const showEnhanced = level === childGrid && centerTarget > 0 && centerReady >= centerTarget;
      const waitingForCenter = level === childGrid && centerTarget > 0 && !showEnhanced;
      const priority = waitingForCenter ? new Set([...centerTiles, ...parentTiles]) : wanted;
      for (const [tile, request] of pending) {
        if (!priority.has(tile)) request.abort();
      }
      requestTiles(priority, now);
      for (const [tile, started] of fading) {
        const opacity = Math.min(255, Math.floor((now - started) * 255 / fadeDuration));
        if (lookupBytes[tile.offset + 3] !== opacity) {
          lookupBytes[tile.offset + 3] = opacity;
          dirty = true;
        }
        if (opacity === 255) fading.delete(tile);
      }
      if (dirty) {
        lookup.update(lookupBytes);
        dirty = false;
      }

      const ready = visibleTiles.reduce((count, tile) => count + Number(resident.has(tile)), 0);
      const parentsReady = level === parentGrid ? visibleTiles.length > 0 && ready === visibleTiles.length
        : parentTiles.length > 0 && parentTiles.every(tile => resident.has(tile));
      const nextDisplay = showEnhanced ? childGrid : parentsReady ? parentGrid : 0;
      if (nextDisplay !== displayedLevel) {
        displayedLevel = nextDisplay;
        material.setFloat('detailLevel', displayedLevel);
      }
      if (parentsReady !== displayedParent) {
        displayedParent = parentsReady;
        material.setFloat('parentReady', Number(displayedParent));
      }
      const label = level !== childGrid ? ''
        : coverageLimited ? 'Zoom in for enhanced detail'
        : waitingForCenter ? `Loading center tiles · ${centerReady}/${centerTarget}` : '';
      if (status.textContent !== label) {
        status.textContent = label;
        status.hidden = label === '';
      }
    });
  }

  return { shader, atlasSize, stream };
}

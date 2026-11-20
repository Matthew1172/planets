import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { Engine } from '@babylonjs/core/Engines/engine.js';
import { Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Scene } from '@babylonjs/core/scene.js';
import { loadPlanet } from './planet-config.js';
import { createPlanetMaterial } from './planet-material.js';
import { createSurfaceDetail } from './surface-detail.js';
import { createQuadSphere } from './quad-sphere.js';

// Shown when the URL has no ?planet=<id>.
const defaultPlanet = 'jol';

const canvas = document.querySelector('#scene');
const status = document.querySelector('#status');

try {
  const planetsUrl = new URL(`${import.meta.env.BASE_URL}planets/`, location.href);
  const planetId = new URLSearchParams(location.search).get('planet') ?? defaultPlanet;
  const planet = await loadPlanet(planetId, planetsUrl);
  document.title = `${planet.name} · Babylon.js`;
  canvas.setAttribute('aria-label', planet.description ? `3D view of ${planet.name}: ${planet.description}` : `3D view of ${planet.name}`);
  await showPlanet(planet);
} catch (error) {
  status.textContent = error.message;
  status.hidden = false;
  throw error;
}

async function showPlanet(planet) {
  const engine = new Engine(canvas, true);
  const scene = new Scene(engine);
  scene.clearColor = new Color4(...planet.background, 1);

  const texturesAvailable = planet.textures !== null && await imageExists(planet.textures.overview({ face: 'px' }));
  const surfaceDetail = texturesAvailable && planet.textures.detail ? createSurfaceDetail(planet.textures.detail) : null;
  const detailEnabled = surfaceDetail !== null && !engine.needPOTTextures
    && engine.getCaps().maxTextureSize >= surfaceDetail.atlasSize;
  const camera = new ArcRotateCamera('camera', -Math.PI / 2, Math.PI / 2, 5, Vector3.Zero(), scene);
  camera.attachControl(canvas, true);
  camera.panningSensibility = 0;
  camera.lowerRadiusLimit = detailEnabled ? 1.035 : 2.6;
  camera.upperRadiusLimit = 12;

  const sphere = createQuadSphere('planet', { radius: 1, subdivisions: 24 }, scene);
  sphere.material = createPlanetMaterial(scene, planet, { texturesAvailable, detail: detailEnabled ? surfaceDetail : null });

  if (detailEnabled) {
    camera.minZ = 0.01;
    camera.inputs.attached.mousewheel.customComputeDeltaFromMouseWheel = wheelDelta => {
      const altitude = camera.radius - 1;
      const step = Math.max(-1, Math.min(1, wheelDelta / 360));
      return altitude * (1 - Math.exp(-step)) * (1 - camera.inertia);
    };
    surfaceDetail.stream(scene, camera, sphere.material, status);
  }

  function resize() {
    engine.resize();
    camera.fovMode = canvas.clientWidth < canvas.clientHeight
      ? ArcRotateCamera.FOVMODE_HORIZONTAL_FIXED
      : ArcRotateCamera.FOVMODE_VERTICAL_FIXED;
  }

  window.addEventListener('resize', resize);
  resize();
  engine.runRenderLoop(() => scene.render());
}

// Vite's dev server answers missing files with index.html, so check the type too.
async function imageExists(url) {
  const response = await fetch(url, { method: 'HEAD' }).catch(() => null);
  return Boolean(response?.ok && response.headers.get('content-type')?.startsWith('image/'));
}

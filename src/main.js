import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { Engine } from '@babylonjs/core/Engines/engine.js';
import { Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Scene } from '@babylonjs/core/scene.js';
import { createJolMaterial, overviewUrl } from './jol-material.js';
import { jolAtlasSize, streamJolDetail } from './jol-detail.js';
import { createQuadSphere } from './quad-sphere.js';

const canvas = document.querySelector('#scene');
const engine = new Engine(canvas, true);
const scene = new Scene(engine);
scene.clearColor = new Color4(0.02, 0.03, 0.065, 1);

const overview = await fetch(`${overviewUrl}_px.png`, { method: 'HEAD' }).catch(() => null);
const texturesAvailable = Boolean(overview?.ok && overview.headers.get('content-type')?.startsWith('image/'));
const detailEnabled = texturesAvailable && !engine.needPOTTextures && engine.getCaps().maxTextureSize >= jolAtlasSize;
const camera = new ArcRotateCamera('camera', -Math.PI / 2, Math.PI / 2, 5, Vector3.Zero(), scene);
camera.attachControl(canvas, true);
camera.panningSensibility = 0;
camera.lowerRadiusLimit = detailEnabled ? 1.035 : 2.6;
camera.upperRadiusLimit = 12;

const planet = createQuadSphere('planet', { radius: 1, subdivisions: 24 }, scene);
planet.material = createJolMaterial(scene, texturesAvailable, detailEnabled);

if (detailEnabled) {
  camera.minZ = 0.01;
  camera.inputs.attached.mousewheel.customComputeDeltaFromMouseWheel = wheelDelta => {
    const altitude = camera.radius - 1;
    const step = Math.max(-1, Math.min(1, wheelDelta / 360));
    return altitude * (1 - Math.exp(-step)) * (1 - camera.inertia);
  };
  streamJolDetail(scene, camera, planet.material, document.querySelector('#texture-status'));
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

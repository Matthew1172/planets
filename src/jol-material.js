import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { CubeTexture } from '@babylonjs/core/Materials/Textures/cubeTexture.js';
import { detailShader, jolFaces } from './jol-detail.js';

const vertexSource = `
  attribute vec3 position;
  attribute vec3 normal;
  uniform mat4 worldViewProjection;
  varying vec3 surfaceDirection;

  void main() {
    surfaceDirection = normal;
    gl_Position = worldViewProjection * vec4(position, 1.0);
  }
`;

const fragmentSource = `
  precision highp float;
  varying vec3 surfaceDirection;
  #ifdef JOL_TEXTURES
    uniform samplerCube surfaceMap;
  #endif

  #ifdef JOL_DETAIL
    ${detailShader}
  #endif

  void main() {
    vec3 direction = normalize(surfaceDirection);
    vec3 albedo = vec3(0.19, 0.45, 0.77);
    #ifdef JOL_TEXTURES
      albedo = textureCube(surfaceMap, direction).rgb;
    #endif
    #ifdef JOL_DETAIL
      albedo = sampleJolDetail(direction, albedo);
    #endif
    vec3 sun = normalize(vec3(-1.0, 1.0, -1.0));
    float daylight = max(dot(direction, sun), 0.0);
    float illumination = 0.24 + 0.1 * (0.5 + 0.5 * direction.y) + 0.75 * daylight;
    gl_FragColor = vec4(albedo * sqrt(illumination), 1.0);
  }
`;

export const overviewUrl = `${import.meta.env.BASE_URL}textures/jol-parent/overview/jol`;

export function createJolMaterial(scene, texturesAvailable, detailEnabled) {
  const uniforms = ['worldViewProjection'];
  const samplers = texturesAvailable ? ['surfaceMap'] : [];
  const defines = texturesAvailable ? ['JOL_TEXTURES'] : [];
  if (detailEnabled) {
    uniforms.push('atlasSizes', 'storedTileSize', 'detailLevel', 'parentReady');
    samplers.push('detailAtlas', 'overflowAtlas', 'tileMap');
    defines.push('JOL_DETAIL');
  }
  const material = new ShaderMaterial(
    'Jol surface',
    scene,
    { vertexSource, fragmentSource },
    { attributes: ['position', 'normal'], uniforms, samplers, defines }
  );
  if (texturesAvailable) {
    material.setTexture('surfaceMap', new CubeTexture(overviewUrl, scene, jolFaces.map(face => `_${face}.png`)));
  }
  return material;
}

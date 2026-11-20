import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { CubeTextureCreateFromImages } from '@babylonjs/core/Materials/Textures/cubeTexture.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { cubeFaces } from './planet-config.js';

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

const fragmentSource = detailShader => `
  precision highp float;
  varying vec3 surfaceDirection;
  uniform vec3 baseColor;
  uniform vec3 sunDirection;
  #ifdef SURFACE_TEXTURES
    uniform samplerCube surfaceMap;
  #endif

  #ifdef SURFACE_DETAIL
    ${detailShader}
  #endif

  void main() {
    vec3 direction = normalize(surfaceDirection);
    vec3 albedo = baseColor;
    #ifdef SURFACE_TEXTURES
      albedo = textureCube(surfaceMap, direction).rgb;
    #endif
    #ifdef SURFACE_DETAIL
      albedo = sampleSurfaceDetail(direction, albedo);
    #endif
    float daylight = max(dot(direction, sunDirection), 0.0);
    float illumination = 0.24 + 0.1 * (0.5 + 0.5 * direction.y) + 0.75 * daylight;
    gl_FragColor = vec4(albedo * sqrt(illumination), 1.0);
  }
`;

// Pass `detail` (from createSurfaceDetail) to enable streamed tiles; it requires textures.
export function createPlanetMaterial(scene, planet, { texturesAvailable, detail }) {
  const uniforms = ['worldViewProjection', 'baseColor', 'sunDirection'];
  const samplers = texturesAvailable ? ['surfaceMap'] : [];
  const defines = texturesAvailable ? ['SURFACE_TEXTURES'] : [];
  if (detail) {
    uniforms.push('atlasSizes', 'storedTileSize', 'detailLevel', 'parentReady');
    samplers.push('detailAtlas', 'overflowAtlas', 'tileMap');
    defines.push('SURFACE_DETAIL');
  }
  const material = new ShaderMaterial(
    `${planet.name} surface`,
    scene,
    { vertexSource, fragmentSource: fragmentSource(detail?.shader ?? '') },
    { attributes: ['position', 'normal'], uniforms, samplers, defines }
  );
  material.setColor3('baseColor', Color3.FromArray(planet.baseColor));
  material.setVector3('sunDirection', Vector3.FromArray(planet.sunDirection).normalize());
  if (texturesAvailable) {
    const faceUrls = cubeFaces.map(face => planet.textures.overview({ face }));
    material.setTexture('surfaceMap', CubeTextureCreateFromImages(faceUrls, scene));
  }
  return material;
}

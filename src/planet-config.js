// Shader face indices follow this order; `{face}` in texture paths uses these names.
export const cubeFaces = ['px', 'py', 'pz', 'nx', 'ny', 'nz'];

const defaults = {
  baseColor: [0.5, 0.5, 0.5],
  sunDirection: [-1, 1, -1],
  background: [0.02, 0.03, 0.065],
};

export async function loadPlanet(id, planetsUrl) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(`Invalid planet id "${id}"`);
  const configUrl = new URL(`${id}.json`, planetsUrl).href;
  const response = await fetch(configUrl);
  if (!response.ok || !response.headers.get('content-type')?.includes('json')) {
    throw new Error(`Planet "${id}" not found (${configUrl})`);
  }
  return parsePlanetConfig(id, await response.json(), configUrl);
}

export function parsePlanetConfig(id, config, configUrl) {
  const fail = message => { throw new Error(`Planet "${id}": ${message}`); };
  if (!isObject(config)) fail('config must be a JSON object');
  if (typeof config.name !== 'string' || !config.name) fail('"name" must be a non-empty string');
  if (config.description !== undefined && typeof config.description !== 'string') fail('"description" must be a string');

  const vector = (key, min, max) => {
    const value = config[key] ?? defaults[key];
    const valid = Array.isArray(value) && value.length === 3
      && value.every(n => typeof n === 'number' && n >= min && n <= max);
    if (!valid) fail(`"${key}" must be three numbers between ${min} and ${max}`);
    return value;
  };
  const baseColor = vector('baseColor', 0, 1);
  const background = vector('background', 0, 1);
  const sunDirection = vector('sunDirection', -Infinity, Infinity);
  if (sunDirection.every(n => n === 0)) fail('"sunDirection" must not be zero');

  return {
    id,
    name: config.name,
    description: config.description ?? '',
    baseColor,
    background,
    sunDirection,
    textures: config.textures === undefined ? null : parseTextures(config.textures, configUrl, fail),
  };
}

function parseTextures(textures, configUrl, fail) {
  if (!isObject(textures)) fail('"textures" must be an object');
  const baseUrl = new URL(textures.baseUrl ?? './', configUrl);
  const path = (key, placeholders) => {
    const template = key.split('.').reduce((value, part) => value?.[part], textures);
    if (typeof template !== 'string') fail(`"textures.${key}" must be a path string`);
    const missing = placeholders.filter(name => !template.includes(`{${name}}`));
    if (missing.length) fail(`"textures.${key}" must contain ${missing.map(name => `{${name}}`).join(', ')}`);
    // Fill before resolving: URL() would percent-encode the braces.
    return values => new URL(template.replace(/\{(\w+)\}/g, (_, name) => values[name]), baseUrl).href;
  };

  const overview = path('overview', ['face']);
  if (textures.detail === undefined) return { overview, detail: null };
  if (!isObject(textures.detail)) fail('"textures.detail" must be an object');
  const { tileSize, tilesPerFace } = textures.detail;
  if (!Number.isInteger(tileSize) || tileSize < 16) fail('"textures.detail.tileSize" must be an integer of at least 16');
  if (!Number.isInteger(tilesPerFace) || tilesPerFace < 1 || tilesPerFace > 64) {
    fail('"textures.detail.tilesPerFace" must be an integer from 1 to 64');
  }
  return {
    overview,
    detail: {
      tileSize,
      tilesPerFace,
      parent: path('detail.parent', ['face', 'x', 'y']),
      child: path('detail.child', ['face', 'qx', 'qy', 'x', 'y']),
    },
  };
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parsePlanetConfig } from '../src/planet-config.js';

const configUrl = 'http://localhost/planets/demo.json';
const parse = config => parsePlanetConfig('demo', config, configUrl);

test('a name alone gives an untextured planet with default lighting', () => {
  const planet = parse({ name: 'Demo' });
  assert.equal(planet.name, 'Demo');
  assert.equal(planet.description, '');
  assert.deepEqual(planet.baseColor, [0.5, 0.5, 0.5]);
  assert.deepEqual(planet.sunDirection, [-1, 1, -1]);
  assert.equal(planet.textures, null);
});

test('texture paths are filled and resolved against baseUrl relative to the config', () => {
  const planet = parse({
    name: 'Demo',
    textures: {
      baseUrl: '../textures/demo/',
      overview: 'overview/{face}.png',
      detail: {
        tileSize: 512,
        tilesPerFace: 8,
        parent: 'parent/{face}/{x}-{y}.png',
        child: 'child/{face}/{qx}-{qy}/{x}-{y}.webp',
      },
    },
  });
  assert.equal(planet.textures.overview({ face: 'nz' }), 'http://localhost/textures/demo/overview/nz.png');
  assert.equal(planet.textures.detail.parent({ face: 'px', x: 3, y: 7 }),
    'http://localhost/textures/demo/parent/px/3-7.png');
  assert.equal(planet.textures.detail.child({ face: 'py', qx: 1, qy: 0, x: 15, y: 2 }),
    'http://localhost/textures/demo/child/py/1-0/15-2.webp');
  assert.equal(planet.textures.detail.tileSize, 512);
});

test('detail is optional', () => {
  const planet = parse({ name: 'Demo', textures: { overview: '{face}.png' } });
  assert.equal(planet.textures.overview({ face: 'px' }), 'http://localhost/planets/px.png');
  assert.equal(planet.textures.detail, null);
});

test('invalid configs name the planet and the field', () => {
  assert.throws(() => parse({}), /Planet "demo": "name"/);
  assert.throws(() => parse({ name: 'Demo', baseColor: [1, 2, 0] }), /"baseColor"/);
  assert.throws(() => parse({ name: 'Demo', sunDirection: [0, 0, 0] }), /"sunDirection" must not be zero/);
  assert.throws(() => parse({ name: 'Demo', textures: { overview: 'overview.png' } }), /must contain \{face\}/);
  assert.throws(() => parse({
    name: 'Demo',
    textures: { overview: '{face}.png', detail: { tileSize: 1024, tilesPerFace: 16, parent: '{face}/{x}-{y}.png', child: '{face}/{x}-{y}.png' } },
  }), /"textures.detail.child" must contain \{qx\}, \{qy\}/);
});

test('every planet config in public/planets is valid', async () => {
  const directory = new URL('../public/planets/', import.meta.url);
  const files = (await readdir(directory)).filter(file => file.endsWith('.json'));
  assert.ok(files.length > 0);
  for (const file of files) {
    const config = JSON.parse(await readFile(new URL(file, directory), 'utf8'));
    parsePlanetConfig(file.slice(0, -5), config, new URL(file, directory).href);
  }
});

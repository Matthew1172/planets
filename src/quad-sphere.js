import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';

export function createQuadSphere(name, { radius, subdivisions }, scene) {
  const positions = [];
  const normals = [];
  const quads = [];
  const vertexByCubePoint = new Map();
  const rowLength = subdivisions + 1;

  function vertexAt(cubePoint) {
    // Integer cube coordinates let adjacent faces share their edge and corner vertices.
    const key = cubePoint.join(',');
    const existingIndex = vertexByCubePoint.get(key);
    if (existingIndex !== undefined) return existingIndex;

    const index = positions.length / 3;
    const [x, y, z] = cubePoint;
    const length = Math.hypot(x, y, z);
    const normal = [x / length, y / length, z / length];
    normals.push(...normal);
    positions.push(...normal.map(component => component * radius));
    vertexByCubePoint.set(key, index);
    return index;
  }

  for (const axis of [0, 1, 2]) {
    const uAxis = (axis + 1) % 3;
    const vAxis = (axis + 2) % 3;

    for (const side of [-1, 1]) {
      const grid = [];
      for (let row = 0; row <= subdivisions; row++) {
        for (let column = 0; column <= subdivisions; column++) {
          const cubePoint = [];
          cubePoint[axis] = side * subdivisions;
          cubePoint[uAxis] = 2 * column - subdivisions;
          cubePoint[vAxis] = 2 * row - subdivisions;
          grid.push(vertexAt(cubePoint));
        }
      }

      for (let row = 0; row < subdivisions; row++) {
        for (let column = 0; column < subdivisions; column++) {
          const cell = row * rowLength + column;
          const a = grid[cell];
          const b = grid[cell + 1];
          const c = grid[cell + rowLength + 1];
          const d = grid[cell + rowLength];
          quads.push(side === 1 ? [a, d, c, b] : [a, b, c, d]);
        }
      }
    }
  }

  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.normals = normals;
  // Babylon.js draws triangles. Split each quad along the a–c diagonal.
  vertexData.indices = quads.flatMap(([a, b, c, d]) => [a, b, c, a, c, d]);
  const mesh = new Mesh(name, scene);
  vertexData.applyToMesh(mesh);
  return mesh;
}

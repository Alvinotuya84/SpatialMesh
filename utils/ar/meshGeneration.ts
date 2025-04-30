import { THREE } from "expo-three";
import {
  ScanFrame,
  ScanPoint,
  Mesh,
  ProcessingStatus,
} from "../../stores/scanStore";
import { v4 as uuidv4 } from "uuid";

export interface MeshGenerationOptions {
  resolution: number;
  smoothingIterations: number;
  simplifyRatio: number;
  chunkSize: number;
  onStatusUpdate?: (status: ProcessingStatus) => void;
  onError?: (error: string) => void;
}

const defaultOptions: MeshGenerationOptions = {
  resolution: 0.05,
  smoothingIterations: 2,
  simplifyRatio: 0.8,
  chunkSize: 10,
};

export async function generateMeshFromFrames(
  frames: ScanFrame[],
  options: Partial<MeshGenerationOptions> = {}
): Promise<Mesh> {
  const opts = { ...defaultOptions, ...options };

  try {
    opts.onStatusUpdate?.({
      stage: "pointcloud",
      progress: 0,
      message: "Merging point clouds from frames...",
    });

    const pointCloud = await mergePointCloudsFromFrames(frames, opts);

    opts.onStatusUpdate?.({
      stage: "meshing",
      progress: 30,
      message: "Creating mesh from point cloud...",
    });

    const rawMesh = await createMeshFromPointCloud(pointCloud, opts);

    opts.onStatusUpdate?.({
      stage: "optimizing",
      progress: 70,
      message: "Optimizing mesh...",
    });

    const optimizedMesh = await optimizeMesh(rawMesh, opts);

    opts.onStatusUpdate?.({
      stage: "completed",
      progress: 100,
      message: "Mesh generation complete",
    });

    return {
      id: uuidv4(),
      vertices: optimizedMesh.vertices,
      faces: optimizedMesh.faces,
      normals: optimizedMesh.normals,
      uvs: optimizedMesh.uvs,
      name: `Scan ${new Date().toLocaleString()}`,
      createdAt: Date.now(),
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown error in mesh generation";
    opts.onError?.(errorMessage);
    throw error;
  }
}

async function mergePointCloudsFromFrames(
  frames: ScanFrame[],
  options: MeshGenerationOptions
): Promise<ScanPoint[]> {
  const { chunkSize, onStatusUpdate } = options;
  const mergedPoints: ScanPoint[] = [];

  for (let i = 0; i < frames.length; i += chunkSize) {
    const chunk = frames.slice(i, i + chunkSize);

    onStatusUpdate?.({
      stage: "pointcloud",
      progress: Math.min(25, (i / frames.length) * 25),
      message: `Processing frames ${i + 1}-${Math.min(
        i + chunkSize,
        frames.length
      )} of ${frames.length}...`,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    for (const frame of chunk) {
      for (const point of frame.points) {
        const worldPoint = transformPointToWorldSpace(
          point,
          frame.cameraPosition,
          frame.cameraRotation
        );
        mergedPoints.push(worldPoint);
      }
    }
  }

  const filteredPoints = filterPointCloud(mergedPoints, options.resolution);

  return filteredPoints;
}

function transformPointToWorldSpace(
  point: ScanPoint,
  cameraPosition: THREE.Vector3,
  cameraRotation: THREE.Quaternion
): ScanPoint {
  const pointInCameraSpace = point.position.clone();

  const cameraMatrix = new THREE.Matrix4().compose(
    cameraPosition,
    cameraRotation,
    new THREE.Vector3(1, 1, 1)
  );

  const worldPosition = pointInCameraSpace.applyMatrix4(cameraMatrix);

  let worldNormal: THREE.Vector3 | undefined = undefined;
  if (point.normal) {
    worldNormal = point.normal.clone().applyQuaternion(cameraRotation);
  }

  return {
    position: worldPosition,
    normal: worldNormal,
    color: point.color,
    confidence: point.confidence,
  };
}

function filterPointCloud(
  points: ScanPoint[],
  resolution: number
): ScanPoint[] {
  const gridCells: Map<string, ScanPoint[]> = new Map();

  for (const point of points) {
    const gridKey = [
      Math.floor(point.position.x / resolution),
      Math.floor(point.position.y / resolution),
      Math.floor(point.position.z / resolution),
    ].join(",");

    if (!gridCells.has(gridKey)) {
      gridCells.set(gridKey, []);
    }

    gridCells.get(gridKey)!.push(point);
  }

  const filteredPoints: ScanPoint[] = [];

  for (const [_, cellPoints] of gridCells.entries()) {
    if (cellPoints.length > 0) {
      const avgPosition = new THREE.Vector3();
      let avgNormal: THREE.Vector3 | undefined;
      let avgColor: THREE.Color | undefined;
      let avgConfidence = 0;
      let pointsWithNormals = 0;
      let pointsWithColors = 0;

      for (const p of cellPoints) {
        avgPosition.add(p.position);

        if (p.normal) {
          if (!avgNormal) avgNormal = new THREE.Vector3();
          avgNormal.add(p.normal);
          pointsWithNormals++;
        }

        if (p.color) {
          if (!avgColor) avgColor = new THREE.Color();
          avgColor.add(p.color);
          pointsWithColors++;
        }

        if (p.confidence) {
          avgConfidence += p.confidence;
        }
      }

      avgPosition.divideScalar(cellPoints.length);

      if (avgNormal && pointsWithNormals > 0) {
        avgNormal.divideScalar(pointsWithNormals);
        avgNormal.normalize();
      }

      if (avgColor && pointsWithColors > 0) {
        const r = avgColor.r / pointsWithColors;
        const g = avgColor.g / pointsWithColors;
        const b = avgColor.b / pointsWithColors;
        avgColor.setRGB(r, g, b);
      }

      if (cellPoints.length > 0) {
        avgConfidence /= cellPoints.length;
      }

      filteredPoints.push({
        position: avgPosition,
        normal: avgNormal,
        color: avgColor,
        confidence: avgConfidence > 0 ? avgConfidence : undefined,
      });
    }
  }

  return filteredPoints;
}

async function createMeshFromPointCloud(
  points: ScanPoint[],
  options: MeshGenerationOptions
): Promise<{
  vertices: number[];
  faces: number[];
  normals?: number[];
  uvs?: number[];
}> {
  const { onStatusUpdate } = options;

  onStatusUpdate?.({
    stage: "meshing",
    progress: 35,
    message: "Estimating mesh surface...",
  });

  // Voxelize the space containing the point cloud
  const pointsWithNormals = ensureNormals(points);
  const voxelGrid = createVoxelGrid(pointsWithNormals, options.resolution);

  // Compute the implicit surface using Poisson reconstruction
  onStatusUpdate?.({
    stage: "meshing",
    progress: 45,
    message: "Creating triangle mesh...",
  });

  const { vertices, faces, normals } = extractIsosurface(
    voxelGrid,
    options.resolution
  );

  onStatusUpdate?.({
    stage: "meshing",
    progress: 60,
    message: "Finalizing mesh...",
  });

  return {
    vertices,
    faces,
    normals,
  };
}

function ensureNormals(points: ScanPoint[]): ScanPoint[] {
  const pointsWithNormals: ScanPoint[] = [];

  for (const point of points) {
    if (point.normal) {
      pointsWithNormals.push(point);
    } else {
      // Estimate normal from neighboring points
      const normal = estimateNormal(point, points);
      pointsWithNormals.push({ ...point, normal });
    }
  }

  return pointsWithNormals;
}

function estimateNormal(
  point: ScanPoint,
  allPoints: ScanPoint[]
): THREE.Vector3 {
  // Find nearest neighbors
  const neighbors: ScanPoint[] = [];
  const maxNeighbors = 10;
  const maxDistance = 0.2;

  for (const p of allPoints) {
    if (p !== point) {
      const distance = p.position.distanceTo(point.position);
      if (distance < maxDistance) {
        neighbors.push(p);
        if (neighbors.length >= maxNeighbors) break;
      }
    }
  }

  if (neighbors.length < 3) {
    // Not enough neighbors to estimate normal, return default
    return new THREE.Vector3(0, 1, 0);
  }

  // Calculate centroid
  const centroid = new THREE.Vector3();
  for (const neighbor of neighbors) {
    centroid.add(neighbor.position);
  }
  centroid.divideScalar(neighbors.length);

  // Calculate covariance matrix
  let xx = 0,
    xy = 0,
    xz = 0;
  let yy = 0,
    yz = 0,
    zz = 0;

  for (const neighbor of neighbors) {
    const px = neighbor.position.x - centroid.x;
    const py = neighbor.position.y - centroid.y;
    const pz = neighbor.position.z - centroid.z;

    xx += px * px;
    xy += px * py;
    xz += px * pz;
    yy += py * py;
    yz += py * pz;
    zz += pz * pz;
  }

  // Find normal through SVD (approximated for simplicity)
  // This would be more robust with a full SVD implementation
  const det1 = yy * zz - yz * yz;
  const det2 = xy * zz - xz * yz;
  const det3 = xy * yz - xz * yy;

  const norm = Math.sqrt(det1 * det1 + det2 * det2 + det3 * det3);

  if (norm < 1e-10) {
    return new THREE.Vector3(0, 1, 0);
  }

  return new THREE.Vector3(det1, -det2, det3).normalize();
}

function createVoxelGrid(points: ScanPoint[], resolution: number): any {
  // Find bounding box
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

  for (const point of points) {
    min.x = Math.min(min.x, point.position.x);
    min.y = Math.min(min.y, point.position.y);
    min.z = Math.min(min.z, point.position.z);

    max.x = Math.max(max.x, point.position.x);
    max.y = Math.max(max.y, point.position.y);
    max.z = Math.max(max.z, point.position.z);
  }

  // Add padding
  min.subScalar(resolution * 4);
  max.addScalar(resolution * 4);

  // Calculate grid dimensions
  const dimensions = {
    x: Math.ceil((max.x - min.x) / resolution),
    y: Math.ceil((max.y - min.y) / resolution),
    z: Math.ceil((max.z - min.z) / resolution),
  };

  // Create grid
  const grid = {
    min,
    max,
    dimensions,
    resolution,
    values: new Float32Array(dimensions.x * dimensions.y * dimensions.z),
    normals: new Float32Array(dimensions.x * dimensions.y * dimensions.z * 3),
    getIndex: (x: number, y: number, z: number) => {
      return x + y * dimensions.x + z * dimensions.x * dimensions.y;
    },
    getPosition: (index: number) => {
      const x = index % dimensions.x;
      const y = Math.floor(index / dimensions.x) % dimensions.y;
      const z = Math.floor(index / (dimensions.x * dimensions.y));

      return new THREE.Vector3(
        min.x + x * resolution,
        min.y + y * resolution,
        min.z + z * resolution
      );
    },
  };

  // Initialize grid values
  for (let i = 0; i < grid.values.length; i++) {
    grid.values[i] = 1.0; // Outside value (positive)
  }

  // Fill grid using signed distance function
  for (const point of points) {
    const p = point.position;
    const n = point.normal!;

    // Convert point to grid coordinates
    const gx = Math.floor((p.x - min.x) / resolution);
    const gy = Math.floor((p.y - min.y) / resolution);
    const gz = Math.floor((p.z - min.z) / resolution);

    // Calculate influence radius in grid units
    const influenceRadius = Math.ceil(3 / resolution);

    // Update surrounding voxels
    for (let dx = -influenceRadius; dx <= influenceRadius; dx++) {
      for (let dy = -influenceRadius; dy <= influenceRadius; dy++) {
        for (let dz = -influenceRadius; dz <= influenceRadius; dz++) {
          const nx = gx + dx;
          const ny = gy + dy;
          const nz = gz + dz;

          // Check bounds
          if (
            nx < 0 ||
            ny < 0 ||
            nz < 0 ||
            nx >= dimensions.x ||
            ny >= dimensions.y ||
            nz >= dimensions.z
          ) {
            continue;
          }

          // Calculate distance from voxel center to point
          const voxelPos = new THREE.Vector3(
            min.x + nx * resolution,
            min.y + ny * resolution,
            min.z + nz * resolution
          );

          const toVoxel = new THREE.Vector3().subVectors(voxelPos, p);
          const dist = toVoxel.length();

          if (dist > 3) continue; // Skip if too far

          // Calculate signed distance using point normal
          const signedDist = dist * Math.sign(toVoxel.dot(n));

          // Weight by distance
          const weight = Math.max(0, 1 - dist / 3);

          // Update grid index
          const index = grid.getIndex(nx, ny, nz);

          // Blend with existing value (weighted average)
          const oldValue = grid.values[index];
          const oldWeight = grid.normals[index * 3 + 3]; // Use 4th component for weight

          if (oldWeight === 0) {
            grid.values[index] = signedDist;
            grid.normals[index * 3] = n.x;
            grid.normals[index * 3 + 1] = n.y;
            grid.normals[index * 3 + 2] = n.z;
            grid.normals[index * 3 + 3] = weight;
          } else {
            const totalWeight = oldWeight + weight;
            grid.values[index] =
              (oldValue * oldWeight + signedDist * weight) / totalWeight;

            // Blend normals
            grid.normals[index * 3] =
              (grid.normals[index * 3] * oldWeight + n.x * weight) /
              totalWeight;
            grid.normals[index * 3 + 1] =
              (grid.normals[index * 3 + 1] * oldWeight + n.y * weight) /
              totalWeight;
            grid.normals[index * 3 + 2] =
              (grid.normals[index * 3 + 2] * oldWeight + n.z * weight) /
              totalWeight;
            grid.normals[index * 3 + 3] = totalWeight;
          }
        }
      }
    }
  }

  // Normalize normals
  for (let i = 0; i < grid.values.length; i++) {
    const nx = grid.normals[i * 3];
    const ny = grid.normals[i * 3 + 1];
    const nz = grid.normals[i * 3 + 2];

    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);

    if (len > 0) {
      grid.normals[i * 3] /= len;
      grid.normals[i * 3 + 1] /= len;
      grid.normals[i * 3 + 2] /= len;
    }
  }

  return grid;
}

function extractIsosurface(
  grid: any,
  resolution: number
): {
  vertices: number[];
  faces: number[];
  normals?: number[];
} {
  // Implementation of Marching Cubes algorithm
  const vertices: number[] = [];
  const faces: number[] = [];
  const normals: number[] = [];

  const { dimensions, min } = grid;

  // Precomputed edge table for marching cubes
  const edgeTable = [
    0x0, 0x109, 0x203, 0x30a, 0x406, 0x50f, 0x605, 0x70c, 0x80c, 0x905, 0xa0f,
    0xb06, 0xc0a, 0xd03, 0xe09, 0xf00,
  ];

  // Precomputed triangle table for marching cubes
  const triTable = [
    [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
    [0, 8, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
    // ... more tri table entries would go here (omitted for brevity)
  ];

  // Simplified implementation that creates triangles for occupied voxels
  // In a full implementation, this would use marching cubes with the above tables
  for (let z = 0; z < dimensions.z - 1; z++) {
    for (let y = 0; y < dimensions.y - 1; y++) {
      for (let x = 0; x < dimensions.x - 1; x++) {
        const idx = grid.getIndex(x, y, z);

        if (grid.values[idx] <= 0) {
          // If this voxel is inside the surface, create triangles for it
          const baseVertex = vertices.length / 3;

          // Add vertices for a cube at this voxel
          const px = min.x + x * resolution;
          const py = min.y + y * resolution;
          const pz = min.z + z * resolution;

          // Add 8 vertices for the cube corners
          // Bottom face
          vertices.push(px, py, pz);
          vertices.push(px + resolution, py, pz);
          vertices.push(px + resolution, py, pz + resolution);
          vertices.push(px, py, pz + resolution);

          // Top face
          vertices.push(px, py + resolution, pz);
          vertices.push(px + resolution, py + resolution, pz);
          vertices.push(px + resolution, py + resolution, pz + resolution);
          vertices.push(px, py + resolution, pz + resolution);

          // Add normals for each vertex
          for (let i = 0; i < 8; i++) {
            normals.push(
              grid.normals[idx * 3],
              grid.normals[idx * 3 + 1],
              grid.normals[idx * 3 + 2]
            );
          }

          // Add faces (triangles) for the cube
          // Bottom face
          faces.push(baseVertex, baseVertex + 1, baseVertex + 2);
          faces.push(baseVertex, baseVertex + 2, baseVertex + 3);

          // Top face
          faces.push(baseVertex + 4, baseVertex + 6, baseVertex + 5);
          faces.push(baseVertex + 4, baseVertex + 7, baseVertex + 6);

          // Side faces
          faces.push(baseVertex, baseVertex + 4, baseVertex + 1);
          faces.push(baseVertex + 1, baseVertex + 4, baseVertex + 5);

          faces.push(baseVertex + 1, baseVertex + 5, baseVertex + 2);
          faces.push(baseVertex + 2, baseVertex + 5, baseVertex + 6);

          faces.push(baseVertex + 2, baseVertex + 6, baseVertex + 3);
          faces.push(baseVertex + 3, baseVertex + 6, baseVertex + 7);

          faces.push(baseVertex + 3, baseVertex + 7, baseVertex + 0);
          faces.push(baseVertex + 0, baseVertex + 7, baseVertex + 4);
        }
      }
    }
  }

  return {
    vertices,
    faces,
    normals,
  };
}

async function optimizeMesh(
  mesh: {
    vertices: number[];
    faces: number[];
    normals?: number[];
    uvs?: number[];
  },
  options: MeshGenerationOptions
): Promise<{
  vertices: number[];
  faces: number[];
  normals?: number[];
  uvs?: number[];
}> {
  const { smoothingIterations, simplifyRatio, onStatusUpdate } = options;

  onStatusUpdate?.({
    stage: "optimizing",
    progress: 75,
    message: "Smoothing mesh...",
  });

  let smoothedMesh = await smoothMesh(mesh, smoothingIterations);

  onStatusUpdate?.({
    stage: "optimizing",
    progress: 85,
    message: "Simplifying mesh...",
  });

  let simplifiedMesh = await simplifyMesh(smoothedMesh, simplifyRatio);

  onStatusUpdate?.({
    stage: "optimizing",
    progress: 95,
    message: "Computing texture coordinates...",
  });

  const finalMesh = await generateUVCoordinates(simplifiedMesh);

  return finalMesh;
}

async function smoothMesh(
  mesh: {
    vertices: number[];
    faces: number[];
    normals?: number[];
    uvs?: number[];
  },
  iterations: number
): Promise<{
  vertices: number[];
  faces: number[];
  normals?: number[];
  uvs?: number[];
}> {
  if (iterations <= 0) return mesh;

  // Copy the mesh
  const smoothedVertices = [...mesh.vertices];
  const { faces } = mesh;

  // Build adjacency list for vertices
  const vertexAdjacency: number[][] = [];
  for (let i = 0; i < smoothedVertices.length / 3; i++) {
    vertexAdjacency.push([]);
  }

  // Populate adjacency list from faces
  for (let i = 0; i < faces.length; i += 3) {
    const v1 = faces[i];
    const v2 = faces[i + 1];
    const v3 = faces[i + 2];

    vertexAdjacency[v1].push(v2, v3);
    vertexAdjacency[v2].push(v1, v3);
    vertexAdjacency[v3].push(v1, v2);
  }

  // Remove duplicates in adjacency lists
  for (let i = 0; i < vertexAdjacency.length; i++) {
    vertexAdjacency[i] = [...new Set(vertexAdjacency[i])];
  }

  // Perform Laplacian smoothing
  for (let iter = 0; iter < iterations; iter++) {
    const newVertices = [...smoothedVertices];

    for (let i = 0; i < vertexAdjacency.length; i++) {
      const neighbors = vertexAdjacency[i];

      if (neighbors.length > 0) {
        let sumX = 0,
          sumY = 0,
          sumZ = 0;

        for (const neighbor of neighbors) {
          sumX += smoothedVertices[neighbor * 3];
          sumY += smoothedVertices[neighbor * 3 + 1];
          sumZ += smoothedVertices[neighbor * 3 + 2];
        }

        // Weighted average (0.8 original, 0.2 neighbor average)
        newVertices[i * 3] =
          smoothedVertices[i * 3] * 0.8 + (sumX / neighbors.length) * 0.2;
        newVertices[i * 3 + 1] =
          smoothedVertices[i * 3 + 1] * 0.8 + (sumY / neighbors.length) * 0.2;
        newVertices[i * 3 + 2] =
          smoothedVertices[i * 3 + 2] * 0.8 + (sumZ / neighbors.length) * 0.2;
      }
    }

    // Update for next iteration
    for (let i = 0; i < newVertices.length; i++) {
      smoothedVertices[i] = newVertices[i];
    }
  }

  // Recompute normals
  const normals = recomputeNormals(smoothedVertices, faces);

  return {
    vertices: smoothedVertices,
    faces,
    normals,
    uvs: mesh.uvs,
  };
}

function recomputeNormals(vertices: number[], faces: number[]): number[] {
  const normals = new Array(vertices.length).fill(0);

  // For each face
  for (let i = 0; i < faces.length; i += 3) {
    const i1 = faces[i] * 3;
    const i2 = faces[i + 1] * 3;
    const i3 = faces[i + 2] * 3;

    // Get vertices of this face
    const v1 = new THREE.Vector3(
      vertices[i1],
      vertices[i1 + 1],
      vertices[i1 + 2]
    );
    const v2 = new THREE.Vector3(
      vertices[i2],
      vertices[i2 + 1],
      vertices[i2 + 2]
    );
    const v3 = new THREE.Vector3(
      vertices[i3],
      vertices[i3 + 1],
      vertices[i3 + 2]
    );

    // Calculate face normal
    const edge1 = new THREE.Vector3().subVectors(v2, v1);
    const edge2 = new THREE.Vector3().subVectors(v3, v1);
    const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();

    // Add to vertex normals
    normals[i1] += normal.x;
    normals[i1 + 1] += normal.y;
    normals[i1 + 2] += normal.z;

    normals[i2] += normal.x;
    normals[i2 + 1] += normal.y;
    normals[i2 + 2] += normal.z;

    normals[i3] += normal.x;
    normals[i3 + 1] += normal.y;
    normals[i3 + 2] += normal.z;
  }

  // Normalize all normals
  for (let i = 0; i < vertices.length; i += 3) {
    const nx = normals[i];
    const ny = normals[i + 1];
    const nz = normals[i + 2];

    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);

    if (len > 0) {
      normals[i] = nx / len;
      normals[i + 1] = ny / len;
      normals[i + 2] = nz / len;
    }
  }

  return normals;
}

async function simplifyMesh(
  mesh: {
    vertices: number[];
    faces: number[];
    normals?: number[];
    uvs?: number[];
  },
  targetRatio: number
): Promise<{
  vertices: number[];
  faces: number[];
  normals?: number[];
  uvs?: number[];
}> {
  // If simplification not needed
  if (targetRatio >= 0.99) return mesh;

  // Target number of faces
  const targetFaces =
    Math.max(10, Math.floor((mesh.faces.length / 3) * targetRatio)) * 3;

  // If already below target, return original
  if (mesh.faces.length <= targetFaces) return mesh;

  // Simple face decimation (remove faces with smallest area)
  const faceAreas: { index: number; area: number }[] = [];

  for (let i = 0; i < mesh.faces.length; i += 3) {
    const i1 = mesh.faces[i] * 3;
    const i2 = mesh.faces[i + 1] * 3;
    const i3 = mesh.faces[i + 2] * 3;

    const v1 = new THREE.Vector3(
      mesh.vertices[i1],
      mesh.vertices[i1 + 1],
      mesh.vertices[i1 + 2]
    );
    const v2 = new THREE.Vector3(
      mesh.vertices[i2],
      mesh.vertices[i2 + 1],
      mesh.vertices[i2 + 2]
    );
    const v3 = new THREE.Vector3(
      mesh.vertices[i3],
      mesh.vertices[i3 + 1],
      mesh.vertices[i3 + 2]
    );

    const edge1 = new THREE.Vector3().subVectors(v2, v1);
    const edge2 = new THREE.Vector3().subVectors(v3, v1);
    const cross = new THREE.Vector3().crossVectors(edge1, edge2);

    const area = cross.length() * 0.5;

    faceAreas.push({
      index: i,
      area: area,
    });
  }

  // Sort by area (smallest first)
  faceAreas.sort((a, b) => a.area - b.area);

  // Keep only the target number of faces (largest ones)
  const keepFaces = faceAreas
    .slice(Math.floor((mesh.faces.length - targetFaces) / 3))
    .map((f) => f.index);
  keepFaces.sort((a, b) => a - b);

  const newFaces: number[] = [];

  for (const faceIndex of keepFaces) {
    newFaces.push(
      mesh.faces[faceIndex],
      mesh.faces[faceIndex + 1],
      mesh.faces[faceIndex + 2]
    );
  }

  // Find which vertices are still used
  const usedVertices = new Set<number>();
  for (const faceIdx of newFaces) {
    usedVertices.add(faceIdx);
  }

  // Create a mapping from old to new indices
  const vertexMap = new Map<number, number>();
  let nextVertexIndex = 0;

  for (const oldIdx of usedVertices) {
    vertexMap.set(oldIdx, nextVertexIndex++);
  }

  // Create new vertex arrays
  const newVertices: number[] = [];
  const newNormals: number[] = [];
  const newUvs: number[] = [];

  for (const oldVertexIndex of usedVertices) {
    const idx = oldVertexIndex * 3;

    newVertices.push(
      mesh.vertices[idx],
      mesh.vertices[idx + 1],
      mesh.vertices[idx + 2]
    );

    if (mesh.normals) {
      newNormals.push(
        mesh.normals[idx],
        mesh.normals[idx + 1],
        mesh.normals[idx + 2]
      );
    }

    if (mesh.uvs) {
      const uvIdx = oldVertexIndex * 2;
      newUvs.push(mesh.uvs[uvIdx], mesh.uvs[uvIdx + 1]);
    }
  }

  // Remap face indices
  const remappedFaces: number[] = [];
  for (const oldIdx of newFaces) {
    remappedFaces.push(vertexMap.get(oldIdx)!);
  }

  return {
    vertices: newVertices,
    faces: remappedFaces,
    normals: newNormals.length > 0 ? newNormals : undefined,
    uvs: newUvs.length > 0 ? newUvs : undefined,
  };
}

async function generateUVCoordinates(mesh: {
  vertices: number[];
  faces: number[];
  normals?: number[];
  uvs?: number[];
}): Promise<{
  vertices: number[];
  faces: number[];
  normals?: number[];
  uvs?: number[];
}> {
  if (mesh.uvs && mesh.uvs.length === (mesh.vertices.length / 3) * 2) {
    return mesh;
  }

  const uvs: number[] = [];
  const vertexCount = mesh.vertices.length / 3;

  // Use simple sphere mapping
  for (let i = 0; i < vertexCount; i++) {
    const vIdx = i * 3;
    const x = mesh.vertices[vIdx];
    const y = mesh.vertices[vIdx + 1];
    const z = mesh.vertices[vIdx + 2];

    // Calculate spherical coordinates
    const r = Math.sqrt(x * x + y * y + z * z);
    const theta = Math.atan2(z, x);
    const phi = Math.acos(y / r);

    // Convert to UV coordinates
    const u = (theta + Math.PI) / (2 * Math.PI);
    const v = phi / Math.PI;

    uvs.push(u, v);
  }

  return {
    ...mesh,
    uvs,
  };
}

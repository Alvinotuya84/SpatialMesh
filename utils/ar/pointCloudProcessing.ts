import { THREE } from "expo-three";
import { ScanFrame, ScanPoint } from "../../stores/scanStore";

export async function extractFeaturesFromFrame(
  imageData: Uint8Array,
  depthData: Float32Array | null,
  intrinsics: {
    focalLength: { x: number; y: number };
    principalPoint: { x: number; y: number };
    width: number;
    height: number;
  }
): Promise<ScanPoint[]> {
  await new Promise((resolve) => setTimeout(resolve, 50));

  const features: ScanPoint[] = [];
  const numFeatures = 100;

  for (let i = 0; i < numFeatures; i++) {
    const u = Math.random() * intrinsics.width;
    const v = Math.random() * intrinsics.height;

    const depth = depthData
      ? getDepthAt(depthData, u, v, intrinsics.width)
      : 0.5 + Math.random() * 4.5;

    const x =
      ((u - intrinsics.principalPoint.x) * depth) / intrinsics.focalLength.x;
    const y =
      ((v - intrinsics.principalPoint.y) * depth) / intrinsics.focalLength.y;
    const z = depth;

    features.push({
      position: new THREE.Vector3(x, y, z),
      confidence: 0.5 + Math.random() * 0.5,
    });
  }

  return features;
}

function getDepthAt(
  depthData: Float32Array,
  u: number,
  v: number,
  width: number
): number {
  const x = Math.floor(u);
  const y = Math.floor(v);
  const index = y * width + x;

  if (index >= 0 && index < depthData.length) {
    return depthData[index] || 1.0;
  }

  return 1.0;
}

export function matchFeaturesAcrossFrames(
  currentFeatures: ScanPoint[],
  previousFrames: ScanFrame[],
  maxMatches: number = 20
): { currentIdx: number; matchFrame: ScanFrame; matchIdx: number }[] {
  if (previousFrames.length === 0 || currentFeatures.length === 0) {
    return [];
  }

  const matches: {
    currentIdx: number;
    matchFrame: ScanFrame;
    matchIdx: number;
  }[] = [];

  for (
    let i = 0;
    i < currentFeatures.length && matches.length < maxMatches;
    i++
  ) {
    const currentPoint = currentFeatures[i];

    let bestDistance = Infinity;
    let bestMatch: { frame: ScanFrame; pointIdx: number } | null = null;

    for (const frame of previousFrames.slice(-5)) {
      for (let j = 0; j < frame.points.length; j++) {
        const prevPoint = frame.points[j];
        const distance = currentPoint.position.distanceTo(prevPoint.position);

        if (distance < bestDistance && distance < 0.1) {
          bestDistance = distance;
          bestMatch = { frame, pointIdx: j };
        }
      }
    }

    if (bestMatch) {
      matches.push({
        currentIdx: i,
        matchFrame: bestMatch.frame,
        matchIdx: bestMatch.pointIdx,
      });
    }
  }

  return matches;
}

export function estimateCameraPose(
  currentFeatures: ScanPoint[],
  previousFrame: ScanFrame,
  matches: { currentIdx: number; matchFrame: ScanFrame; matchIdx: number }[]
): { position: THREE.Vector3; rotation: THREE.Quaternion } | null {
  if (matches.length < 5) {
    return null;
  }

  const previousPosition = previousFrame.cameraPosition;
  const previousRotation = previousFrame.cameraRotation;

  let totalTranslation = new THREE.Vector3();
  let averageRotation = new THREE.Quaternion();

  for (const match of matches) {
    const currentPoint = currentFeatures[match.currentIdx];
    const prevPoint = match.matchFrame.points[match.matchIdx];

    const translation = new THREE.Vector3().subVectors(
      currentPoint.position,
      prevPoint.position
    );

    totalTranslation.add(translation);
  }

  totalTranslation.divideScalar(matches.length);

  const newPosition = new THREE.Vector3().addVectors(
    previousPosition,
    totalTranslation
  );

  return {
    position: newPosition,
    rotation: previousRotation.clone(),
  };
}

export function calculatePointCloudNormals(
  points: ScanPoint[],
  kNearest: number = 10
): ScanPoint[] {
  const result: ScanPoint[] = [];

  for (let i = 0; i < points.length; i++) {
    const point = points[i];

    const neighbors: { point: ScanPoint; distance: number }[] = [];

    for (let j = 0; j < points.length; j++) {
      if (i !== j) {
        const distance = point.position.distanceTo(points[j].position);
        neighbors.push({ point: points[j], distance });
      }
    }

    neighbors.sort((a, b) => a.distance - b.distance);
    const kNearestNeighbors = neighbors.slice(0, kNearest);

    if (kNearestNeighbors.length >= 3) {
      const normal = estimateNormal(
        point.position,
        kNearestNeighbors.map((n) => n.point.position)
      );

      result.push({
        ...point,
        normal,
      });
    } else {
      result.push(point);
    }
  }

  return result;
}

function estimateNormal(
  position: THREE.Vector3,
  neighbors: THREE.Vector3[]
): THREE.Vector3 {
  const centroid = new THREE.Vector3();

  for (const neighbor of neighbors) {
    centroid.add(neighbor);
  }

  centroid.divideScalar(neighbors.length);

  let xx = 0,
    xy = 0,
    xz = 0,
    yy = 0,
    yz = 0,
    zz = 0;

  for (const neighbor of neighbors) {
    const dx = neighbor.x - centroid.x;
    const dy = neighbor.y - centroid.y;
    const dz = neighbor.z - centroid.z;

    xx += dx * dx;
    xy += dx * dy;
    xz += dx * dz;
    yy += dy * dy;
    yz += dy * dz;
    zz += dz * dz;
  }

  const covarianceMatrix = new THREE.Matrix3().set(
    xx,
    xy,
    xz,
    xy,
    yy,
    yz,
    xz,
    yz,
    zz
  );

  const eigenvalues = calculateEigenvalues(covarianceMatrix);

  if (eigenvalues.length === 3) {
    const minEigenvalueIndex = eigenvalues.indexOf(Math.min(...eigenvalues));

    const normal = new THREE.Vector3();
    if (minEigenvalueIndex === 0) normal.set(1, 0, 0);
    else if (minEigenvalueIndex === 1) normal.set(0, 1, 0);
    else normal.set(0, 0, 1);

    return normal.normalize();
  }

  return new THREE.Vector3(0, 1, 0);
}

function calculateEigenvalues(matrix: THREE.Matrix3): number[] {
  const m = matrix.elements;

  const a = m[0];
  const b = m[1];
  const c = m[2];
  const d = m[3];
  const e = m[4];
  const f = m[5];
  const g = m[6];
  const h = m[7];
  const i = m[8];

  const A = 1;
  const B = -(a + e + i);
  const C = a * e + a * i + e * i - b * d - c * g - f * h;
  const D = -(
    a * e * i +
    b * f * g +
    c * d * h -
    c * e * g -
    a * f * h -
    b * d * i
  );

  return solvePolynomial(A, B, C, D);
}

function solvePolynomial(a: number, b: number, c: number, d: number): number[] {
  if (Math.abs(a) < 1e-10) {
    return solveQuadratic(b, c, d);
  }

  const p = (3 * a * c - b * b) / (3 * a * a);
  const q = (2 * b * b * b - 9 * a * b * c + 27 * a * a * d) / (27 * a * a * a);

  if (Math.abs(p) < 1e-10) {
    const x = Math.cbrt(-q);
    return [x - b / (3 * a), x - b / (3 * a), x - b / (3 * a)];
  }

  if (Math.abs(q) < 1e-10) {
    return [0, ...solveQuadratic(0, p, 0).map((x) => x - b / (3 * a))];
  }

  const discriminant = 4 * p * p * p + 27 * q * q;

  if (discriminant > 0) {
    const u = Math.cbrt(-q / 2 + Math.sqrt(discriminant / 27) / 3);
    const v = Math.cbrt(-q / 2 - Math.sqrt(discriminant / 27) / 3);

    return [u + v - b / (3 * a)];
  } else {
    const u = 2 * Math.sqrt(-p / 3);
    const v = Math.acos(((3 * q) / (2 * p)) * Math.sqrt(-3 / p)) / 3;

    return [
      u * Math.cos(v) - b / (3 * a),
      u * Math.cos(v + (2 * Math.PI) / 3) - b / (3 * a),
      u * Math.cos(v + (4 * Math.PI) / 3) - b / (3 * a),
    ];
  }
}

function solveQuadratic(a: number, b: number, c: number): number[] {
  if (Math.abs(a) < 1e-10) {
    if (Math.abs(b) < 1e-10) {
      return [];
    }
    return [-c / b];
  }

  const discriminant = b * b - 4 * a * c;

  if (discriminant < 0) {
    return [];
  } else if (discriminant === 0) {
    return [-b / (2 * a)];
  } else {
    const sqrtDiscriminant = Math.sqrt(discriminant);
    return [
      (-b + sqrtDiscriminant) / (2 * a),
      (-b - sqrtDiscriminant) / (2 * a),
    ];
  }
}

export function voxelizePointCloud(
  points: ScanPoint[],
  voxelSize: number
): ScanPoint[] {
  const voxelGrid: Map<string, ScanPoint[]> = new Map();

  for (const point of points) {
    const voxelKey = [
      Math.floor(point.position.x / voxelSize),
      Math.floor(point.position.y / voxelSize),
      Math.floor(point.position.z / voxelSize),
    ].join(",");

    if (!voxelGrid.has(voxelKey)) {
      voxelGrid.set(voxelKey, []);
    }

    voxelGrid.get(voxelKey)!.push(point);
  }

  const voxelizedPoints: ScanPoint[] = [];

  for (const [_, voxelPoints] of voxelGrid.entries()) {
    if (voxelPoints.length > 0) {
      const avgPosition = new THREE.Vector3();
      let avgNormal: THREE.Vector3 | undefined;
      let avgColor: THREE.Color | undefined;
      let avgConfidence = 0;
      let pointsWithNormals = 0;
      let pointsWithColors = 0;

      for (const p of voxelPoints) {
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

      avgPosition.divideScalar(voxelPoints.length);

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

      if (voxelPoints.length > 0) {
        avgConfidence /= voxelPoints.length;
      }

      voxelizedPoints.push({
        position: avgPosition,
        normal: avgNormal,
        color: avgColor,
        confidence: avgConfidence > 0 ? avgConfidence : undefined,
      });
    }
  }

  return voxelizedPoints;
}

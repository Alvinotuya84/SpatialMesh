import { THREE } from "expo-three";
import { ScanPoint, Mesh } from "../../stores/scanStore";

export interface ARScene {
  initialize: () => Promise<void>;
  startScanning: () => void;
  pauseScanning: () => void;
  stopScanning: () => void;
  getPointCloud: () => ScanPoint[];
  renderPointCloud: (points: ScanPoint[]) => void;
  renderMesh: (mesh: Mesh) => void;
  clearScene: () => void;
  takeScreenshot: () => Promise<string>;
  getCamera: () => { position: THREE.Vector3; rotation: THREE.Quaternion };
}

export function createARScene(
  gl: any,
  arRef: any,
  onTrackingUpdated?: (state: string, reason: string) => void,
  onPointCloudUpdated?: (points: ScanPoint[]) => void
): ARScene {
  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  let pointCloud: THREE.Points | null = null;
  let mesh: THREE.Mesh | null = null;
  let isScanning = false;

  const capturedPoints: ScanPoint[] = [];

  const initialize = async (): Promise<void> => {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(
      75,
      gl.drawingBufferWidth / gl.drawingBufferHeight,
      0.1,
      1000
    );

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(0, 1, 0);
    scene.add(directionalLight);

    return Promise.resolve();
  };

  const startScanning = (): void => {
    isScanning = true;
  };

  const pauseScanning = (): void => {
    isScanning = false;
  };

  const stopScanning = (): void => {
    isScanning = false;
  };

  const getPointCloud = (): ScanPoint[] => {
    return capturedPoints;
  };

  const renderPointCloud = (points: ScanPoint[]): void => {
    if (!scene) return;

    if (pointCloud) {
      scene.remove(pointCloud);
    }

    const geometry = new THREE.BufferGeometry();

    const positions = new Float32Array(points.length * 3);
    const colors = new Float32Array(points.length * 3);

    for (let i = 0; i < points.length; i++) {
      const point = points[i];

      positions[i * 3] = point.position.x;
      positions[i * 3 + 1] = point.position.y;
      positions[i * 3 + 2] = point.position.z;

      if (point.color) {
        colors[i * 3] = point.color.r;
        colors[i * 3 + 1] = point.color.g;
        colors[i * 3 + 2] = point.color.b;
      } else {
        colors[i * 3] = 1.0;
        colors[i * 3 + 1] = 1.0;
        colors[i * 3 + 2] = 1.0;
      }
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.02,
      vertexColors: true,
      sizeAttenuation: true,
    });

    pointCloud = new THREE.Points(geometry, material);
    scene.add(pointCloud);
  };

  const renderMesh = (meshData: Mesh): void => {
    if (!scene) return;

    if (mesh) {
      scene.remove(mesh);
    }

    const geometry = new THREE.BufferGeometry();

    const positions = new Float32Array(meshData.vertices);
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    if (meshData.normals) {
      const normals = new Float32Array(meshData.normals);
      geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    }

    if (meshData.faces) {
      geometry.setIndex(Array.from(meshData.faces));
    }

    if (meshData.uvs) {
      const uvs = new Float32Array(meshData.uvs);
      geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    }

    const material = new THREE.MeshStandardMaterial({
      color: 0x7777ff,
      roughness: 0.7,
      metalness: 0.2,
      wireframe: false,
    });

    mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
  };

  const clearScene = (): void => {
    if (!scene) return;

    if (pointCloud) {
      scene.remove(pointCloud);
      pointCloud = null;
    }

    if (mesh) {
      scene.remove(mesh);
      mesh = null;
    }
  };

  const takeScreenshot = async (): Promise<string> => {
    if (!arRef || !arRef.current) {
      throw new Error("AR reference not available");
    }

    try {
      const screenshot = await arRef.current.takeScreenshot();
      return screenshot;
    } catch (error) {
      throw error;
    }
  };

  const getCamera = (): {
    position: THREE.Vector3;
    rotation: THREE.Quaternion;
  } => {
    if (!camera) {
      return {
        position: new THREE.Vector3(),
        rotation: new THREE.Quaternion(),
      };
    }

    return {
      position: camera.position.clone(),
      rotation: camera.quaternion.clone(),
    };
  };

  return {
    initialize,
    startScanning,
    pauseScanning,
    stopScanning,
    getPointCloud,
    renderPointCloud,
    renderMesh,
    clearScene,
    takeScreenshot,
    getCamera,
  };
}

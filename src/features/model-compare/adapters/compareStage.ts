import {
  AmbientLight,
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  OrthographicCamera,
  PCFSoftShadowMap,
  PlaneGeometry,
  Scene,
  Vector3,
  WebGPURenderer,
  type Material,
} from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PEOPLE_SOURCES } from '../../../../voxel-gen/people/index.ts';
import { buildModel } from '../../../../voxel-gen/voxelgen.ts';
import type { ComparedModel, Comparison, CompareView } from '../domain/comparison';
import {
  meshVoxelModel,
  type SurfaceKind,
  type SurfaceMesh,
  type VoxelMesh,
} from '../domain/voxelMesh';

export interface CompareStage {
  readonly backend: 'webgpu' | 'webgl2';
  show(comparison: Comparison): void;
  setView(view: CompareView): void;
  setSpin(spin: boolean): void;
  dispose(): void;
}

const GROUND_COLOR = 0x5d7a45;
const SKY_COLOR = 0xdfe7ea;

// The preview renderer's angles, so this page and `pnpm preview --variants` show the same side.
const AZIMUTH = (35 * Math.PI) / 180;
const ELEVATION = (32 * Math.PI) / 180;
const VIEW = new Vector3(
  -Math.sin(AZIMUTH) * Math.cos(ELEVATION),
  Math.sin(ELEVATION),
  Math.cos(AZIMUTH) * Math.cos(ELEVATION),
);
const ACROSS = new Vector3(Math.cos(AZIMUTH), 0, Math.sin(AZIMUTH));

const GAP = 14;
const MARGIN = 1.12;
const SPIN_RADIANS_PER_SECOND = 0.35;

function geometryOf(surface: SurfaceMesh): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(surface.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(surface.normals, 3));
  // Already linear: the domain converts with the same curve Three.js applies to hex colours.
  geometry.setAttribute('color', new BufferAttribute(surface.colors, 3));
  geometry.setIndex(new BufferAttribute(surface.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

function createMaterials(): Record<SurfaceKind, Material> {
  return {
    lit: new MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 }),
    emissive: new MeshBasicNodeMaterial({ vertexColors: true }),
    water: new MeshStandardNodeMaterial({
      vertexColors: true,
      roughness: 0.15,
      metalness: 0,
      transparent: true,
      opacity: 0.85,
    }),
  };
}

function meshGroup(mesh: VoxelMesh, materials: Record<SurfaceKind, Material>): Group {
  const group = new Group();
  for (const kind of ['lit', 'emissive', 'water'] as const) {
    const surface = mesh.surfaces[kind];
    if (!surface) continue;
    const part = new Mesh(geometryOf(surface), materials[kind]);
    part.castShadow = kind !== 'water';
    part.receiveShadow = true;
    group.add(part);
  }
  return group;
}

interface Person {
  readonly mesh: VoxelMesh;
  readonly scale: number;
}

// Centred on its pivot so a spin turns it in place, with a guest beside it for scale.
function modelPivot(
  compared: ComparedModel,
  person: Person,
  materials: Record<SurfaceKind, Material>,
): Group {
  const { width, depth } = compared.model;
  const pivot = new Group();
  const body = meshGroup(compared.mesh, materials);
  body.position.set(-width / 2, 0, -depth / 2);
  pivot.add(body);
  const figure = meshGroup(person.mesh, materials);
  figure.scale.setScalar(person.scale);
  figure.position.set(-width / 2 - 6, 0, depth / 2 - 4);
  pivot.add(figure);
  return pivot;
}

function disposeGroup(group: Group): void {
  group.traverse((node) => {
    if (node instanceof Mesh) node.geometry.dispose();
  });
}

const reachOf = (compared: ComparedModel): number =>
  Math.hypot(compared.model.width, compared.model.depth) / 2 + 6;

function backendOf(renderer: WebGPURenderer): 'webgpu' | 'webgl2' {
  return (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend === true
    ? 'webgpu'
    : 'webgl2';
}

// Ambient and sun as the game sets them at noon, over the game's grass.
function createScene(): { scene: Scene; sun: DirectionalLight; ground: Mesh } {
  const scene = new Scene();
  scene.background = new Color(SKY_COLOR);
  scene.add(new AmbientLight(0xffffff, 1.1));
  const sun = new DirectionalLight(0xffffff, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun, sun.target);

  const ground = new Mesh(
    new PlaneGeometry(4000, 4000),
    new MeshStandardNodeMaterial({ color: GROUND_COLOR, roughness: 1, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);
  return { scene, sun, ground };
}

function extentInView(bounds: Box3, camera: OrthographicCamera): { x: number; y: number } {
  const { min, max } = bounds;
  const corners = [min.x, max.x].flatMap((x) =>
    [min.y, max.y].flatMap((y) => [min.z, max.z].map((z) => new Vector3(x, y, z))),
  );
  const seen = corners.map((corner) => corner.applyMatrix4(camera.matrixWorldInverse));
  return {
    x: Math.max(...seen.map((corner) => Math.abs(corner.x))),
    y: Math.max(...seen.map((corner) => Math.abs(corner.y))),
  };
}

// From the upper left as the camera sees it, the side the game's sun comes from.
function aimSun(sun: DirectionalLight, centre: Vector3, reach: number): void {
  sun.position.copy(centre).add(new Vector3(-reach * 0.6, reach, reach * 0.4));
  sun.target.position.copy(centre);
  const shadow = sun.shadow.camera;
  shadow.left = shadow.bottom = -reach;
  shadow.right = shadow.top = reach;
  shadow.far = reach * 4;
  shadow.updateProjectionMatrix();
}

export async function createCompareStage(canvas: HTMLCanvasElement): Promise<CompareStage> {
  const renderer = new WebGPURenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio ?? 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  await renderer.init();

  const { scene, sun, ground } = createScene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 4000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;

  const materials = createMaterials();
  const guest = buildModel(PEOPLE_SOURCES[0]!);
  const person = { mesh: meshVoxelModel(guest), scale: guest.scale ?? 1 };
  let pivots: { original: Group; variant: Group } | null = null;
  let current: Comparison | null = null;
  let view: CompareView = 'side';
  let spin = false;
  let extent = { x: 1, y: 1 };

  const fitFrustum = (): void => {
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    const halfHeight = Math.max(extent.y, extent.x / aspect) * MARGIN;
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
  };

  // Measured from the meshes in camera space, so a tall palm and a flat villa both fill the view.
  const frame = (shown: readonly Group[]): void => {
    const bounds = new Box3();
    for (const pivot of shown) bounds.expandByObject(pivot);
    const centre = bounds.getCenter(new Vector3());
    const reach = bounds.getSize(new Vector3()).length();
    controls.target.copy(centre);
    camera.position.copy(centre).addScaledVector(VIEW, reach * 2);
    camera.zoom = 1;
    camera.lookAt(centre);
    camera.updateMatrixWorld();

    extent = extentInView(bounds, camera);
    fitFrustum();
    aimSun(sun, centre, reach);
  };

  const layout = (): void => {
    if (!pivots || !current) return;
    const { original, variant } = pivots;
    original.position.set(0, 0, 0);
    variant.position.set(0, 0, 0);
    original.visible = view !== 'variant';
    variant.visible = view !== 'original';
    if (view === 'side') {
      const leftReach = reachOf(current.original);
      const rightReach = reachOf(current.variant);
      original.position.copy(ACROSS).multiplyScalar(-(leftReach + GAP / 2));
      variant.position.copy(ACROSS).multiplyScalar(rightReach + GAP / 2);
    }
    frame([original, variant].filter((pivot) => pivot.visible));
  };

  const resize = (): void => {
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    fitFrustum();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  let last = performance.now();
  renderer.setAnimationLoop((now: number) => {
    const seconds = (now - last) / 1000;
    last = now;
    if (spin && pivots) {
      pivots.original.rotation.y += seconds * SPIN_RADIANS_PER_SECOND;
      pivots.variant.rotation.y = pivots.original.rotation.y;
    }
    controls.update();
    renderer.render(scene, camera);
  });

  const clear = (): void => {
    if (!pivots) return;
    scene.remove(pivots.original, pivots.variant);
    disposeGroup(pivots.original);
    disposeGroup(pivots.variant);
    pivots = null;
  };

  return {
    backend: backendOf(renderer),
    show(comparison) {
      clear();
      const original = modelPivot(comparison.original, person, materials);
      const variant = modelPivot(comparison.variant, person, materials);
      current = comparison;
      pivots = { original, variant };
      scene.add(original, variant);
      layout();
    },
    setView(next) {
      view = next;
      layout();
    },
    setSpin(next) {
      spin = next;
      if (spin || !pivots) return;
      pivots.original.rotation.y = 0;
      pivots.variant.rotation.y = 0;
    },
    dispose() {
      renderer.setAnimationLoop(null);
      observer.disconnect();
      controls.dispose();
      clear();
      for (const material of Object.values(materials)) material.dispose();
      ground.geometry.dispose();
      renderer.dispose();
    },
  };
}

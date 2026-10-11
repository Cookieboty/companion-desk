import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

const params = new URLSearchParams(location.search);
const modelUrl = params.get('model') || '/models/shibu-vrm0.vrm';
const seconds = Number(params.get('seconds') || '8');
const warmup = Number(params.get('warmup') || '1');

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(1);
renderer.setSize(1280, 720, false);
renderer.setClearColor(0x1e2430, 1);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1280 / 720, 0.1, 100);
camera.position.set(0, 1.35, 2.4);
camera.lookAt(0, 1.1, 0);

scene.add(new THREE.AmbientLight(0xb0c0d8, 0.7));
const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(2, 4, 3);
scene.add(sun);

const lookTarget = new THREE.Object3D();
lookTarget.position.set(0.35, 1.45, 1.2);
scene.add(lookTarget);

let vrm = null;
const clock = new THREE.Clock();
const frames = [];
let elapsed = 0;
let done = false;

window.__bench = { ready: false, result: null };

const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser));
loader.load(
  modelUrl,
  (gltf) => {
    vrm = gltf.userData.vrm;
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons(gltf.scene);
    vrm.scene.rotation.y = Math.PI;
    scene.add(vrm.scene);
    window.__bench.ready = true;
    console.log('[three-bench] loaded', modelUrl);
  },
  undefined,
  (e) => {
    console.error(e);
    window.__bench.error = String(e);
  },
);

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  elapsed += dt;
  if (vrm) {
    // idle sway
    vrm.scene.rotation.y = Math.PI + Math.sin(elapsed * 0.6) * 0.05;
    if (vrm.lookAt) vrm.lookAt.target = lookTarget;
    vrm.update(dt);
  }
  renderer.render(scene, camera);
  if (!window.__bench.ready || done) return;
  if (elapsed < warmup) return;
  frames.push(dt * 1000);
  if (elapsed >= warmup + seconds) {
    done = true;
    const n = frames.length;
    const sum = frames.reduce((a, b) => a + b, 0);
    const mean = sum / n;
    const sorted = [...frames].sort((a, b) => a - b);
    window.__bench.result = {
      label: params.get('label') || 'three-vrm',
      engine: 'three-vrm',
      samples: n,
      warmup_s: warmup,
      duration_s: seconds,
      fps_avg: mean > 0 ? 1000 / mean : 0,
      frame_ms_avg: mean,
      frame_ms_min: sorted[0],
      frame_ms_max: sorted[n - 1],
      frame_ms_p50: sorted[Math.floor(n * 0.5)],
      frame_ms_p95: sorted[Math.min(n - 1, Math.floor(n * 0.95))],
      vsync: false,
      resolution: [1280, 720],
      model: modelUrl,
      renderer: renderer.getContext().getParameter(renderer.getContext().RENDERER),
    };
    console.log('[three-bench] done', window.__bench.result);
  }
}
animate();

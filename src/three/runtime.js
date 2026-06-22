import * as THREE from "../../node_modules/three/build/three.module.js";

export function createThreeRuntime() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x09111d);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1000);
  camera.position.set(0, 0, 18);
  camera.lookAt(0, 0, 0);

  const light = new THREE.AmbientLight(0xffffff, 1.1);
  scene.add(light);

  const keyLight = new THREE.DirectionalLight(0xffffff, 0.75);
  keyLight.position.set(4, 8, 6);
  scene.add(keyLight);

  const boardGroup = new THREE.Group();
  scene.add(boardGroup);

  return { THREE, scene, camera, boardGroup };
}

export function createThreeRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  return renderer;
}

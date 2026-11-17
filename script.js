import Lenis from "lenis";
import * as THREE from "three";
import html2canvas from "html2canvas";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  vertexShader,
  frontFragmentShader,
  backFragmentShader,
} from "./shaders.js";

gsap.registerPlugin(ScrollTrigger);

const lenis = new Lenis();
lenis.on("scroll", ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);

const letterEl = document.querySelector(".letter");
const spotlightEl = document.querySelector(".spotlight");
const dpr = Math.min(window.devicePixelRatio, 2);

await document.fonts.ready;

const snapshot = await html2canvas(letterEl, {
  scale: dpr,
  useCORS: true,
  backgroundColor: "#ffffff",
});

const letterRect = letterEl.getBoundingClientRect();
const spotlightRect = spotlightEl.getBoundingClientRect();
const letterWidth = letterRect.width;
const letterHeight = letterRect.height;
const viewWidth = spotlightRect.width;
const viewHeight = spotlightRect.height;

letterEl.style.visibility = "hidden";

const scene = new THREE.Scene();

const cameraDistance = letterHeight * 1.5;
const cameraNear = cameraDistance * 0.3;
const cameraFar = cameraDistance * 2;
const spotlightCenterY = spotlightRect.top + window.scrollY + viewHeight / 2;

const camera = new THREE.PerspectiveCamera();

function updateCamera() {
  const viewportCenterY = window.scrollY + window.innerHeight / 2;
  const eyeY = THREE.MathUtils.clamp(
    spotlightCenterY - viewportCenterY,
    -viewHeight / 2,
    viewHeight / 2,
  );
  camera.position.set(0, eyeY, cameraDistance);

  const frustumScale = cameraNear / cameraDistance;
  camera.projectionMatrix.makePerspective(
    (-viewWidth / 2) * frustumScale,
    (viewWidth / 2) * frustumScale,
    (viewHeight / 2 - eyeY) * frustumScale,
    (-viewHeight / 2 - eyeY) * frustumScale,
    cameraNear,
    cameraFar,
  );
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(dpr);
renderer.setSize(viewWidth, viewHeight);
renderer.domElement.classList.add("letter-canvas");
Object.assign(renderer.domElement.style, {
  position: "absolute",
  top: "0",
  left: "0",
  pointerEvents: "none",
});
spotlightEl.appendChild(renderer.domElement);

const letterTexture = new THREE.CanvasTexture(snapshot);
letterTexture.minFilter = THREE.LinearMipmapLinearFilter;
letterTexture.magFilter = THREE.LinearFilter;
letterTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

const frontMaterial = new THREE.ShaderMaterial({
  side: THREE.FrontSide,
  uniforms: { uTexture: { value: letterTexture } },
  vertexShader,
  fragmentShader: frontFragmentShader,
});

const backMaterial = new THREE.ShaderMaterial({
  side: THREE.FrontSide,
  vertexShader,
  fragmentShader: backFragmentShader,
});

const panelHeight = letterHeight / 3;
const LAYER_GAP = 1;
const BACK_BLEED = 2;

const backGeometry = new THREE.PlaneGeometry(
  letterWidth + BACK_BLEED * 2,
  panelHeight + BACK_BLEED * 2,
);

function createPanel(index) {
  const frontGeometry = new THREE.PlaneGeometry(letterWidth, panelHeight);
  const uvs = frontGeometry.attributes.uv;
  const vMin = 1 - (index + 1) / 3;
  for (let i = 0; i < uvs.count; i++) {
    uvs.setY(i, vMin + uvs.getY(i) / 3);
  }

  const frontMesh = new THREE.Mesh(frontGeometry, frontMaterial);

  const backMesh = new THREE.Mesh(backGeometry, backMaterial);
  backMesh.rotation.y = Math.PI;

  const panel = new THREE.Group();
  panel.add(frontMesh, backMesh);
  return panel;
}

const paper = new THREE.Group();
paper.position.set(
  letterRect.left + letterWidth / 2 - (spotlightRect.left + viewWidth / 2),
  spotlightRect.top + viewHeight / 2 - (letterRect.top + letterHeight / 2),
  0,
);
scene.add(paper);

const topPanel = createPanel(0);
topPanel.position.y = letterHeight / 2 - panelHeight / 2;
paper.add(topPanel);

const topFold = new THREE.Group();
topFold.position.y = letterHeight / 2 - panelHeight;
paper.add(topFold);

const middlePanel = createPanel(1);
middlePanel.position.y = -panelHeight / 2;
topFold.add(middlePanel);

const bottomFold = new THREE.Group();
bottomFold.position.y = -panelHeight;
topFold.add(bottomFold);

const bottomPanel = createPanel(2);
bottomPanel.position.y = -panelHeight / 2;
bottomFold.add(bottomPanel);

const FOLDED_ANGLE = -Math.PI;
topFold.rotation.x = FOLDED_ANGLE;
bottomFold.rotation.x = FOLDED_ANGLE;

function updateLayering() {
  const topFoldAmount = topFold.rotation.x / FOLDED_ANGLE;
  const bottomFoldAmount = bottomFold.rotation.x / FOLDED_ANGLE;

  middlePanel.position.z = -LAYER_GAP * 2 * topFoldAmount;
  bottomFold.position.z = -LAYER_GAP * 2 * topFoldAmount;
  bottomPanel.position.z = -LAYER_GAP * bottomFoldAmount;
}

const UNFOLD_DURATION = 0.75;
const UNFOLD_EASE = "power2.inOut";

const unfoldTimeline = gsap
  .timeline({ paused: true })
  .addLabel("folded")
  .to(topFold.rotation, {
    x: 0,
    duration: UNFOLD_DURATION,
    ease: UNFOLD_EASE,
  })
  .addLabel("firstOpen")
  .to(bottomFold.rotation, {
    x: 0,
    duration: UNFOLD_DURATION,
    ease: UNFOLD_EASE,
  })
  .addLabel("open");

const STEP_LABELS = ["folded", "firstOpen", "open"];
const FIRST_FOLD_AT = 0;
const SECOND_FOLD_AT = 0.2;

let currentStep = 0;
let currentTween = null;

function onScrollProgress(progress) {
  const step = progress > SECOND_FOLD_AT ? 2 : progress > FIRST_FOLD_AT ? 1 : 0;

  if (step === currentStep) return;
  currentStep = step;

  currentTween?.kill();
  currentTween = unfoldTimeline.tweenTo(STEP_LABELS[step]);
}

const scrollTrigger = ScrollTrigger.create({
  trigger: spotlightEl,
  start: "top top",
  end: "75% top",
  onUpdate: (self) => onScrollProgress(self.progress),
});

onScrollProgress(scrollTrigger.progress);

function render() {
  updateCamera();
  updateLayering();
  renderer.render(scene, camera);
}

gsap.ticker.add(render);

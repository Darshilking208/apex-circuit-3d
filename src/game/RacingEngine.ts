import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  CAR_PHYSICS_CONFIG,
  CarControls,
  CarState,
  createInitialCarState,
  resetCarToNearestTrack,
  stepCarPhysics,
} from './carPhysics';
import { createRaceCarRig, syncCarRigToPhysics } from './carMesh';
import {
  RaceProgressState,
  createInitialRaceState,
  stepRaceRules,
} from './raceRules';
import { createProceduralTextures } from './textures';
import { findClosestTrackSample } from './track';
import { buildRacingWorld } from './worldBuilder';
import { RacingAudio } from './audio';

export type GameScreenState = 'title' | 'playing' | 'paused' | 'gameover';

export interface HudSnapshot {
  speedKmh: number;
  gear: string;
  rpmRatio: number;
  currentLap: number;
  totalLaps: number;
  currentLapTime: number;
  bestLapTime: number | null;
  totalTime: number;
  lapTimes: number[];
  carX: number;
  carZ: number;
  carHeading: number;
  wrongWay: boolean;
  bannerText: string | null;
  highestCheckpoint: number;
  muted: boolean;
}

export interface RacingEngineCallbacks {
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onRaceFinish: (snapshot: HudSnapshot) => void;
  onStateShortcut: (action: 'togglePause' | 'startFromTitle' | 'toggleMute') => void;
}

const _camTargetPos = new THREE.Vector3();
const _camLookTarget = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class RacingEngine {
  private container: HTMLElement;
  private callbacks: RacingEngineCallbacks;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private sunLight: THREE.DirectionalLight;
  private isSoftwareGl: boolean;
  private frameId = 0;
  private disposed = false;

  private car: CarState;
  private race: RaceProgressState;
  private screenState: GameScreenState = 'title';
  private audio = new RacingAudio();

  private laggedHeading = 0;
  private cameraTrauma = 0;
  private titleElapsed = 0;
  private lastTimeMs = 0;
  private hudEmitAccum = 0;
  private particleEmitAccum = 0;
  private keys = new Set<string>();

  private textures: ReturnType<typeof createProceduralTextures>;
  private carRig: ReturnType<typeof createRaceCarRig>;
  private world: ReturnType<typeof buildRacingWorld>;
  private envMap: THREE.Texture;

  constructor(
    container: HTMLElement,
    callbacks: RacingEngineCallbacks,
    initialState: GameScreenState
  ) {
    this.container = container;
    this.callbacks = callbacks;
    this.screenState = initialState;

    this.isSoftwareGl = detectSoftwareWebGL();
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(
      container.clientWidth || window.innerWidth,
      container.clientHeight || window.innerHeight
    );

    container.appendChild(this.renderer.domElement);

    // Scene, coastal daylight sky & horizon fog
    this.scene = new THREE.Scene();
    const skyColor = new THREE.Color(0x9bd1eb);
    this.scene.background = skyColor;
    this.scene.fog = new THREE.Fog(0xbadff0, 125, 340);

    // Mandatory RoomEnvironment PMREM for PBR car paint & chrome reflections
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envMap;
    pmrem.dispose();

    // Camera
    const aspect =
      (container.clientWidth || window.innerWidth) /
      (container.clientHeight || window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(62, aspect, 0.25, 480);

    // Warm/cool 3-point outdoor daylight rig
    const hemi = new THREE.HemisphereLight(0x9ad4f5, 0x5d6d47, 0.9);
    this.scene.add(hemi);

    this.sunLight = new THREE.DirectionalLight(0xfff1d4, 2.25);
    this.sunLight.position.set(45, 72, 36);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 190;
    const d = 38;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Procedural Textures, World & Composite Car
    const maxAniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.textures = createProceduralTextures(maxAniso);
    this.world = buildRacingWorld(this.scene, this.textures, !this.isSoftwareGl);
    this.carRig = createRaceCarRig(this.textures.contactShadowMap, !this.isSoftwareGl);
    this.scene.add(this.carRig.root);

    // Initialize Car & Race State
    this.car = createInitialCarState(0);
    this.race = createInitialRaceState(this.car.trackS);
    this.laggedHeading = this.car.heading;
    syncCarRigToPhysics(this.carRig, this.car);
    this.snapChaseCamera();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // Event listeners
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);

    this.lastTimeMs = performance.now();
    this.emitHud();
    this.scheduleNextFrame();
  }

  public setScreenState(next: GameScreenState): void {
    const prev = this.screenState;
    this.screenState = next;
    this.keys.clear();

    if (next === 'playing') {
      this.audio.unlock();
      this.audio.setPlaying(true);
      if (prev === 'title') {
        this.snapChaseCamera();
      }
    } else {
      this.audio.setPlaying(false);
    }
    this.emitHud();
  }

  public restartRace(): void {
    this.car = createInitialCarState(0);
    this.race = createInitialRaceState(this.car.trackS);
    this.laggedHeading = this.car.heading;
    this.cameraTrauma = 0;
    this.keys.clear();
    syncCarRigToPhysics(this.carRig, this.car);
    this.snapChaseCamera();
    this.audio.unlock();
    this.audio.setPlaying(this.screenState === 'playing');
    this.emitHud();
  }

  public resetCarToTrack(): void {
    resetCarToNearestTrack(this.car);
    this.laggedHeading = this.car.heading;
    this.emitHud();
  }

  public toggleMute(): boolean {
    this.audio.unlock();
    const next = !this.audio.isMuted();
    this.audio.setMuted(next);
    this.emitHud();
    return next;
  }

  private snapChaseCamera(): void {
    const fwdX = -Math.sin(this.car.heading);
    const fwdZ = -Math.cos(this.car.heading);
    this.camera.position.set(
      this.car.x - fwdX * 8.2,
      3.4,
      this.car.z - fwdZ * 8.2
    );
    this.camera.lookAt(
      this.car.x + fwdX * 8,
      1.1,
      this.car.z + fwdZ * 8
    );
  }

  private handleResize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    const code = e.code;
    if (
      code === 'ArrowUp' ||
      code === 'ArrowDown' ||
      code === 'ArrowLeft' ||
      code === 'ArrowRight' ||
      code === 'Space'
    ) {
      e.preventDefault();
    }

    if (e.repeat) return;

    if (this.screenState === 'title') {
      if (code === 'Enter' || code === 'Space') {
        this.callbacks.onStateShortcut('startFromTitle');
        return;
      }
    }

    if (code === 'Escape' || code === 'KeyP') {
      if (this.screenState === 'playing' || this.screenState === 'paused') {
        this.callbacks.onStateShortcut('togglePause');
        return;
      }
    }

    if (code === 'KeyM') {
      this.callbacks.onStateShortcut('toggleMute');
      return;
    }

    if (code === 'KeyR' && this.screenState === 'playing') {
      this.resetCarToTrack();
      return;
    }

    this.keys.add(code);
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private handleWindowBlur = (): void => {
    this.keys.clear();
  };

  private handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.keys.clear();
    }
  };

  private getControls(): CarControls {
    return {
      accelerate: this.keys.has('KeyW') || this.keys.has('ArrowUp'),
      brakeReverse: this.keys.has('KeyS') || this.keys.has('ArrowDown'),
      steerLeft: this.keys.has('KeyA') || this.keys.has('ArrowLeft'),
      steerRight: this.keys.has('KeyD') || this.keys.has('ArrowRight'),
      handbrake: this.keys.has('Space'),
    };
  }

  private getGearAndRpm(): { gear: string; rpmRatio: number } {
    if (this.car.isReversing) {
      return {
        gear: 'R',
        rpmRatio: Math.min(1, Math.abs(this.car.speed) / CAR_PHYSICS_CONFIG.maxReverseSpeed),
      };
    }
    const ratio = Math.min(
      1,
      Math.max(0, this.car.speed) / CAR_PHYSICS_CONFIG.maxForwardSpeed
    );
    if (ratio < 0.02) return { gear: '1', rpmRatio: 0.14 };
    const gearNum = Math.min(6, Math.floor(ratio * 5.8) + 1);
    const span = 1 / 6;
    const local = ((ratio - (gearNum - 1) * span * 0.88) / span) % 1;
    return {
      gear: String(gearNum),
      rpmRatio: Math.max(0.2, Math.min(1, local * 0.8 + ratio * 0.25)),
    };
  }

  private emitHud(): void {
    const { gear, rpmRatio } = this.getGearAndRpm();
    this.callbacks.onHudUpdate({
      speedKmh: this.car.speedKmh,
      gear,
      rpmRatio,
      currentLap: this.race.currentLap,
      totalLaps: this.race.totalLaps,
      currentLapTime: this.race.currentLapTime,
      bestLapTime: this.race.bestLapTime,
      totalTime: this.race.totalTime,
      lapTimes: [...this.race.lapTimes],
      carX: this.car.x,
      carZ: this.car.z,
      carHeading: this.car.heading,
      wrongWay: this.race.wrongWay,
      bannerText: this.race.bannerText,
      highestCheckpoint: this.race.highestCheckpoint,
      muted: this.audio.isMuted(),
    });
  }

  private stepTitleCamera(dt: number): void {
    this.titleElapsed += dt;
    // Live hero camera pan from front-left three-quarter angle with calm sky behind top-left title
    const angle = 0.42 + Math.sin(this.titleElapsed * 0.24) * 0.28;
    const radius = 9.2 + Math.cos(this.titleElapsed * 0.18) * 1.1;
    const cx = this.car.x - Math.sin(angle) * radius;
    const cz = this.car.z - Math.cos(angle) * radius;
    const cy = 2.4 + Math.sin(this.titleElapsed * 0.3) * 0.32;

    this.camera.position.set(cx, cy, cz);
    // Look slightly left of car so car + gantry sit in right/center third while top-left remains open sky
    this.camera.lookAt(this.car.x - 2.3, 1.15, this.car.z + 0.6);
  }

  private stepChaseCamera(dt: number): void {
    // Shortest angular interpolation so camera smoothly lags behind car around corners
    let diff = this.car.heading - this.laggedHeading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    const lagRate = 4.2;
    this.laggedHeading += diff * (1 - Math.exp(-lagRate * dt));

    const lagFwdX = -Math.sin(this.laggedHeading);
    const lagFwdZ = -Math.cos(this.laggedHeading);

    const carFwdX = -Math.sin(this.car.heading);
    const carFwdZ = -Math.cos(this.car.heading);

    const speedRatio = Math.min(
      1,
      Math.abs(this.car.speed) / CAR_PHYSICS_CONFIG.maxForwardSpeed
    );

    const chaseDist = 7.6 + speedRatio * 1.15;
    const chaseHeight = 3.15 + speedRatio * 0.35;

    _camTargetPos.set(
      this.car.x - lagFwdX * chaseDist,
      chaseHeight,
      this.car.z - lagFwdZ * chaseDist
    );

    const posAlpha = 1 - Math.exp(-10.5 * dt);
    this.camera.position.lerp(_camTargetPos, posAlpha);
    this.camera.position.y = Math.max(1.4, this.camera.position.y);

    // Subtle speed FOV kick
    const targetFov = 62 + speedRatio * 13;
    this.camera.fov += (targetFov - this.camera.fov) * (1 - Math.exp(-6 * dt));
    this.camera.updateProjectionMatrix();

    // Trauma shake decay on barrier hit
    if (this.cameraTrauma > 0) {
      const shake = this.cameraTrauma * this.cameraTrauma;
      this.camera.position.x += (Math.random() - 0.5) * shake * 0.55;
      this.camera.position.y += (Math.random() - 0.5) * shake * 0.35;
      this.cameraTrauma = Math.max(0, this.cameraTrauma - dt * 2.4);
    }

    _camLookTarget.set(
      this.car.x + carFwdX * 6.5,
      1.05,
      this.car.z + carFwdZ * 6.5
    );
    this.camera.lookAt(_camLookTarget);
  }

  private tick = (): void => {
    if (this.disposed) return;

    const nowMs = performance.now();
    const rawDt = (nowMs - this.lastTimeMs) / 1000;
    this.lastTimeMs = nowMs;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

    if (this.screenState === 'title') {
      this.stepTitleCamera(dt);
    } else if (this.screenState === 'playing') {
      const controls = this.getControls();
      stepCarPhysics(this.car, controls, dt);
      syncCarRigToPhysics(this.carRig, this.car);

      // Update directional sun shadow frustum around car for crisp shadows everywhere
      if (!this.isSoftwareGl) {
        this.sunLight.position.set(this.car.x + 42, 68, this.car.z + 34);
        this.sunLight.target.position.set(this.car.x, 0, this.car.z);
        this.sunLight.target.updateMatrixWorld();
      }

      // Track direction alignment & race checkpoint progression
      const trackInfo = findClosestTrackSample(this.car.x, this.car.z);
      const carFwdX = -Math.sin(this.car.heading);
      const carFwdZ = -Math.cos(this.car.heading);
      const fwdDotTrack = carFwdX * trackInfo.tx + carFwdZ * trackInfo.tz;

      const raceEvents = stepRaceRules(
        this.race,
        this.car.trackS,
        fwdDotTrack,
        this.car.speed,
        dt
      );

      // Audio & world effects
      const speedRatio = Math.min(
        1,
        Math.abs(this.car.speed) / CAR_PHYSICS_CONFIG.maxForwardSpeed
      );
      this.audio.update(speedRatio, this.car.lateralSlip, controls.accelerate);

      if (this.car.hitBarrier && this.car.impactSpeed > 2.5) {
        this.cameraTrauma = Math.min(1, this.cameraTrauma + this.car.impactSpeed * 0.032);
        this.audio.playImpact(this.car.impactSpeed);
        // Barrier scrape sparks
        for (let k = 0; k < 4; k++) {
          this.world.emitParticle(
            this.car.x,
            0.45,
            this.car.z,
            (Math.random() - 0.5) * 9,
            2 + Math.random() * 4,
            (Math.random() - 0.5) * 9,
            0.55,
            0.32,
            0xffae2b
          );
        }
      }

      // Tire smoke during heavy lateral slip or handbrake drift
      this.particleEmitAccum += dt;
      if (
        (this.car.lateralSlip > 3.6 || (controls.handbrake && Math.abs(this.car.speed) > 8)) &&
        this.particleEmitAccum > 0.035
      ) {
        this.particleEmitAccum = 0;
        const backX = this.car.x - carFwdX * 1.35;
        const backZ = this.car.z - carFwdZ * 1.35;
        this.world.emitParticle(
          backX + (Math.random() - 0.5) * 1.2,
          0.18,
          backZ + (Math.random() - 0.5) * 1.2,
          (Math.random() - 0.5) * 1.5,
          0.8 + Math.random() * 0.8,
          (Math.random() - 0.5) * 1.5,
          0.95,
          0.55,
          0xe6e8ec
        );
      }

      if (raceEvents.checkpointReached !== null) {
        this.audio.playCheckpoint();
      }
      if (raceEvents.lapCompleted !== null) {
        this.audio.playLapComplete(raceEvents.raceFinished);
      }

      this.world.updateEffects(raceEvents.checkpointReached, dt);
      this.world.updateParticles(dt);
      this.stepChaseCamera(dt);

      if (raceEvents.raceFinished) {
        this.emitHud();
        const { gear, rpmRatio } = this.getGearAndRpm();
        this.callbacks.onRaceFinish({
          speedKmh: this.car.speedKmh,
          gear,
          rpmRatio,
          currentLap: this.race.currentLap,
          totalLaps: this.race.totalLaps,
          currentLapTime: this.race.currentLapTime,
          bestLapTime: this.race.bestLapTime,
          totalTime: this.race.totalTime,
          lapTimes: [...this.race.lapTimes],
          carX: this.car.x,
          carZ: this.car.z,
          carHeading: this.car.heading,
          wrongWay: false,
          bannerText: this.race.bannerText,
          highestCheckpoint: this.race.highestCheckpoint,
          muted: this.audio.isMuted(),
        });
      } else {
        // Throttle React HUD updates to ~15Hz
        this.hudEmitAccum += dt;
        if (this.hudEmitAccum >= 0.065) {
          this.hudEmitAccum = 0;
          this.emitHud();
        }
      }
    }

    this.renderer.render(this.scene, this.camera);
    this.scheduleNextFrame();
  };

  private scheduleNextFrame(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);

    this.audio.dispose();
    this.carRig.dispose();
    this.world.dispose();
    this.textures.dispose();
    this.envMap.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}

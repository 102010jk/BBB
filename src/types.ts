export type Route = 'landing' | 'arsenal' | 'information' | 'cart' | 'simulator';
export type DeployMode = 'DROP' | 'DELIVER';

export interface WeaponStats {
  YIELD: number;
  RANGE: number;
  PRECISION: number;
  MASS: number;
  DEPLOY: number;
}

export interface Weapon {
  id: string;
  cat: string;
  code: string;
  name: string;
  price: number;
  stats: WeaponStats;
  tags: string[];
  desc: string;
}

export interface Category {
  id: string;
  name: string;
  deploy: DeployMode[];
  desc: string;
}

export interface CartItem {
  weaponId: string;
  mode: DeployMode;
  target: Target | null;
  address: string | null;
}

export interface Target {
  lat: number;
  lon: number;
  region: string;
}

export interface TweakState {
  ringRadius: number;
  ringThickness: number;
  ringSpeed: number;
  ringCount: number;
  cameraTilt: number;
  starsCount: number;
  glitchIntensity: number;
  scanlineStrength: number;
  pushStrength: number;
  pushRadius: number;
  particleSize: number;
}

export interface ToastState {
  line: string;
  sub: string;
  red: boolean;
}

export interface SimAnalytics {
  casualties: number;
  radius: number;
  cost: number;
  halflife: number;
  sparkHistory: number[];
}

export interface SceneController {
  goRoute: (route: Route) => void;
  triggerGlitch: (peak?: number) => void;
  updateTweaks: (tweaks: Partial<TweakState>) => void;
  dispose: () => void;
}

export interface SceneConfig {
  canvas: HTMLCanvasElement;
  flashEl: HTMLElement;
  domMenuEl: HTMLElement;
  fpsEl: HTMLElement;
  onRouteSwitched: (route: Route) => void;
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { Route, CartItem, TweakState, ToastState, SceneController, DeployMode, Target } from './types';
import { initMainScene } from './scene/index';
import { categoryById, weaponById } from './data';
import { sound } from './audio/sound';

import HUD from './components/HUD';
import Compass from './components/Compass';
import TweaksPanel from './components/TweaksPanel';
import Splash from './components/Splash';
import Arsenal from './components/pages/Arsenal';
import Cart from './components/pages/Cart';
import PickOverlay from './components/pages/PickOverlay';
import Simulator from './components/pages/Simulator';
import Information from './components/pages/Information';

const TWEAK_DEFAULTS: TweakState = {
  ringRadius: 2.6, ringThickness: 0.6, ringSpeed: 0.11, ringCount: 2400,
  cameraTilt: 2.9, starsCount: 12000,
  glitchIntensity: 0.75, scanlineStrength: 0.09,
  pushStrength: 1.35, pushRadius: 2.15, particleSize: 0.005,
};

const INITIAL_CART: CartItem[] = [
  { weaponId: 'n-strat', mode: 'DROP',    target: null, address: null },
  { weaponId: 'g-therm', mode: 'DELIVER', target: null, address: 'Hangar 7, Cobalt Spire, Sector ND-9' },
  { weaponId: 'l-lance', mode: 'DROP',    target: { lat: 9.0, lon: -140.0, region: 'INTL. WATERS' }, address: null },
];

export default function App() {
  const [route, setRoute] = useState<Route>('landing');
  const [cart, setCart] = useState<CartItem[]>(INITIAL_CART);
  const [simWeapon, setSimWeapon] = useState('n-strat');
  const [tweaks, setTweaks] = useState<TweakState>(TWEAK_DEFAULTS);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [pickWeaponId, setPickWeaponId] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const flashRef   = useRef<HTMLDivElement>(null);
  const domMenuRef = useRef<HTMLDivElement>(null);
  const fpsRef     = useRef<HTMLSpanElement>(null);
  const sceneRef   = useRef<SceneController | null>(null);
  const routeRef   = useRef<Route>('landing');

  // Keep routeRef in sync
  useEffect(() => { routeRef.current = route; }, [route]);

  // Sync body data-state for CSS selectors
  useEffect(() => {
    document.body.setAttribute('data-state', route);
  }, [route]);

  // Init Three.js scene
  useEffect(() => {
    if (!canvasRef.current || !flashRef.current || !domMenuRef.current || !fpsRef.current) return;
    const ctrl = initMainScene({
      canvas: canvasRef.current,
      flashEl: flashRef.current,
      domMenuEl: domMenuRef.current,
      fpsEl: fpsRef.current,
      onRouteSwitched: (r) => {
        routeRef.current = r;
        setRoute(r);
      },
    });
    sceneRef.current = ctrl;
    return () => { ctrl.dispose(); sceneRef.current = null; };
  }, []);

  // Intro glitch after load (skipped when the user prefers reduced motion)
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t = setTimeout(() => {
      sceneRef.current?.triggerGlitch(TWEAK_DEFAULTS.glitchIntensity * 1.5);
    }, 1100);
    return () => clearTimeout(t);
  }, []);

  // Unlock the audio engine on the first user gesture (autoplay policy).
  useEffect(() => {
    const unlock = () => sound.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // Ambient drone: fuller on the landing, quieter (but present) inside pages.
  useEffect(() => {
    sound.setAmbient(route === 'landing' ? 1 : 0.45);
  }, [route]);

  const showToast = useCallback((line: string, sub: string, red = false) => {
    setToast({ line, sub, red });
    sound.play(red ? 'denied' : 'toast');
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 1800);
  }, []);

  const handleNavigate = useCallback((newRoute: Route) => {
    if (newRoute === routeRef.current) return;
    sceneRef.current?.goRoute(newRoute);
  }, []);

  // Cart helpers
  const addToCart = useCallback((weaponId: string) => {
    setCart(prev => {
      if (prev.find(it => it.weaponId === weaponId)) return prev;
      const w = weaponById(weaponId);
      if (!w) return prev;
      const cat = categoryById(w.cat);
      if (!cat) return prev;
      const mode: DeployMode = cat.deploy[0];
      sound.play('add');
      return [...prev, { weaponId, mode, target: null, address: null }];
    });
  }, []);

  const updateMode = useCallback((weaponId: string, mode: DeployMode) => {
    setCart(prev => prev.map(it => it.weaponId === weaponId
      ? { ...it, mode, target: mode === 'DROP' ? it.target : null, address: mode === 'DELIVER' ? it.address : null }
      : it
    ));
  }, []);

  const updateAddress = useCallback((weaponId: string, address: string) => {
    setCart(prev => prev.map(it => it.weaponId === weaponId ? { ...it, address } : it));
  }, []);

  const removeFromCart = useCallback((weaponId: string) => {
    sound.play('remove');
    setCart(prev => prev.filter(it => it.weaponId !== weaponId));
  }, []);

  const confirmTarget = useCallback((weaponId: string, target: Target) => {
    setCart(prev => prev.map(it => it.weaponId === weaponId ? { ...it, target } : it));
    setPickOpen(false);
  }, []);

  const handleTestInSim = useCallback((weaponId: string) => {
    setSimWeapon(weaponId);
    handleNavigate('simulator');
  }, [handleNavigate]);

  return (
    <>
      <canvas id="scene" ref={canvasRef} />
      <div className="dim" />

      <HUD
        route={route}
        flashRef={flashRef as React.RefObject<HTMLDivElement>}
        domMenuRef={domMenuRef as React.RefObject<HTMLDivElement>}
        fpsRef={fpsRef as React.RefObject<HTMLSpanElement>}
        toast={toast}
      />

      <Compass route={route} onNavigate={handleNavigate} />

      {/* ARSENAL */}
      <div className={`page${route==='arsenal'?' on':''}`} id="page-arsenal">
        <Arsenal
          cart={cart}
          onAddToCart={addToCart}
          onNavigateToSim={handleTestInSim}
          isActive={route === 'arsenal'}
        />
      </div>

      {/* CART */}
      <div className={`page${route==='cart'?' on':''}`} id="page-cart">
        <Cart
          cart={cart}
          onUpdateMode={updateMode}
          onUpdateAddress={updateAddress}
          onRemove={removeFromCart}
          onOpenPicker={(id) => { setPickWeaponId(id); setPickOpen(true); }}
          onShowToast={showToast}
          isActive={route === 'cart'}
        />
      </div>

      {/* SIMULATOR */}
      <div className={`page${route==='simulator'?' on':''}`} id="page-sim">
        <Simulator
          isActive={route === 'simulator'}
          simWeapon={simWeapon}
          onSimWeaponChange={setSimWeapon}
          mainSceneRef={sceneRef as React.RefObject<SceneController | null>}
        />
      </div>

      {/* INFORMATION */}
      <div className={`page${route==='information'?' on':''}`} id="page-info">
        <Information />
      </div>

      {/* PICK OVERLAY */}
      <PickOverlay
        open={pickOpen}
        weaponId={pickWeaponId}
        cart={cart}
        onConfirm={confirmTarget}
        onCancel={() => setPickOpen(false)}
        onShowToast={showToast}
      />

      {/* TWEAKS PANEL */}
      <TweaksPanel tweaks={tweaks} onUpdate={(patch) => setTweaks(prev => ({ ...prev, ...patch }))} sceneRef={sceneRef} />

      <Splash />
    </>
  );
}

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { initPickScene, PickController } from '../../scene/pickScene';
import { CartItem, Target } from '../../types';
import { weaponById } from '../../data';

interface Props {
  open: boolean;
  weaponId: string | null;
  cart: CartItem[];
  onConfirm: (weaponId: string, target: Target) => void;
  onCancel: () => void;
  onShowToast: (line: string, sub: string) => void;
}

export default function PickOverlay({ open, weaponId, cart, onConfirm, onCancel, onShowToast }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const stageRef   = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const ctrlRef    = useRef<PickController | null>(null);
  const [picked, setPicked] = useState<(Target & { localP?: any }) | null>(null);

  const w = weaponId ? weaponById(weaponId) : null;
  const existingTarget = weaponId ? cart.find(it => it.weaponId === weaponId)?.target : null;

  // Init Three.js scene when canvas is available
  useEffect(() => {
    if (!canvasRef.current || !stageRef.current) return;
    const ctrl = initPickScene(
      canvasRef.current,
      stageRef.current,
      (t) => setPicked(t),
    );
    ctrlRef.current = ctrl;
    // Start hidden
    if (overlayRef.current) gsap.set(overlayRef.current, { visibility: 'hidden', opacity: 0 });
    return () => { ctrl.dispose(); ctrlRef.current = null; };
  }, []);

  // GSAP open/close + pause/resume render loop
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    ctrlRef.current?.setVisible(open);
    if (open) {
      setPicked(existingTarget ?? null);
      gsap.set(el, { visibility: 'visible', pointerEvents: 'auto' });
      gsap.fromTo(el,
        { opacity: 0 },
        { opacity: 1, duration: 0.35, ease: 'power3.out' }
      );
      gsap.fromTo(
        el.querySelectorAll('.pick-head, .pick-foot'),
        { opacity: 0, y: 22 },
        { opacity: 1, y: 0, stagger: 0.1, duration: 0.45, ease: 'power3.out', delay: 0.1, clearProps: 'transform' }
      );
      setTimeout(() => ctrlRef.current?.resizeCanvas(), 50);
    } else {
      gsap.to(el, {
        opacity: 0,
        duration: 0.28,
        ease: 'power2.in',
        onComplete: () => gsap.set(el, { visibility: 'hidden', pointerEvents: 'none' }),
      });
    }
  }, [open, weaponId]);

  const isPending = !picked;

  return (
    <div className="pick-overlay" ref={overlayRef}>
      <div className="pick-head">
        <div>
          <h2>Set <em>target</em>.</h2>
          <div className="sub">{w ? `${w.code} · ${w.name} — SELECT IMPACT POINT` : '— SELECT A POINT ON THE PLANET'}</div>
        </div>
        <button className="btn ghost" onClick={onCancel}>▸ CANCEL</button>
      </div>
      <div className="pick-stage" ref={stageRef}>
        <canvas ref={canvasRef} />
      </div>
      <div className="pick-foot">
        <div className="readout">
          <div>LAT&nbsp;<span className={`v${isPending&&!picked?' pending':''}`}>{picked ? picked.lat.toFixed(2)+'°' : '—'}</span></div>
          <div>LON&nbsp;<span className={`v${isPending&&!picked?' pending':''}`}>{picked ? picked.lon.toFixed(2)+'°' : '—'}</span></div>
          <div>REGION&nbsp;<span className={`v${isPending&&!picked?' pending':''}`}>{picked ? picked.region : '—'}</span></div>
          <div>ETA&nbsp;<span className={`v${isPending&&!picked?' pending':''}`}>{picked ? (Math.random()*8+2).toFixed(1)+' min' : '—'}</span></div>
        </div>
        <button
          className="btn add"
          disabled={!picked}
          style={{ opacity: picked ? 1 : 0.3 }}
          onClick={() => {
            if (picked && weaponId) {
              onConfirm(weaponId, { lat: picked.lat, lon: picked.lon, region: picked.region });
              onShowToast('▸ COORDINATES LOCKED', picked.region);
            }
          }}
        >▸ LOCK COORDINATES</button>
      </div>
    </div>
  );
}

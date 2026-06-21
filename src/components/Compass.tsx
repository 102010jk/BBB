import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { Route } from '../types';
import { sound } from '../audio/sound';

const COMPASS_ROUTES: { id: Route | 'landing'; label: string; disc?: boolean }[] = [
  { id: 'arsenal',     label: 'ARSENAL'    },
  { id: 'information', label: 'INFORMATION'},
  { id: 'cart',        label: 'CART'       },
  { id: 'simulator',   label: 'SIMULATOR'  },
  { id: 'landing',     label: 'DISCONNECT', disc: true },
];

const COMPASS_GAP = 200;

interface Props {
  route: Route;
  onNavigate: (route: Route) => void;
}

export default function Compass({ route, onNavigate }: Props) {
  const visible = route !== 'landing';
  const [activeIdx, setActiveIdx] = useState(() => COMPASS_ROUTES.findIndex(r => r.id === route));
  const accumRef      = useRef(0);
  const dwellRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackRef      = useRef<HTMLDivElement>(null);
  const rootRef       = useRef<HTMLDivElement>(null);
  const isHoveringRef = useRef(false);
  const initRef       = useRef(false);

  // Sync active index when route changes externally
  useEffect(() => {
    const idx = COMPASS_ROUTES.findIndex(r => r.id === route);
    if (idx >= 0) setActiveIdx(idx);
  }, [route]);

  // Init track position on mount (no animation)
  useEffect(() => {
    if (trackRef.current) {
      gsap.set(trackRef.current, { x: -(0 * COMPASS_GAP + 100), yPercent: -50 });
    }
  }, []);

  // Animate track on activeIdx change
  useEffect(() => {
    if (!trackRef.current) return;
    gsap.to(trackRef.current, {
      x: -(activeIdx * COMPASS_GAP + 100),
      duration: 0.55,
      ease: 'back.out(1.7)',
    });
  }, [activeIdx]);

  // Compass show/hide with GSAP
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (!initRef.current) {
      // First render — start hidden
      gsap.set(el, { opacity: 0, y: -18 });
      initRef.current = true;
    }
    if (visible) {
      gsap.fromTo(el,
        { opacity: 0, y: -18 },
        { opacity: 1, y: 0, duration: 0.45, ease: 'power3.out', delay: 0.08, clearProps: 'y' }
      );
    } else {
      gsap.to(el, { opacity: 0, y: -14, duration: 0.3, ease: 'power2.in' });
    }
  }, [visible]);

  function select(idx: number, commit: boolean) {
    const clamped = Math.max(0, Math.min(COMPASS_ROUTES.length - 1, idx));
    setActiveIdx(clamped);
    if (commit) {
      const r = COMPASS_ROUTES[clamped];
      if (r && r.id !== route) onNavigate(r.id as Route);
    }
  }

  // Scroll handler — only fires when hovering
  useEffect(() => {
    if (!visible) return;
    function onWheel(e: WheelEvent) {
      if (!isHoveringRef.current) return;
      if ((e.target as HTMLElement)?.closest?.('.tweaks, .accordion, .items, .summary, .picker, .analytics, .detail, .pick-overlay')) return;
      e.preventDefault();
      accumRef.current += e.deltaY || e.deltaX;
      const STEP = 180;
      if (Math.abs(accumRef.current) > STEP) {
        const dir = accumRef.current > 0 ? 1 : -1;
        accumRef.current = 0;
        setActiveIdx(prev => {
          const next = Math.max(0, Math.min(COMPASS_ROUTES.length - 1, prev + dir));
          if (dwellRef.current) clearTimeout(dwellRef.current);
          dwellRef.current = setTimeout(() => {
            const r = COMPASS_ROUTES[next];
            if (r) onNavigate(r.id as Route);
          }, 450);
          return next;
        });
      }
    }
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, [visible, onNavigate]);

  return (
    <div
      className={`compass${visible ? ' on' : ''}`}
      ref={rootRef}
      onMouseEnter={() => { isHoveringRef.current = true; }}
      onMouseLeave={() => { isHoveringRef.current = false; }}
    >
      <div className="frame">
        <div className="ticks" />
        <div className="ticks bot" />
        <div className="track" ref={trackRef}>
          {COMPASS_ROUTES.map((r, i) => (
            <div
              key={r.id}
              className={`item${r.disc ? ' disc' : ''}${i === activeIdx ? ' active' : ''}`}
              onClick={() => select(i, true)}
              onMouseEnter={() => { if (i !== activeIdx) sound.play('hover'); }}
            >
              {r.label}
            </div>
          ))}
        </div>
        <div className="reticle" />
      </div>
    </div>
  );
}

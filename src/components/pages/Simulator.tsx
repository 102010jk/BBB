import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { initSimScene, SimController } from '../../scene/simScene';
import { SimAnalytics, SceneController } from '../../types';
import { CATEGORIES, weaponsInCategory, weaponById } from '../../data';
import { sound } from '../../audio/sound';

interface LogEntry { t: string; msg: string; kind: string; }

interface Props {
  isActive: boolean;
  simWeapon: string;
  onSimWeaponChange: (id: string) => void;
  mainSceneRef: React.RefObject<SceneController | null>;
}

export default function Simulator({ isActive, simWeapon, onSimWeaponChange, mainSceneRef }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const ctrlRef  = useRef<SimController | null>(null);
  const [analytics, setAnalytics] = useState<SimAnalytics>({ casualties: 0, radius: 0, cost: 0, halflife: 0, sparkHistory: [] });
  const [targetCoords, setTargetCoords] = useState('—');
  const [log, setLog] = useState<LogEntry[]>([]);

  // Direct DOM refs for count-up (avoids React re-render during tween)
  const casRef  = useRef<HTMLDivElement>(null);
  const radRef  = useRef<HTMLSpanElement>(null);
  const costRef = useRef<HTMLDivElement>(null);
  const hlRef   = useRef<HTMLDivElement>(null);
  const displayCounters = useRef({ cas: 0, rad: 0, cost: 0, hl: 0 });

  const simWeaponRef = useRef(simWeapon);
  simWeaponRef.current = simWeapon;

  useEffect(() => {
    if (!isActive || !stageRef.current) return;
    const ctrl = initSimScene({
      stageEl: stageRef.current,
      getSelectedWeapon: () => simWeaponRef.current,
      onAnalyticsUpdate: setAnalytics,
      onTargetCoords: setTargetCoords,
      onLog: (msg, kind) => {
        const d = new Date();
        const tstr = String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+':'+String(d.getSeconds()).padStart(2,'0');
        setLog(prev => [{ t: tstr, msg, kind }, ...prev].slice(0, 8));
      },
      triggerGlitch: () => mainSceneRef.current?.triggerGlitch(),
    });
    ctrlRef.current = ctrl;
    setTimeout(() => ctrl.resizeCanvas(), 100);
    const onResize = () => ctrl.resizeCanvas();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      ctrl.dispose();
      ctrlRef.current = null;
    };
  }, [isActive]);

  // Page entrance animation
  useEffect(() => {
    if (!isActive || !stageRef.current) return;
    const parent = stageRef.current.closest('#page-sim');
    if (!parent) return;
    gsap.fromTo(
      parent.querySelectorAll('.crumb, .page-head h1, .page-head .meta > *'),
      { opacity: 0, y: -12 },
      { opacity: 1, y: 0, stagger: 0.06, duration: 0.4, ease: 'power2.out', delay: 0.05, clearProps: 'transform,opacity' }
    );
    gsap.fromTo(
      parent.querySelectorAll('.sim .picker, .sim .analytics'),
      { opacity: 0, x: (_i: number, el: Element) => el.classList.contains('picker') ? -20 : 20 },
      { opacity: 1, x: 0, duration: 0.45, ease: 'power2.out', delay: 0.15, clearProps: 'transform,opacity' }
    );
  }, [isActive]);

  // GSAP count-up when analytics change
  useEffect(() => {
    const from = { ...displayCounters.current };
    const proxy = { cas: from.cas, rad: from.rad, cost: from.cost, hl: from.hl };

    gsap.to(proxy, {
      cas: analytics.casualties, rad: analytics.radius, cost: analytics.cost, hl: analytics.halflife,
      duration: 0.85,
      ease: 'power2.out',
      onUpdate() {
        if (casRef.current)  casRef.current.textContent  = Math.round(proxy.cas).toLocaleString();
        if (radRef.current)  radRef.current.textContent  = proxy.rad.toFixed(1);
        if (costRef.current) costRef.current.textContent = formatCost(proxy.cost);
        if (hlRef.current)   hlRef.current.textContent   = proxy.hl > 0 ? formatHalflife(Math.round(proxy.hl)) : '0 d';
        displayCounters.current = { cas: proxy.cas, rad: proxy.rad, cost: proxy.cost, hl: proxy.hl };
      },
    });

    // Flash glow on casualty number on new impact
    if (analytics.casualties > from.cas && casRef.current) {
      gsap.fromTo(casRef.current,
        { textShadow: '0 0 28px #dc2626, 0 0 10px #dc2626' },
        { textShadow: '0 0 0px transparent', duration: 0.9, ease: 'power2.out' }
      );
    }
  }, [analytics]);

  function formatCost(v: number): string {
    if (v >= 1e9) return '$ ' + (v/1e9).toFixed(2) + 'B';
    if (v >= 1e6) return '$ ' + (v/1e6).toFixed(1) + 'M';
    return '$ ' + v.toLocaleString();
  }
  function formatHalflife(v: number): string {
    return v > 365 ? (v/365).toFixed(1)+' y' : v + ' d';
  }

  const sparkPts = analytics.sparkHistory;
  const sparkPath = (() => {
    if (sparkPts.length < 2) return '';
    const max = Math.max(...sparkPts, 1);
    const W = 200, H = 36;
    return sparkPts.map((v, i) => {
      const x = (i / (sparkPts.length-1)) * W;
      const y = H - (v / max) * (H-2) - 1;
      return (i===0?'M':'L') + x.toFixed(1)+' '+y.toFixed(1);
    }).join(' ');
  })();

  return (
    <>
      <div className="page-head">
        <div className="left">
          <span className="crumb">// SIM.SANDBOX</span>
          <h1>IMPACT SIMULATOR <span className="sub">/ {weaponById(simWeapon)?.name ?? '—'}</span></h1>
        </div>
        <div className="meta">
          <div><span className="k">TARGET</span><span className="v">{targetCoords}</span></div>
          <div><span className="k">REGISTRY</span><span className="v">SANDBOX</span></div>
          <div><span className="k">YIELD</span><span className="v green">LIVE</span></div>
        </div>
      </div>
      <div className="sim">
        <div className="picker">
          <h3>// PAYLOAD</h3>
          <div>
            {CATEGORIES.map(cat => (
              <div key={cat.id} className="pgroup">
                <div className="cat-name">{cat.name}</div>
                {weaponsInCategory(cat.id).map(w => (
                  <div
                    key={w.id}
                    className={`row${simWeapon===w.id?' active':''}`}
                    onClick={() => { onSimWeaponChange(w.id); sound.play('click'); }}
                    onMouseEnter={() => sound.play('hover')}
                  >
                    <span>{w.name}</span>
                    <span className="y">{cat.deploy.includes('DROP') ? '·' : '×'}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="deploy">▸ CLICK ANYWHERE ON EARTH<br/>TO DEPLOY</div>
        </div>
        <div className="stage" ref={stageRef}>
          <div className="crosshair" />
          <div className="center-info"><kbd>CLICK</kbd>DEPLOY · <kbd>DRAG</kbd>ROTATE</div>
        </div>
        <div className="analytics">
          <div className="analytics-head">
            <h3>// LIVE ANALYTICS</h3>
            <button
              type="button"
              className="reset-btn"
              onClick={() => ctrlRef.current?.reset()}
              title="Clear all impacts and zero the registry"
            >▸ RESET</button>
          </div>
          <div className="stat-big">
            <div className="k">EST. CASUALTIES</div>
            <div className="v red" ref={casRef}>0</div>
            <div className="u">SOULS, MEDIAN ESTIMATE</div>
            <div className="spark">
              <svg viewBox="0 0 200 36" preserveAspectRatio="none">
                <path d={sparkPath} stroke="#dc2626" fill="none" strokeWidth="1.2" />
              </svg>
            </div>
          </div>
          <div className="stat-big">
            <div className="k">DESTRUCTION RADIUS</div>
            <div className="v"><span ref={radRef}>0.0</span> <span className="u" style={{ fontSize:14, color:'var(--dim)' }}>KM</span></div>
            <div className="u">KILOMETERS, FROM EPICENTER</div>
          </div>
          <div className="stat-big">
            <div className="k">FINANCIAL DAMAGE</div>
            <div className="v green" ref={costRef}>$ 0</div>
            <div className="u">USD, GLOBAL MARKETS</div>
          </div>
          <div className="stat-big">
            <div className="k">RESIDUAL HALF-LIFE</div>
            <div className="v" ref={hlRef}>0 d</div>
            <div className="u">UNTIL HABITABLE</div>
          </div>
          <div className="sim-log">
            {log.map((entry) => (
              <div key={entry.t + entry.msg} className={`row${entry.kind?' '+entry.kind:''}`}>
                <span className="t">{entry.t}</span>
                <span>{entry.msg}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { CATEGORIES, WEAPONS, weaponById, weaponsInCategory, categoryById } from '../../data';
import { CartItem, Weapon } from '../../types';

interface Props {
  cart: CartItem[];
  onAddToCart: (weaponId: string) => void;
  onNavigateToSim: (weaponId: string) => void;
  isActive: boolean;
}

function yieldDisplay(w: Weapon): string {
  if (w.cat==='grenades') return (w.stats.YIELD*15).toFixed(2)+' kg TNT';
  if (w.cat==='lasers')   return (w.stats.YIELD*45).toFixed(0)+' MJ/s';
  if (w.cat==='nukes')    return w.stats.YIELD < 0.5 ? (w.stats.YIELD*5).toFixed(1)+' kt' : (w.stats.YIELD*120).toFixed(0)+' kt';
  if (w.cat==='drones')   return (w.stats.YIELD*80).toFixed(0)+' kg TNT-eq';
  return (w.stats.YIELD*500).toFixed(0)+' kt';
}
const rangeDisplay    = (w: Weapon) => (w.stats.RANGE*15000|0).toLocaleString()+' km';
const precisionDisplay= (w: Weapon) => (Math.round((1.05-w.stats.PRECISION)*200))+' m CEP';
const massDisplay     = (w: Weapon) => w.cat==='grenades' ? (w.stats.MASS*0.5).toFixed(2)+' kg' : (w.stats.MASS*2400|0).toLocaleString()+' kg';
function deployTimeDisplay(w: Weapon): string {
  const sec = (1.05 - w.stats.DEPLOY) * 600;
  return sec < 60 ? sec.toFixed(0)+' s' : (sec/60).toFixed(1)+' min';
}

function StatRow({ label, value01, display, red=false }: { label:string; value01:number; display:string; red?:boolean }) {
  const pct = Math.round(value01 * 100);
  return (
    <div className={`stat-row${red?' red':''}`}>
      <div className="top"><span className="k">{label}</span><span className="v">{display}</span></div>
      <div className="bar"><div className="fill" style={{ width: pct+'%' }} /></div>
    </div>
  );
}

function YieldGraph({ w }: { w: Weapon }) {
  const W=520, H=120, pad=8;
  const peakX = (1-w.stats.DEPLOY) * (W-pad*2) + pad;
  const peakY = pad + (1-w.stats.YIELD) * (H-pad*2 - 10);
  const pts: [number,number][] = [];
  const N = 60;
  for (let i=0;i<N;i++) {
    const x = pad + (i/(N-1)) * (W-pad*2);
    const σ = (W-pad*2) * (0.18 + (1-w.stats.YIELD)*0.10);
    const y = peakY + (H - pad - peakY) * (1 - Math.exp(-Math.pow((x-peakX)/σ, 2)));
    pts.push([x, y]);
  }
  const path = pts.map((p,i) => (i===0?'M':'L')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
  const fillPath = path + ` L ${pts[pts.length-1][0].toFixed(1)} ${H-pad} L ${pts[0][0].toFixed(1)} ${H-pad} Z`;
  const gradId = `yg-${w.id}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width:'100%', height:H }}>
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%"   stopColor="#7dff8e" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#7dff8e" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill={`url(#${gradId})`} />
      <path d={path} stroke="#7dff8e" strokeWidth="1.4" fill="none" />
      <circle cx={peakX} cy={peakY} r="3" fill="#dc2626" />
      <line x1={peakX} y1={peakY} x2={peakX} y2={H-pad} stroke="#dc2626" strokeWidth="0.5" strokeDasharray="2 3" />
      {[0.25,0.5,0.75].map(g => (
        <line key={g} x1={pad} y1={pad+g*(H-pad*2)} x2={W-pad} y2={pad+g*(H-pad*2)} stroke="#1c1c1c" strokeWidth="0.5" />
      ))}
    </svg>
  );
}

function WeaponDetail({ weapon, inCart, onAddToCart, onTest }: { weapon: Weapon; inCart: boolean; onAddToCart: () => void; onTest: () => void }) {
  const cat = categoryById(weapon.cat)!;
  const deployText = cat.deploy.join('  ·  ');
  const detRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = detRef.current;
    if (!el) return;

    // Stagger sections in
    const targets = [
      el.querySelector('.det-head'),
      ...Array.from(el.querySelectorAll('.stat-row')),
      el.querySelector('.det-desc'),
      el.querySelector('.det-graph'),
      el.querySelector('.det-actions'),
    ].filter(Boolean);
    gsap.fromTo(targets,
      { opacity: 0, y: 14 },
      { opacity: 1, y: 0, stagger: 0.045, duration: 0.42, ease: 'power2.out', clearProps: 'transform,opacity' }
    );

    // Animate stat bars from 0
    el.querySelectorAll<HTMLElement>('.bar .fill').forEach(fill => {
      const targetW = fill.style.width;
      gsap.fromTo(fill, { width: '0%' }, { width: targetW, duration: 0.9, ease: 'power3.out', delay: 0.18 });
    });
  }, [weapon.id]);

  return (
    <div className="det on" ref={detRef}>
      <div className="det-head">
        <div>
          <div className="code">{weapon.code} · {cat.name}</div>
          <h2>{weapon.name}</h2>
        </div>
        <div className="price">
          <span className="u">UNIT PRICE</span>
          ${weapon.price.toLocaleString()}
        </div>
      </div>
      <div className="det-body">
        <div className="det-stats">
          <StatRow label="YIELD"       value01={weapon.stats.YIELD}     display={yieldDisplay(weapon)} />
          <StatRow label="RANGE"       value01={weapon.stats.RANGE}     display={rangeDisplay(weapon)} />
          <StatRow label="PRECISION"   value01={weapon.stats.PRECISION} display={precisionDisplay(weapon)} />
          <StatRow label="MASS"        value01={weapon.stats.MASS}      display={massDisplay(weapon)} />
          <StatRow label="DEPLOY TIME" value01={weapon.stats.DEPLOY}    display={deployTimeDisplay(weapon)} red />
        </div>
        <div className="det-desc">
          <p>{weapon.desc}</p>
          <div className="tags">{weapon.tags.map(t => <span key={t} className="tag">{t}</span>)}</div>
          <div style={{ fontSize:10, letterSpacing:'.24em', color:'var(--dim)' }}>
            DEPLOYMENT MODES: <b style={{ color:'var(--green)', fontWeight:600 }}>{deployText}</b>
          </div>
        </div>
        <div className="det-graph">
          <div className="lbl"><span className="l">// YIELD CURVE</span><span>kt-eq over t · s</span></div>
          <YieldGraph w={weapon} />
        </div>
      </div>
      <div className="det-actions">
        <div className="deploy-info">{cat.desc}</div>
        <button className="btn test" onClick={onTest}>▸ TEST IN SIMULATOR</button>
        <button className={`btn add${inCart?' added':''}`} onClick={onAddToCart} disabled={inCart}>
          {inCart ? '✓ IN CART' : '▸ ADD TO CART'}
        </button>
      </div>
    </div>
  );
}

export default function Arsenal({ cart, onAddToCart, onNavigateToSim, isActive }: Props) {
  const [openCat, setOpenCat] = useState<string | null>('nukes');
  const [selected, setSelected] = useState<string | null>(null);
  const pageRef    = useRef<HTMLDivElement>(null);
  const prevActive = useRef(false);

  const selectedWeapon = selected ? weaponById(selected) : null;
  const inCart = (id: string) => cart.some(it => it.weaponId === id);

  // Page entrance animation
  useEffect(() => {
    if (isActive && !prevActive.current && pageRef.current) {
      const el = pageRef.current;
      gsap.fromTo(
        el.querySelectorAll('.crumb, .page-head h1, .page-head .meta > *'),
        { opacity: 0, y: -12 },
        { opacity: 1, y: 0, stagger: 0.06, duration: 0.4, ease: 'power2.out', delay: 0.05, clearProps: 'transform,opacity' }
      );
      gsap.fromTo(
        el.querySelectorAll('.arsenal .col'),
        { opacity: 0, y: 22 },
        { opacity: 1, y: 0, stagger: 0.1, duration: 0.5, ease: 'power2.out', delay: 0.12, clearProps: 'transform,opacity' }
      );
    }
    prevActive.current = isActive;
  }, [isActive]);

  return (
    <div ref={pageRef}>
      <div className="page-head">
        <div className="left">
          <span className="crumb">// ARSENAL.001</span>
          <h1>WEAPONS CATALOG <span className="sub">/ BBB-A/2086</span></h1>
        </div>
        <div className="meta">
          <div><span className="k">SKUS</span><span className="v">15</span></div>
          <div><span className="k">CATEGORIES</span><span className="v">5</span></div>
          <div><span className="k">CLEARANCE</span><span className="v green">DELTA</span></div>
        </div>
      </div>
      <div className="arsenal">
        <div className="col">
          <div className="accordion">
            {CATEGORIES.map(cat => {
              const weapons = weaponsInCategory(cat.id);
              const isOpen = openCat === cat.id;
              return (
                <div key={cat.id} className={`cat${isOpen?' open':''}`}>
                  <div className="cat-head" onClick={() => setOpenCat(isOpen ? null : cat.id)}>
                    <div className="name">▸ {cat.name}</div>
                    <div className="meta">
                      <span>{cat.deploy.join(' / ')}</span>
                      <span className="count">{weapons.length}</span>
                      <span className="chev" />
                    </div>
                  </div>
                  <div className="cat-body">
                    {weapons.map(w => (
                      <div
                        key={w.id}
                        className={`weapon${selected===w.id?' active':''}`}
                        onClick={() => setSelected(w.id)}
                      >
                        <span>{w.code}&nbsp;&nbsp;{w.name}</span>
                        <span className="price">${w.price.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="col">
          <div className="detail">
            {selectedWeapon ? (
              <WeaponDetail
                weapon={selectedWeapon}
                inCart={inCart(selectedWeapon.id)}
                onAddToCart={() => onAddToCart(selectedWeapon.id)}
                onTest={() => onNavigateToSim(selectedWeapon.id)}
              />
            ) : (
              <div className="detail-empty">SELECT A WEAPON</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

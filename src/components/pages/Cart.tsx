import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { CartItem, DeployMode } from '../../types';
import { weaponById, categoryById } from '../../data';

const VAULT_BALANCE = 1420000;

interface Props {
  cart: CartItem[];
  onUpdateMode: (weaponId: string, mode: DeployMode) => void;
  onUpdateAddress: (weaponId: string, address: string) => void;
  onRemove: (weaponId: string) => void;
  onOpenPicker: (weaponId: string) => void;
  onShowToast: (line: string, sub: string, red?: boolean) => void;
  isActive: boolean;
}

export default function Cart({ cart, onUpdateMode, onUpdateAddress, onRemove, onOpenPicker, onShowToast, isActive }: Props) {
  const [warnKey, setWarnKey] = useState(0);
  const [warnMsg, setWarnMsg] = useState(' ');
  const buyRef    = useRef<HTMLButtonElement>(null);
  const itemsRef  = useRef<HTMLDivElement>(null);
  const pageRef   = useRef<HTMLDivElement>(null);
  const prevActive = useRef(false);
  const prevCount  = useRef(cart.length);

  const count    = cart.length;
  const subtotal  = cart.reduce((s, it) => s + (weaponById(it.weaponId)?.price ?? 0), 0);
  const handling  = Math.round(subtotal * 0.12);
  const insurance = Math.round(subtotal * 0.04);
  const total     = subtotal + handling + insurance;
  const funds     = VAULT_BALANCE - total;
  const pending   = cart.filter(it => it.mode === 'DROP' && !it.target).length;
  const dropTotal = cart.filter(it => it.mode === 'DROP').length;

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
        el.querySelectorAll('.cart > *'),
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, stagger: 0.1, duration: 0.5, ease: 'power2.out', delay: 0.12, clearProps: 'transform,opacity' }
      );
    }
    prevActive.current = isActive;
  }, [isActive]);

  // Animate items on count change
  useEffect(() => {
    if (!itemsRef.current) return;
    const els = itemsRef.current.querySelectorAll('.item');
    if (cart.length > prevCount.current) {
      // New item added — stagger in all items
      gsap.fromTo(els,
        { opacity: 0, x: -14 },
        { opacity: 1, x: 0, stagger: 0.06, duration: 0.38, ease: 'power2.out', clearProps: 'transform,opacity' }
      );
    }
    prevCount.current = cart.length;
  }, [cart.length]);

  function handleBuy() {
    // GSAP shake on BUY button
    if (buyRef.current) {
      gsap.timeline()
        .to(buyRef.current, { x: -7, duration: 0.05 })
        .to(buyRef.current, { x:  7, duration: 0.05 })
        .to(buyRef.current, { x: -5, duration: 0.05 })
        .to(buyRef.current, { x:  5, duration: 0.05 })
        .to(buyRef.current, { x: -3, duration: 0.05 })
        .to(buyRef.current, { x:  0, duration: 0.05, clearProps: 'x' });
    }
    setWarnKey(k => k + 1);
    setWarnMsg('▸ INSUFFICIENT FUNDS');
    onShowToast('▸ TRANSACTION DENIED', 'INSUFFICIENT FUNDS · VAULT BALANCE TOO LOW', true);
    setTimeout(() => setWarnMsg(' '), 3000);
  }

  return (
    <div ref={pageRef}>
      <div className="page-head">
        <div className="left">
          <span className="crumb">// MANIFEST.{(1000 + count).toString().padStart(4,'0')}</span>
          <h1>DEPLOYMENT QUEUE <span className="sub">/ STAGED ITEMS {count}</span></h1>
        </div>
        <div className="meta">
          <div><span className="k">VAULT</span><span className="v green">$ 1,420,000</span></div>
          <div><span className="k">SESSION</span><span className="v">7FD9-EAGLE</span></div>
          <div><span className="k">OP-SEC</span><span className="v red">RED</span></div>
        </div>
      </div>
      <div className="cart">
        <div className="items-wrap">
          <div className="brief">
            <div className="b-col"><div className="k">LAUNCH WINDOW</div><div className="v">T-MINUS&nbsp;<span className="green">04:12:38</span></div></div>
            <div className="b-col"><div className="k">ORBITAL PLATFORM</div><div className="v">SWORD-7&nbsp;<span style={{ color:'var(--dim)' }}>·</span>&nbsp;<span className="green">READY</span></div></div>
            <div className="b-col"><div className="k">PAYLOADS PENDING TARGET</div><div className={`v ${pending > 0 ? 'red' : 'green'}`}>{pending} OF {dropTotal}</div></div>
          </div>
          <div className="items" ref={itemsRef}>
            {count === 0 ? (
              <div className="empty">// CART EMPTY<div className="sub">Browse the arsenal to stage payloads.</div></div>
            ) : (
              cart.map(it => {
                const w = weaponById(it.weaponId)!;
                const cat = categoryById(w.cat)!;
                const canDrop    = cat.deploy.includes('DROP');
                const canDeliver = cat.deploy.includes('DELIVER');
                const stripeCls  = it.mode === 'DROP' ? (it.target ? 'has-target' : 'no-target') : 'has-target';
                return (
                  <div key={w.id} className={`item ${stripeCls}`} data-id={w.id}>
                    <div className="code">{w.code}<span className="price">${w.price.toLocaleString()}</span></div>
                    <div className="meat">
                      <h3>{w.name}</h3>
                      <div className="deploy-strip">
                        <span>MODE:</span>
                        <div className="seg">
                          <button
                            data-mode="DROP"
                            disabled={!canDrop}
                            className={it.mode==='DROP'?'on':''}
                            onClick={() => onUpdateMode(w.id, 'DROP')}
                          >DROP</button>
                          <button
                            data-mode="DELIVER"
                            disabled={!canDeliver}
                            className={it.mode==='DELIVER'?'on':''}
                            onClick={() => onUpdateMode(w.id, 'DELIVER')}
                          >DELIVER</button>
                        </div>
                      </div>
                    </div>
                    <div className="target">
                      {it.mode === 'DROP' ? (
                        it.target ? (
                          <>
                            <div>LAT&nbsp;<span className="v">{it.target.lat.toFixed(2)}°</span></div>
                            <div>LON&nbsp;<span className="v">{it.target.lon.toFixed(2)}°</span></div>
                            <div>REGION&nbsp;<span className="v">{it.target.region}</span></div>
                            <button className="pickbtn set" onClick={() => onOpenPicker(w.id)}>▸ RETARGET</button>
                          </>
                        ) : (
                          <>
                            <div>TARGET&nbsp;<span className="v pending">NOT SET</span></div>
                            <button className="pickbtn" onClick={() => onOpenPicker(w.id)}>▸ PICK COORDINATES</button>
                          </>
                        )
                      ) : (
                        <>
                          <input
                            type="text"
                            placeholder="DELIVERY ADDRESS"
                            value={it.address ?? ''}
                            onChange={e => onUpdateAddress(w.id, e.target.value)}
                          />
                          <div style={{ fontSize:'9.5px', color:'var(--dim)', letterSpacing:'.18em' }}>
                            ETA&nbsp;·&nbsp;<span className="v" style={{ color:'var(--green)' }}>3–5 BUSINESS DAYS</span>
                          </div>
                        </>
                      )}
                    </div>
                    <button className="remove" onClick={() => onRemove(w.id)}>▸ REMOVE</button>
                  </div>
                );
              })
            )}
          </div>
        </div>
        <div className="summary">
          <h3>// INVOICE</h3>
          <div className="row"><span>SUBTOTAL</span><span className="v">$&nbsp;{subtotal.toLocaleString()}</span></div>
          <div className="row"><span>ORBITAL HANDLING (12%)</span><span className="v">$&nbsp;{handling.toLocaleString()}</span></div>
          <div className="row"><span>INSURANCE WAIVER</span><span className="v">$&nbsp;{insurance.toLocaleString()}</span></div>
          <div className="divider" />
          <div className="total">
            <span className="k">TOTAL</span>
            <span className="v">$&nbsp;{total.toLocaleString()}</span>
          </div>
          <div className="funds">
            FUNDS REQ&nbsp;·&nbsp;
            {funds >= 0
              ? <span className="v">$&nbsp;{VAULT_BALANCE.toLocaleString()} AVAILABLE</span>
              : <span className="v lacking">SHORT BY $&nbsp;{(-funds).toLocaleString()}</span>
            }
          </div>
          <div className="warn-msg">{warnMsg}</div>
          <button
            key={warnKey}
            className={`buy${warnKey > 0 ? ' warn' : ''}`}
            ref={buyRef}
            onClick={handleBuy}
          >▸ BUY</button>
        </div>
      </div>
    </div>
  );
}

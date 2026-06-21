import { useEffect, useRef, useState } from 'react';
import { TweakState, SceneController } from '../types';

interface Props {
  tweaks: TweakState;
  onUpdate: (t: Partial<TweakState>) => void;
  sceneRef: React.RefObject<SceneController | null>;
}

function TweakSlider({
  label, id, min, max, step, value, format, onChange,
}: {
  label: string; id: string; min: number; max: number; step: number;
  value: number; format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const fmt = format ?? ((v: number) => v.toFixed(2));
  return (
    <div className="grp">
      <div className="lbl">
        <span>{label}</span>
        <span className="val">{fmt(value)}</span>
      </div>
      <input
        type="range" id={id} min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

export default function TweaksPanel({ tweaks, onUpdate, sceneRef }: Props) {
  const [on, setOn] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target && ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA')) return;
      if (e.key === 't' || e.key === 'T') setOn(prev => !prev);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Draggable head
  const headRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const head = headRef.current;
    const panel = panelRef.current;
    if (!head || !panel) return;
    let drag = false, sx = 0, sy = 0, ox = 0, oy = 0;
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).id === 'tweaks-close') return;
      drag = true; head.setPointerCapture(e.pointerId);
      const r = panel.getBoundingClientRect(); sx = r.left; sy = r.top; ox = e.clientX; oy = e.clientY;
      panel.style.right = 'auto'; panel.style.bottom = 'auto';
      panel.style.left = sx + 'px'; panel.style.top = sy + 'px';
    };
    const onMove = (e: PointerEvent) => { if (!drag) return; panel.style.left = (sx + e.clientX - ox) + 'px'; panel.style.top = (sy + e.clientY - oy) + 'px'; };
    const onUp   = () => { drag = false; };
    head.addEventListener('pointerdown', onDown);
    head.addEventListener('pointermove', onMove);
    head.addEventListener('pointerup', onUp);
    return () => {
      head.removeEventListener('pointerdown', onDown);
      head.removeEventListener('pointermove', onMove);
      head.removeEventListener('pointerup', onUp);
    };
  }, []);

  function change<K extends keyof TweakState>(key: K, value: TweakState[K]) {
    const patch = { [key]: value } as Partial<TweakState>;
    onUpdate(patch);
    sceneRef.current?.updateTweaks(patch);
  }

  return (
    <div className={`tweaks${on ? ' on' : ''}`} ref={panelRef}>
      <div className="head" ref={headRef}>
        <div className="ttl">// TWEAKS</div>
        <button className="x" id="tweaks-close" onClick={() => setOn(false)}>×</button>
      </div>
      <div className="body">
        <div className="sec">// SCENE</div>
        <TweakSlider label="RING RADIUS"     id="t-ringR" min={1.2} max={5.0} step={0.05} value={tweaks.ringRadius}    onChange={v => change('ringRadius', v)} />
        <TweakSlider label="RING THICKNESS"  id="t-ringT" min={0.05} max={0.6} step={0.01} value={tweaks.ringThickness} onChange={v => change('ringThickness', v)} />
        <TweakSlider label="RING SPEED"      id="t-ringS" min={0} max={0.4} step={0.01} value={tweaks.ringSpeed}      onChange={v => change('ringSpeed', v)} />
        <TweakSlider label="RING PARTICLES"  id="t-ringC" min={600} max={6000} step={100} value={tweaks.ringCount}     format={v => String(Math.round(v))} onChange={v => change('ringCount', Math.round(v))} />
        <TweakSlider label="CAMERA TILT"     id="t-tilt"  min={0.4} max={3.0} step={0.05} value={tweaks.cameraTilt}   onChange={v => change('cameraTilt', v)} />
        <TweakSlider label="STARS"           id="t-stars" min={500} max={12000} step={100} value={tweaks.starsCount}   format={v => String(Math.round(v))} onChange={v => change('starsCount', Math.round(v))} />
        <div className="sec">// POSTPROCESS</div>
        <TweakSlider label="GLITCH (CLICK)"  id="t-glitch" min={0} max={2} step={0.05} value={tweaks.glitchIntensity}  onChange={v => change('glitchIntensity', v)} />
        <TweakSlider label="SCANLINE"        id="t-scan"  min={0} max={0.5} step={0.01} value={tweaks.scanlineStrength} onChange={v => change('scanlineStrength', v)} />
        <div className="sec">// SPLATTER</div>
        <TweakSlider label="PUSH STRENGTH"   id="t-pushS" min={0} max={4} step={0.05} value={tweaks.pushStrength}     onChange={v => change('pushStrength', v)} />
        <TweakSlider label="PUSH RADIUS"     id="t-pushR" min={0.2} max={4} step={0.05} value={tweaks.pushRadius}     onChange={v => change('pushRadius', v)} />
        <TweakSlider label="PARTICLE SIZE"   id="t-psize" min={0.005} max={0.20} step={0.005} value={tweaks.particleSize} format={v => v.toFixed(3)} onChange={v => change('particleSize', v)} />
      </div>
    </div>
  );
}

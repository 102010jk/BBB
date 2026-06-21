import { useEffect, useRef } from 'react';
import gsap from 'gsap';

export default function Splash() {
  const rootRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tl = gsap.timeline();
    tl.fromTo(logoRef.current,
        { opacity: 0, y: -18, letterSpacing: '1.4em' },
        { opacity: 1, y: 0,   letterSpacing: '.4em', duration: 0.7, ease: 'power3.out' }
      )
      .fromTo(textRef.current,
        { opacity: 0, letterSpacing: '.9em' },
        { opacity: 1, letterSpacing: '.4em', duration: 0.45, ease: 'power2.out' },
        '-=0.25'
      )
      .to(rootRef.current, {
        opacity: 0,
        duration: 0.55,
        ease: 'power2.in',
        delay: 0.45,
        onComplete: () => { if (rootRef.current) gsap.set(rootRef.current, { display: 'none' }); },
      });
    return () => { tl.kill(); };
  }, []);

  return (
    <div className="splash" ref={rootRef}>
      <div className="logo" ref={logoRef}>B<em>B</em>B</div>
      <div ref={textRef}>ESTABLISHING SECURE UPLINK</div>
    </div>
  );
}

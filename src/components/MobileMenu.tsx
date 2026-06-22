import { Route } from '../types';
import { sound } from '../audio/sound';

const ITEMS: { id: Route; label: string }[] = [
  { id: 'arsenal',     label: 'ARSENAL'     },
  { id: 'information', label: 'INFORMATION' },
  { id: 'cart',        label: 'CART'        },
  { id: 'simulator',   label: 'SIMULATOR'   },
];

interface Props {
  route: Route;
  onNavigate: (route: Route) => void;
}

/**
 * Touch-friendly landing menu. On narrow screens the orbiting 3D labels can
 * swing off the edges of a portrait viewport, so we swap them (via CSS) for
 * this static, large-target stack that is always reachable with a thumb.
 */
export default function MobileMenu({ route, onNavigate }: Props) {
  return (
    <nav className={`mobile-menu${route === 'landing' ? ' on' : ''}`} aria-label="Main menu">
      {ITEMS.map(it => (
        <button
          key={it.id}
          type="button"
          className="mm-item"
          onClick={() => { sound.play('click'); onNavigate(it.id); }}
        >
          <span className="mm-arrow" aria-hidden="true">▸</span>
          {it.label}
        </button>
      ))}
    </nav>
  );
}

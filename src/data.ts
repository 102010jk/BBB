import { Category, DeployMode, Weapon } from './types';

export const CATEGORIES: Category[] = [
  { id:'grenades', name:'HAND GRENADES',  deploy:['DELIVER'],            desc:'Personal-issue ordnance. Subsonic, fragmentation, thermobaric.' },
  { id:'lasers',   name:'ORBITAL LASERS', deploy:['DROP'],               desc:'Coherent-beam orbital platforms. Continuous-fire and lance variants.' },
  { id:'nukes',    name:'NUKES',          deploy:['DROP','DELIVER'],      desc:'Yield-class fission and thermonuclear devices. Hardened transit.' },
  { id:'drones',   name:'DRONE STRIKES',  deploy:['DROP'],               desc:'Autonomous loitering munitions. Single-use or swarm.' },
  { id:'missiles', name:'MISSILES',       deploy:['DROP','DELIVER'],      desc:'Hypersonic glide vehicles and cruise platforms. MIRV-capable.' },
];

export const WEAPONS: Weapon[] = [
  // grenades
  { id:'g-frag',  cat:'grenades', code:'BBB-G/14', name:'FRAG-19',         price: 220,
    stats:{ YIELD:0.04, RANGE:0.06, PRECISION:0.45, MASS:0.08, DEPLOY:0.95 },
    tags:['INFANTRY','FRAG','LEGAL-EU'],
    desc:'Standard issue defensive grenade. Pre-fragmented steel jacket, 4-second delay fuze.' },
  { id:'g-therm', cat:'grenades', code:'BBB-G/22', name:'THERMOBARIC-K',   price: 1450,
    stats:{ YIELD:0.18, RANGE:0.10, PRECISION:0.35, MASS:0.22, DEPLOY:0.85 },
    tags:['STRUCTURE','THERMOBARIC','CIVILIAN-ZONE-RESTRICTED'],
    desc:'Fuel-air enhanced blast for enclosed structures. Overpressure event in 12m radius.' },
  { id:'g-emp',   cat:'grenades', code:'BBB-G/40', name:'EMP-PULSE',       price: 6200,
    stats:{ YIELD:0.02, RANGE:0.12, PRECISION:0.60, MASS:0.30, DEPLOY:0.70 },
    tags:['EMP','NON-LETHAL','TIER-3'],
    desc:'Single-use electromagnetic pulse charge. Disables electronics in a 30m sphere for ~90 seconds.' },

  // orbital lasers
  { id:'l-lance', cat:'lasers', code:'BBB-L/01', name:'LANCE-7',           price: 480000,
    stats:{ YIELD:0.55, RANGE:0.98, PRECISION:0.97, MASS:0.65, DEPLOY:0.30 },
    tags:['ORBITAL','CONTINUOUS','PRECISION'],
    desc:'4-second lance from Sword-Class platform. Penetrates 18m hardened concrete, glassifies soil.' },
  { id:'l-burst', cat:'lasers', code:'BBB-L/03', name:'PHASE-BURST',       price: 1240000,
    stats:{ YIELD:0.75, RANGE:0.92, PRECISION:0.88, MASS:0.78, DEPLOY:0.42 },
    tags:['ORBITAL','PULSED','AREA'],
    desc:'Multi-pulse area denial. 12 lances over 90 seconds, walking pattern across a 400m corridor.' },
  { id:'l-glass', cat:'lasers', code:'BBB-L/09', name:'GLASSWORK',         price: 4900000,
    stats:{ YIELD:0.92, RANGE:1.00, PRECISION:0.78, MASS:0.95, DEPLOY:0.18 },
    tags:['STRATEGIC','SUSTAINED','EXPORT-BANNED'],
    desc:'Sustained 12-minute burn from low orbit. Designed to render a 2km radius geologically inert.' },

  // nukes
  { id:'n-tac',   cat:'nukes', code:'BBB-N/05', name:'TACTICAL · 1.2kt',   price: 220000,
    stats:{ YIELD:0.40, RANGE:0.85, PRECISION:0.62, MASS:0.55, DEPLOY:0.55 },
    tags:['TACTICAL','FISSION','RAILHEAD'],
    desc:'Linear-implosion device with airburst fuze. Designed for armored column denial.' },
  { id:'n-strat', cat:'nukes', code:'BBB-N/12', name:'STRATEGIC · 480kt',  price: 1800000,
    stats:{ YIELD:0.88, RANGE:0.92, PRECISION:0.55, MASS:0.84, DEPLOY:0.45 },
    tags:['STRATEGIC','THERMONUCLEAR','MIRV-COMPATIBLE'],
    desc:'Two-stage thermonuclear primary. Hardened reentry vehicle, salt-jacketed for fallout shaping.' },
  { id:'n-doom',  cat:'nukes', code:'BBB-N/Ω',  name:'OMEGA · 64Mt',       price: 18900000,
    stats:{ YIELD:1.00, RANGE:0.98, PRECISION:0.40, MASS:1.00, DEPLOY:0.22 },
    tags:['CITY-KILLER','THERMONUCLEAR','EXPORT-PROHIBITED','TIER-Ω'],
    desc:'Sole-purpose deterrent. Cobalt-salted fusion-fission-fusion device. Restricted to head-of-state authority.' },

  // drones
  { id:'d-swarm', cat:'drones', code:'BBB-D/03', name:'SWARM-12',          price: 84000,
    stats:{ YIELD:0.32, RANGE:0.72, PRECISION:0.88, MASS:0.30, DEPLOY:0.68 },
    tags:['SWARM','LOITER','TIER-2'],
    desc:'12-unit kamikaze swarm with shared targeting cortex. Coordinated breach pattern.' },
  { id:'d-loit',  cat:'drones', code:'BBB-D/08', name:'PHANTOM-LOITER',    price: 310000,
    stats:{ YIELD:0.42, RANGE:0.95, PRECISION:0.94, MASS:0.40, DEPLOY:0.55 },
    tags:['SOLO','ENDURANCE','BLACK-SITE'],
    desc:'72-hour loitering platform. AI target selection, IR + RF + acoustic triangulation.' },
  { id:'d-reap',  cat:'drones', code:'BBB-D/14', name:'REAPER-EVO',        price: 920000,
    stats:{ YIELD:0.62, RANGE:0.88, PRECISION:0.92, MASS:0.62, DEPLOY:0.42 },
    tags:['HEAVY','HARDPOINT','VTOL'],
    desc:'Heavy strike drone with 8 hardpoints. Drop tank capacity, supersonic dash, autonomous egress.' },

  // missiles
  { id:'m-cruise', cat:'missiles', code:'BBB-M/02', name:'CRUISE-9',       price: 460000,
    stats:{ YIELD:0.45, RANGE:0.78, PRECISION:0.90, MASS:0.50, DEPLOY:0.62 },
    tags:['SUBSONIC','LAND-ATTACK','GPS-DENIED'],
    desc:'Terrain-following cruise missile, GPS-denied capable. Modular warhead bus.' },
  { id:'m-hyper',  cat:'missiles', code:'BBB-M/07', name:'HYPER-GLIDE',    price: 2100000,
    stats:{ YIELD:0.65, RANGE:0.94, PRECISION:0.85, MASS:0.72, DEPLOY:0.30 },
    tags:['HYPERSONIC','GLIDE-VEHICLE','UNINTERCEPTABLE'],
    desc:'Mach-12 glide vehicle launched from orbital platform. No known interception envelope.' },
  { id:'m-mirv',   cat:'missiles', code:'BBB-M/Δ',  name:'MIRV-DELTA',    price: 6800000,
    stats:{ YIELD:0.90, RANGE:0.96, PRECISION:0.70, MASS:0.95, DEPLOY:0.20 },
    tags:['ICBM','MIRV','STRATEGIC'],
    desc:'10-warhead MIRV bus. Each independently targetable, decoys included. Single-launch saturation.' },
];

export function regionFor(lat: number, lon: number): string {
  if (lat > 60)  return 'ARCTIC SHELF';
  if (lat < -60) return 'ANTARCTIC';
  if (lat > 25 && lon > -10 && lon < 60)   return 'EUR / MENA';
  if (lat > 0  && lon > 60  && lon < 150)  return 'ASIA';
  if (lat > 25 && lon > -130 && lon < -60) return 'NORAM';
  if (lat < 0  && lon > -90  && lon < -30) return 'SOUTH AMERICA';
  if (lat > -40 && lat < 30 && lon > -20 && lon < 55) return 'AFRICA';
  if (lat < -10 && lon > 100 && lon < 180) return 'OCEANIA';
  return 'INTL. WATERS';
}

export function categoryById(id: string): Category | undefined {
  return CATEGORIES.find(c => c.id === id);
}

export function weaponById(id: string): Weapon | undefined {
  return WEAPONS.find(w => w.id === id);
}

export function weaponsInCategory(catId: string): Weapon[] {
  return WEAPONS.filter(w => w.cat === catId);
}

export const DEFAULT_DEPLOY: Record<string, DeployMode> = {
  grenades: 'DELIVER',
  lasers: 'DROP',
  nukes: 'DROP',
  drones: 'DROP',
  missiles: 'DROP',
};

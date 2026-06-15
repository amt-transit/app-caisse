// Fond de messagerie « façon WhatsApp », thème transport/logistique, couleurs AMT.
// react-native-svg <Pattern> tileable + seed déterministe (pas de scintillement).
// Trait fin uniquement, #1A3553 à faible opacité sur fond #EEF3F8.
import React from 'react';
import Svg, { Defs, Pattern, G, Path, Circle, Ellipse, Rect } from 'react-native-svg';

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Icônes dessinées autour de l'origine (~ -10..10), en éléments react-native-svg.
const ICONS = [
  (k) => [<Path key={k} d="M0,-10 C1.2,-10 1.8,-8.5 1.8,-6 L1.8,-2 L9,2 L9,4 L1.8,2.6 L1.8,6 L4.2,8.2 L4.2,9.4 L0,8.1 L-4.2,9.4 L-4.2,8.2 L-1.8,6 L-1.8,2.6 L-9,4 L-9,2 L-1.8,-2 L-1.8,-6 C-1.8,-8.5 -1.2,-10 0,-10 Z" />], // avion
  (k) => [ // bateau cargo
    <Path key={k + 'a'} d="M-9,2 H9 L6.5,7.5 H-6.5 Z" />,
    <Rect key={k + 'b'} x="-5" y="-4" width="4" height="6" />,
    <Rect key={k + 'c'} x="0.6" y="-4" width="4" height="6" />,
    <Path key={k + 'd'} d="M-9,9.6 Q-6.5,11.1 -4,9.6 T1,9.6 T6,9.6 T9,9.6" />,
  ],
  (k) => [ // camion
    <Path key={k + 'a'} d="M-9,-4 H1.5 V5 H-9 Z" />,
    <Path key={k + 'b'} d="M1.5,-0.5 H6.6 L9.6,2.5 V5 H1.5" />,
    <Circle key={k + 'c'} cx="-5" cy="6.6" r="2" />,
    <Circle key={k + 'd'} cx="6" cy="6.6" r="2" />,
  ],
  (k) => [ // conteneur
    <Rect key={k + 'a'} x="-9.5" y="-5" width="19" height="10" />,
    <Path key={k + 'b'} d="M-5.5,-5 V5 M-1.5,-5 V5 M2.5,-5 V5 M6.5,-5 V5" />,
  ],
  (k) => [ // colis
    <Rect key={k + 'a'} x="-7" y="-6" width="14" height="13" />,
    <Path key={k + 'b'} d="M-7,-1.5 H7 M0,-6 V7 M-7,-6 L0,-9.5 L7,-6" />,
  ],
  (k) => [ // globe
    <Circle key={k + 'a'} r="8.5" />,
    <Ellipse key={k + 'b'} rx="3.6" ry="8.5" />,
    <Path key={k + 'c'} d="M-8.5,0 H8.5 M-7.5,-4.2 H7.5 M-7.5,4.2 H7.5" />,
  ],
  (k) => [ // pin localisation
    <Path key={k + 'a'} d="M0,-9 C-4.8,-9 -8.5,-5.3 -8.5,-0.5 C-8.5,6 0,10 0,10 C0,10 8.5,6 8.5,-0.5 C8.5,-5.3 4.8,-9 0,-9 Z" />,
    <Circle key={k + 'b'} cy="-0.5" r="3.1" />,
  ],
  (k) => [ // document douane
    <Path key={k + 'a'} d="M-6.5,-9 H3 L6.5,-5.5 V9 H-6.5 Z M3,-9 V-5.5 H6.5" />,
    <Path key={k + 'b'} d="M-3.5,-2 H3.5 M-3.5,1.5 H3.5 M-3.5,5 H1" />,
  ],
  (k) => [ // ancre
    <Circle key={k + 'a'} cy="-7" r="2.2" />,
    <Path key={k + 'b'} d="M0,-4.8 V7.6 M-4,-3.5 H4 M-8,2.5 Q-8,8 0,8 Q8,8 8,2.5 M-8,2.5 l-1.8,-1.3 M-8,2.5 l1.8,-1.3 M8,2.5 l-1.8,-1.3 M8,2.5 l1.8,-1.3" />,
  ],
  (k) => [ // horloge
    <Circle key={k + 'a'} r="8.5" />,
    <Path key={k + 'b'} d="M0,-8.5 V-6.6 M0,8.5 V6.6 M-8.5,0 H-6.6 M8.5,0 H6.6 M0,0.4 V-5 M0,0.4 L4,2.4" />,
  ],
];

const TILE = 174;
const STEP = 42;
const JIT = 11;

const TILE_ELS = (() => {
  const rnd = mulberry32(20260615);
  const base = [];
  let row = 0;
  for (let gy = -STEP / 2; gy < TILE + STEP; gy += STEP, row++) {
    const rowOff = (row % 2) * (STEP / 2);
    for (let gx = -STEP / 2; gx < TILE + STEP; gx += STEP) {
      base.push({
        x: gx + rowOff + (rnd() * 2 - 1) * JIT,
        y: gy + (rnd() * 2 - 1) * JIT,
        ic: Math.floor(rnd() * ICONS.length),
        rot: ((rnd() * 2 - 1) * 25).toFixed(1),
        sc: (0.75 + rnd() * 0.25).toFixed(3),
      });
    }
  }
  // Wrap toroïdal (copies de bord) -> tuile sans couture.
  const els = [];
  let n = 0;
  for (const it of base) {
    for (const dx of [-TILE, 0, TILE]) {
      for (const dy of [-TILE, 0, TILE]) {
        const nx = it.x + dx, ny = it.y + dy;
        if (nx < -26 || nx > TILE + 26 || ny < -26 || ny > TILE + 26) continue;
        els.push(
          <G key={'i' + (n++)} transform={`translate(${nx.toFixed(1)},${ny.toFixed(1)}) rotate(${it.rot}) scale(${it.sc})`}>
            {ICONS[it.ic]('k' + n)}
          </G>
        );
      }
    }
  }
  return els;
})();

export default function ChatBackground() {
  return (
    <Svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <Defs>
        <Pattern id="amtChatBg" width={TILE} height={TILE} patternUnits="userSpaceOnUse">
          <G stroke="#1A3553" strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.13}>
            {TILE_ELS}
          </G>
        </Pattern>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="#EEF3F8" />
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#amtChatBg)" />
    </Svg>
  );
}

/**
 * The mine: laws at the surface, results below, tunnels for "this result uses that one".
 *
 * A node is either a law (`law: true`, mined from the start: the course takes it as given) or a result
 * with a derivation in derivations.json under the same id. `from` lists what the derivation leans on;
 * a result can be mined once everything it comes from has been. Depth is not stored: a node sits one
 * level below the deepest thing it comes from (src/mine/layout.js).
 *
 * `vein` groups nodes into the part of the mine they belong to, which sets where they sit.
 * `result` is the TeX shown on the crystal's card: what the derivation ends with.
 * `short` is the crystal's label in the mine; the card uses the full title.
 */
export const VEINS = {
  circuits: { name: 'Circuits', color: 0x8fd16a },
  biot: { name: 'Biot–Savart', color: 0xa48cff },
  ampere: { name: 'Ampère', color: 0x5fd4c4 },
};

export const NODES = [
  // ---------------------------------------------------------------- the surface: laws
  {
    id: 'loop-rule',
    short: 'Loop rule',
    vein: 'circuits',
    law: true,
    title: 'Kirchhoff’s loop rule',
    result: String.raw`\sum_{\text{loop}} \Delta V = 0`,
    about: 'Walk any closed loop of a circuit and the potential changes add to zero. It is energy conservation for a charge that comes back to where it started.',
  },
  {
    id: 'elements',
    short: 'V = IR, q/C, dq/dt',
    vein: 'circuits',
    law: true,
    title: 'Resistors, capacitors and current',
    result: String.raw`V_R = IR,\quad V_C = \frac{q}{C},\quad I = \pm\frac{dq}{dt}`,
    about: 'The voltage across each part, and current as the rate charge arrives on a plate or leaves it.',
  },
  {
    id: 'biot-savart',
    short: 'Biot–Savart law',
    vein: 'biot',
    law: true,
    title: 'The Biot–Savart law',
    result: String.raw`d\vec B = \frac{\mu_0}{4\pi}\,\frac{I\,d\vec\ell\times\hat r}{r^2}`,
    about: 'Each short piece of current makes a little field. Add every piece with an integral to get the whole field.',
  },
  {
    id: 'ampere-law',
    short: 'Ampère’s law',
    vein: 'ampere',
    law: true,
    title: 'Ampère’s law',
    result: String.raw`\oint \vec B\cdot d\vec\ell = \mu_0 I_{\text{enc}}`,
    about: 'Around any closed loop, the field along the loop adds up to μ0 times the current passing through it.',
  },

  // ---------------------------------------------------------------- circuits
  { id: 'rc-charge', short: 'RC charging', vein: 'circuits', from: ['loop-rule', 'elements'], result: String.raw`q(t) = C\mathcal{E}\left(1 - e^{-t/RC}\right)` },
  { id: 'rc-discharge', short: 'RC discharging', vein: 'circuits', from: ['loop-rule', 'elements'], result: String.raw`q(t) = Q_0\,e^{-t/RC}` },

  // ---------------------------------------------------------------- Biot–Savart
  { id: 'biot-wire', short: 'Straight wire', vein: 'biot', from: ['biot-savart'], result: String.raw`B_\infty = \frac{\mu_0 I}{2\pi a}` },
  { id: 'biot-end', short: 'P beside an end', vein: 'biot', from: ['biot-savart'], result: String.raw`B = \frac{\mu_0 I}{4\pi a}\,\frac{L}{\sqrt{L^2 + a^2}}` },
  { id: 'biot-loop', short: 'Loop, on its axis', vein: 'biot', from: ['biot-savart'], result: String.raw`B_{\text{center}} = \frac{\mu_0 I}{2R}` },
  { id: 'biot-half', short: 'Half loop', vein: 'biot', from: ['biot-savart'], result: String.raw`B = \frac{\mu_0 I}{4R}` },
  { id: 'biot-quarter', short: 'Quarter loop', vein: 'biot', from: ['biot-savart'], result: String.raw`B = \frac{\mu_0 I}{8R}` },
  { id: 'biot-square', short: 'Square loop', vein: 'biot', from: ['biot-wire'], result: String.raw`B = \frac{2\sqrt2\,\mu_0 I}{\pi L}` },
  { id: 'biot-rect', short: 'Rectangle', vein: 'biot', from: ['biot-wire'], result: String.raw`B = \frac{2\mu_0 I\sqrt{W^2 + H^2}}{\pi W H}` },
  { id: 'biot-sector', short: 'Pie slice', vein: 'biot', from: ['biot-half'], result: String.raw`B = \frac{\mu_0 I\theta}{4\pi}\left(\frac1a - \frac1b\right)` },
  { id: 'biot-semis', short: 'Two semicircles', vein: 'biot', from: ['biot-half'], result: String.raw`B = \frac{\mu_0 I}{4}\left(\frac1a - \frac1b\right)` },
  { id: 'biot-hairpin', short: 'Hairpin', vein: 'biot', from: ['biot-end', 'biot-half'], result: String.raw`B = \frac{\mu_0 I}{4R}\left(1 + \frac{2}{\pi}\right)` },
  { id: 'biot-wireloop', short: 'Wire beside a loop', vein: 'biot', from: ['biot-wire', 'biot-loop'], result: String.raw`I_L = \frac{I R}{\pi d}` },

  // ---------------------------------------------------------------- Ampère
  { id: 'ampere-thick', short: 'Inside a thick wire', vein: 'ampere', from: ['ampere-law'], result: String.raw`B = \frac{\mu_0 I r}{2\pi a^2}\quad (r < a)` },
];

export const nodeById = (id) => NODES.find((n) => n.id === id);

# Number Theory Plane — Design Brief

Oct 10, 2026 · @Dalton Gadapee

## Why this plane

The Truth Mines becomes a series of planes, each shaped by how its formalism thinks; number theory is the first, built as a vertical slice. The rule for every plane: the visuals come from the mathematics. Nothing is decoration with a statement attached.

Number theory goes first because its objects can be made physical. Integers become stones, prime factors become blocks, and the thinning of the primes becomes distance you walk. A visitor should leave having felt three ideas: every number is built from primes in exactly one way, primes are what survives the sieve, and primes thin out at a predictable rate.

## The experience

A visit is a walk along a road of integers, from 1 outward, with three stops that each teach one idea.

1. **Arrive at 1.** A flat seed stone: the unit, built from no primes. The road runs ahead into the distance.
2. **Walk the road.** Each integer is a stone column. Primes are single unbroken monoliths; composites are stacks of prime blocks. Light threads link each block back to its prime's monolith upstream, so you see what each number is made of.
3. **The sieve plaza.** The numbers 2 to 100 stand in a 10 by 10 grid. Strike a prime and all its multiples crumble. What still stands is the primes.
4. **The overlook.** Past 100 the road compresses so you can see far: only primes remain, as points of light growing sparse. The prime-counting curve traces itself across the sky beside its approximation, and their ratio settles toward 1.

Later versions add side places (an Ulam spiral plaza, a modular-arithmetic clock room, an endless horizon of primes) and the set.mm landmarks as destinations along the road.

## The vertical slice: three moments

The slice builds only the road from 1 to 100, the sieve plaza and the overlook. Each moment has one idea it must land.

### 1. The road (1 to 100)

**Idea:** every integer is built from primes in exactly one way (the fundamental theorem of arithmetic).

- One stone column per integer, 2 m apart along a gently curving road.
- A composite is a stack of blocks, one block per prime factor counted with multiplicity, smallest prime at the bottom: 12 = 2 · 2 · 3 is three blocks. Stack height therefore equals the number of prime factors, so 64 = 2⁶ is the tallest stack before 100.
- A prime is a single tall polished monolith in its own material, visibly different from a block.
- Looking at a column shows its factorization as a small label ("12 = 2² · 3") and lights threads from each block to that prime's monolith.

### 2. The sieve plaza

**Idea:** the primes are what survives when every multiple is removed (the sieve of Eratosthenes).

- The numbers 2 to 100 stand as columns in a 10 by 10 grid, in reading order.
- Strike a standing number: it glows, and every multiple of it after itself crumbles in sequence.
- A crumbled number can't be struck; a reset button restores the grid.
- The key moment: after 2, 3, 5 and 7, striking anything else knocks nothing down. A one-line note explains why: every composite up to 100 has a factor no larger than 10, the square root of 100.
- The 25 survivors glow together at the end.

### 3. The overlook

**Idea:** primes thin out at a predictable rate (the prime number theorem).

- Beyond 100 the road is drawn on a logarithmic scale out to 10⁶. Only primes appear, as points of light.
- Across the sky, two curves: the count of primes up to x, and its approximation:

```latex
\pi(x) \quad \text{and} \quad \frac{x}{\ln x}
```

- A marker walks along x and shows both values and their ratio. At x = 10⁶ there are 78,498 primes against an estimate of about 72,382, a ratio of about 1.085, still slowly falling toward 1.

## Visual language

Every visual property encodes a mathematical one; anything that encodes nothing stays plain.

| Element | Encodes | Treatment |
| --- | --- | --- |
| Prime monolith | A prime: indivisible | Single tall polished stone, its own hue, faint inner glow |
| Block in a stack | One prime factor | Matte block in the same hue as its prime's monolith |
| Stack height | Number of prime factors with multiplicity | One block height per factor |
| Seed stone at 1 | The unit, no prime factors | Flat, neutral, unlit |
| Thread of light | "Is made of" | Line from a block to its prime's monolith, shown on focus |
| Point of light (overlook) | A prime beyond 100 | Brightness constant, so density alone shows the thinning |

Hues: each prime up to 100 gets a distinct hue, with the small primes (2, 3, 5, 7) the most saturated since they appear most often in stacks. The ground and sky stay dark and quiet so the stones carry the color. Gray box first: shapes, hues and the sieve animation matter in the slice; rock textures and polish come after the slice feels right.

## Mathematical correctness

A learning tool that shows a wrong factorization is worse than none, so every number on screen is computed and tested, never typed.

- Factorizations for 2 to 100 come from code and are tested against independent trial division.
- The sieve leaves exactly 25 numbers standing, and they are the primes up to 100, whatever order the visitor strikes in.
- π(x) is computed by a sieve and tested at known values: 25 at 100, 168 at 1,000, 1,229 at 10⁴, 9,592 at 10⁵ and 78,498 at 10⁶.
- The overlook's estimate uses the natural logarithm, and its displayed ratio is tested against the computed values.
- Every explanatory line in the plane (labels, the sieve note) is reviewed by Dalton before it ships, like the landmark display forms.

## Fit with the existing project

The plane is a new mode in the truth-mines web app, built under the same rules as the Inside view.

- **Engine independence (CLAUDE.md rule 9).** The pipeline computes the plane: column positions, factor stacks, hues, the sieve grid and the overlook's π(x) samples, exported as `plane-number-theory.json`. The app only renders and animates it, so Unreal can draw the same plane later.
- **Deterministic.** The same build always produces the same plane.
- **Web first, desktop first.** Gray-box in the browser with mouse and keyboard, then WebXR on the Quest. The engine decision for the final look waits until the slice feels right.
- **The existing mine stays.** The overview map and Inside view keep working; nothing in them changes for this slice. How planes and the set.mm landmarks connect is a later decision.
- **Same gates.** `npm run check` and `npm run e2e` must pass, with new tests for the plane.

## Scope

The slice is small on purpose: three moments, gray box, desktop first.

| In the slice | Later |
| --- | --- |
| Road of integers 1 to 100 with factor stacks and threads | Ulam spiral plaza |
| Sieve plaza with strike, crumble and reset | Modular-arithmetic clock room |
| Overlook with log-scaled road to 10⁶ and the π(x) curves | Endless horizon of primes |
| Desktop walking and focus | set.mm landmarks placed along the road |
| WebXR on the Quest: teleport and snap turn | Other planes (logic, sets, analysis) |
|  | Rock textures, audio, polish, Unreal |

## Acceptance

The slice is done when the tests pass and a walk-through lands all three ideas.

- [ ] All correctness tests above pass in `npm run check`.
- [ ] Desktop: walk from 1 to 100, focus any column and see its factorization and threads.
- [ ] Desktop: the sieve leaves exactly the 25 primes, from any strike order; reset works.
- [ ] Desktop: the overlook shows both curves and the ratio at the marker.
- [ ] Headset: 72 fps on the Quest 3 on the road and in the plaza.
- [ ] Screenshots of each moment in `e2e/output/` for review.
- [ ] Dalton's walk-through: someone who doesn't know the theorems explains back the three ideas afterward.

## Open questions

- [ ] Should prime monoliths be tall (stand out) or one block high (honest about stack height)? The slice starts tall; judge in the headset.
- [ ] How many distinct hues stay readable? 25 primes up to 100 may need small primes in strong hues and larger ones in muted tones.
- [ ] Is a 2 m spacing between columns right for walking, or should the road be shorter with teleport stops?
- [ ] How does a visitor arrive at this plane, and how do planes connect to each other and to the set.mm landmarks?
- [ ] Does the existing Inside view stay as its own mode, or become part of a plane?

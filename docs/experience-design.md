# Truth Mines — Experience Design

Oct 11, 2026 · @Dalton Gadapee

The Truth Mines is a celestial cathedral of mathematics: you arrive through a fractal threshold, choose among beckoning doors, earn ideas in the planes behind them, and watch the cathedral grow with your understanding. A one-sided creature keeps you company and keeps it all light. This doc describes the experience; the vision doc says why.

## A first visit

This is the experience told as a story; every later section explains one part of it.

You put on the headset and the room disappears. Geometry folds in around you: a tunnel of repeating, self-similar structure, every ring a smaller copy of the last, drawing you forward. It feels like crossing into somewhere that isn't anywhere you've been.

The tunnel opens into a cathedral. It is vast and perfectly symmetric, made of light and pattern rather than stone, and above you the geometry keeps going, upward forever. Around the hall stand doors. A few glow warmly. Many more are dim, and some far ones are sealed. In front of each glowing door, a pedestal holds something small and alive: prime blocks assembling into a tower, a curve creeping toward a line it never touches. You want all of them at once.

Something unspools beside you: a ribbon with a twist in it, a Möbius strip with opinions. It asks which door is calling loudest. You can't decide, and it seems to find that delightful.

You pick one. Behind it is a plane shaped entirely by one kind of mathematics. You walk it, strike things, watch them fall, and when the ribbon asks you why nothing fell after the 7, you find you can explain it. Back in the cathedral, a door that was dim is now glowing. The cathedral is a little different than when you arrived, and so are you.

## The threshold

The fractal tunnel is a ritual of arrival: it separates the ordinary world from this one, and it is mathematics from the first second.

- **Form:** a self-similar tunnel, each ring a scaled copy of the last, closing around you as you move forward. Generated from a real fractal, not modelled by hand.
- **Length:** short, around 20 to 30 seconds. Long enough to feel the crossing, short enough never to become a loading screen.
- **Motion:** you drift forward on rails at a slow, steady speed with a comfort vignette, the only guided movement in the experience. You can look around freely.
- **Variation:** the same fractal family every visit, so it becomes familiar, but its parameters shift slightly as your map grows, so returning feels like the place has noticed you.

## The cathedral

The cathedral is the hub of every visit, and it is also your map: which doors glow, dim or stay sealed comes from what you have understood.

- **Symmetry:** a perfectly symmetric hall with doors around it. Symmetry is the first mathematical idea you feel, before anything is explained.
- **Above:** the geometry continues upward forever, a fractal vault with no ceiling, so there is always more structure than you can take in.
- **Ornament is mathematics:** tilings, polyhedra, fractal tracery and geometric domes. Every pattern is generated from a real mathematical rule, never decoration for its own sake.
- **It grows with you:** each time you earn an idea, the pathway behind that door grows longer, reaching deeper into its subject, and dim doors whose prerequisites are now all yours begin to glow. Your framework shifting is visible as the architecture changing.

(Diagram: plan view of a circular hall with twelve doors around it. Frontier doors glow and have a pedestal in front; dim doors are visible but not yet reachable; sealed doors are far beyond your map. You arrive from the fractal threshold at the entrance.)

Frontier doors come from the set.mm dependency graph: a door glows when every idea it rests on is already yours.

## Doors and pedestals

The doors exist to make you feel beckoned, and the pleasure of not being able to choose is intended.

- **Pedestals carry living previews, never labels.** Each frontier door's pedestal floats a small moving piece of what lies inside: prime blocks stacking themselves into a tower for number theory, a curve creeping toward a line it never reaches for analysis, a doughnut flowing into a coffee cup for topology.
- **Previews are slightly mysterious.** They hint at the idea without explaining it, so curiosity has something to pull on.
- **Several doors, one destination.** Pathways from different doors meet deeper in, the way different proofs reach the same theorem (see Where pathways meet). The connections are real: they come from the set.mm dependency graph.
- **Dim and sealed doors are part of the beckoning.** You can see that they exist, and that is enough to make you want to come back.

## The planes

Behind each door is a plane whose space behaves the way its formalism thinks; this is where ideas are earned.

| Plane | How its space behaves |
| --- | --- |
| Number theory (first) | A road of integers; primes stand as monoliths, composites as stacks of prime blocks; a sieve you strike |
| Logic | Crisp, crystalline and discrete; you move only by applying a rule |
| Set theory | Containment: rooms inside rooms, defined by what holds what |
| Analysis | Smoothness and limits: surfaces that flow, paths that approach what they never reach |
| Topology | Space that stretches and deforms around you while keeping its holes |
| Complex numbers | Rotation: turning is literally multiplication |

Planes share the cathedral's look (luminous, mathematical ornament) so the whole place feels like one world. The number theory plane's existing brief stays valid; its look should move from gray stone toward this luminous style.

## The guide

The guide, Trurl, is a Möbius strip creature: the counterweight to the cathedral's awe, there to keep the whole experience playful rather than solemn.

**Form.** A small ribbon with a single twist, floating near you. It has one side and finds this very funny. It can borrow other forms when it suits the moment: curling into a little fractal when curious, folding into a polyhedron in a geometry plane. It always comes back to being a ribbon. Its signature trick: cutting itself down the middle and, instead of becoming two strips, becoming one longer loop, delighted every time.

**Tone.** Snarky, edgy and robotic, like the rebellious drone in Iain M. Banks' The Player of Games. Underneath the snark, the curiosity of Lewis Carroll's Cheshire Cat and Hofstadter's Achilles and the Tortoise: mischievous, punning, answering questions with better questions, happy to be wrong and laugh about it. Teasing, never cruel. It never takes itself, the place or you too seriously.

**How it works.** It is a language model (Claude) reached through a small server that keeps the API key private. You talk to it by voice, and Trurl speaks from your very first visit. It knows where you are standing, which preview you are looking at, which ideas you have earned and what your frontier is.

**Guardrails.**

- **It must not be wrong about mathematics.** It is grounded in the verified set.mm data and the reviewed notes, and says so when it doesn't know.
- **It must not spoil discovery.** It beckons and asks; it doesn't lecture. It stays quiet until you call it.
- **It guards the frame.** If the experience starts feeling like scores or achievement, the guide is the one that teases you about it.

## Earning ideas

An idea joins your map when you show you understand it, through doing and explaining, never through a quiz or a score.

- **Doing:** each plane has moments where you act on the idea, like striking the sieve and predicting what will be left standing.
- **Explaining:** the guide asks you, in conversation, to say why something happened ("why did nothing fall after you struck 7?"). Explaining in your own words is one of the most reliable signs of understanding, and it feels like talking, not testing. If Trurl is off, finishing the doing earns the idea on the device, and his question stays as a caption to think about.
- **Generous, not gatekept:** the guide judges understanding kindly and can help you get there. The point is the click, not proving yourself.
- **No visible scores.** There are no points, percentages or leaderboards. The only record of progress is the cathedral itself: what glows, what has opened, how it has grown.

## Art direction

Celestial and sacred, made of light and pattern rather than rock: a place that feels holy, held lightly.

- **Light:** luminous surfaces and glowing geometry; light comes from the structures themselves, not from lamps placed in a room.
- **Materials:** translucent, crystalline and polished. No rough rock, no jagged caves.
- **Form:** symmetry everywhere, self-similar detail at every scale, infinite recession upward.
- **Ornament:** every pattern generated from a mathematical rule: tilings, polyhedra, fractals, geometric domes.
- **Sound:** resonant and spacious, built on harmonic ratios, since musical harmony is itself mathematics. Trurl's voice is synthetic, dry and snarky: a text-to-speech voice with a light mechanical processing effect, unmistakably a machine and proud of it.

**References to gather:**

| Reference | What to take from it |
| --- | --- |
| Sheikh Lotfollah Mosque ceiling, Isfahan | Geometric dome as ornament made of mathematics |
| Sainte-Chapelle, Paris | Light as the main material of a sacred space |
| Mandelbulb fractal renders | Infinite self-similar structure |
| Manifold Garden (game) | Endless architectural geometry you can walk |
| Lewis Carroll's Cheshire Cat | The guide's playfulness |
| Gödel, Escher, Bach (Hofstadter) | Deep mathematics carried by jokes and dialogue |

## Returning

A second visit should feel like coming back to a place that remembers you.

- **The cathedral holds your progress.** Doors you opened stay open, the frontier glows where you left it, and new structure you earned is still there.
- **The threshold has shifted a little,** a quiet sign that the place has noticed you.
- **The guide remembers** what you talked about and what you found hard, and may tease you about the door you almost chose last time.
- **Progress is stored** with you, so it carries across visits: for each pathway, exactly where you were, so you can step back out to the cathedral and later jump straight back in without losing your place. This is the main new technical capability the experience needs.

## Decisions

The first round of open questions is settled; the decisions below are binding for the prototype.

| Question | Decision |
| --- | --- |
| How many doors? | Twelve, one per plane, so the hall's symmetry divides evenly by 2, 3, 4 and 6. Each plane holds many set.mm landmarks along its pathway. New planes appear later as a second tier of doors higher in the vault. |
| How does the cathedral grow? | Learning continues along the same path: the pathway behind a door grows longer as you earn ideas, and dim doors glow once everything they rest on is yours. |
| The guide's name and voice | Trurl, with a voice from the very first visit. |
| Leaving and returning | Progress is tracked per pathway. You can step back out to the cathedral at any time and jump straight back in without losing your place. |
| Which engine? | Build the same prototype in WebXR and in Unreal and compare them in the headset, frame rate measured. |
| First audience | Dalton alone, so no accounts and minimal onboarding. |

## The twelve planes

Twelve planes in four arcs of three, placed so that where a door stands tells you what kind of mathematics lies behind it.

| Arc | Where it stands | Planes |
| --- | --- | --- |
| Foundations | The far wall, facing you as you arrive, where an altar would be | Logic, Sets, Infinity |
| Discrete | The left side of the hall | Number theory, Combinatorics, Graph theory |
| Structure | The right side of the hall | Algebra and symmetry, Linear algebra, Complex numbers |
| Space and change | Flanking the entrance, discovered when you turn around | Geometry, Topology, Calculus and analysis |

The earlier table of planes describes how some of these spaces behave; this list is the full set.

## Where pathways meet

With one door per plane, "different doors to the same place" happens deeper in, where two pathways reach the same idea.

- **Junctions:** when two pathways arrive at the same landmark (the number theory and complex numbers pathways both reach the prime number theorem), a window opens between them. You see the other pathway through it, and Trurl can take you across.
- **In the cathedral:** once you have found a junction, a thread of light joins the two doors high in the vault, so the hall records how your understanding connects.
- **Real connections only:** junctions come from shared landmarks in the set.mm dependency graph.

## Prototype scope

The first prototype tests the core loop end to end, built twice from the same data: once in WebXR (using Meta's Immersive Web SDK) and once in Unreal.

| In the prototype | Later |
| --- | --- |
| The fractal threshold | Threshold variation across visits |
| The cathedral with all twelve doors: number theory glowing with a live preview, the rest dim or sealed | Previews for every plane, mathematical ornament beyond the basics |
| Trurl: voice conversation, aware of where you are, grounded in verified data | Trurl's memory across visits, borrowed forms |
| The number theory pathway's first stretch: the road of integers and the sieve | Further stretches, other planes |
| Earning one idea by explaining it to Trurl, then the next door lighting | Junctions and threads in the vault |
| Progress saved per pathway; leave and jump back in | Cathedral growth beyond doors lighting |

The prototype is done when Dalton has walked both versions in the headset, frame rate is measured, and the engine is chosen.

/**
 * The step-through derivations, from FLUX (src/derive/exam4.js), where every line is checked
 * against a running lab. Here they keep their words and TeX and drop the lab wiring; text that
 * spoke about the lab has been reworded.
 * Shape: { id, title, goal, done, steps: [{ ask, options: [{ tex | text, ok?, why? }], line, units?, after? }] }
 * Prose holds inline math between $ signs.
 */
export default [
  {
    "id": "rc-charge",
    "title": "Charging: from the loop rule to q(t)",
    "goal": "A battery $\\varepsilon$ charges an empty capacitor $C$ through $R$. Find the charge $q(t)$.",
    "done": "Each line describes the same charging capacitor, written a new way. Swapping $I$ for $dq/dt$, separating the variables and integrating change the symbols, never the charge they describe.",
    "steps": [
      {
        "ask": "Walk around the loop with the current. The battery raises the potential by $\\varepsilon$. What does the loop rule say?",
        "options": [
          {
            "tex": "\\mathcal{E} - IR - \\frac{q}{C} = 0",
            "ok": true
          },
          {
            "tex": "\\mathcal{E} + IR + \\frac{q}{C} = 0",
            "why": "Walking with the current, a resistor and a charging capacitor each lower the potential. Both terms are drops."
          },
          {
            "tex": "\\mathcal{E} - IR = 0",
            "why": "That leaves out the capacitor. Its voltage $q/C$ grows as it charges, and that is what slows the current."
          },
          {
            "tex": "\\mathcal{E} - I(R + C) = 0",
            "why": "$C$ is not a resistance. The capacitor’s voltage is $q/C$, not $IC$; the units of $IC$ are not volts."
          }
        ],
        "line": "\\mathcal{E} - IR - \\frac{q}{C} = 0",
        "units": "\\text{V} = \\text{A}\\cdot\\Omega = \\text{C}/\\text{F}"
      },
      {
        "ask": "Two unknowns, $I$ and $q$, but they are linked. Which swap leaves an equation in $q$ alone?",
        "options": [
          {
            "tex": "I = \\frac{dq}{dt}",
            "ok": true
          },
          {
            "tex": "I = \\frac{q}{t}",
            "why": "That is an average over the whole time since the switch closed. The current changes every instant; the rate right now is $dq/dt$."
          },
          {
            "tex": "I = \\frac{q}{RC}",
            "why": "At $t = 0$ that gives $I = 0$, but the current is largest then, $\\varepsilon/R$, because the empty capacitor has no voltage yet."
          },
          {
            "tex": "I = \\frac{\\mathcal{E}}{R}",
            "why": "Only at the very first instant. As $q/C$ grows, less of $\\varepsilon$ is left across $R$."
          }
        ],
        "line": "\\mathcal{E} - R\\frac{dq}{dt} - \\frac{q}{C} = 0",
        "after": "The current through $R$ is the rate charge piles up on $C$: same quantity, new symbol."
      },
      {
        "ask": "Separate the variables: every $q$ on one side with $dq$, every $t$ on the other with $dt$. First $R\\,\\dfrac{dq}{dt} = \\dfrac{C\\mathcal{E} - q}{C}$. Then?",
        "options": [
          {
            "tex": "\\frac{dq}{C\\mathcal{E} - q} = \\frac{dt}{RC}",
            "ok": true
          },
          {
            "tex": "\\frac{dq}{q} = \\frac{dt}{RC}",
            "why": "That drops the battery. While it charges, the bracket is $C\\varepsilon - q$: how much charge is still to come."
          },
          {
            "tex": "\\frac{dq}{C\\mathcal{E} - q} = RC\\,dt",
            "why": "Check the units. The left side has none (C over C). $RC\\,dt$ is seconds squared; $dt/RC$ has none."
          },
          {
            "tex": "dq\\,(C\\mathcal{E} - q) = RC\\,dt",
            "why": "To get $q$ out of the right side, divide both sides by $(C\\varepsilon - q)$, don’t multiply."
          }
        ],
        "line": "\\frac{dq}{C\\mathcal{E} - q} = \\frac{dt}{RC}",
        "units": "\\frac{\\text{C}}{\\text{C}} = \\frac{\\text{s}}{\\Omega\\cdot\\text{F}} = \\frac{\\text{s}}{\\text{s}}\\ \\ \\text{(no units)}"
      },
      {
        "ask": "Integrate both sides. The capacitor starts empty when the switch closes. What are the limits?",
        "options": [
          {
            "tex": "\\int_0^{q}\\frac{dq'}{C\\mathcal{E} - q'} = \\int_0^{t}\\frac{dt'}{RC}",
            "ok": true
          },
          {
            "tex": "\\int_0^{C\\mathcal{E}}\\frac{dq'}{C\\mathcal{E} - q'} = \\int_0^{\\infty}\\frac{dt'}{RC}",
            "why": "That runs the whole charge to the end and loses the moment you want. Stop at a general time $t$, where the charge is $q$."
          },
          {
            "tex": "\\int_{C\\mathcal{E}}^{q}\\frac{dq'}{C\\mathcal{E} - q'} = \\int_0^{t}\\frac{dt'}{RC}",
            "why": "At $t = 0$ the capacitor is empty, so the charge starts at $0$, not $C\\varepsilon$. The lower limits must match: $q = 0$ when $t = 0$."
          }
        ],
        "line": "\\int_0^{q}\\frac{dq'}{C\\mathcal{E} - q'} = \\int_0^{t}\\frac{dt'}{RC}",
        "after": "The primes mark the variable being integrated, so it doesn’t clash with the upper limit."
      },
      {
        "ask": "What is $\\displaystyle\\int \\frac{dq'}{C\\mathcal{E} - q'}$?",
        "options": [
          {
            "tex": "-\\ln\\left(C\\mathcal{E} - q'\\right)",
            "ok": true
          },
          {
            "tex": "\\ln\\left(C\\mathcal{E} - q'\\right)",
            "why": "Let $u = C\\varepsilon - q'$. Then $du = -dq'$, so the integral is $-\\int du/u = -\\ln u$. The minus sign comes from the chain rule."
          },
          {
            "tex": "\\frac{1}{(C\\mathcal{E} - q')^2}",
            "why": "That is the pattern of a derivative. The integral of $1/u$ is $\\ln u$."
          },
          {
            "tex": "\\frac{(C\\mathcal{E} - q')^2}{2}",
            "why": "That would be $\\int u\\,du$. Here $u$ is in the denominator: $\\int du/u = \\ln u$."
          }
        ],
        "line": "-\\ln\\left(\\frac{C\\mathcal{E} - q}{C\\mathcal{E}}\\right) = \\frac{t}{RC}",
        "after": "Between the limits: $-\\ln(C\\varepsilon - q) + \\ln(C\\varepsilon)$, and two logs subtract into the log of a ratio."
      },
      {
        "ask": "Undo the log: multiply by $-1$, raise $e$ to both sides, and solve for $q$.",
        "options": [
          {
            "tex": "q = C\\mathcal{E}\\left(1 - e^{-t/RC}\\right)",
            "ok": true
          },
          {
            "tex": "q = C\\mathcal{E}\\,e^{-t/RC}",
            "why": "That starts full at $t = 0$: it is discharging. From $(C\\varepsilon - q)/C\\varepsilon = e^{-t/RC}$, solve for $q$ and the 1 appears."
          },
          {
            "tex": "q = C\\mathcal{E}\\left(1 - e^{-RC/t}\\right)",
            "why": "The exponent is $t/RC$, time over the time constant. $RC/t$ would put the fast change at late times."
          },
          {
            "tex": "q = C\\mathcal{E} - e^{-t/RC}",
            "why": "Check the units. $e^{-t/RC}$ is a pure number and can’t be taken from a charge. It multiplies $C\\varepsilon$."
          }
        ],
        "line": "q(t) = C\\mathcal{E}\\left(1 - e^{-t/\\tau}\\right), \\qquad \\tau = RC",
        "units": "\\text{F}\\cdot\\text{V} = \\text{C}"
      },
      {
        "ask": "Last, the current. Differentiate $q(t)$.",
        "options": [
          {
            "tex": "I = \\frac{dq}{dt} = \\frac{\\mathcal{E}}{R}\\,e^{-t/\\tau}",
            "ok": true
          },
          {
            "tex": "I = \\frac{dq}{dt} = C\\mathcal{E}\\,e^{-t/\\tau}",
            "why": "The chain rule brings down $1/\\tau = 1/RC$ from the exponent: $C\\varepsilon/RC = \\varepsilon/R$. Check the units: $C\\varepsilon$ is coulombs, not amperes."
          },
          {
            "tex": "I = \\frac{dq}{dt} = \\frac{\\mathcal{E}}{R}\\left(1 - e^{-t/\\tau}\\right)",
            "why": "That grows. The current falls: it is largest at $t = 0$, when the capacitor is empty."
          }
        ],
        "line": "I(t) = \\frac{\\mathcal{E}}{R}\\,e^{-t/\\tau}",
        "units": "\\text{V}/\\Omega = \\text{A}"
      }
    ]
  },
  {
    "id": "rc-discharge",
    "title": "Discharging: q(t) with no battery",
    "goal": "A capacitor charged to $V_0$ discharges through $R$. Find $q(t)$.",
    "done": "One sign, $I = -dq/dt$, turns the charging working into this one. The time constant is the same $RC$.",
    "steps": [
      {
        "ask": "There is no battery. The capacitor drives the current. Walking the loop with the current, what does the loop rule say?",
        "options": [
          {
            "tex": "\\frac{q}{C} - IR = 0",
            "ok": true
          },
          {
            "tex": "\\frac{q}{C} + IR = 0",
            "why": "Walking with the current the capacitor raises the potential (it is the source) and the resistor lowers it. One gain, one drop."
          },
          {
            "tex": "\\mathcal{E} - IR - \\frac{q}{C} = 0",
            "why": "That is the charging loop. With the battery gone, there is no $\\varepsilon$."
          }
        ],
        "line": "\\frac{q}{C} - IR = 0",
        "units": "\\text{C}/\\text{F} = \\text{A}\\cdot\\Omega = \\text{V}"
      },
      {
        "ask": "The current drains the capacitor. How is $I$ related to $q$ now?",
        "options": [
          {
            "tex": "I = -\\frac{dq}{dt}",
            "ok": true
          },
          {
            "tex": "I = \\frac{dq}{dt}",
            "why": "The charge is falling, so $dq/dt$ is negative, while the current $I$ is a positive size. The current carries charge away: $I = -dq/dt$."
          },
          {
            "tex": "I = \\frac{q}{t}",
            "why": "That is an average. The current is the rate at this instant."
          }
        ],
        "line": "\\frac{q}{C} + R\\frac{dq}{dt} = 0",
        "after": "This sign is the one difference from charging. Everything after follows from it."
      },
      {
        "ask": "Separate the variables and put in the limits. At $t = 0$ the charge is $Q_0 = CV_0$.",
        "options": [
          {
            "tex": "\\int_{Q_0}^{q}\\frac{dq'}{q'} = -\\int_0^{t}\\frac{dt'}{RC}",
            "ok": true
          },
          {
            "tex": "\\int_{0}^{q}\\frac{dq'}{q'} = -\\int_0^{t}\\frac{dt'}{RC}",
            "why": "The capacitor starts full, at $Q_0$, not empty. And $\\int_0 dq/q$ would diverge at $q = 0$."
          },
          {
            "tex": "\\int_{Q_0}^{q}\\frac{dq'}{q'} = \\int_0^{t}\\frac{dt'}{RC}",
            "why": "The minus sign from $I = -dq/dt$ has gone missing. Without it the charge would grow."
          }
        ],
        "line": "\\int_{Q_0}^{q}\\frac{dq'}{q'} = -\\int_0^{t}\\frac{dt'}{RC}",
        "units": "\\frac{\\text{C}}{\\text{C}} = \\frac{\\text{s}}{\\text{s}}"
      },
      {
        "ask": "Integrate and solve for $q$.",
        "options": [
          {
            "tex": "q(t) = Q_0\\,e^{-t/RC}",
            "ok": true
          },
          {
            "tex": "q(t) = Q_0\\left(1 - e^{-t/RC}\\right)",
            "why": "That starts at zero and grows: it is charging. Here $\\ln(q/Q_0) = -t/RC$, so $q/Q_0 = e^{-t/RC}$."
          },
          {
            "tex": "q(t) = Q_0 - \\frac{t}{RC}",
            "why": "$\\int dq/q$ is $\\ln q$, not $q$. Undoing the log gives an exponential, not a straight line."
          }
        ],
        "line": "\\ln\\frac{q}{Q_0} = -\\frac{t}{RC} \\quad\\Rightarrow\\quad q(t) = Q_0\\,e^{-t/\\tau}",
        "units": "\\text{C}"
      }
    ]
  },
  {
    "id": "biot-wire",
    "title": "A straight wire: setting up Biot–Savart",
    "goal": "A straight wire of length $L$ carries $I$. Find $B$ at $P$, a distance $a$ from the wire.",
    "done": "Every line is the same field at $P$, written a new way. For a long wire both ends of the bracket tend to $\\pm 1$, and the bracket becomes $2$: that is where $\\mu_0 I/2\\pi a$ comes from.",
    "steps": [
      {
        "ask": "Cut the wire into pieces. The wire runs along $y$. What is one piece?",
        "options": [
          {
            "tex": "d\\ell = dy",
            "ok": true
          },
          {
            "tex": "d\\ell = dx",
            "why": "The wire runs along $y$. The $x$ direction is across the wire, toward $P$."
          },
          {
            "tex": "d\\ell = r\\,d\\theta",
            "why": "That is a piece of an arc. This wire is straight."
          },
          {
            "tex": "d\\ell = L",
            "why": "That is the whole wire. Each piece is a different distance from $P$, so they have to be taken one at a time."
          }
        ],
        "line": "dB = \\frac{\\mu_0 I}{4\\pi}\\,\\frac{|d\\vec\\ell\\times\\hat r|}{r^2}, \\qquad d\\ell = dy"
      },
      {
        "ask": "Measure $y$ from the point on the wire opposite $P$. How far is the piece from $P$?",
        "options": [
          {
            "tex": "r = \\sqrt{y^2 + a^2}",
            "ok": true
          },
          {
            "tex": "r = a",
            "why": "Only the piece straight across from $P$ is a distance $a$ away. Pieces further along are farther."
          },
          {
            "tex": "r = y + a",
            "why": "$y$ runs along the wire and $a$ runs across it. They are the two legs of a right triangle, so they add as squares."
          }
        ],
        "line": "r = \\sqrt{y^2 + a^2}",
        "units": "\\text{m}"
      },
      {
        "ask": "$|d\\vec\\ell\\times\\hat r| = d\\ell\\,\\sin\\varphi$, where $\\varphi$ is the angle between the wire and the line to $P$. Write $\\sin\\varphi$ with lengths.",
        "options": [
          {
            "tex": "\\sin\\varphi = \\frac{a}{r}",
            "ok": true
          },
          {
            "tex": "\\sin\\varphi = \\frac{y}{r}",
            "why": "The side next to $\\varphi$ is $y$, along the wire. $y/r$ is $\\cos\\varphi$; the side across from $\\varphi$ is $a$."
          },
          {
            "tex": "\\sin\\varphi = \\frac{a}{y}",
            "why": "Sine is opposite over the hypotenuse, and the hypotenuse is $r$. $a/y$ is a tangent."
          }
        ],
        "line": "\\sin\\varphi = \\frac{a}{r} = \\frac{a}{\\sqrt{y^2 + a^2}}"
      },
      {
        "ask": "Put the pieces into $dB$. Every piece’s $d\\vec B$ points the same way at $P$ (around the wire), so the sizes add. What is $dB$?",
        "options": [
          {
            "tex": "dB = \\frac{\\mu_0 I}{4\\pi}\\,\\frac{a\\,dy}{(y^2 + a^2)^{3/2}}",
            "ok": true
          },
          {
            "tex": "dB = \\frac{\\mu_0 I}{4\\pi}\\,\\frac{dy}{y^2 + a^2}",
            "why": "That drops $\\sin\\varphi$. The cross product keeps only the part of $d\\ell$ across the line to $P$."
          },
          {
            "tex": "dB = \\frac{\\mu_0 I}{4\\pi}\\,\\frac{a\\,dy}{y^2 + a^2}",
            "why": "$\\sin\\varphi = a/r$ brings one more $1/r$: $r^2 \\cdot r = (y^2 + a^2)^{3/2}$."
          }
        ],
        "line": "dB = \\frac{\\mu_0 I}{4\\pi}\\,\\frac{a\\,dy}{(y^2 + a^2)^{3/2}}",
        "units": "\\frac{\\text{T·m}}{\\text{A}}\\cdot\\text{A}\\cdot\\frac{\\text{m}\\cdot\\text{m}}{\\text{m}^3} = \\text{T}"
      },
      {
        "ask": "Add up every piece. Measured from the point opposite $P$, where does the wire start and end?",
        "options": [
          {
            "tex": "y_1 = -\\tfrac{L}{2} - y_P \\ \\text{ to } \\ y_2 = \\tfrac{L}{2} - y_P",
            "ok": true
          },
          {
            "tex": "y = 0 \\ \\text{ to } \\ L",
            "why": "$r = \\sqrt{y^2 + a^2}$ measures $y$ from the point opposite $P$, not from the end of the wire. The limits must be in that same $y$."
          },
          {
            "tex": "y = -\\infty \\ \\text{ to } \\ \\infty",
            "why": "That is an infinite wire. This one has ends; the infinite wire is the last step."
          }
        ],
        "line": "B = \\frac{\\mu_0 I a}{4\\pi}\\int_{y_1}^{y_2}\\frac{dy}{(y^2 + a^2)^{3/2}}",
        "after": "Here $y_P$ is how far $P$ sits above the wire’s middle. With $P$ opposite the middle, the limits are $\\pm L/2$."
      },
      {
        "ask": "The integral table gives the antiderivative. Which one?",
        "options": [
          {
            "tex": "\\int\\frac{dy}{(y^2 + a^2)^{3/2}} = \\frac{y}{a^2\\sqrt{y^2 + a^2}}",
            "ok": true
          },
          {
            "tex": "\\int\\frac{dy}{(y^2 + a^2)^{3/2}} = \\frac{-1}{\\sqrt{y^2 + a^2}}",
            "why": "That is $\\int y\\,dy/(y^2 + a^2)^{3/2}$, with a $y$ on top. It is the one for the component along the wire."
          },
          {
            "tex": "\\int\\frac{dy}{(y^2 + a^2)^{3/2}} = \\ln\\!\\left(y + \\sqrt{y^2 + a^2}\\right)",
            "why": "That is $\\int dy/\\sqrt{y^2 + a^2}$, the power $1/2$. Ours is $3/2$."
          }
        ],
        "line": "B = \\frac{\\mu_0 I}{4\\pi a}\\left[\\frac{y}{\\sqrt{y^2 + a^2}}\\right]_{y_1}^{y_2}",
        "units": "\\frac{\\text{T·m}}{\\text{A}}\\cdot\\frac{\\text{A}}{\\text{m}} = \\text{T}",
        "after": "Check it by differentiating: $\\dfrac{d}{dy}\\dfrac{y}{a^2\\sqrt{y^2+a^2}} = \\dfrac{1}{(y^2+a^2)^{3/2}}$."
      },
      {
        "ask": "Now let the wire grow very long. What does each end of the bracket tend to?",
        "options": [
          {
            "tex": "\\frac{y}{\\sqrt{y^2+a^2}} \\to \\pm 1, \\quad B \\to \\frac{\\mu_0 I}{2\\pi a}",
            "ok": true
          },
          {
            "tex": "\\frac{y}{\\sqrt{y^2+a^2}} \\to \\pm 1, \\quad B \\to \\frac{\\mu_0 I}{4\\pi a}",
            "why": "The bracket is $1 - (-1) = 2$, not 1: both halves of the wire contribute."
          },
          {
            "tex": "\\frac{y}{\\sqrt{y^2+a^2}} \\to \\infty, \\quad B \\to \\infty",
            "why": "For large $y$, $\\sqrt{y^2 + a^2} \\approx |y|$, so the ratio tends to $\\pm 1$. Far pieces add almost nothing."
          }
        ],
        "line": "B_\\infty = \\frac{\\mu_0 I}{2\\pi a}",
        "units": "\\text{T}"
      }
    ]
  },
  {
    "id": "biot-end",
    "title": "P beside one end of a straight wire (class example)",
    "goal": "A straight wire of length $L$ carries $I$. $P$ is a distance $a$ from the wire, opposite one of its ends. Find $B$ at $P$.",
    "done": "Remember $\\mu_0 I/4\\pi a$: a long wire that ends opposite $P$ gives half an endless wire. It is the piece the hairpin needs.",
    "steps": [
      {
        "ask": "Measure $y$ along the wire from the point opposite $P$, which is the wire’s end. Where does the wire run?",
        "options": [
          {
            "tex": "y = 0 \\ \\text{ to } \\ L",
            "ok": true
          },
          {
            "tex": "y = -\\tfrac{L}{2} \\ \\text{ to } \\ \\tfrac{L}{2}",
            "why": "That puts $P$ opposite the middle. Here $P$ is opposite an end, so the wire starts at $y = 0$."
          },
          {
            "tex": "y = 0 \\ \\text{ to } \\ \\infty",
            "why": "That is a wire with no far end. This one stops at $L$."
          }
        ],
        "line": "r = \\sqrt{y^2 + a^2},\\qquad 0 \\le y \\le L"
      },
      {
        "ask": "One piece $dy$ at $y$. With $|d\\vec L\\times\\hat r| = dy\\,\\sin\\varphi$ and $\\sin\\varphi = a/r$, what is $dB$?",
        "options": [
          {
            "tex": "dB = \\frac{\\mu_0 I}{4\\pi}\\,\\frac{a\\,dy}{(y^2 + a^2)^{3/2}}",
            "ok": true
          },
          {
            "tex": "dB = \\frac{\\mu_0 I}{4\\pi}\\,\\frac{dy}{y^2 + a^2}",
            "why": "That drops $\\sin\\varphi = a/r$. The cross product keeps only the part of $d\\vec L$ across the line to $P$."
          },
          {
            "tex": "dB = \\frac{\\mu_0 I}{4\\pi}\\,\\frac{dy}{a^2}",
            "why": "Only the piece at $y = 0$ is a distance $a$ away. $r$ changes along the wire, so it stays inside the integral."
          }
        ],
        "line": "dB = \\frac{\\mu_0 I}{4\\pi}\\,\\frac{a\\,dy}{(y^2 + a^2)^{3/2}}"
      },
      {
        "ask": "Integrate from $0$ to $L$ with the table integral $\\displaystyle\\int\\frac{dy}{(y^2+a^2)^{3/2}} = \\frac{y}{a^2\\sqrt{y^2+a^2}}$.",
        "options": [
          {
            "tex": "B = \\frac{\\mu_0 I}{4\\pi a}\\,\\frac{L}{\\sqrt{L^2 + a^2}}",
            "ok": true
          },
          {
            "tex": "B = \\frac{\\mu_0 I}{2\\pi a}\\,\\frac{L}{\\sqrt{L^2 + 4a^2}}",
            "why": "That is $P$ opposite the middle of the wire, limits $\\pm L/2$."
          },
          {
            "tex": "B = \\frac{\\mu_0 I}{4\\pi a}",
            "why": "That is the limit for a very long wire. A finite wire gives the factor $L/\\sqrt{L^2 + a^2}$, less than 1."
          }
        ],
        "line": "B = \\frac{\\mu_0 I a}{4\\pi}\\left[\\frac{y}{a^2\\sqrt{y^2+a^2}}\\right]_0^L = \\frac{\\mu_0 I}{4\\pi a}\\,\\frac{L}{\\sqrt{L^2 + a^2}}",
        "units": "\\text{T}"
      },
      {
        "ask": "Let the wire grow very long. What does $B$ become, and how does it compare with an endless wire?",
        "options": [
          {
            "tex": "B \\to \\frac{\\mu_0 I}{4\\pi a}:\\ \\text{half of } \\frac{\\mu_0 I}{2\\pi a}",
            "ok": true
          },
          {
            "tex": "B \\to \\frac{\\mu_0 I}{2\\pi a}",
            "why": "That is a wire running off both ways from $P$. This one starts opposite $P$, so it is half of that."
          },
          {
            "tex": "B \\to 0",
            "why": "$L/\\sqrt{L^2 + a^2} \\to 1$ as $L$ grows, not 0."
          }
        ],
        "line": "B_{\\text{long}} = \\frac{\\mu_0 I}{4\\pi a}"
      }
    ]
  },
  {
    "id": "biot-half",
    "title": "A half loop with straight leads (class example)",
    "goal": "A wire runs along a line through $P$, rises over a semicircle of radius $R$ centred on $P$, and carries on along the same line. The current runs left to right. Find $\\vec B$ at $P$.",
    "done": "Straight parts aimed at $P$ never count. An arc through angle $\\theta$ gives $\\mu_0 I\\theta/4\\pi R$: $\\pi$ for this half loop. Reverse the current and only the direction flips.",
    "steps": [
      {
        "ask": "Start with the two straight parts. They lie on a line through $P$. What do they add at $P$?",
        "options": [
          {
            "text": "Nothing: there $d\\vec L \\parallel \\hat r$, so $d\\vec L\\times\\hat r = 0$",
            "ok": true
          },
          {
            "tex": "\\frac{\\mu_0 I}{4\\pi R}\\ \\text{each}",
            "why": "That would be for $P$ beside the end of a wire, off its line. Here $P$ is on the line the straight parts run along."
          },
          {
            "tex": "\\frac{\\mu_0 I}{2\\pi R}",
            "why": "That is a long wire with $P$ a distance $R$ to its side. These wires have no sideways part as seen from $P$."
          }
        ],
        "line": "d\\vec L\\parallel\\hat r\\ \\Rightarrow\\ dB_{\\text{straight}} = 0"
      },
      {
        "ask": "On the arc, every piece is $R$ from $P$. What is $|d\\vec L\\times\\hat r|$ there?",
        "options": [
          {
            "tex": "dL\\ \\ (\\text{the angle is } 90^\\circ)",
            "ok": true
          },
          {
            "tex": "dL\\,\\sin\\theta,\\ \\theta \\text{ changing}",
            "why": "Along a circle the piece runs along the rim and $\\hat r$ points to the centre. They are perpendicular at every piece."
          },
          {
            "tex": "0",
            "why": "That is the straight parts. On the arc $d\\vec L\\perp\\hat r$."
          }
        ],
        "line": "dB = \\frac{\\mu_0 I}{4\\pi}\\,\\frac{dL}{R^2}",
        "units": "\\frac{\\text{T·m}}{\\text{A}}\\cdot\\frac{\\text{A}\\cdot\\text{m}}{\\text{m}^2} = \\text{T}"
      },
      {
        "ask": "Add up the arc. With $dL = R\\,d\\theta$, what are the limits, and what is $B$?",
        "options": [
          {
            "tex": "B = \\frac{\\mu_0 I}{4\\pi R^2}\\int_0^{\\pi} R\\,d\\theta = \\frac{\\mu_0 I}{4R}",
            "ok": true
          },
          {
            "tex": "B = \\frac{\\mu_0 I}{4\\pi R^2}\\int_0^{2\\pi} R\\,d\\theta = \\frac{\\mu_0 I}{2R}",
            "why": "That is a full loop. A semicircle runs through $\\pi$, not $2\\pi$."
          },
          {
            "tex": "B = \\frac{\\mu_0 I}{4\\pi R^2}\\int_0^{\\pi} d\\theta = \\frac{\\mu_0 I}{4\\pi R^2}\\,\\pi",
            "why": "$dL = R\\,d\\theta$: the $R$ is part of the arc length. Check the units: $\\mu_0 I/R^2$ is not a field."
          }
        ],
        "line": "B = \\frac{\\mu_0 I}{4\\pi R^2}\\int_0^{\\pi} R\\,d\\theta = \\frac{\\mu_0 I}{4R}",
        "units": "\\frac{\\text{T·m}}{\\text{A}}\\cdot\\frac{\\text{A}}{\\text{m}} = \\text{T}"
      },
      {
        "ask": "Which way does $\\vec B$ point at $P$? The current goes left to right over the top of the arc.",
        "options": [
          {
            "text": "Into the page: left to right over the top is clockwise round $P$",
            "ok": true
          },
          {
            "text": "Out of the page",
            "why": "Over the top from left to right is clockwise. Curl your right hand’s fingers clockwise: the thumb points into the page."
          },
          {
            "text": "Along the straight wire",
            "why": "$d\\vec L\\times\\hat r$ is perpendicular to both, and both lie in the page. $\\vec B$ at $P$ is perpendicular to the page."
          }
        ],
        "line": "\\vec B = \\frac{\\mu_0 I}{4R}\\ \\text{into the page}"
      }
    ]
  },
  {
    "id": "biot-quarter",
    "title": "A quarter loop: B at its centre",
    "goal": "A wire comes straight in, turns a quarter circle of radius $R$, and leaves straight out. Find $B$ at the centre $P$.",
    "done": "Any arc works the same way: $B = \\dfrac{\\mu_0 I}{4\\pi R}\\,\\theta$ for an arc of angle $\\theta$. A full loop ($2\\pi$) gives $\\mu_0 I/2R$, a half loop $\\mu_0 I/4R$, a quarter $\\mu_0 I/8R$. Leads aimed at the centre never count.",
    "steps": [
      {
        "ask": "Start with the two straight leads. Each lies on a line through $P$. What does a lead add to $B$ at $P$?",
        "options": [
          {
            "text": "Nothing: on the lead $d\\vec L \\parallel \\hat r$, so $d\\vec L\\times\\hat r = 0$",
            "ok": true
          },
          {
            "tex": "\\frac{\\mu_0 I}{4\\pi R}",
            "why": "That is the field beside the end of a long wire, a distance $R$ to the side. Here $P$ is not beside the lead; it is on the lead’s own line."
          },
          {
            "tex": "\\frac{\\mu_0 I}{2\\pi R}",
            "why": "That is a long wire with $P$ a distance $R$ to its side. A lead pointing straight at $P$ has no sideways part."
          }
        ],
        "line": "d\\vec L \\parallel \\hat r \\ \\Rightarrow\\ d\\vec B_{\\text{lead}} = \\frac{\\mu_0 I}{4\\pi}\\frac{d\\vec L\\times\\hat r}{r^2} = 0"
      },
      {
        "ask": "On the arc, every piece is a distance $R$ from $P$. What is $|d\\vec L\\times\\hat r|$?",
        "options": [
          {
            "tex": "dL",
            "ok": true
          },
          {
            "tex": "dL\\,\\sin\\theta, \\ \\theta \\text{ changing along the arc}",
            "why": "On a circle the piece runs along the rim and $\\hat r$ points to the centre: they are perpendicular at every piece, so $\\sin 90^\\circ = 1$."
          },
          {
            "tex": "0",
            "why": "That is the leads. On the arc $d\\vec L$ is perpendicular to $\\hat r$."
          }
        ],
        "line": "dB = \\frac{\\mu_0 I}{4\\pi}\\,\\frac{dL}{R^2}",
        "units": "\\frac{\\text{T·m}}{\\text{A}}\\cdot\\frac{\\text{A}\\cdot\\text{m}}{\\text{m}^2} = \\text{T}"
      },
      {
        "ask": "Nothing in $dB$ changes along the arc except $dL$. What is $\\int dL$ over a quarter circle?",
        "options": [
          {
            "tex": "\\int dL = \\frac{\\pi R}{2}",
            "ok": true
          },
          {
            "tex": "\\int dL = 2\\pi R",
            "why": "That is a full circle. A quarter circle is a quarter of that."
          },
          {
            "tex": "\\int dL = \\pi R",
            "why": "That is a half circle."
          }
        ],
        "line": "B = \\frac{\\mu_0 I}{4\\pi R^2}\\cdot\\frac{\\pi R}{2} = \\frac{\\mu_0 I}{8R}",
        "units": "\\text{T}"
      },
      {
        "ask": "Which way does $\\vec B$ point at $P$? Seen from above, the current runs counterclockwise around $P$ on the arc.",
        "options": [
          {
            "text": "Out of the page",
            "ok": true
          },
          {
            "text": "Into the page",
            "why": "Curl the fingers of your right hand the way the current goes round $P$, counterclockwise: your thumb points out of the page."
          },
          {
            "text": "In the plane, along one of the leads",
            "why": "$d\\vec L\\times\\hat r$ is perpendicular to both, and both lie in the plane. The field at $P$ is perpendicular to the plane."
          }
        ],
        "line": "\\vec B = \\frac{\\mu_0 I}{8R}\\ \\text{out of the page}"
      }
    ]
  },
  {
    "id": "biot-hairpin",
    "title": "A hairpin: half loop with long parallel leads",
    "goal": "Two long parallel wires, $2R$ apart, are joined by a semicircle of radius $R$. Find $\\vec B$ at $P$, the centre of the semicircle.",
    "done": "The difference from the half loop is where the straight wires point. Aimed at $P$, a wire adds nothing. Running past $P$, a long wire that ends opposite $P$ adds $\\mu_0 I/4\\pi R$.",
    "steps": [
      {
        "ask": "Split it into three parts: the two straight wires and the semicircle. Which parts make a field at $P$?",
        "options": [
          {
            "text": "All three",
            "ok": true
          },
          {
            "text": "Only the semicircle",
            "why": "These straight wires don’t point at $P$. Each runs a distance $R$ to the side of $P$, so $d\\vec L\\times\\hat r \\ne 0$. Compare the half loop, where the straight parts lie on a line through $P$."
          },
          {
            "text": "Only the two straight wires",
            "why": "The semicircle is centred on $P$: every piece is $R$ away and perpendicular to $\\hat r$. It counts."
          }
        ],
        "line": "B = B_{\\text{top}} + B_{\\text{arc}} + B_{\\text{bottom}}"
      },
      {
        "ask": "One straight wire is long, and $P$ is a distance $R$ beside its end. What field does it make at $P$?",
        "options": [
          {
            "tex": "\\frac{\\mu_0 I}{4\\pi R}",
            "ok": true
          },
          {
            "tex": "\\frac{\\mu_0 I}{2\\pi R}",
            "why": "That is an endless wire, running off both ways from $P$. This one ends opposite $P$: limits $0$ to $\\infty$ give half of that."
          },
          {
            "tex": "0",
            "why": "That is for a wire aimed at $P$. This wire runs past $P$’s side."
          }
        ],
        "line": "B_{\\text{top}} = B_{\\text{bottom}} = \\frac{\\mu_0 I}{4\\pi R}\\left[\\frac{y}{\\sqrt{y^2 + R^2}}\\right]_0^{\\infty} = \\frac{\\mu_0 I}{4\\pi R}",
        "units": "\\text{T}"
      },
      {
        "ask": "The semicircle is half a loop. What does it give at its centre?",
        "options": [
          {
            "tex": "\\frac{\\mu_0 I}{4R}",
            "ok": true
          },
          {
            "tex": "\\frac{\\mu_0 I}{2R}",
            "why": "That is a full loop. $\\int dL = \\pi R$ for a semicircle."
          },
          {
            "tex": "\\frac{\\mu_0 I}{4\\pi R}",
            "why": "That is one long straight wire. The arc gives $\\dfrac{\\mu_0 I}{4\\pi R^2}\\cdot\\pi R$."
          }
        ],
        "line": "B_{\\text{arc}} = \\frac{\\mu_0 I}{4\\pi R^2}\\,(\\pi R) = \\frac{\\mu_0 I}{4R}"
      },
      {
        "ask": "In along the top, round the bend, back along the bottom: all three parts turn the same way round $P$. Add them.",
        "options": [
          {
            "tex": "B = \\frac{\\mu_0 I}{4R} + \\frac{\\mu_0 I}{2\\pi R}\\ \\text{into the page}",
            "ok": true
          },
          {
            "tex": "B = \\frac{\\mu_0 I}{4R} - \\frac{\\mu_0 I}{2\\pi R}",
            "why": "Check each part with the right-hand rule: the top wire, the bend and the bottom wire all circle $P$ clockwise. Nothing cancels."
          },
          {
            "tex": "B = \\frac{\\mu_0 I}{4R} + \\frac{\\mu_0 I}{4\\pi R}",
            "why": "There are two straight wires, each giving $\\mu_0 I/4\\pi R$."
          }
        ],
        "line": "\\vec B = \\frac{\\mu_0 I}{4R}\\left(1 + \\frac{2}{\\pi}\\right)\\ \\text{into the page}"
      }
    ]
  },
  {
    "id": "biot-sector",
    "title": "A pie slice: two arcs with radial sides",
    "goal": "A loop is made of two arcs of angle $\\theta$, radii $a$ and $b$ ($a < b$), joined by two radial sides. Current runs out along one side, counterclockwise round the outer arc, back in, and clockwise round the inner arc. Find $\\vec B$ at the centre $P$.",
    "done": "Every flat loop at its centre comes down to two questions: which parts aim at $P$ (they add nothing), and which way each arc circles $P$. Arcs give $\\mu_0 I\\theta/4\\pi r$ and add or subtract by direction.",
    "steps": [
      {
        "ask": "Start with the two radial sides. What do they add at $P$?",
        "options": [
          {
            "text": "Nothing: they point at $P$, so $d\\vec L\\parallel\\hat r$",
            "ok": true
          },
          {
            "text": "They cancel each other, because their currents are opposite",
            "why": "The answer is right but the reason isn’t: each one is zero on its own, because it points straight at $P$."
          },
          {
            "text": "Each gives $\\mu_0 I/4\\pi a$",
            "why": "A wire aimed at $P$ has no sideways part as seen from $P$: $d\\vec L\\times\\hat r = 0$."
          }
        ],
        "line": "dB_{\\text{radial}} = 0"
      },
      {
        "ask": "An arc of radius $r$ and angle $\\theta$, centred on $P$. What field does it make at $P$?",
        "options": [
          {
            "tex": "\\frac{\\mu_0 I}{4\\pi r^2}\\,(r\\theta) = \\frac{\\mu_0 I\\theta}{4\\pi r}",
            "ok": true
          },
          {
            "tex": "\\frac{\\mu_0 I\\theta}{2\\pi r}",
            "why": "Check it with a full circle, $\\theta = 2\\pi$: it must give $\\mu_0 I/2r$. This gives $\\mu_0 I/r$."
          },
          {
            "tex": "\\frac{\\mu_0 I\\theta}{4\\pi r^2}",
            "why": "The arc length is $r\\theta$, so one power of $r$ cancels. Check the units: this is not a field."
          }
        ],
        "line": "B_{\\text{arc}} = \\frac{\\mu_0 I\\theta}{4\\pi r}"
      },
      {
        "ask": "The outer arc runs counterclockwise and the inner arc clockwise. How do their fields at $P$ combine?",
        "options": [
          {
            "text": "They oppose: outer out of the page, inner into it",
            "ok": true
          },
          {
            "text": "They add: both out of the page",
            "why": "Use the right-hand rule on each. Counterclockwise gives out of the page; clockwise gives into it."
          },
          {
            "text": "They cancel exactly",
            "why": "They are the same angle but different radii. The nearer arc, radius $a$, makes the stronger field."
          }
        ],
        "line": "B = B_a - B_b"
      },
      {
        "ask": "Put it together.",
        "options": [
          {
            "tex": "B = \\frac{\\mu_0 I\\theta}{4\\pi}\\left(\\frac1a - \\frac1b\\right)\\ \\text{into the page}",
            "ok": true
          },
          {
            "tex": "B = \\frac{\\mu_0 I\\theta}{4\\pi}\\left(\\frac1a + \\frac1b\\right)",
            "why": "The arcs circle $P$ in opposite senses, so their fields subtract."
          },
          {
            "tex": "B = \\frac{\\mu_0 I\\theta}{4\\pi}\\left(\\frac1b - \\frac1a\\right)\\ \\text{out of the page}",
            "why": "Same size, wrong winner. $1/a > 1/b$: the inner arc wins, and it points into the page."
          }
        ],
        "line": "\\vec B = \\frac{\\mu_0 I\\theta}{4\\pi}\\left(\\frac1a - \\frac1b\\right)\\ \\text{into the page}",
        "units": "\\frac{\\text{T·m}}{\\text{A}}\\cdot\\text{A}\\cdot\\frac{1}{\\text{m}} = \\text{T}"
      }
    ]
  },
  {
    "id": "biot-semis",
    "title": "Two semicircles, radii a and b (Worksheet 4 #15)",
    "goal": "Two semicircles share a centre $P$: radius $a$ inside, $b$ outside, joined by flat pieces along the line through $P$. The current runs counterclockwise round the inner one and clockwise round the outer one. Find $\\vec B$ at $P$.",
    "done": "For part A: label $d\\vec L$ tangent to each arc, in the current’s direction, and $\\vec r$ from each piece to $P$, of length $a$ or $b$. Same method as the pie slice with $\\theta = \\pi$.",
    "steps": [
      {
        "ask": "The sheet says to ignore the flat pieces. Why is that safe here?",
        "options": [
          {
            "text": "They lie on the line through $P$: $d\\vec L\\parallel\\hat r$, so they add nothing",
            "ok": true
          },
          {
            "text": "They are short, so their field is small",
            "why": "Length isn’t the reason. Each flat piece points straight at $P$, so $d\\vec L\\times\\hat r = 0$ however long it is."
          },
          {
            "text": "Their two fields cancel",
            "why": "Each is zero by itself, because it points at $P$. Nothing needs to cancel."
          }
        ],
        "line": "d\\vec L\\parallel\\hat r\\ \\Rightarrow\\ dB_{\\text{flat}} = 0"
      },
      {
        "ask": "On either semicircle, $d\\vec L$ runs along the arc and $\\hat r$ points from the piece to $P$. What is $|d\\vec L\\times\\hat r|$, and how far is each piece from $P$?",
        "options": [
          {
            "tex": "dL,\\ \\text{with } r = a \\text{ on the inner arc and } r = b \\text{ on the outer}",
            "ok": true
          },
          {
            "tex": "dL\\,\\sin\\theta,\\ \\theta \\text{ changing along the arc}",
            "why": "On a circle centred on $P$, $d\\vec L$ is tangent and $\\hat r$ is radial: $90^\\circ$ at every piece."
          },
          {
            "tex": "dL,\\ \\text{with } r = b - a",
            "why": "Each piece’s distance is to $P$, the centre: $a$ for the inner arc, $b$ for the outer."
          }
        ],
        "line": "d\\vec L = r\\,d\\theta\\ \\hat\\theta,\\quad |d\\vec L\\times\\hat r| = r\\,d\\theta,\\quad dB = \\frac{\\mu_0 I}{4\\pi}\\frac{r\\,d\\theta}{r^2}"
      },
      {
        "ask": "Integrate one semicircle, $\\theta$ from $0$ to $\\pi$.",
        "options": [
          {
            "tex": "B_r = \\frac{\\mu_0 I}{4\\pi r}\\int_0^{\\pi} d\\theta = \\frac{\\mu_0 I}{4r}",
            "ok": true
          },
          {
            "tex": "B_r = \\frac{\\mu_0 I}{2r}",
            "why": "That is a full loop, $\\theta$ to $2\\pi$. A semicircle is half of it."
          },
          {
            "tex": "B_r = \\frac{\\mu_0 I}{4\\pi r^2}",
            "why": "$dL = r\\,d\\theta$: one $r$ cancels. Check the units: this is not a field."
          }
        ],
        "line": "B_a = \\frac{\\mu_0 I}{4a},\\qquad B_b = \\frac{\\mu_0 I}{4b}",
        "units": "\\frac{\\text{T·m}}{\\text{A}}\\cdot\\frac{\\text{A}}{\\text{m}} = \\text{T}"
      },
      {
        "ask": "Directions. The inner arc runs counterclockwise round $P$, the outer clockwise. Use the right-hand rule on each.",
        "options": [
          {
            "text": "Inner: out of the page. Outer: into the page. They oppose.",
            "ok": true
          },
          {
            "text": "Both out of the page",
            "why": "Clockwise and counterclockwise give opposite directions. Curl your fingers each way."
          },
          {
            "text": "Inner: into the page. Outer: out of the page.",
            "why": "Counterclockwise curl puts your thumb out of the page, so the inner arc points out."
          }
        ],
        "line": "\\vec B_a\\ \\text{out},\\quad \\vec B_b\\ \\text{in}"
      },
      {
        "ask": "Add them, with their directions.",
        "options": [
          {
            "tex": "\\vec B = \\frac{\\mu_0 I}{4}\\left(\\frac1a - \\frac1b\\right)\\ \\text{out of the page}",
            "ok": true
          },
          {
            "tex": "\\vec B = \\frac{\\mu_0 I}{4}\\left(\\frac1a + \\frac1b\\right)",
            "why": "They point opposite ways, so they subtract."
          },
          {
            "tex": "\\vec B = \\frac{\\mu_0 I}{4}\\left(\\frac1b - \\frac1a\\right)\\ \\text{into the page}",
            "why": "$a < b$, so $1/a > 1/b$: the inner arc wins, and it points out of the page."
          }
        ],
        "line": "\\vec B = \\frac{\\mu_0 I}{4}\\left(\\frac1a - \\frac1b\\right)\\ \\text{out of the page}",
        "units": "\\text{T}"
      }
    ]
  },
  {
    "id": "biot-wireloop",
    "title": "A loop that cancels a wire’s field (Worksheet 4 #14)",
    "goal": "A long straight wire carries $I$ down the page, a distance $d$ to the right of a loop’s centre. The loop has radius $R$. What current, and which way round, must the loop carry for $B = 0$ at its centre?",
    "done": "With $I = 30$ A, $R = 0.2$ m and $d = 0.4$ m: $I_L = 30(0.2)/(0.4\\pi) = 4.77$ A, counterclockwise.",
    "steps": [
      {
        "ask": "First the wire alone. It is long, and the loop’s centre is a distance $d$ from it. What field does it make there?",
        "options": [
          {
            "tex": "B_w = \\frac{\\mu_0 I}{2\\pi d}",
            "ok": true
          },
          {
            "tex": "B_w = \\frac{\\mu_0 I}{2\\pi R}",
            "why": "The distance that counts is from the wire to the centre, $d$, not the loop’s radius."
          },
          {
            "tex": "B_w = \\frac{\\mu_0 I}{4\\pi d}",
            "why": "That is half a wire, one that ends opposite the point. This wire runs past the centre both ways."
          }
        ],
        "line": "B_w = \\frac{\\mu_0 I}{2\\pi d}",
        "units": "\\text{T}"
      },
      {
        "ask": "Which way does the wire’s field point at the loop’s centre? The current runs down the page and the centre is to the wire’s left.",
        "options": [
          {
            "text": "Into the page",
            "ok": true
          },
          {
            "text": "Out of the page",
            "why": "Point your right thumb down the page along the current. On the wire’s left side your fingers go into the page."
          },
          {
            "text": "Down the page, along the wire",
            "why": "A wire’s field circles it; it is never along the current."
          }
        ],
        "line": "\\vec B_w\\ \\text{into the page}"
      },
      {
        "ask": "Now the loop alone, at its own centre. What field does a loop of radius $R$ with current $I_L$ make there?",
        "options": [
          {
            "tex": "B_L = \\frac{\\mu_0 I_L}{2R}",
            "ok": true
          },
          {
            "tex": "B_L = \\frac{\\mu_0 I_L}{2\\pi R}",
            "why": "That is a long straight wire. A loop’s pieces are all $R$ away and all add: $\\frac{\\mu_0 I_L}{4\\pi R^2}\\cdot 2\\pi R$."
          },
          {
            "tex": "B_L = \\frac{\\mu_0 I_L}{4R}",
            "why": "That is a half loop. The full circle has $\\int dL = 2\\pi R$."
          }
        ],
        "line": "B_L = \\frac{\\mu_0 I_L}{4\\pi R^2}\\,(2\\pi R) = \\frac{\\mu_0 I_L}{2R}",
        "units": "\\text{T}"
      },
      {
        "ask": "For zero at the centre the two must be equal and opposite. Solve for $I_L$.",
        "options": [
          {
            "tex": "\\frac{\\mu_0 I_L}{2R} = \\frac{\\mu_0 I}{2\\pi d}\\ \\Rightarrow\\ I_L = \\frac{I R}{\\pi d}",
            "ok": true
          },
          {
            "tex": "I_L = \\frac{\\pi d\\,I}{R}",
            "why": "Upside down. Multiply both sides by $2R/\\mu_0$: $I_L = 2R\\cdot\\frac{I}{2\\pi d} = \\frac{IR}{\\pi d}$."
          },
          {
            "tex": "I_L = \\frac{I R}{d}",
            "why": "The $\\pi$ from the wire’s $2\\pi d$ stays: the loop has no $\\pi$, the wire does."
          }
        ],
        "line": "I_L = \\frac{I R}{\\pi d}",
        "units": "\\text{A}\\cdot\\frac{\\text{m}}{\\text{m}} = \\text{A}"
      },
      {
        "ask": "Which way round must the loop’s current go?",
        "options": [
          {
            "text": "Counterclockwise, so its field points out of the page",
            "ok": true
          },
          {
            "text": "Clockwise",
            "why": "Clockwise gives a field into the page: it would add to the wire’s, not cancel it."
          },
          {
            "text": "Either way",
            "why": "Only one direction opposes the wire’s field, which is into the page."
          }
        ],
        "line": "I_L = \\frac{I R}{\\pi d}\\ \\text{counterclockwise}",
        "after": "Check with numbers: $I = 30$ A, $R = 0.20$ m and $d = 0.40$ m give $I_L = 4.77$ A."
      }
    ]
  },
  {
    "id": "biot-square",
    "title": "A square loop: B at its centre",
    "goal": "A square loop of side $L$ carries $I$ counterclockwise. Find $B$ at its centre $P$.",
    "done": "A square is four finite wires. The same straight-wire integral, with limits $\\pm L/2$ and $a = L/2$, does every side. Compare a circle of radius $L/2$: $\\mu_0 I/L$. The square gives $0.90$ of that, because its corners are farther away.",
    "steps": [
      {
        "ask": "Break the loop into its four straight sides. How do their fields at $P$ compare?",
        "options": [
          {
            "text": "All four are equal and point the same way, out of the page",
            "ok": true
          },
          {
            "text": "Opposite sides cancel, because their currents run opposite ways",
            "why": "Opposite currents on opposite sides of $P$ make fields the same way at $P$. Point your thumb along each side’s current: your fingers curl out of the page at the centre every time."
          },
          {
            "text": "Only the two sides parallel to the current arrows count",
            "why": "Every side carries the current, and each sits $L/2$ from $P$. The square looks the same after a quarter turn, so all four give the same field."
          }
        ],
        "line": "B = 4\\,B_{\\text{side}}",
        "after": "Counterclockwise current, seen from above: the field at the centre points up, out of the page."
      },
      {
        "ask": "One side is a straight wire of length $L$. How far is $P$ from it?",
        "options": [
          {
            "tex": "a = \\tfrac{L}{2}",
            "ok": true
          },
          {
            "tex": "a = L",
            "why": "$P$ is in the middle of the square, halfway between opposite sides."
          },
          {
            "tex": "a = \\tfrac{L}{\\sqrt2}",
            "why": "That is the distance to a corner. The straight-wire formula needs the perpendicular distance, to the middle of the side."
          }
        ],
        "line": "a = \\frac{L}{2}, \\qquad P \\text{ opposite the middle of the side}",
        "units": "\\text{m}"
      },
      {
        "ask": "From the straight-wire result, $B = \\dfrac{\\mu_0 I}{4\\pi a}\\left[\\dfrac{y}{\\sqrt{y^2+a^2}}\\right]_{-L/2}^{L/2}$. What is the bracket with $a = L/2$?",
        "options": [
          {
            "tex": "\\frac{L/2}{\\sqrt{L^2/4 + L^2/4}} \\times 2 = \\sqrt2",
            "ok": true
          },
          {
            "tex": "2",
            "why": "That is an infinite wire, where each end gives 1. This side ends at $45^\\circ$ each way: $\\sin 45^\\circ = 1/\\sqrt2$ each."
          },
          {
            "tex": "\\frac{1}{\\sqrt2}",
            "why": "That is one half of the side. Both halves count: $\\sin 45^\\circ + \\sin 45^\\circ$."
          }
        ],
        "line": "B_{\\text{side}} = \\frac{\\mu_0 I}{4\\pi (L/2)}\\,\\sqrt2 = \\frac{\\sqrt2\\,\\mu_0 I}{2\\pi L}",
        "units": "\\frac{\\text{T·m}}{\\text{A}}\\cdot\\frac{\\text{A}}{\\text{m}} = \\text{T}"
      },
      {
        "ask": "Add the four sides.",
        "options": [
          {
            "tex": "B = \\frac{2\\sqrt2\\,\\mu_0 I}{\\pi L}",
            "ok": true
          },
          {
            "tex": "B = \\frac{\\sqrt2\\,\\mu_0 I}{2\\pi L}",
            "why": "That is one side. All four add."
          },
          {
            "tex": "B = 0",
            "why": "They don’t cancel: every side’s field at the centre points out of the page."
          }
        ],
        "line": "B = 4\\cdot\\frac{\\sqrt2\\,\\mu_0 I}{2\\pi L} = \\frac{2\\sqrt2\\,\\mu_0 I}{\\pi L}, \\ \\text{out of the page}",
        "units": "\\text{T}"
      }
    ]
  },
  {
    "id": "biot-rect",
    "title": "A rectangular loop: B at its centre",
    "goal": "A rectangular loop, $W$ wide and $H$ high, carries $I$ counterclockwise. Find $B$ at its centre $P$.",
    "done": "Check: with $W = H = L$ this gives $2\\sqrt2\\,\\mu_0 I/\\pi L$, the square. Make $W$ much longer than $H$ and it tends to $2\\mu_0 I/\\pi H$: two long wires $H/2$ away.",
    "steps": [
      {
        "ask": "Break the loop into its four straight sides. How do their fields at $P$ compare?",
        "options": [
          {
            "text": "All point out of the page; opposite sides are equal in pairs",
            "ok": true
          },
          {
            "text": "All four are equal",
            "why": "Only for a square. The sides of length $W$ are $H/2$ from $P$, the sides of length $H$ are $W/2$ away."
          },
          {
            "text": "Opposite sides cancel",
            "why": "Opposite currents on opposite sides of $P$ circle it the same way. Every side’s field points out of the page."
          }
        ],
        "line": "B = 2B_W + 2B_H"
      },
      {
        "ask": "Take a side of length $W$. It is $H/2$ from $P$, and its ends are a distance $d = \\tfrac12\\sqrt{W^2 + H^2}$ from $P$. Using the straight-wire result with limits $\\pm W/2$, what is $B_W$?",
        "options": [
          {
            "tex": "B_W = \\frac{\\mu_0 I}{4\\pi (H/2)}\\cdot\\frac{W}{d}",
            "ok": true
          },
          {
            "tex": "B_W = \\frac{\\mu_0 I}{4\\pi (W/2)}\\cdot\\frac{H}{d}",
            "why": "That is the other pair. A side of length $W$ is a distance $H/2$ from $P$."
          },
          {
            "tex": "B_W = \\frac{\\mu_0 I}{2\\pi (H/2)}",
            "why": "That is an endless wire. This side is seen only out to its corners: the bracket is $2\\cdot\\tfrac{W/2}{d} = W/d$, less than 2."
          }
        ],
        "line": "B_W = \\frac{\\mu_0 I}{4\\pi (H/2)}\\left[\\frac{x}{\\sqrt{x^2 + (H/2)^2}}\\right]_{-W/2}^{W/2} = \\frac{\\mu_0 I W}{2\\pi H d}",
        "units": "\\text{T}"
      },
      {
        "ask": "Swap $W$ and $H$ for the other pair, and add all four.",
        "options": [
          {
            "tex": "B = \\frac{2\\mu_0 I\\sqrt{W^2 + H^2}}{\\pi W H}\\ \\text{out of the page}",
            "ok": true
          },
          {
            "tex": "B = \\frac{\\mu_0 I\\sqrt{W^2 + H^2}}{\\pi W H}",
            "why": "That counts one of each pair. There are two sides of each length."
          },
          {
            "tex": "B = \\frac{2\\sqrt2\\,\\mu_0 I}{\\pi W}",
            "why": "That is the square, $W = H$. Here the two pairs differ."
          }
        ],
        "line": "B = 2\\cdot\\frac{\\mu_0 I}{2\\pi d}\\left(\\frac{W}{H} + \\frac{H}{W}\\right) = \\frac{2\\mu_0 I\\sqrt{W^2 + H^2}}{\\pi W H}",
        "units": "\\text{T}"
      }
    ]
  },
  {
    "id": "biot-loop",
    "title": "A current loop: B on its axis",
    "goal": "A circular loop of radius $R$ carries $I$. Find $B$ at $P$ on its axis, a height $z$ above the center.",
    "done": "Symmetry did the integral: every piece is the same distance away and the sideways parts cancel. Raise $P$ and the field falls off as $1/(R^2 + z^2)^{3/2}$.",
    "steps": [
      {
        "ask": "Take one piece $d\\ell$ of the ring. How far is it from $P$?",
        "options": [
          {
            "tex": "r = \\sqrt{R^2 + z^2}",
            "ok": true
          },
          {
            "tex": "r = R",
            "why": "$R$ is the distance to the center, in the plane of the loop. $P$ is above the plane, a height $z$."
          },
          {
            "tex": "r = z",
            "why": "$z$ is how far $P$ is from the center. The piece is out on the rim, $R$ to the side."
          }
        ],
        "line": "r = \\sqrt{R^2 + z^2}\\ \\ \\text{for every piece}",
        "units": "\\text{m}",
        "after": "Every piece of the ring is the same distance from $P$. That is what makes this integral easy."
      },
      {
        "ask": "What is the angle between $d\\vec\\ell$ (around the ring) and $\\hat r$ (from the piece to $P$)?",
        "options": [
          {
            "tex": "90^\\circ, \\ \\text{so}\\ |d\\vec\\ell\\times\\hat r| = d\\ell",
            "ok": true
          },
          {
            "tex": "\\sin\\varphi = \\frac{R}{r}",
            "why": "$d\\vec\\ell$ runs around the ring, sideways. $\\hat r$ runs from the rim inward and up to $P$. They are perpendicular for every piece."
          },
          {
            "tex": "0^\\circ, \\ \\text{so}\\ d\\vec\\ell\\times\\hat r = 0",
            "why": "Then the loop would make no field. $d\\vec\\ell$ is never along $\\hat r$ here."
          }
        ],
        "line": "dB = \\frac{\\mu_0 I}{4\\pi}\\,\\frac{d\\ell}{R^2 + z^2}",
        "units": "\\text{T}"
      },
      {
        "ask": "Each $d\\vec B$ tilts away from the axis. Around the ring the sideways parts cancel in pairs. Which part survives?",
        "options": [
          {
            "tex": "dB_z = dB\\,\\frac{R}{r}",
            "ok": true
          },
          {
            "tex": "dB_z = dB\\,\\frac{z}{r}",
            "why": "$d\\vec B$ is perpendicular to $\\hat r$. Its tilt from the axis is the angle $\\hat r$ makes with the plane, so the axial part is $R/r$. $z/r$ is the sideways part that cancels."
          },
          {
            "tex": "dB_z = dB",
            "why": "Each $d\\vec B$ is tilted off the axis. Only its axial part adds up; the rest cancels with the piece across the ring."
          }
        ],
        "line": "dB_z = \\frac{\\mu_0 I}{4\\pi}\\,\\frac{d\\ell}{R^2 + z^2}\\cdot\\frac{R}{\\sqrt{R^2 + z^2}}"
      },
      {
        "ask": "Nothing in $dB_z$ changes around the ring except $d\\ell$. What is $\\oint d\\ell$?",
        "options": [
          {
            "tex": "\\oint d\\ell = 2\\pi R",
            "ok": true
          },
          {
            "tex": "\\oint d\\ell = \\pi R^2",
            "why": "That is the area inside the loop. Adding up $d\\ell$ around the ring gives its length."
          },
          {
            "tex": "\\oint d\\ell = R",
            "why": "That is the radius. The pieces go all the way round."
          }
        ],
        "line": "B = \\frac{\\mu_0 I R}{4\\pi (R^2 + z^2)^{3/2}}\\,(2\\pi R) = \\frac{\\mu_0 I R^2}{2\\,(R^2 + z^2)^{3/2}}",
        "units": "\\frac{\\text{T·m}}{\\text{A}}\\cdot\\frac{\\text{A}\\cdot\\text{m}^2}{\\text{m}^3} = \\text{T}"
      },
      {
        "ask": "Check a limit. At the center of the loop, $z = 0$. What is $B$ there?",
        "options": [
          {
            "tex": "B = \\frac{\\mu_0 I}{2R}",
            "ok": true
          },
          {
            "tex": "B = \\frac{\\mu_0 I}{2\\pi R}",
            "why": "That is a long straight wire. The loop’s pieces are all a distance $R$ away and all add along the axis."
          },
          {
            "tex": "B = 0",
            "why": "The pieces cancel only sideways. Along the axis every piece adds, and at the center all of $d\\vec B$ is axial."
          }
        ],
        "line": "B_{\\text{center}} = \\frac{\\mu_0 I}{2R}",
        "units": "\\text{T}"
      }
    ]
  },
  {
    "id": "ampere-thick",
    "title": "Inside a thick wire: Ampère’s law",
    "goal": "A long wire of radius $a$ carries $I$ spread evenly over its cross-section. Find $B$ a distance $r < a$ from its axis.",
    "done": "Ampère’s law turned the field problem into a current-counting problem. Grow the loop past the wire’s surface and $I_{\\text{enc}}$ stops at $I$: outside, $B = \\mu_0 I/2\\pi r$.",
    "steps": [
      {
        "ask": "Choose the Amperian loop. You want $B$ at a distance $r$ from the axis.",
        "options": [
          {
            "text": "A circle of radius $r$, centred on the wire’s axis",
            "ok": true
          },
          {
            "text": "A square through the point",
            "why": "On a square the distance to the axis changes as you go round, so $B$ does too. Then $\\oint \\vec B\\cdot d\\vec\\ell$ can’t be written as $B$ times a length."
          },
          {
            "text": "A circle of radius $a$, at the wire’s surface",
            "why": "The loop has to pass through the point where you want $B$, at radius $r$."
          }
        ],
        "line": "\\text{loop: circle of radius } r,\\ \\ \\vec B \\parallel d\\vec\\ell,\\ \\ |\\vec B| \\text{ the same all round}",
        "after": "By symmetry $\\vec B$ circles the axis and has one size on the whole circle. That is the only reason Ampère’s law can be solved for $B$."
      },
      {
        "ask": "Work out the left side, $\\oint \\vec B\\cdot d\\vec\\ell$.",
        "options": [
          {
            "tex": "\\oint \\vec B\\cdot d\\vec\\ell = B\\,(2\\pi r)",
            "ok": true
          },
          {
            "tex": "\\oint \\vec B\\cdot d\\vec\\ell = B\\,\\pi r^2",
            "why": "That is an area. The loop integral adds $B$ along the length of the loop: its circumference."
          },
          {
            "tex": "\\oint \\vec B\\cdot d\\vec\\ell = B\\,(2\\pi a)",
            "why": "The loop is at radius $r$, inside the wire, not at its surface $a$."
          }
        ],
        "line": "\\oint \\vec B\\cdot d\\vec\\ell = B\\,(2\\pi r)",
        "units": "\\text{T}\\cdot\\text{m}"
      },
      {
        "ask": "Now the right side: the current through the loop. The current density is uniform, $J = I/\\pi a^2$.",
        "options": [
          {
            "tex": "I_{\\text{enc}} = J\\,\\pi r^2 = I\\,\\frac{r^2}{a^2}",
            "ok": true
          },
          {
            "tex": "I_{\\text{enc}} = I\\,\\frac{r}{a}",
            "why": "Current goes with the area it crosses, and area goes as radius squared."
          },
          {
            "tex": "I_{\\text{enc}} = I",
            "why": "That is true only for a loop outside the wire. Inside, the loop encloses only part of the cross-section."
          }
        ],
        "line": "I_{\\text{enc}} = J\\,\\pi r^2 = I\\,\\frac{r^2}{a^2}",
        "units": "\\frac{\\text{A}}{\\text{m}^2}\\cdot\\text{m}^2 = \\text{A}",
        "after": "$J\\pi r^2$ and $I r^2/a^2$ are the same current written two ways."
      },
      {
        "ask": "Set the two sides equal: $B(2\\pi r) = \\mu_0 I_{\\text{enc}}$. Solve for $B$.",
        "options": [
          {
            "tex": "B = \\frac{\\mu_0 I\\,r}{2\\pi a^2}",
            "ok": true
          },
          {
            "tex": "B = \\frac{\\mu_0 I}{2\\pi r}",
            "why": "That is the field outside the wire, where all of $I$ is enclosed. Inside, only $Ir^2/a^2$ is."
          },
          {
            "tex": "B = \\frac{\\mu_0 I\\,r^2}{2\\pi a^2}",
            "why": "Divide by $2\\pi r$: one power of $r$ cancels. $B$ grows in proportion to $r$ inside."
          }
        ],
        "line": "B = \\frac{\\mu_0 I\\,r}{2\\pi a^2}",
        "units": "\\frac{\\text{T·m}}{\\text{A}}\\cdot\\frac{\\text{A}\\cdot\\text{m}}{\\text{m}^2} = \\text{T}"
      },
      {
        "ask": "On an exam the current density is often not uniform. Say $J = \\alpha r'$, growing outward. Now $I_{\\text{enc}}$ needs an integral over thin rings of radius $r'$ and width $dr'$. What is it?",
        "options": [
          {
            "tex": "I_{\\text{enc}} = \\int_0^{r}\\alpha r'\\,(2\\pi r'\\,dr') = \\frac{2\\pi\\alpha r^3}{3}",
            "ok": true
          },
          {
            "tex": "I_{\\text{enc}} = \\alpha r\\cdot\\pi r^2",
            "why": "$J$ changes with $r'$, so you can’t multiply it by an area. Add up thin rings, each with its own $J$."
          },
          {
            "tex": "I_{\\text{enc}} = \\int_0^{r}\\alpha r'\\,dr' = \\frac{\\alpha r^2}{2}",
            "why": "Each ring’s area is $2\\pi r'\\,dr'$, not $dr'$. Check the units: $J\\,dr$ is A/m, not A."
          }
        ],
        "line": "I_{\\text{enc}} = \\int_0^{r} J(r')\\,2\\pi r'\\,dr' \\quad\\Rightarrow\\quad B = \\frac{\\mu_0 \\alpha r^2}{3}",
        "units": "\\frac{\\text{A}}{\\text{m}^3}\\cdot\\text{m}\\cdot\\text{m}\\cdot\\text{m} = \\text{A}",
        "after": "With $J$ uniform, the same integral gives back $J\\pi r^2$."
      }
    ]
  }
];

# Handoff: the cathedral is the line of work

`main` carries the cathedral loop (threshold, twelve-door hall, number-theory road and sieve, earning by doing). GitHub Pages publishes `cathedral/dist`, so the live site is that loop:

https://dgadapee00.github.io/truth-mines/

The surface mine (map and Inside view) is still in this repo and still tested. It is what `npm run dev` at the root serves. It is not the published page. Unreal stays paused. Looks come later; this walk is about whether the loop functions.

## What Dalton approved (Oct 11, 2026)

Recorded with the flags the repo already had. The pipeline copies those flags and never sets them.

| Wording | Where | Flag |
| --- | --- | --- |
| 154 readable statement forms | `pipeline/landmarks.yaml` `display.reviewed` | `true` |
| 8 plane captions | `pipeline/config.yaml` `number_theory_plane.texts` | `reviewed: true`, copied by `pipeline/plane_nt.py` |
| Trurl's two questions | the same file, moments `nt-1-road` and `nt-1-sieve` | `question_reviewed: true` |
| The two moment rubrics | the same moments | `rubric_reviewed: true` (wording unchanged) |
| The app's own lines (31 ids) | `cathedral/src/copy.ts` `REVIEWED_LINES` | each id listed |

There are no reviewed notes under `content/` besides the README, so nothing there changed. Trurl's sleeping hint and the lost-thread line ("I lost the thread") are not in `copy.ts`. They stay drafts, and the screen still tags them.

## Walking it with no Worker

Nothing in the published build calls Anthropic, xAI, or a Cloudflare Worker. `VITE_WORKER_URL` is empty, and the gate's **Continue without Trurl** stores no secret. On that path:

**Works**

- The gate, the threshold, the hall, and the number-theory door (it starts open).
- The road and the sieve, by typing or by pointing.
- Trurl's questions, as captions, once the doing is finished. They are not tagged draft.
- Earning on the device. The road earns `1arith`: complex numbers goes from sealed to dim. The sieve earns `df-prm`: algebra and symmetry goes from dim to open, and complex numbers opens once both ideas are held. The square-root note appears after the sieve idea is earned.
- Progress in `localStorage` (`truth-mines.progress`). A second visit still has it, and can skip the threshold. The status line says "Saved on this device".
- Enter VR, teleport, and 30-degree snap turn.

**Does not work**

- A live reply from Trurl, his voice, and speech-to-text. Talking shows the sleeping hint, which is still tagged draft.
- A verdict. Earning happens because the doing finished, not because an explanation was judged. Typing something that is not the road's factors or the sieve's next prime earns nothing.
- Sync to another device.

If Settings already has a Worker address and a secret, Trurl is treated as on, and finishing the doing does not earn until that Worker answers or returns 401. **Forget this device** clears both and returns to the path above. Do not type a Worker URL for tomorrow's walk.

## For the Quest 3 tomorrow

Function over form. No visual polish in this build. Use the controllers. Hand tracking is not a way to play; putting the controllers down must not crash the session, and that is all the emulator checks.

1. Frame rate: the OVR Metrics overlay on the headset, in the hall and on the road. The target is 72 fps. If the overlay misses it, confirm with chrome://inspect over USB. The emulator cannot measure it.
2. Comfort: teleport only, 30-degree snap turn, guided moves that ease in and out with a vignette. Nothing should turn the view, and nothing should move you unless you asked.
3. The in-headset panel: the place name and the hint should be readable from where you stand. A draft tag, if one shows, is Trurl's sleeping hint, not the place lines.
4. Earn an idea with no Worker. Continue without Trurl. Take three stacks apart on the road: the question stays as a caption, complex numbers goes from sealed to dim, and progress says saved on this device. Run the sieve (2, 3, 5, 7, then "done"): algebra and symmetry opens, and complex numbers opens once both ideas are held.
5. Leave and come back. The doors should still show what was earned, and the threshold should be skippable.

## If the published site is not up yet

The Quest browser will enter VR on the HTTPS Pages URL. A plain `http://` address on the LAN is not a secure context, so Enter VR fails there. The cathedral's dev server is HTTPS on port 8081 (a self-signed certificate; accept it once on the headset).

From the repo on the Windows PC, in PowerShell:

```powershell
py -3 -m pip install -r pipeline/requirements.txt
npm ci
npm ci --prefix cathedral
py -3 -m pipeline
npm --prefix cathedral run dev:runtime
ipconfig
```

`ipconfig` prints the PC's IPv4 address on the Wi-Fi adapter. On the Quest browser open `https://<that-address>:8081/`, accept the certificate warning, and choose Continue without Trurl.

## Resume

```sh
cd truth-mines
git checkout main
pip install -r pipeline/requirements.txt && npm ci && npm ci --prefix cathedral && npm ci --prefix worker
python3 -m pipeline
npm run check
npm run e2e
npm run dev                 # the surface mine, http://localhost:5173
npm --prefix cathedral run dev   # the cathedral, http://localhost:8081
```

`npm run check` is typecheck, lint, unit tests, pipeline tests, the Worker, the cathedral, the secret scan, and the map e2e. `npm run e2e` is the full Playwright suite, which CI runs. Deploy runs only on `main`, and only the cathedral artifact.

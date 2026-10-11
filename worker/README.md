# The Trurl Worker

One Cloudflare Worker holds every provider key. The static app talks only to it. The design is in
`docs/technical-design.md`; this is how it is built and how to run it.

| Endpoint | Method | What |
| --- | --- | --- |
| `/api/trurl` | POST | Trurl's reply, streamed as server-sent events: `text` (`{delta}`) as Claude writes, then `verdict` (`{earned}`) and `done`, or one generic `error`. |
| `/api/stt` | WebSocket | Speech to text, proxied to xAI (`grok-voice-transcribe-2.0`). Binary audio frames up (16 kHz 16-bit mono PCM), a text frame `{"type":"end"}` on release; `{"type":"interim"\|"final","text"}` back. |
| `/api/progress` | GET, PUT | The visitor's progress in KV. PUT merges into what is stored (earned ideas union, newest pathway wins). |

Every request must present the app secret: `Authorization: Bearer <secret>`, or for the WebSocket
(a browser cannot set headers on one) the subprotocols `bearer.<secret>` and `trurl.v1`. The origin
must be in `ALLOWED_ORIGINS` or be localhost or a local-network address. Limits per minute: 30 Trurl,
10 speech sessions, 60 progress.

The client chooses nothing about the model. The Worker fixes `claude-haiku-5-5`, the token limit and
the prompt (`src/trurl.ts`, `src/prompt.ts`), and builds Trurl's grounding from `data/grounding.json`,
which the pipeline writes (`python -m pipeline grounding`) and `npm run grounding` copies here.

## Tests

```sh
npm ci --prefix worker
npm run test:worker          # from the repo root; also copies data/grounding.json first
npm run typecheck:worker
```

The tests use fake keys, a stubbed Anthropic stream and fake WebSockets. No real key is needed and
none is ever read from the environment.

## What you do (once)

1. **Anthropic Console**: create an API key and set a monthly spend limit (for example $15).
2. **xAI**: create an API key for speech input and set a spend limit.
3. **Cloudflare** (free): `npx wrangler login`, then
   `npx wrangler kv namespace create PROGRESS` and paste the id into `wrangler.toml`.
4. **Secrets** (from this directory; each prompts for the value, so none lands in shell history):
   ```sh
   openssl rand -hex 32          # a strong app secret: use this as TRURL_APP_SECRET
   npx wrangler secret put TRURL_APP_SECRET
   npx wrangler secret put ANTHROPIC_API_KEY
   npx wrangler secret put XAI_API_KEY
   ```
5. `npm run deploy`, then type the app secret into each device once when the app asks.
6. To rotate the secret: `wrangler secret put TRURL_APP_SECRET` again and re-enter it on each device.

For local development put the same three names in `worker/.dev.vars` (gitignored) and run
`npx wrangler dev`.

## Not verified without real keys and a deployed Worker

- **xAI's streaming speech-to-text protocol** (`src/stt.ts`): written from Vercel's `@ai-sdk/xai`
  5.0.20, the independent client for xAI's page
  https://docs.x.ai/developers/model-capabilities/audio/speech-to-text, because that page was not
  reachable from the development sandbox. Still to confirm with a real key: that `keyterm` is
  accepted on the streaming endpoint, and 16 kHz PCM from the Quest's microphone capture.
- **Cloudflare's WebSocket plumbing** (`src/worker-ws.ts`): a few lines that cannot run under Node.
- **The verdict contract**: Claude is told to end with `<verdict>{"earned":[...]}</verdict>`; the
  Worker never trusts it beyond what the moment can earn, but how reliably Haiku writes it, and how
  generously it judges at `low` effort (`EFFORT` in `src/trurl.ts`), needs a real run.
- **Prompt caching**: the persona block is marked cacheable, but may be under the model's minimum
  cacheable length; check `usage.cache_read_input_tokens` on a real run.
- **Latency**: time from releasing the button to the first caption word, on the headset.

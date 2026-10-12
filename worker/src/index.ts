import type { GroundingFile } from '../../core/schema';
import type { Env } from './env';
import groundingData from './grounding.generated.json';
import { createHandler } from './handler';
import { workerSttDeps } from './worker-ws';

const handler = createHandler({
  grounding: groundingData as GroundingFile,
  fetch: (input, init) => fetch(input, init),
  now: () => Date.now(),
  stt: workerSttDeps,
});

export default {
  fetch: (req: Request, env: Env): Promise<Response> => handler(req, env),
};

// Copies the pipeline's data/grounding.json next to the Worker's source, where it is bundled.
// The copy is generated and gitignored. Run `python -m pipeline` first.
import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const from = fileURLToPath(new URL('../../data/grounding.json', import.meta.url));
const to = fileURLToPath(new URL('../src/grounding.generated.json', import.meta.url));
if (!existsSync(from)) {
  console.error('data/grounding.json is missing: run `python -m pipeline` (or `python -m pipeline grounding`) first');
  process.exit(1);
}
copyFileSync(from, to);

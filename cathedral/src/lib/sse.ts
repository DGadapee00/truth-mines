export interface SseEvent {
  event: string;
  data: unknown;
}

/** Server-sent events from a stream of bytes. An event only counts once its blank line has arrived. */
export async function* parseSse(chunks: AsyncIterable<Uint8Array>): AsyncGenerator<SseEvent> {
  const decoder = new TextDecoder();
  let buffer = '';
  const take = (block: string): SseEvent | null => {
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
    if (data.length === 0) return null;
    try {
      return { event, data: JSON.parse(data.join('\n')) as unknown };
    } catch {
      return null;
    }
  };
  for await (const chunk of chunks) {
    buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n/g, '\n');
    let at: number;
    while ((at = buffer.indexOf('\n\n')) !== -1) {
      const e = take(buffer.slice(0, at));
      buffer = buffer.slice(at + 2);
      if (e) yield e;
    }
  }
}

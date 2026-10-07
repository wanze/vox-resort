import { ShareError } from '../domain/layoutCodec';

const streamOf = (bytes: Uint8Array): ReadableStream<BufferSource> =>
  new Blob([bytes as Uint8Array<ArrayBuffer>]).stream();

export async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const deflated = streamOf(bytes).pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(deflated).arrayBuffer());
}

async function readCapped(
  chunks: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>>,
  maxBytes: number,
): Promise<Uint8Array<ArrayBuffer>[]> {
  const read: Uint8Array<ArrayBuffer>[] = [];
  let total = 0;
  for (;;) {
    // One stream's chunks come in order: there is nothing to read in parallel.
    // oxlint-disable-next-line no-await-in-loop
    const { done, value } = await chunks.read();
    if (done) return read;
    total += value.length;
    if (total > maxBytes) {
      void chunks.cancel();
      throw new ShareError('too-big', [`more than ${maxBytes} bytes`]);
    }
    read.push(value);
  }
}

// Read chunk by chunk and given up past maxBytes, so a small link cannot inflate into gigabytes.
export async function inflate(bytes: Uint8Array, maxBytes: number): Promise<Uint8Array> {
  const chunks = streamOf(bytes).pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  try {
    return new Uint8Array(await new Blob(await readCapped(chunks, maxBytes)).arrayBuffer());
  } catch (cause: unknown) {
    throw cause instanceof ShareError ? cause : new ShareError('malformed', [String(cause)]);
  }
}

import { createReadStream } from 'node:fs';
import { createConnection } from 'node:net';
import { once } from 'node:events';

export type ScanResult = Readonly<{ clean: boolean; detail: string }>;

async function scanChunks(
  chunks: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
): Promise<ScanResult> {
  const socket = createConnection({
    host: process.env.CLAMAV_HOST ?? 'localhost',
    port: Number(process.env.CLAMAV_PORT ?? 3310),
    timeout: Number(process.env.CLAMAV_TIMEOUT_MS ?? 60_000),
  });
  socket.once('timeout', () => socket.destroy(new Error('ClamAV scan timed out.')));
  await once(socket, 'connect');
  socket.write('zINSTREAM\0');
  for await (const rawChunk of chunks) {
    const chunk = Buffer.from(rawChunk);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(chunk.length);
    if (!socket.write(Buffer.concat([length, chunk]))) await once(socket, 'drain');
  }
  socket.write(Buffer.alloc(4));
  const response: Buffer[] = [];
  socket.on('data', (chunk: Buffer) => response.push(chunk));
  await once(socket, 'end');
  const detail = Buffer.concat(response).toString('utf8').replace(/\0$/u, '').trim();
  if (detail.endsWith('OK')) return { clean: true, detail: 'CLEAN' };
  if (detail.includes('FOUND')) return { clean: false, detail: 'MALWARE_FOUND' };
  throw new Error('ClamAV returned an indeterminate result.');
}

export async function scanFile(path: string): Promise<ScanResult> {
  return scanChunks(createReadStream(path, { highWaterMark: 64 * 1024 }));
}

export async function scanBytes(bytes: Uint8Array): Promise<ScanResult> {
  return scanChunks([bytes]);
}

import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type OcrResult = Readonly<{ engine: string; suggestions: Record<string, string> }>;

export async function extractSuggestions(path: string, mimeType: string): Promise<OcrResult> {
  const work = await mkdtemp(join(tmpdir(), 'bloctrust-ocr-'));
  try {
    let target = path;
    if (mimeType === 'application/pdf') {
      const prefix = join(work, 'page');
      await run('pdftoppm', ['-f', '1', '-singlefile', '-png', path, prefix]);
      target = `${prefix}.png`;
    }
    const text = await run('tesseract', [
      target,
      'stdout',
      '-l',
      process.env.OCR_LANGUAGES ?? 'eng',
    ]);
    return { engine: 'tesseract', suggestions: parseSuggestions(text) };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

export function parseSuggestions(text: string): Record<string, string> {
  const suggestions: Record<string, string> = {};
  const number = text.match(/(?:invoice|inv)[\s#:.-]*(?<value>[A-Z0-9][A-Z0-9/-]{2,40})/iu)?.groups
    ?.value;
  const total = text.match(/(?:total|amount due)[^\d]{0,20}(?<value>\d[\d ,.]*[.,]\d{2})/iu)?.groups
    ?.value;
  const currency = text.match(/\b(?<value>EUR|USD|GBP|MDL|RON)\b/u)?.groups?.value;
  const date = text.match(/\b(?<value>\d{4}[-/.]\d{2}[-/.]\d{2})\b/u)?.groups?.value;
  if (number) suggestions.invoiceNumber = number;
  if (total) suggestions.totalAmount = total.replace(/\s/gu, '');
  if (currency) suggestions.currency = currency.toUpperCase();
  if (date) suggestions.issueDate = date.replace(/[/.]/gu, '-');
  return suggestions;
}

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, windowsHide: true });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    child.stdout.on('data', (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes <= 2 * 1024 * 1024) stdout.push(chunk);
      else child.kill();
    });
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.once('error', reject);
    child.once('close', (code) =>
      code === 0
        ? resolve(Buffer.concat(stdout).toString('utf8'))
        : reject(
            new Error(
              `OCR command failed (${code ?? -1}): ${Buffer.concat(stderr).toString('utf8').slice(0, 200)}`,
            ),
          ),
    );
  });
}

import { Injectable } from '@nestjs/common';
import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';

type ArgonParameters = Readonly<{
  memory: number;
  passes: number;
  parallelism: number;
  tagLength: number;
}>;

const VERSION = 19;
const MAX_MEMORY_KIB = 262_144;
const MAX_PASSES = 10;
const MAX_PARALLELISM = 8;

@Injectable()
export class PasswordService {
  private readonly parameters: ArgonParameters = {
    memory: Number(process.env.ARGON2_MEMORY_KIB ?? 19_456),
    passes: Number(process.env.ARGON2_PASSES ?? 2),
    parallelism: 1,
    tagLength: 32,
  };

  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const derivedKey = await this.derive(password, salt, this.parameters);
    const parameterString = `m=${this.parameters.memory},t=${this.parameters.passes},p=${this.parameters.parallelism}`;

    return `$argon2id$v=${VERSION}$${parameterString}$${this.encode(salt)}$${this.encode(derivedKey)}`;
  }

  async verify(password: string, encodedHash: string): Promise<boolean> {
    const parsed = this.parse(encodedHash);
    if (!parsed) return false;

    try {
      const candidate = await this.derive(password, parsed.salt, parsed.parameters);

      return (
        candidate.length === parsed.expected.length && timingSafeEqual(candidate, parsed.expected)
      );
    } catch {
      return false;
    }
  }

  private derive(password: string, salt: Buffer, parameters: ArgonParameters): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      argon2(
        'argon2id',
        {
          message: password,
          nonce: salt,
          parallelism: parameters.parallelism,
          tagLength: parameters.tagLength,
          memory: parameters.memory,
          passes: parameters.passes,
        },
        (error, derivedKey) => {
          if (error) reject(error);
          else resolve(derivedKey);
        },
      );
    });
  }

  private encode(value: Buffer): string {
    return value.toString('base64').replace(/=+$/u, '');
  }

  private decode(value: string): Buffer {
    return Buffer.from(value, 'base64');
  }

  private parse(
    encodedHash: string,
  ): Readonly<{ salt: Buffer; expected: Buffer; parameters: ArgonParameters }> | undefined {
    const match = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([^$]+)\$([^$]+)$/u.exec(
      encodedHash,
    );
    if (!match) return undefined;

    const memory = Number(match[1]);
    const passes = Number(match[2]);
    const parallelism = Number(match[3]);
    const saltValue = match[4];
    const hashValue = match[5];

    if (
      !saltValue ||
      !hashValue ||
      !Number.isSafeInteger(memory) ||
      !Number.isSafeInteger(passes) ||
      !Number.isSafeInteger(parallelism)
    ) {
      return undefined;
    }

    const salt = this.decode(saltValue);
    const expected = this.decode(hashValue);

    if (
      memory < 8 * parallelism ||
      memory > MAX_MEMORY_KIB ||
      passes < 1 ||
      passes > MAX_PASSES ||
      parallelism < 1 ||
      parallelism > MAX_PARALLELISM ||
      salt.length < 16 ||
      salt.length > 64 ||
      expected.length < 16 ||
      expected.length > 64
    ) {
      return undefined;
    }

    return {
      salt,
      expected,
      parameters: { memory, passes, parallelism, tagLength: expected.length },
    };
  }
}

import { createHash, createHmac } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { request } from 'node:http';
import { request as secureRequest } from 'node:https';
import type { IncomingMessage } from 'node:http';

type Method = 'GET' | 'PUT' | 'DELETE';

export class ObjectStorage {
  private readonly endpoint = new URL(process.env.MINIO_ENDPOINT ?? 'http://localhost:9000');
  private readonly accessKey = process.env.MINIO_ACCESS_KEY ?? 'bloctrust-local';
  private readonly secretKey = process.env.MINIO_SECRET_KEY ?? 'bloctrust-local-secret';
  private readonly region = process.env.MINIO_REGION ?? 'us-east-1';

  async download(bucket: string, key: string, destination: string): Promise<void> {
    const response = await this.send('GET', bucket, key, emptyHash());
    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(destination, { mode: 0o600 });
      response.once('error', reject);
      output.once('error', reject);
      output.once('finish', resolve);
      response.pipe(output);
    });
  }

  put(bucket: string, key: string, source: string, sha256: string, size: number): Promise<void> {
    return this.send('PUT', bucket, '', emptyHash(), undefined, 0)
      .then((response) => {
        response.resume();
        return this.send('PUT', bucket, key, sha256, source, size);
      })
      .then((response) => {
        response.resume();
      });
  }

  delete(bucket: string, key: string): Promise<void> {
    return this.send('DELETE', bucket, key, emptyHash()).then((response) => {
      response.resume();
    });
  }

  private send(
    method: Method,
    bucket: string,
    key: string,
    payloadHash: string,
    source?: string,
    size?: number,
  ): Promise<IncomingMessage> {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/gu, '');
    const date = amzDate.slice(0, 8);
    const pathname = `/${encodeURIComponent(bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
    const headers: Record<string, string> = {
      host: this.endpoint.host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    };
    if (size !== undefined) headers['content-length'] = String(size);
    const names = Object.keys(headers).sort();
    const canonicalHeaders = names.map((name) => `${name}:${headers[name]}\n`).join('');
    const scope = `${date}/${this.region}/s3/aws4_request`;
    const canonical = [method, pathname, '', canonicalHeaders, names.join(';'), payloadHash].join(
      '\n',
    );
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      createHash('sha256').update(canonical).digest('hex'),
    ].join('\n');
    const signature = createHmac('sha256', signingKey(this.secretKey, date, this.region))
      .update(stringToSign)
      .digest('hex');
    headers.authorization = `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`;

    return new Promise((resolve, reject) => {
      const requester = this.endpoint.protocol === 'https:' ? secureRequest : request;
      const outgoing = requester(
        {
          protocol: this.endpoint.protocol,
          hostname: this.endpoint.hostname,
          port: this.endpoint.port,
          method,
          path: pathname,
          headers,
        },
        (response) => {
          if (
            ((response.statusCode ?? 500) >= 200 && (response.statusCode ?? 500) < 300) ||
            (method === 'PUT' && key === '' && response.statusCode === 409)
          )
            resolve(response);
          else {
            response.resume();
            reject(new Error(`Object storage status ${response.statusCode ?? 500}.`));
          }
        },
      );
      outgoing.once('error', reject);
      if (source) createReadStream(source).once('error', reject).pipe(outgoing);
      else outgoing.end();
    });
  }
}

function signingKey(secret: string, date: string, region: string): Buffer {
  const dateKey = createHmac('sha256', `AWS4${secret}`).update(date).digest();
  const regionKey = createHmac('sha256', dateKey).update(region).digest();
  const serviceKey = createHmac('sha256', regionKey).update('s3').digest();
  return createHmac('sha256', serviceKey).update('aws4_request').digest();
}

function emptyHash(): string {
  return createHash('sha256').update('').digest('hex');
}

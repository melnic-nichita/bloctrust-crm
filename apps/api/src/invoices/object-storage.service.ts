import { Injectable } from '@nestjs/common';
import { createHash, createHmac } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { request } from 'node:http';
import { request as secureRequest } from 'node:https';
import type { Readable } from 'node:stream';

type StorageConfig = Readonly<{
  endpoint: URL;
  accessKey: string;
  secretKey: string;
  region: string;
}>;

@Injectable()
export class ObjectStorageService {
  private readonly config = storageConfig();

  putFile(bucket: string, key: string, path: string, sha256: string, size: number): Promise<void> {
    return this.ensureBucket(bucket).then(() =>
      this.send('PUT', bucket, key, sha256, createReadStream(path), size).then((response) => {
        response.resume();
      }),
    );
  }

  getObject(bucket: string, key: string): Promise<Readable> {
    return this.send('GET', bucket, key, emptyHash());
  }

  deleteObject(bucket: string, key: string): Promise<void> {
    return this.send('DELETE', bucket, key, emptyHash()).then((response) => {
      response.resume();
    });
  }

  private ensureBucket(bucket: string): Promise<void> {
    return this.send('PUT', bucket, '', emptyHash(), undefined, 0).then((response) => {
      response.resume();
    });
  }

  private send(
    method: 'PUT' | 'GET' | 'DELETE',
    bucket: string,
    key: string,
    payloadHash: string,
    body?: Readable,
    contentLength?: number,
  ): Promise<Readable> {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/gu, '');
    const date = amzDate.slice(0, 8);
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    const pathname = `/${encodeURIComponent(bucket)}/${encodedKey}`;
    const host = this.config.endpoint.host;
    const headers: Record<string, string> = {
      host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    };
    if (contentLength !== undefined) headers['content-length'] = String(contentLength);
    const signedHeaderNames = Object.keys(headers).sort();
    const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${headers[name]}\n`).join('');
    const signedHeaders = signedHeaderNames.join(';');
    const canonicalRequest = [
      method,
      pathname,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');
    const scope = `${date}/${this.config.region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');
    const signature = createHmac(
      'sha256',
      signingKey(this.config.secretKey, date, this.config.region),
    )
      .update(stringToSign)
      .digest('hex');
    headers.authorization = `AWS4-HMAC-SHA256 Credential=${this.config.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return new Promise((resolve, reject) => {
      const sendRequest = this.config.endpoint.protocol === 'https:' ? secureRequest : request;
      const outgoing = sendRequest(
        {
          protocol: this.config.endpoint.protocol,
          hostname: this.config.endpoint.hostname,
          port: this.config.endpoint.port,
          method,
          path: pathname,
          headers,
        },
        (response) => {
          if (
            ((response.statusCode ?? 500) >= 200 && (response.statusCode ?? 500) < 300) ||
            (method === 'PUT' && key === '' && response.statusCode === 409)
          ) {
            resolve(response);
            return;
          }
          response.resume();
          reject(
            new Error(`Object storage request failed with status ${response.statusCode ?? 500}.`),
          );
        },
      );
      outgoing.once('error', reject);
      if (body) body.once('error', reject).pipe(outgoing);
      else outgoing.end();
    });
  }
}

function storageConfig(): StorageConfig {
  return {
    endpoint: new URL(process.env.MINIO_ENDPOINT ?? 'http://localhost:9000'),
    accessKey: process.env.MINIO_ACCESS_KEY ?? 'bloctrust-local',
    secretKey: process.env.MINIO_SECRET_KEY ?? 'bloctrust-local-secret',
    region: process.env.MINIO_REGION ?? 'us-east-1',
  };
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

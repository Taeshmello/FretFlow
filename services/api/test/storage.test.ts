import { describe, expect, it } from 'vitest';
import { createS3Storage } from '../src/lib/storage.ts';

const storage = createS3Storage({
  endpoint: 'https://r2.example.com',
  region: 'auto',
  bucket: 'audio',
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'secret-example',
  forcePathStyle: true,
});

const SHA_HEX = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const SHA_B64 = Buffer.from(SHA_HEX, 'hex').toString('base64');

describe('createS3Storage.presignUpload', () => {
  it('binds content type, length and the sha256 checksum into the signature', async () => {
    const { url, headers } = await storage.presignUpload('audio/u1/abc', {
      contentType: 'audio/mpeg',
      size: 1234,
      sha256: SHA_HEX,
    });
    const q = new URL(url).searchParams;
    expect(q.get('X-Amz-SignedHeaders')?.split(';').sort()).toEqual(
      ['content-length', 'content-type', 'host', 'x-amz-checksum-sha256'].sort(),
    );
    expect(q.get('X-Amz-Expires')).toBe('600');
    // The checksum must travel as a header the client sends, not be baked into the URL.
    expect([...q.keys()].some(k => k.toLowerCase().startsWith('x-amz-checksum'))).toBe(false);
    expect([...q.keys()].some(k => k.toLowerCase() === 'x-amz-sdk-checksum-algorithm')).toBe(false);
    expect(headers).toEqual({ 'content-type': 'audio/mpeg', 'x-amz-checksum-sha256': SHA_B64 });
  });
});

describe('upload URL binding (L3)', () => {
  it('requires an x-amz-checksum-sha256 header equal to the declared sha256, so the URL cannot store other bytes', async () => {
    const other = 'a'.repeat(64);
    const a = await storage.presignUpload('audio/u1/k', { contentType: 'audio/mpeg', size: 10, sha256: SHA_HEX });
    const b = await storage.presignUpload('audio/u1/k', { contentType: 'audio/mpeg', size: 10, sha256: other });
    const qa = new URL(a.url).searchParams;
    expect(qa.get('X-Amz-SignedHeaders')?.split(';')).toContain('x-amz-checksum-sha256');
    expect(a.headers['x-amz-checksum-sha256']).toBe(SHA_B64);
    expect(b.headers['x-amz-checksum-sha256']).toBe(Buffer.from(other, 'hex').toString('base64'));
    // The checksum is inside the signature: a different sha256 gives a different signature.
    expect(qa.get('X-Amz-Signature')).not.toBe(new URL(b.url).searchParams.get('X-Amz-Signature'));
  });
});

describe('createS3Storage.presignDownload', () => {
  it('forces a download with the stored content type', async () => {
    const url = await storage.presignDownload('audio/u1/abc', { contentType: 'audio/mpeg' });
    const q = new URL(url).searchParams;
    expect(q.get('response-content-type')).toBe('audio/mpeg');
    expect(q.get('response-content-disposition')).toBe('attachment');
    expect(q.get('X-Amz-Expires')).toBe('600');
  });
});

import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/** BACKEND.md §6.6: signed URLs live 10 minutes. */
export const SIGNED_URL_TTL_SEC = 600;

export interface PresignedUpload {
  url: string;
  /** Headers the client must send with the PUT; they are part of the signature. */
  headers: Record<string, string>;
}

export interface ObjectStorage {
  presignUpload(key: string, opts: { contentType: string; size: number; sha256: string }): Promise<PresignedUpload>;
  presignDownload(key: string, opts: { contentType: string }): Promise<string>;
  /** Size of a stored object, or null when it does not exist. */
  sizeOf(key: string): Promise<number | null>;
  deleteObject(key: string): Promise<void>;
}

export function audioStorageKey(ownerId: string, sha256: string): string {
  return `audio/${ownerId}/${sha256}`;
}

export function createS3Storage(opts: {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
}): ObjectStorage {
  const client = new S3Client({
    endpoint: opts.endpoint,
    region: opts.region,
    forcePathStyle: opts.forcePathStyle ?? false,
    credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey },
    // The SDK default would presign a CRC32 of the (empty) request body, which
    // real uploads then fail. We supply our own SHA-256 checksum instead.
    requestChecksumCalculation: 'WHEN_REQUIRED',
  });
  const Bucket = opts.bucket;

  return {
    async presignUpload(key, { contentType, size, sha256 }) {
      const checksum = Buffer.from(sha256, 'hex').toString('base64');
      const cmd = new PutObjectCommand({
        Bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: size,
        ChecksumSHA256: checksum,
      });
      // Keep the checksum a signed header (not a query param) so storage
      // verifies the uploaded bytes against it and rejects anything else.
      const url = await getSignedUrl(client, cmd, {
        expiresIn: SIGNED_URL_TTL_SEC,
        signableHeaders: new Set(['content-type']),
        unhoistableHeaders: new Set(['x-amz-checksum-sha256']),
      });
      return { url, headers: { 'content-type': contentType, 'x-amz-checksum-sha256': checksum } };
    },
    presignDownload(key, { contentType }) {
      const cmd = new GetObjectCommand({
        Bucket,
        Key: key,
        ResponseContentType: contentType,
        ResponseContentDisposition: 'attachment',
      });
      return getSignedUrl(client, cmd, { expiresIn: SIGNED_URL_TTL_SEC });
    },
    async sizeOf(key) {
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket, Key: key }));
        return head.ContentLength ?? 0;
      } catch (err) {
        const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        if (status === 404) return null;
        throw err;
      }
    },
    async deleteObject(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },
  };
}

// Writes apps/web/public/.well-known/assetlinks.json for the Android TWA.
//
//   ANDROID_PACKAGE_ID=com.iliasai.fretflow \
//   ANDROID_CERT_SHA256="AA:BB:...,CC:DD:..." \
//   pnpm assetlinks:generate
//
// List every certificate that signs a build users or testers install:
// the Play App Signing key (Play Console > Test and release > App integrity)
// and, for sideloaded test builds, the local upload key. Fingerprints are
// public values; never put keystore passwords here.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, 'apps/web/public/.well-known/assetlinks.json');

const packageId = process.env.ANDROID_PACKAGE_ID ?? '';
const fingerprints = (process.env.ANDROID_CERT_SHA256 ?? '')
  .split(',')
  .map(value => value.trim().toUpperCase())
  .filter(Boolean);

const PACKAGE_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
const FINGERPRINT_RE = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

const problems = [];
if (!PACKAGE_RE.test(packageId)) problems.push('ANDROID_PACKAGE_ID must be a lowercase Java package name, e.g. com.iliasai.fretflow');
if (fingerprints.length === 0) problems.push('ANDROID_CERT_SHA256 needs at least one SHA-256 certificate fingerprint');
for (const value of fingerprints) {
  if (!FINGERPRINT_RE.test(value)) problems.push(`not a colon-separated SHA-256 fingerprint: ${value}`);
}
if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}

const statements = [
  {
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: packageId,
      sha256_cert_fingerprints: [...new Set(fingerprints)],
    },
  },
];

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(statements, null, 2)}\n`);
console.log(`wrote ${target}`);

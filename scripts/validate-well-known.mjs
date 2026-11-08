// Validates the link-verification files in hosting/.well-known (docs/v1-spec.md §12).
// Fails on invalid JSON or wrong app identifiers. An empty assetlinks.json only warns:
// its SHA-256 fingerprints are added once the Android signing keys exist.
import { readFileSync } from 'node:fs';

const IOS_APP_ID = '3JMZLMZVTS.com.lmunck.Qualk';
const ANDROID_PACKAGE = 'com.lmunck.qualk';
const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

const errors = [];
const warnings = [];

function readJson(path) {
  try {
    return JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
  } catch (e) {
    errors.push(`${path}: ${e.message}`);
    return undefined;
  }
}

const aasaPath = 'hosting/.well-known/apple-app-site-association';
const aasa = readJson(aasaPath);
if (aasa) {
  const details = aasa.applinks?.details;
  const entry = Array.isArray(details)
    ? details.find((d) => Array.isArray(d.appIDs) && d.appIDs.includes(IOS_APP_ID))
    : undefined;
  if (!entry) {
    errors.push(`${aasaPath}: no applinks.details entry with appIDs containing ${IOS_APP_ID}`);
  } else if (!entry.components?.some((c) => c['/'] === '/play*')) {
    errors.push(`${aasaPath}: the ${IOS_APP_ID} entry has no component for "/play*"`);
  }
}

const linksPath = 'hosting/.well-known/assetlinks.json';
const links = readJson(linksPath);
if (links !== undefined) {
  if (!Array.isArray(links)) {
    errors.push(`${linksPath}: must be a JSON array`);
  } else if (links.length === 0) {
    warnings.push(`${linksPath}: empty, so Android App Links are not verified yet`);
  } else {
    links.forEach((s, i) => {
      const where = `${linksPath}[${i}]`;
      if (!s.relation?.includes('delegate_permission/common.handle_all_urls')) {
        errors.push(`${where}: relation must include delegate_permission/common.handle_all_urls`);
      }
      if (s.target?.namespace !== 'android_app')
        errors.push(`${where}: namespace must be android_app`);
      if (s.target?.package_name !== ANDROID_PACKAGE) {
        errors.push(`${where}: package_name must be ${ANDROID_PACKAGE}`);
      }
      const fps = s.target?.sha256_cert_fingerprints;
      if (!Array.isArray(fps) || fps.length === 0) {
        errors.push(`${where}: sha256_cert_fingerprints must be a non-empty array`);
      } else {
        for (const fp of fps)
          if (!FINGERPRINT.test(fp)) errors.push(`${where}: bad fingerprint ${fp}`);
      }
    });
  }
}

for (const w of warnings) console.warn(`warning: ${w}`);
for (const e of errors) console.error(`error: ${e}`);
if (errors.length) process.exit(1);
console.log('Link-verification files are valid.');

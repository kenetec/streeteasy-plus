// Strips a raw, logged-in-session StreetEasy page save down to a
// committable test fixture: removes executable <script> tags (keeping the
// single application/ld+json block downstream tests parse for listing
// coordinates), inline event handlers, and known personal-data leaks from
// the account menu — then verifies the result before writing it out.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const inPath = path.resolve(root, process.argv[2] || 'streeteasy-fixture.html');
const outPath = path.resolve(
  root,
  process.argv[3] || 'test/fixtures/search-results.html'
);

let html;
try {
  html = readFileSync(inPath, 'utf8');
} catch {
  console.error(`Could not read raw fixture at ${inPath}`);
  console.error(
    'Save a StreetEasy search results page (logged in) as "Webpage, HTML Only" to that path first.'
  );
  process.exit(1);
}

const beforeSize = Buffer.byteLength(html, 'utf8');

// Drop every <script> element except application/ld+json blocks. Those
// blocks are left byte-for-byte untouched since tests JSON.parse them.
let sanitized = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (match) => {
  const openTag = match.slice(0, match.indexOf('>') + 1);
  return /type\s*=\s*["']application\/ld\+json["']/i.test(openTag)
    ? match
    : '';
});

// Inline event-handler attributes (onclick=, onload=, ...) — cheap
// defense-in-depth for an HTML file that will be opened in browsers.
sanitized = sanitized.replace(/\s+on[a-z]+\s*=\s*"(?:[^"\\]|\\.)*"/gi, '');
sanitized = sanitized.replace(/\s+on[a-z]+\s*=\s*'(?:[^'\\]|\\.)*'/gi, '');

// Known leak: the logged-in account-menu icon carries data-user-email /
// data-user-name / data-user-agent attributes and an id="user-data" marker
// in the rendered DOM (not inside a <script>, so script removal above
// doesn't touch it).
sanitized = sanitized.replace(/\s+data-user-[a-z]+\s*=\s*"[^"]*"/gi, '');
sanitized = sanitized.replace(/\s+id\s*=\s*"user-data"/gi, '');

const afterSize = Buffer.byteLength(sanitized, 'utf8');

// --- verification: fail loudly rather than commit something unsafe ---
const failures = [];

const ldJsonBlocks = [
  ...sanitized.matchAll(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi
  ),
];
if (ldJsonBlocks.length !== 1) {
  failures.push(
    `expected exactly 1 application/ld+json script, found ${ldJsonBlocks.length}`
  );
} else {
  try {
    const parsed = JSON.parse(ldJsonBlocks[0][1]);
    const graph = Array.isArray(parsed['@graph']) ? parsed['@graph'] : [];
    const apartments = graph.filter(
      (node) =>
        node?.['@type'] === 'Apartment' &&
        typeof node?.geo?.latitude === 'number'
    );
    if (apartments.length < 1) {
      failures.push(
        'ld+json @graph has no Apartment node with a numeric geo.latitude'
      );
    }
  } catch (err) {
    failures.push(`ld+json block does not parse as JSON: ${err.message}`);
  }
}

const cardCount = (sanitized.match(/data-testid="listing-card"/g) ?? [])
  .length;
if (cardCount < 1) {
  failures.push('no data-testid="listing-card" elements remain');
}

const forbiddenPatterns = [
  /@gmail\./i,
  /@yahoo\./i,
  /@hotmail\./i,
  /user_id/i,
  /csrf/i,
  /token=/i,
];
for (const pattern of forbiddenPatterns) {
  if (pattern.test(sanitized)) {
    failures.push(`forbidden pattern still present after sanitizing: ${pattern}`);
  }
}

if (failures.length > 0) {
  console.error('Fixture sanitization verification failed:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, sanitized, 'utf8');

const removedPct = (100 * (1 - afterSize / beforeSize)).toFixed(1);
console.log(`Wrote sanitized fixture to ${path.relative(root, outPath)}`);
console.log(`  before: ${beforeSize.toLocaleString()} bytes`);
console.log(`  after:  ${afterSize.toLocaleString()} bytes`);
console.log(
  `  removed: ${(beforeSize - afterSize).toLocaleString()} bytes (${removedPct}%)`
);
console.log('Verification passed:');
console.log(
  `  - 1 application/ld+json script, parses, has Apartment node(s) with geo.latitude`
);
console.log(`  - ${cardCount} data-testid="listing-card" occurrence(s)`);
console.log(
  '  - no @gmail./@yahoo./@hotmail./user_id/csrf/token= patterns remain'
);

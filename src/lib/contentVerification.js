// Real, mechanical file checks — no AI opinions, no calls to a plagiarism
// API (there's no budget/credentials for one wired up yet, see the comment
// on runVerification below for exactly what that would take). Everything
// in this file is arithmetic on the actual bytes of the uploaded file:
//   1. A SHA-256 hash — the fingerprint. Two files with the same hash are
//      the same file, byte for byte. That's what catches five different
//      sellers uploading the identical Notion-template export.
//   2. Magic-byte sniffing — the first few bytes of a real PDF/ZIP/MP4
//      are fixed, standardized signatures, regardless of what extension
//      or Content-Type the upload claims. A renamed .exe never has them.
//   3. A real PDF page count, read from the file's own internal
//      structure via pdf-lib — not guessed.
//   4. A crude but real check: does the listing's own title/description
//      claim a page count that doesn't match the file. This is pattern
//      matching on digits next to the word "page", not comprehension —
//      it will miss claims phrased differently, and that's an honestly
//      stated limitation, not a hidden one.
const fs = require('fs');
const crypto = require('crypto');
const { PDFDocument } = require('pdf-lib');

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

// Signatures are the first bytes of the file, in hex. ftyp-box MP4/MOV
// detection checks bytes 4-7 rather than 0-3 because the first 4 bytes are
// a box *size* (varies per file), not a signature.
const SIGNATURES = [
  { mime: 'application/pdf', check: buf => buf.slice(0, 4).toString('ascii') === '%PDF' },
  { mime: 'application/zip', check: buf => buf.slice(0, 4).toString('hex') === '504b0304' },
  { mime: 'video/mp4', check: buf => buf.slice(4, 8).toString('ascii') === 'ftyp' },
  { mime: 'image/png', check: buf => buf.slice(0, 8).toString('hex') === '89504e470d0a1a0a' },
  { mime: 'image/jpeg', check: buf => buf.slice(0, 3).toString('hex') === 'ffd8ff' },
  { mime: 'image/gif', check: buf => buf.slice(0, 3).toString('ascii') === 'GIF' },
  { mime: 'image/webp', check: buf => buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP' }
];

// null means "not one of the types we know how to fingerprint" — not an
// error, just not a signature this function checks. Doesn't mean the file
// is fake, only that mismatch detection can't be run on it.
function detectRealType(filePath) {
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(16);
  fs.readSync(fd, buf, 0, 16, 0);
  fs.closeSync(fd);
  const match = SIGNATURES.find(s => s.check(buf));
  return match ? match.mime : null;
}

async function getPdfPageCount(filePath) {
  try {
    const bytes = fs.readFileSync(filePath);
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    return doc.getPageCount();
  } catch {
    // A file that claims to be a PDF (passed the magic-byte check) but
    // fails to actually parse is itself a real finding — surfaced by the
    // caller comparing detectedMime to a null page count, not swallowed here.
    return null;
  }
}

// "20 page template", "20-page", "20 pages" — the handful of phrasings an
// honest listing is likely to actually use. Anything cleverer than that
// (spelled-out numbers, "twenty pages") isn't caught; this is a floor, not
// a ceiling.
function extractClaimedPageCount(text) {
  if (!text) return null;
  const match = text.match(/(\d+)[\s-]?pages?\b/i);
  return match ? parseInt(match[1], 10) : null;
}

// Runs everything that's actually feasible without a paid third-party
// service, and returns a single verdict. Two real checks are deliberately
// NOT here, and shouldn't be faked in their place:
//   - Cross-platform plagiarism/AI-content detection (comparing this file
//     or its text against the wider internet, or running it through an
//     AI-generated-content classifier) needs a real paid API — Copyscape,
//     Originality.ai, GPTZero, or Google's Custom Search API for reverse
//     lookups. None of those are configured; wiring one in is a real,
//     scoped follow-up once there's an account and a key for one.
//   - Multi-file claims ("this course has 10 videos") can't be checked
//     yet because the schema only supports one file per product. That's a
//     bigger, separate feature (multi-file products) than verification
//     itself.
async function runVerification({ filePath, claimedMimeType, title, description }) {
  const hash = sha256File(filePath);
  const detectedMime = detectRealType(filePath);
  const flags = [];

  if (detectedMime && detectedMime !== claimedMimeType) {
    flags.push(`File content doesn't match its claimed type (looks like ${detectedMime}, uploaded as ${claimedMimeType}).`);
  }

  let pageCount = null;
  if (detectedMime === 'application/pdf') {
    pageCount = await getPdfPageCount(filePath);
    if (pageCount === null) {
      flags.push('File has a PDF signature but could not actually be opened as a PDF.');
    } else {
      const claimed = extractClaimedPageCount(`${title || ''} ${description || ''}`);
      if (claimed && Math.abs(claimed - pageCount) / claimed > 0.2) {
        flags.push(`Listing says ${claimed} pages; the file actually has ${pageCount}.`);
      }
    }
  }

  return { hash, detectedMime, pageCount, flags };
}

module.exports = { sha256File, detectRealType, getPdfPageCount, extractClaimedPageCount, runVerification };

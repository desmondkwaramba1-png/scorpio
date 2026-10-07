const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { PDFDocument } = require('pdf-lib');
const { runStreamVerification } = require('../src/lib/contentVerification');

async function main() {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  const pdfBytes = Buffer.from(await pdf.save());
  const smallResult = await runStreamVerification({
    stream: Readable.from([pdfBytes]),
    size: pdfBytes.length,
    claimedMimeType: 'application/pdf',
    title: 'Sample ebook',
    description: ''
  });
  assert.equal(smallResult.detectedMime, 'application/pdf');
  assert.equal(smallResult.pageCount, 1);
  assert.deepEqual(smallResult.flags, []);

  const header = Buffer.from('%PDF-1.7\n');
  const chunk = Buffer.alloc(1024 * 1024);
  const extraChunks = 21;
  const expectedHash = crypto.createHash('sha256').update(header);
  for (let i = 0; i < extraChunks; i += 1) expectedHash.update(chunk);

  async function* largePdfStream() {
    yield header;
    for (let i = 0; i < extraChunks; i += 1) yield chunk;
  }

  const largeResult = await runStreamVerification({
    stream: Readable.from(largePdfStream()),
    claimedMimeType: 'application/pdf',
    title: 'Large ebook',
    description: ''
  });
  assert.equal(largeResult.detectedMime, 'application/pdf');
  assert.equal(largeResult.hash, expectedHash.digest('hex'));
  assert.equal(largeResult.pageCount, null);
  assert.deepEqual(largeResult.flags, []);

  console.log('Streamed content hashing and bounded PDF page verification passed.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

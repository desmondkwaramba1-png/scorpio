// One-off: generate the seed marketplace's cover images + a sample PDF.
// Output goes to client/public/brand/seed/ and is committed, so Vercel
// serves them and no R2 uploads are needed for demo content.
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'client', 'public', 'brand', 'seed');
fs.mkdirSync(OUT, { recursive: true });

// On-brand-adjacent palette pairs (deep base -> lighter accent).
const PALETTES = [
  ['#131921', '#2A3550'], ['#1B1330', '#4B2E6B'], ['#0E2A2A', '#1E6B5E'],
  ['#2A160E', '#8A4712'], ['#12261A', '#2E7D4F'], ['#291018', '#8A2F4A'],
  ['#101A2E', '#2F5DA8'], ['#241A0E', '#B5852E'], ['#0E1F2E', '#2E7DA8'],
  ['#1E1226', '#6B2E9C'], ['#0F2419', '#3E9C5E'], ['#2E1410', '#C25A3A'],
];

const LABELS = ['EBOOK', 'GUIDE', 'TEMPLATE', 'COURSE', 'HANDBOOK', 'PLANNER', 'TOOLKIT', 'CHECKLIST'];

let i = 0;
for (const [a, b] of PALETTES) {
  for (const label of ['', ' ']) { // two variants per palette = 24
    const rot = (i * 37) % 360;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="960" viewBox="0 0 1200 960">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1" gradientTransform="rotate(${rot} .5 .5)">
          <stop offset="0" stop-color="${a}"/>
          <stop offset="1" stop-color="${b}"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="960" fill="url(#g)"/>
      <g transform="translate(880,120) scale(11)" fill="none" stroke="#FFFFFF" stroke-width="4"
         stroke-linecap="round" stroke-linejoin="round" opacity="0.10">
        <path d="M18 44 Q17 30 27 26 Q40 21 40 33 Q40 42 32 42 Q27 42 27 37"/>
      </g>
      <text x="80" y="520" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="800"
        fill="#FFFFFF" opacity="0.16" letter-spacing="6">${LABELS[i % LABELS.length]}</text>
      <rect x="0" y="952" width="1200" height="8" fill="#FF8C42"/>
    </svg>`;
    sharp(Buffer.from(svg)).png({ quality: 80 }).toFile(path.join(OUT, `cover-${i + 1}.png`))
      .then(() => process.stdout.write(`cover-${i + 1} `))
      .catch(e => { console.error(e); process.exit(1); });
    i++;
  }
}

// A small, real sample PDF so a demo purchase actually delivers a file.
const pdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj
4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
5 0 obj<</Length 210>>stream
BT /F1 20 Tf 70 700 Td (SCORPIO - sample download) Tj
/F1 12 Tf 0 -40 Td (This is a demo product used to populate the marketplace at launch.) Tj
0 -18 Td (Real creator products deliver the creator's own file here.) Tj ET
endstream endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000052 00000 n
0000000101 00000 n
0000000229 00000 n
0000000295 00000 n
trailer<</Size 6/Root 1 0 R>>
startxref
556
%%EOF`;
fs.writeFileSync(path.join(OUT, 'sample-guide.pdf'), pdf, 'latin1');
console.log('\nsample-guide.pdf written');

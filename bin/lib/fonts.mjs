import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './paths.mjs';

// The fonts ship in assets/fonts (SIL Open Font License, see the OFL files
// there): Sofia Sans for headings, Geist for text, Geist Mono for small labels.
// Latin and Latin Extended cover English and every European Latin-script language.
const DIR = path.join(ROOT, 'assets', 'fonts');
const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const LATIN_EXT = 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF';
const FACES = [
  ['Sofia Sans Variable', 'sofia-sans', 'normal', '100 900'],
  ['Geist Variable', 'geist', 'normal', '100 900'],
  ['Geist Variable', 'geist', 'italic', '100 900'],
  ['Geist Mono Variable', 'geist-mono', 'normal', '100 900'],
];

// Fonts as data: URLs, so a saved HTML file renders the same anywhere.
export function fontFaceCss() {
  const blocks = [];
  for (const [family, file, style, weight] of FACES) {
    for (const [subset, range] of [['latin-ext', LATIN_EXT], ['latin', LATIN]]) {
      const name = `${file}-${subset}-wght-${style}.woff2`;
      const src = `data:font/woff2;base64,${fs.readFileSync(path.join(DIR, name)).toString('base64')}`;
      blocks.push(`@font-face{font-family:"${family}";font-style:${style};font-weight:${weight};font-display:block;src:url(${src}) format("woff2");unicode-range:${range};}`);
    }
  }
  return blocks.join('\n');
}

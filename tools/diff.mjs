// Compare two images (any format/size). node tools/diff.mjs ref.jpg mine.png [out-diff.png]
// Resizes both to the reference width, crops to common height; prints % differing pixels and writes side-by-side + diff.
import sharp from 'sharp'; import pixelmatch from 'pixelmatch'; import { PNG } from 'pngjs';
const [ref, mine, out = 'docs/shots/diff.png'] = process.argv.slice(2);
const rm = await sharp(ref).metadata(); const w = rm.width;
const rb = await sharp(ref).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const mb = await sharp(mine).resize({ width: w }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const h = Math.min(rb.info.height, mb.info.height);
const A = rb.data.subarray(0, w * h * 4), B = mb.data.subarray(0, w * h * 4);
const d = new PNG({ width: w, height: h });
const n = pixelmatch(A, B, d.data, w, h, { threshold: 0.2 });
const dbuf = PNG.sync.write(d);
await sharp({ create: { width: w * 3, height: h, channels: 4, background: '#000' } }).composite([
  { input: await sharp(A, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer(), left: 0, top: 0 },
  { input: await sharp(B, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer(), left: w, top: 0 },
  { input: dbuf, left: w * 2, top: 0 }]).png().toFile(out);
console.log(`diff ${(100 * n / (w * h)).toFixed(2)}% of pixels (ref ${w}x${rb.info.height}, mine scaled ${w}x${mb.info.height}) -> ${out} [ref | mine | diff]`);

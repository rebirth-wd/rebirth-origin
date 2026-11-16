// Bakes the two flat copies of each dog part that the window effect needs, from the smoke parts' alpha:
//   dog-<part>-matte.webp  alpha kept, RGB pure white, same pixel size (the white matte for the gradient window)
//   dog-<part>-knock.webp  alpha kept, RGB pure black, half the pixel size (the black knockout; it is only a mask
//                          that gets scaled, so half resolution is plenty and saves bytes)
// Lossless so the alpha edge stays crisp. Run from the repo root: node docs/journey/tools/dog-matte.mjs
import sharp from 'sharp';
import { readFileSync, statSync } from 'node:fs';

const dir = 'src/assets/space';
const dog = JSON.parse(readFileSync('src/components/space/dog.json', 'utf8'));

// a flat-colour image of the given size that carries the given alpha plane
async function flat(alpha, w, h, v, out) {
  await sharp({ create: { width: w, height: h, channels: 3, background: { r: v, g: v, b: v } } })
    .joinChannel(alpha, { raw: { width: w, height: h, channels: 1 } })
    .webp({ lossless: true, effort: 6 })
    .toFile(out);
  return statSync(out).size;
}

let total = 0;
for (const p of dog.parts) {
  const src = `${dir}/${p.file}`;
  const { data: alpha, info } = await sharp(src).ensureAlpha().extractChannel('alpha').raw().toBuffer({ resolveWithObject: true });
  const [w, h] = [info.width, info.height];
  const m = `${dir}/dog-${p.name}-matte.webp`;
  const sm = await flat(alpha, w, h, 255, m);
  const [kw, kh] = [Math.round(w / 2), Math.round(h / 2)];
  const half = await sharp(alpha, { raw: { width: w, height: h, channels: 1 } }).resize(kw, kh, { kernel: 'lanczos3' }).raw().toBuffer();
  const k = `${dir}/dog-${p.name}-knock.webp`;
  const sk = await flat(half, kw, kh, 0, k);
  console.log(`${m}  ${w}x${h}  ${sm}`);
  console.log(`${k}  ${kw}x${kh}  ${sk}`);
  total += sm + sk;
}
console.log(`total ${total} bytes (12 files)`);

// Bakes the two flat copies of each dog part and each astronaut part that the keyhole effect needs, from the smoke
// parts' alpha (dog-<part>-*.webp and astronaut-<left|right>-<part>-*.webp):
//   <name>-matte.webp  alpha kept, RGB pure white, same pixel size (the white matte for the gradient window)
//   <name>-knock.webp  alpha kept, RGB pure black, half the pixel size (the black knockout; it is only a mask
//                      that gets scaled, so half resolution is plenty and saves bytes)
// Lossless so the alpha edge stays crisp. Run from the repo root: node docs/journey/tools/mattes.mjs
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

const rig = JSON.parse(readFileSync('src/components/space/rig.json', 'utf8'));
// every smoke part to bake: [file name, base name of the outputs]
const jobs = [
  ...dog.parts.map((p) => [p.file, `dog-${p.name}`]),
  ...['left', 'right'].flatMap((who) => rig[who].parts.map((p) => [p.file, `astronaut-${who}-${p.name}`])),
];

let total = 0;
for (const [file, base] of jobs) {
  const src = `${dir}/${file}`;
  const { data: alpha, info } = await sharp(src).ensureAlpha().extractChannel('alpha').raw().toBuffer({ resolveWithObject: true });
  const [w, h] = [info.width, info.height];
  const m = `${dir}/${base}-matte.webp`;
  const sm = await flat(alpha, w, h, 255, m);
  const [kw, kh] = [Math.round(w / 2), Math.round(h / 2)];
  // extractChannel pins the resized plane to ONE channel: without it sharp hands back three per pixel and the buffer,
  // read as one, comes out as striped rows (see-through knockouts with lines and boxes around every part)
  const { data: half, info: hi } = await sharp(alpha, { raw: { width: w, height: h, channels: 1 } }).resize(kw, kh, { kernel: 'lanczos3' }).extractChannel(0).raw().toBuffer({ resolveWithObject: true });
  if (hi.channels !== 1 || half.length !== kw * kh) throw new Error(`knockout plane of ${src} is not one channel`);
  const k = `${dir}/${base}-knock.webp`;
  const sk = await flat(half, kw, kh, 0, k);
  console.log(`${m}  ${w}x${h}  ${sm}`);
  console.log(`${k}  ${kw}x${kh}  ${sk}`);
  total += sm + sk;
}
console.log(`total ${total} bytes (${jobs.length * 2} files)`);

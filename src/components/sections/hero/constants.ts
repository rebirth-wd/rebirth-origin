// The reference hero is a deep-blue sky video (average ~rgb(15,110,167)).
// images.heroSky is a pale sky (avg #e1e6f9); multiplying it with this tint lands on the reference's blue
// (#e1e6f9 x #1179ad ~= rgb(15,109,168)) while keeping the cloud texture.
export const HERO_SKY_TINT = 'linear-gradient(180deg, #0f72a8 0%, #1179ad 50%, #1a84b8 100%)';
// Used only if images.ts has no heroSky entry.
export const HERO_SKY_FALLBACK_AVG = '#e1e6f9';

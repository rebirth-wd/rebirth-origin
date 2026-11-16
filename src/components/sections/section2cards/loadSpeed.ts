import gsap from 'gsap';
// placeholder loop
export function build(_root: HTMLElement): gsap.core.Timeline {
  return gsap.timeline({ repeat: -1 }).to({}, { duration: 5 });
}

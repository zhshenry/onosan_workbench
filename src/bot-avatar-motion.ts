import { useEffect, type RefObject } from 'react';

// One activity clock for the live rail; static transcript/profile avatars never subscribe.
const nodes = new Set<HTMLElement>(), visible = new WeakSet<HTMLElement>();
const inputs = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'focus'];
let observer: IntersectionObserver | undefined, timer = 0, lastInput = 0, resting = false;
const restMs = 30_000;
function sync(node: HTMLElement) {
  node.dataset.motionPaused = String(document.hidden || !visible.has(node));
  node.dataset.motionResting = String(resting);
}
function checkRest() {
  const remaining = lastInput + restMs - Date.now();
  if (remaining > 0) { timer = window.setTimeout(checkRest, remaining); return; }
  timer = 0; resting = true; nodes.forEach(sync);
}
function touch() {
  lastInput = Date.now();
  if (resting) { resting = false; nodes.forEach(sync); }
  if (!timer) timer = window.setTimeout(checkRest, restMs);
}
function visibility() { if (!document.hidden) touch(); nodes.forEach(sync); }
function watch(node: HTMLElement) {
  if (!nodes.size) {
    resting = false;
    observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const target = entry.target as HTMLElement;
        if (entry.isIntersecting) visible.add(target); else visible.delete(target);
        sync(target);
      }
    });
    inputs.forEach(type => window.addEventListener(type, touch, { capture: true, passive: true }));
    document.addEventListener('visibilitychange', visibility);
    touch();
  }
  nodes.add(node); visible.add(node); observer!.observe(node); sync(node);
  return () => {
    nodes.delete(node); visible.delete(node); observer?.unobserve(node);
    if (!nodes.size) {
      observer?.disconnect(); observer = undefined;
      window.clearTimeout(timer); timer = 0;
      inputs.forEach(type => window.removeEventListener(type, touch, true));
      document.removeEventListener('visibilitychange', visibility);
    }
  };
}

export function useBotAvatarMotion(ref: RefObject<HTMLSpanElement | null>, live: boolean) {
  useEffect(() => {
    const node = ref.current;
    if (!live || !node) return;
    const unwatch = watch(node), button = node.closest('button');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let hoverTimer = 0, pokeTimer = 0;
    const interactive = () => !reduced.matches && node.dataset.motionPaused !== 'true' && ['idle', 'queued'].includes(node.dataset.state ?? '');
    const reset = () => {
      window.clearTimeout(hoverTimer);
      delete node.dataset.hover;
    };
    const hover = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || !interactive()) return;
      reset();
      node.dataset.hover = 'true';
      hoverTimer = window.setTimeout(reset, 600);
    };
    const poke = () => {
      if (!interactive()) return;
      reset();
      node.dataset.poked = 'true';
      window.clearTimeout(pokeTimer);
      pokeTimer = window.setTimeout(() => { delete node.dataset.poked; }, 480);
    };
    const reduce = () => { reset(); delete node.dataset.poked; };
    button?.addEventListener('pointerenter', hover);
    button?.addEventListener('pointerleave', reset);
    button?.addEventListener('click', poke);
    reduced.addEventListener('change', reduce);
    return () => {
      unwatch(); reset(); window.clearTimeout(pokeTimer);
      button?.removeEventListener('pointerenter', hover);
      button?.removeEventListener('pointerleave', reset);
      button?.removeEventListener('click', poke);
      reduced.removeEventListener('change', reduce);
      delete node.dataset.poked; delete node.dataset.motionPaused; delete node.dataset.motionResting;
    };
  }, [ref, live]);
}

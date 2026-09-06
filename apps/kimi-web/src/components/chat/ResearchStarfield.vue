<script setup lang="ts">
// Static, deterministic decoration: no timers, canvas, network or animation.
const stars = Array.from({ length: 48 }, (_, i) => ({
  left: `${(i * 37 + 7) % 101}%`, top: `${(i * 53 + 11) % 97}%`,
}));
</script>
<template>
  <div class="research-starfield" aria-hidden="true">
    <i v-for="(star, index) in stars" :key="index" class="research-star" :style="star" />
    <div class="research-orbit research-orbit-outer" />
    <div class="research-orbit research-orbit-inner" />
    <div class="research-orbit-axis" />
    <div class="research-limb">
      <i v-for="width in [18, 42, 68, 88]" :key="width" class="limb-meridian" :style="{ width: `${width}%` }" />
      <i v-for="height in [16, 38, 62, 84]" :key="height" class="limb-parallel" :style="{ height: `${height}%` }" />
      <i class="limb-equator" />
    </div>
    <div class="research-limb-orbit" />
    <div class="research-bearing research-bearing-left">
      <i v-for="tick in 17" :key="tick" />
    </div>
    <div class="research-bearing research-bearing-top">
      <i v-for="tick in 25" :key="tick" />
    </div>
    <div class="research-crosshair research-crosshair-a" />
    <div class="research-crosshair research-crosshair-b" />
    <div class="research-field-caption">HAKIMI / DEEP FIELD</div>
  </div>
</template>
<style scoped>
.research-starfield { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.research-star { position: absolute; width: 2px; height: 2px; border-radius: var(--radius-full); background: var(--color-text-muted); opacity: 0.3; }
.research-star:nth-child(4n) { width: 3px; height: 3px; opacity: 0.5; }
.research-orbit { position: absolute; width: 800px; height: 800px; border: 1px solid var(--color-line); border-radius: var(--radius-full); right: -400px; top: -280px; opacity: 0.6; }
.research-orbit-inner { width: 620px; height: 620px; right: -310px; top: -190px; }
.research-orbit-axis { position: absolute; top: 120px; right: 0; width: 380px; border-top: 1px solid var(--color-line); transform: rotate(-32deg); transform-origin: right; opacity: 0.6; }
.research-limb { position: absolute; width: 600px; height: 600px; left: -290px; bottom: -200px; border: 1px solid var(--color-accent-bd); border-radius: var(--radius-full); transform: rotate(-24deg); opacity: 0.38; overflow: hidden; }
.limb-meridian, .limb-parallel { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); border: 1px solid var(--color-accent-bd); border-radius: var(--radius-full); }
.limb-meridian { height: 100%; }
.limb-parallel { width: 100%; }
.limb-equator { position: absolute; top: 50%; width: 100%; border-top: 1px solid var(--color-accent-bd); }
.research-limb-orbit { position: absolute; width: 870px; height: 300px; bottom: -40px; left: -385px; border: 1px solid var(--color-accent-bd); border-radius: var(--radius-full); transform: rotate(-24deg); opacity: 0.38; }
.research-bearing { position: absolute; display: flex; justify-content: space-between; opacity: 0.5; }
.research-bearing i { display: block; background: var(--color-accent-bd); }
.research-bearing-left { left: var(--space-4); top: 18%; height: 230px; flex-direction: column; }
.research-bearing-left i { width: 4px; height: 1px; }
.research-bearing-left i:nth-child(4n + 1) { width: 10px; }
.research-bearing-top { left: var(--space-6); top: var(--space-4); width: 300px; }
.research-bearing-top i { height: 4px; width: 1px; }
.research-bearing-top i:nth-child(4n + 1) { height: 10px; }
.research-crosshair { position: absolute; width: 12px; height: 12px; color: var(--color-accent-bd); }
.research-crosshair::before { content: ''; position: absolute; left: 0; top: 5px; width: 100%; border-top: 1px solid currentColor; }
.research-crosshair::after { content: ''; position: absolute; top: 0; left: 5px; height: 100%; border-left: 1px solid currentColor; }
.research-crosshair-a { top: 23%; left: 12%; }
.research-crosshair-b { bottom: 25%; right: 13%; }
.research-field-caption { position: absolute; top: var(--space-8); left: var(--space-6); color: var(--color-accent-bd); font-family: var(--font-mono); font-size: var(--text-xs); letter-spacing: 0.14em; }
@media (max-width: 640px) {
  .research-limb { left: -460px; bottom: -240px; }
  .research-limb-orbit { left: -630px; }
  .research-bearing-top, .research-field-caption { display: none; }
}
</style>

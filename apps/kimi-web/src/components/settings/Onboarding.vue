<!-- apps/kimi-web/src/components/settings/Onboarding.vue -->
<!-- First-run onboarding overlay: a short welcome + the language, color scheme
     and accent preferences, all of which apply live. Re-openable from the
     settings popover. Each preference can be changed any time later, so there's
     nothing to "lose". -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { availableLocales, setLocale, type LocaleCode } from '../../i18n';
import { useAppearance, type Accent, type ColorScheme } from '../../composables/client/useAppearance';
import Button from '../ui/Button.vue';
import Dialog from '../ui/Dialog.vue';
import SegmentedControl from '../ui/SegmentedControl.vue';

const emit = defineEmits<{ complete: []; skip: [] }>();

const { t, locale } = useI18n();
const { colorScheme, accent, setColorScheme, setAccent } = useAppearance();

function chooseLocale(code: LocaleCode): void {
  if (locale.value !== code) setLocale(code);
}

function finish(): void {
  emit('complete');
}
</script>

<template>
  <Dialog
    :open="true"
    size="md"
    :close-on-overlay="false"
    :close-on-esc="false"
    @close="emit('skip')"
  >
    <template #head>
      <div class="ob-brand">
        <svg class="ob-logo" viewBox="0 0 32 22" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Hakimi">
          <defs>
            <mask id="obKimiEyes" maskUnits="userSpaceOnUse">
              <rect x="0" y="0" width="32" height="22" fill="#fff" />
              <g class="ob-eyes" fill="#000">
                <path class="ob-eye" d="M13.2 7.5C14.6 9.1 14.8 13.7 13.2 16.5C11.6 13.7 11.8 9.1 13.2 7.5Z" />
                <path class="ob-eye" d="M18.8 7.5C20.2 9.1 20.4 13.7 18.8 16.5C17.2 13.7 17.4 9.1 18.8 7.5Z" />
              </g>
            </mask>
          </defs>
          <path d="M2 8L4 2L10 5C12 4 20 4 22 5L28 2L30 8V15C30 19 26 21 16 21C6 21 2 19 2 15V8Z" fill="var(--color-accent)" mask="url(#obKimiEyes)" />
        </svg>
        <div class="ob-brand-text">
          <div class="ob-title">{{ t('onboarding.title') }}</div>
          <div class="ob-sub">{{ t('onboarding.subtitle') }}</div>
        </div>
      </div>
    </template>

    <section class="ob-sec">
      <div class="ob-label">{{ t('onboarding.languageLabel') }}</div>
      <SegmentedControl
        :model-value="locale"
        :options="availableLocales.map((l) => ({ value: l.code, label: l.label }))"
        @update:model-value="chooseLocale($event as LocaleCode)"
      />
    </section>

    <section class="ob-sec">
      <div class="ob-label">{{ t('theme.colorSchemeLabel') }}</div>
      <SegmentedControl
        :model-value="colorScheme"
        :options="[
          { value: 'light', label: t('theme.light') },
          { value: 'dark', label: t('theme.dark') },
          { value: 'system', label: t('theme.system') },
        ]"
        @update:model-value="setColorScheme($event as ColorScheme)"
      />
    </section>

    <section class="ob-sec">
      <div class="ob-label">{{ t('theme.accentLabel') }}</div>
      <SegmentedControl
        :model-value="accent"
        :options="[
          { value: 'blue', label: t('theme.accentBlue') },
          { value: 'mono', label: t('theme.accentBlack') },
        ]"
        @update:model-value="setAccent($event as Accent)"
      />
    </section>

    <Button variant="primary" size="lg" class="ob-start" @click="finish">{{ t('onboarding.start') }}</Button>
  </Dialog>
</template>

<style scoped>
.ob-brand {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}
.ob-brand-text { min-width: 0; }
.ob-logo {
  width: 52px; height: 36px; flex: none;
}
.ob-title { color: var(--color-text); font-size: var(--text-xl); font-weight: var(--weight-medium); }
.ob-sub { color: var(--color-text-muted); font-size: var(--text-base); margin-top: 1px; }

.ob-sec { margin-bottom: var(--space-4); }
.ob-label { color: var(--color-text); font-size: var(--text-sm); font-weight: var(--weight-medium); margin-bottom: var(--space-2); }

/* full-width primary CTA */
.ob-start { width: 100%; }

/* Onboarding logo: faster eye animations than the sidebar (6s look, 4s blink). */
.ob-eyes {
  animation: ob-eye-look 6s ease-in-out infinite;
}
.ob-eye {
  transform-box: fill-box;
  transform-origin: center;
  animation: ob-eye-blink 4s ease-in-out infinite;
}
@keyframes ob-eye-look {
  0%, 42% { transform: translateX(0); }
  47%, 53% { transform: translateX(2px); }
  58%, 80% { transform: translateX(0); }
  84%, 90% { transform: translateX(-2px); }
  95%, 100% { transform: translateX(0); }
}
@keyframes ob-eye-blink {
  0%, 94%, 100% { transform: scaleY(1); }
  96.5%, 98% { transform: scaleY(0.12); }
}
@media (prefers-reduced-motion: reduce) {
  .ob-eyes, .ob-eye { animation: none; }
}
</style>

<script setup lang="ts">
import logoUrl from '../HakimiLogo.svg'

withDefaults(defineProps<{ size?: number }>(), { size: 56 })
</script>

<template>
  <img
    class="KimiLogo"
    :src="logoUrl"
    :width="size"
    :height="size"
    alt="Hakimi"
  />
</template>

<style scoped>
.KimiLogo {
  display: block;
  object-fit: contain;
}
</style>

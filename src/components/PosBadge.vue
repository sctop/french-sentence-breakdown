<script setup lang="ts">
import { computed } from 'vue'
import { POS_GROUPS, POS_LABELS, type PosTag } from '@/lib/pos'

const props = defineProps<{ pos: PosTag }>()

const group = computed(() => POS_GROUPS[props.pos])
const label = computed(() => POS_LABELS[props.pos])
</script>

<template>
  <span class="pos-badge" :data-group="group" :title="`${pos} · ${label}`">
    <span aria-hidden="true">{{ pos }}</span>
    <span class="visually-hidden">{{ label }}</span>
  </span>
</template>

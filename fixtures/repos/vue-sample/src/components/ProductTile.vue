<!-- Seeded barriers: image without alt, clickable <div>, input without a label, autofocus. -->
<template>
  <article class="product-tile">
    <img :src="image" class="product-tile__image">
    <div class="product-tile__open" @click="$emit('open')">View details</div>
    <input type="number" class="product-tile__qty" autofocus>
  </article>
</template>

<script setup lang="ts">
defineProps<{ image: string }>();
defineEmits<{ open: [] }>();
</script>

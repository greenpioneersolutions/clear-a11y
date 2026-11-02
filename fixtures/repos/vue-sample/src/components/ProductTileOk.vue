<!-- Correct pattern: alt text, a real button and a labelled input. Must produce no findings. -->
<template>
  <article class="product-tile">
    <img :src="image" :alt="name" class="product-tile__image">
    <button type="button" class="product-tile__open" @click="$emit('open')">View details</button>
    <label for="qty">Quantity</label>
    <input id="qty" type="number" class="product-tile__qty">
  </article>
</template>

<script setup lang="ts">
defineProps<{ image: string; name: string }>();
defineEmits<{ open: [] }>();
</script>

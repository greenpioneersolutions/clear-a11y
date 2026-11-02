<!-- Correct pattern: the app shell has no barriers. -->
<template>
  <main>
    <h1>Sample shop</h1>
    <ProductTile image="/shoe.png" @open="open" />
  </main>
</template>

<script setup lang="ts">
import ProductTile from './components/ProductTile.vue';
const open = () => undefined;
</script>

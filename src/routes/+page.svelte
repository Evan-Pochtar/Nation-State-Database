<script lang="ts">
	import Map from '$lib/Map.svelte';
</script>

<main class="h-screen w-screen">
	<Map />
</main>

<style global>
	:root {
		color-scheme: light;
	}
	:global(body) {
		background: #000;
		color: #fff;
	}
</style>

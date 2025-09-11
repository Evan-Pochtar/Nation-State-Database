<script lang="ts">
	import Map from '$lib/Map.svelte';
	import Clock from '$lib/Clock.svelte';
</script>

<main class="h-screen w-screen">
	<Map />
	<Clock />
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

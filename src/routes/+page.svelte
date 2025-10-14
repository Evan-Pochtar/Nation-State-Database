<script lang="ts">
	import Map from '$lib/Map.svelte';
	import Clock from '$lib/Clock.svelte';
</script>

<main class="h-screen w-screen">
	<Map />
	<Clock />
	<div
		class="absolute bottom-5 left-5 z-50 rounded-md border border-white/10 bg-gradient-to-br from-gray-900/80 to-black/90 px-3 py-2 text-xs text-white/60 backdrop-blur-[10px]"
	>
		Click on any country to zoom in and view details
	</div>
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

<script lang="ts">
	import '../app.css';
	import Clock from '$lib/Clock.svelte';

	let { children } = $props();
</script>

<svelte:head></svelte:head>
<main class="h-screen w-screen">
	{@render children?.()}
	<Clock />
</main>

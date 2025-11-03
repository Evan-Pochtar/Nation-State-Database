<script lang="ts">
	let {
		message = 'Loading data...',
		submessage = ''
	}: {
		message?: string;
		submessage?: string;
	} = $props();
</script>

<div class="glass-panel-info relative overflow-hidden p-8">
	<div class="loading-grid-background"></div>

	<div class="relative z-10 flex flex-col items-center justify-center py-12">
		<div class="relative">
			<div class="animate-spin-slow h-22 w-22 rounded-full border-2 border-cyan-400/30"></div>
			<div
				class="absolute top-1/2 left-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-cyan-500/20"
			>
				<div class="loading-spinner"></div>
			</div>
		</div>

		<div class="mt-3 text-center">
			<div class="mb-1 animate-pulse font-mono text-sm text-cyan-300">{message}</div>
			{#if submessage}
				<div class="text-xs text-cyan-400/60">{submessage}</div>
			{/if}
		</div>

		<div class="animate-bounce-slow absolute -top-4 -left-4 font-mono text-xs text-cyan-400/30">$LOADING</div>
		<div class="animate-bounce-slow absolute -right-4 -bottom-4 font-mono text-xs text-emerald-400/30">> API V2.1</div>
	</div>
</div>

<script lang="ts">
	let {
		label,
		value,
		year,
		width = 'w-[calc(50%-0.375rem)]'
	}: {
		label: string;
		value: string;
		year?: string | number;
		width?: string;
	} = $props();
</script>

<div class="{width} stat-card">
	<div class="mb-1 flex items-center gap-2">
		<span class="text-xs font-medium text-white/80">{label}</span>
	</div>
	<div class="text-sm font-bold text-white">
		{value}
	</div>
	{#if year}
		<div class="text-xs text-white/50">
			{year}
		</div>
	{/if}
</div>

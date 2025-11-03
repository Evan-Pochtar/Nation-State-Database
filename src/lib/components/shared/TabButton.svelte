<script lang="ts">
	let {
		active = false,
		onclick,
		children,
		ariaLabel
	}: {
		active?: boolean;
		onclick?: () => void;
		children: any;
		ariaLabel?: string;
	} = $props();
</script>

<button
	{onclick}
	role="tab"
	aria-selected={active}
	aria-label={ariaLabel}
	class="tab-button"
	class:tab-button-active={active}
>
	{@render children?.()}
</button>

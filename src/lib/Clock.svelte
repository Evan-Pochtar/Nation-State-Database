<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';

	let now = new Date(),
		clockTimer: number;
	const CLOCK_TICK = 50;

	onMount(() => {
		clockTimer = window.setInterval(() => (now = new Date()), CLOCK_TICK);
	});

	onDestroy(() => {
		clearInterval(clockTimer);
	});

	function getOffsetString(d: Date) {
		const off = -d.getTimezoneOffset();
		const sign = off >= 0 ? '+' : '-';
		const abs = Math.abs(off);
		const hh = String(Math.floor(abs / 60)).padStart(2, '0');
		const mm = String(abs % 60).padStart(2, '0');
		return `${sign}${hh}:${mm}`;
	}

	function formatClock(d: Date) {
		const pad2 = (n: number) => String(n).padStart(2, '0');
		const pad3 = (n: number) => String(n).padStart(3, '0');
		const Y = d.getFullYear();
		const M = pad2(d.getMonth() + 1);
		const D = pad2(d.getDate());
		const hh = pad2(d.getHours());
		const mm = pad2(d.getMinutes());
		const ss = pad2(d.getSeconds());
		const ms = pad3(d.getMilliseconds());
		return `${Y}-${M}-${D} ${hh}:${mm}:${ss}.${ms} UTC${getOffsetString(d)}`;
	}
</script>

<div
	class="absolute top-5 right-5 z-50 rounded-lg border border-[rgba(255,255,255,0.2)] bg-[linear-gradient(135deg,rgba(16,16,16,0.9),rgba(8,8,8,0.95))] px-4 py-3 font-mono text-[14px] text-white shadow-[0_0_30px_rgba(255,255,255,0.1)] backdrop-blur-[15px] select-none"
	aria-hidden="false"
>
	{formatClock(now)}
</div>

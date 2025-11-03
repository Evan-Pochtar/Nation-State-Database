export const LAYOUT = {
	MIN_LEFT_WIDTH: 450,
	MAX_LEFT_WIDTH: 900,
	COMPACT_THRESHOLD: 700,
	HANDLE_WIDTH: 6,
	MIN_PCT: 0.2,
	MAX_PCT: 0.75
} as const;

export const TRANSITIONS = {
	FAST: 100,
	NORMAL: 150,
	MEDIUM: 300,
	SLOW: 600
} as const;

export const TIMEOUTS = {
	API_REQUEST: 3000,
	COPY_LINK_SUCCESS: 2000
} as const;

export const ANIMATION_DELAYS = {
	ZOOM: 250,
	RESET_ZOOM: 350
} as const;

import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'static', 'data');
const DATA_FILE = path.join(DATA_DIR, 'countries-data.json');

async function ensureDir(dir: string) {
	try {
		await fs.mkdir(dir, { recursive: true });
	} catch (e) {}
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { name, summary } = body ?? {};

		if (!name || typeof name !== 'string') {
			return json({ error: 'missing name' }, { status: 400 });
		}

		await ensureDir(DATA_DIR);

		let fileJson: any = [];
		try {
			const raw = await fs.readFile(DATA_FILE, 'utf8');
			fileJson = JSON.parse(raw);
		} catch (e) {
			fileJson = [];
		}

		if (!Array.isArray(fileJson)) {
			fileJson = Object.values(fileJson);
		}

		const idx = fileJson.findIndex(
			(e: any) => e.name === name || e.name === name || e.title === name || e.country === name
		);

		const now = new Date().toISOString();
		if (idx >= 0) {
			fileJson[idx] = {
				...fileJson[idx],
				name: fileJson[idx].name ?? name,
				summary:
					summary ??
					fileJson[idx].summary ??
					fileJson[idx].short ??
					fileJson[idx].description ??
					null,
				updatedAt: now
			};
		} else {
			fileJson.push({
				name: name,
				summary: summary ?? null,
				createdAt: now,
				updatedAt: now
			});
		}

		await fs.writeFile(DATA_FILE, JSON.stringify(fileJson, null, 2), 'utf8');

		return json({ ok: true }, { status: 200 });
	} catch (err: any) {
		console.error('api/countries error', err);
		return json({ error: String(err) }, { status: 500 });
	}
};

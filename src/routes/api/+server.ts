import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.join(process.cwd(), 'static', 'data');
const DATA_FILE = path.join(DATA_DIR, 'countries-data.json');

async function ensureDir(dir: string) {
	try {
		await fs.mkdir(dir, { recursive: true });
	} catch {}
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const {
			name,
			summary,
			cca2ID,
			officialName,
			flag,
			coatOfArms,
			independent,
			region,
			subregion,
			area,
			languages,
			capital,
			population,
			gini,
			gdp
		} = body ?? {};

		if (!name || typeof name !== 'string') {
			return json({ error: 'missing name' }, { status: 400 });
		}

		await ensureDir(DATA_DIR);

		let fileJson: any = [];
		try {
			const raw = await fs.readFile(DATA_FILE, 'utf8');
			fileJson = JSON.parse(raw);
		} catch {
			fileJson = [];
		}

		if (!Array.isArray(fileJson)) fileJson = Object.values(fileJson);

		const idx = fileJson.findIndex((e: any) => e.name === name);
		const now = new Date().toISOString();

		const base = {
			name,
			cca2ID: cca2ID ?? null,
			officialName: officialName ?? null,
			flag: flag ?? null,
			coatOfArms: coatOfArms ?? null,
			independent: independent ?? null,
			region: region ?? null,
			subregion: subregion ?? null,
			area: area ?? null,
			languages: languages ?? null,
			capital: capital ?? null,
			population: population ?? null,
			gini: gini ?? null,
			gdp: gdp ?? null,
			summary: summary ?? null
		};

		if (idx >= 0) {
			fileJson[idx] = { ...fileJson[idx], ...base, updatedAt: now };
		} else {
			fileJson.push({ ...base, createdAt: now, updatedAt: now });
		}

		await fs.writeFile(DATA_FILE, JSON.stringify(fileJson, null, 2), 'utf8');
		return json({ ok: true }, { status: 200 });
	} catch (err: any) {
		console.error('api/countries error', err);
		return json({ error: String(err) }, { status: 500 });
	}
};

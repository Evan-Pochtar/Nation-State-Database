import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.join(process.cwd(), 'static', 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'countries-history.json');

async function ensureDir(dir: string) {
	try {
		await fs.mkdir(dir, { recursive: true });
	} catch (err) {
		console.error('Failed to create directory for history JSON', err);
	}
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const name = body?.name;

		if (!name || typeof name !== 'string') {
			return json({ error: 'missing name' }, { status: 400 });
		}

		await ensureDir(DATA_DIR);

		let fileJson: any = [];
		try {
			const raw = await fs.readFile(HISTORY_FILE, 'utf8');
			fileJson = JSON.parse(raw);
		} catch {
			fileJson = [];
		}

		if (!Array.isArray(fileJson)) fileJson = Object.values(fileJson);

		const idx = fileJson.findIndex((e: any) => e.name === name);
		const now = new Date().toISOString();

		const allowedFields = [
			'overview',
			'source',
			'keyFacts',
			'ancient',
			'colonial',
			'independence',
			'modern',
			'timeline',
			'sources'
		];

		const updateFields: Record<string, any> = {};
		for (const key of allowedFields) {
			if (Object.prototype.hasOwnProperty.call(body, key)) {
				if (key === 'sources' && idx >= 0 && fileJson[idx]?.sources && typeof fileJson[idx].sources === 'object') {
					updateFields.sources = { ...fileJson[idx].sources, ...(body.sources ?? {}) };
				} else {
					updateFields[key] = body[key];
				}
			}
		}

		if (idx >= 0) {
			fileJson[idx] = { ...fileJson[idx], ...updateFields, updatedAt: now };
		} else {
			const newEntry = { name, ...updateFields, createdAt: now, updatedAt: now };
			fileJson.push(newEntry);
		}

		await fs.writeFile(HISTORY_FILE, JSON.stringify(fileJson, null, 2), 'utf8');
		return json({ ok: true }, { status: 200 });
	} catch (err: any) {
		console.error('api/history error', err);
		return json({ error: String(err) }, { status: 500 });
	}
};

export const GET: RequestHandler = async () => {
	try {
		const raw = await fs.readFile(HISTORY_FILE, 'utf8');
		const data = JSON.parse(raw);
		return json(data, { status: 200 });
	} catch (err) {
		return json({ error: 'History data not found: ' + err }, { status: 404 });
	}
};

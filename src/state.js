import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './util.js';

const STATE_DIR = path.join(ROOT, 'state');
const POSTED_FILE = path.join(STATE_DIR, 'posted.json');
const DRAFT_FILE = path.join(STATE_DIR, 'draft.json');

const MAX_POSTED = 600;

function ensureDir() {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function loadPosted() {
  const data = readJson(POSTED_FILE, { keys: [], entries: [] });
  return {
    set: new Set(data.keys || []),
    entries: data.entries || [],
  };
}

export function addPosted(key, meta) {
  ensureDir();
  const data = readJson(POSTED_FILE, { keys: [], entries: [] });
  data.keys = [key, ...(data.keys || []).filter((k) => k !== key)].slice(0, MAX_POSTED);
  data.entries = [
    { key, ...meta },
    ...(data.entries || []).filter((e) => e.key !== key),
  ].slice(0, 120);
  fs.writeFileSync(POSTED_FILE, JSON.stringify(data, null, 2), 'utf8');
}

export function saveDraft(draft) {
  ensureDir();
  fs.writeFileSync(DRAFT_FILE, JSON.stringify(draft, null, 2), 'utf8');
}

export function loadDraft() {
  return readJson(DRAFT_FILE, null);
}

export function markDraftHandled(status) {
  const draft = loadDraft();
  if (!draft) return;
  draft.status = status;
  draft.handledAt = new Date().toISOString();
  saveDraft(draft);
}

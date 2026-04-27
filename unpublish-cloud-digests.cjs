// Unpublish (or delete) specific cloud digests by date.
//
// Usage:
//   node unpublish-cloud-digests.cjs 2026-03-21 2026-04-25       # hide from public profile (PATCH isPublished=false)
//   node unpublish-cloud-digests.cjs --delete 2026-03-21 2026-04-25  # remove entirely (DELETE)

const fs = require('fs');
const path = require('path');
const os = require('os');

const config = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.worktale', 'config.json'), 'utf8'));
const TOKEN = config.cloudToken;
const API_URL = config.cloudApiUrl || 'https://api.worktale.dev';

const args = process.argv.slice(2);
const doDelete = args.includes('--delete');
const dates = args.filter((a) => !a.startsWith('--'));

if (dates.length === 0) {
  console.error('Pass one or more YYYY-MM-DD dates.');
  process.exit(1);
}

async function api(p, opts = {}) {
  const res = await fetch(`${API_URL}${p}`, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${opts.method || 'GET'} ${p} -> ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

(async () => {
  const all = await api('/api/v1/digests?page=1&pageSize=500');
  const byDate = new Map((all.data || []).map((d) => [d.date, d]));

  for (const date of dates) {
    const d = byDate.get(date);
    if (!d) {
      console.log(`  ✗ ${date}  not found`);
      continue;
    }
    if (doDelete) {
      try {
        await api(`/api/v1/digests/${d.id}`, { method: 'DELETE' });
        console.log(`  ✓ ${date}  deleted (${d.id.slice(0, 8)})`);
      } catch (err) {
        console.log(`  ✗ ${date}  delete failed: ${err.message}`);
      }
    } else {
      try {
        await api(`/api/v1/digests/${d.id}`, { method: 'PATCH', body: { isPublished: false } });
        console.log(`  ✓ ${date}  unpublished (${d.id.slice(0, 8)})`);
      } catch (err) {
        console.log(`  ✗ ${date}  unpublish failed: ${err.message}`);
      }
    }
  }
})().catch((err) => { console.error('Fatal:', err); process.exit(1); });

// Prova: durante tante scritture lente, l'app non deve mai ricevere una lettura che non contiene un documento già salvato.
const fs = require('fs'), vm = require('vm');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const db = new Map(); const listeners = [];
const client = {
  auth: { getSession: async () => ({ data: { session: { user: { id: 'u1', email: 'x@y.z' } } } }) },
  from: () => ({
    select: async () => { const snap = [...db.entries()].map(([id, data]) => ({ id, data })); await sleep(250); return { data: snap, error: null }; },
    upsert: async (row) => { await sleep(300 + Math.random() * 400); db.set(row.id, row.data); listeners.forEach(f => f()); return { error: null }; },
    delete: () => ({ eq: async (k, id) => { await sleep(50); db.delete(id); listeners.forEach(f => f()); return { error: null }; } }),
  }),
  channel: () => { const ch = { on: (a, b, f) => { listeners.push(f); return ch; }, subscribe: () => ch }; return ch; },
  removeChannel: () => {},
};
const doc = { addEventListener() {}, removeEventListener() {}, visibilityState: 'visible' };
const ctx = { window: { FP_CONFIG: { url: 'x', anonKey: 'y' }, supabase: { createClient: () => client } }, document: doc, setTimeout, clearTimeout, Math, console };
vm.createContext(ctx); vm.runInContext(fs.readFileSync(process.argv[2], 'utf8'), ctx);
(async () => {
  const api = await ctx.window.claude.use('db'); const col = api.collection('x');
  const saved = new Set(); let bad = 0, snaps = 0;
  col.onSnapshot(s => { snaps++; const ids = new Set(s.docs.map(d => d.id)); for (const id of saved) if (!ids.has(id)) bad++; });
  let q = Promise.resolve();
  for (let i = 1; i <= 12; i++) { const id = 'm-2026-' + String(i).padStart(2, '0'); q = q.then(() => col.doc(id).set({ items: [i] })).then(() => saved.add(id)); }
  await q; await sleep(2500);
  console.log(JSON.stringify({ letture: snaps, letture_sbagliate: bad }));
})();

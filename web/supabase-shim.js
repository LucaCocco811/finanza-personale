// Ponte tra l'app e Supabase.
// L'app usa window.claude.use('db') e window.claude.use('user') con la stessa interfaccia di prima
// (collection(...).get(), doc(id).set(), doc(id).delete(), onSnapshot), così il resto del codice non cambia.
// Le funzioni "con Claude" (sample, mcp, downloads) qui non esistono: l'app le nasconde da sola.
(function () {
  const cfg = window.FP_CONFIG || {};
  if (!window.supabase || !cfg.url || !cfg.anonKey) return;
  const sb = window.supabase.createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  window.FP_SB = sb;

  async function currentUser() {
    const { data } = await sb.auth.getSession();
    return data && data.session ? data.session.user : null;
  }

  const snapOf = rows => ({
    docs: rows.map(r => ({ id: r.id, data: () => r.data })),
    metadata: { fromCache: false, hasPendingWrites: false },
  });

  function collection(/* percorso ignorato: ogni utente vede solo i suoi documenti */) {
    return {
      async get() {
        const { data, error } = await sb.from('docs').select('id,data');
        if (error) throw error;
        return snapOf(data || []);
      },
      doc(id) {
        return {
          async set(data) {
            const u = await currentUser(); if (!u) throw new Error('non connesso');
            const { error } = await sb.from('docs').upsert({ user_id: u.id, id, data }, { onConflict: 'user_id,id' });
            if (error) throw error;
          },
          async delete() {
            const { error } = await sb.from('docs').delete().eq('id', id);
            if (error) throw error;
          },
        };
      },
      onSnapshot(cb, onErr) {
        let timer = null, stopped = false;
        // a ogni modifica rileggo tutto (pochi documenti per utente), raggruppando le modifiche ravvicinate
        const reload = () => { clearTimeout(timer); timer = setTimeout(async () => {
          if (stopped) return;
          try { cb(await this.get()); } catch (e) { onErr && onErr(e); }
        }, 400); };
        const ch = sb.channel('docs-' + Math.random().toString(36).slice(2))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, reload)
          .subscribe(status => { if (status === 'CHANNEL_ERROR' && onErr) onErr(new Error('realtime')); });
        // quando si torna sull'app dopo un po' rileggo comunque
        const vis = () => { if (document.visibilityState === 'visible') reload(); };
        document.addEventListener('visibilitychange', vis);
        return () => { stopped = true; clearTimeout(timer); sb.removeChannel(ch); document.removeEventListener('visibilitychange', vis); };
      },
    };
  }

  window.claude = {
    async use(name) {
      if (name === 'db') return (await currentUser()) ? { collection } : null;
      if (name === 'user') { const u = await currentUser(); return u ? { id: async () => u.id, email: u.email } : null; }
      if (name === 'downloads') return { async save({ filename, data }) {
        const blob = data instanceof Blob ? data : new Blob([data]);
        const url = URL.createObjectURL(blob); const a = document.createElement('a');
        a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      } };
      return null; // sample, mcp: non disponibili fuori da Claude
    },
  };
})();

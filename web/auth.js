// Accesso con email e password (funziona anche nell'app installata sull'iPhone e non ha bisogno di email).
(function () {
  const sb = window.FP_SB;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const okMail = m => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m);

  function errText(e) {
    const m = (e && e.message) || '';
    if (/invalid login credentials/i.test(m)) return 'Email o password sbagliate.';
    if (/already registered|already exists/i.test(m)) return 'Esiste già un account con questa email: usa "Entra".';
    if (/email not confirmed/i.test(m)) return 'Prima devi confermare l\'email: cerca il messaggio di Supabase nella posta.';
    if (/password should be|weak/i.test(m)) return 'Scegli una password più robusta (almeno 8 caratteri).';
    if (/rate|limit|too many/i.test(m)) return 'Troppi tentativi in poco tempo: riprova tra qualche minuto.';
    if (/not authorized/i.test(m)) return 'Per ora non posso mandare email a questo indirizzo.';
    return 'Qualcosa non va: ' + m;
  }

  function gate(initialMode) {
    return new Promise(resolve => {
      const box = document.createElement('div');
      box.className = 'authgate';
      document.body.appendChild(box);
      let mode = initialMode || 'in'; // in = entra, up = crea account, reset = password dimenticata, newpw = nuova password
      let email = '', busy = false, msg = '', ok = '';
      const draw = () => {
        const title = { in: 'Entra', up: 'Crea il tuo account', reset: 'Password dimenticata', newpw: 'Nuova password' }[mode];
        const lead = {
          in: 'Entra con la tua email e la tua password.',
          up: 'Scegli email e password: ti serviranno per entrare da telefono e PC. Ognuno vede solo i propri dati.',
          reset: 'Scrivi la tua email: ti mando un link per scegliere una nuova password.',
          newpw: 'Scegli la nuova password.',
        }[mode];
        box.innerHTML = `<div class="welcome" style="max-width:440px;margin:0 auto">
          <div class="hello">Finanza Personale</div>
          <p class="lead">${lead}</p>
          <form class="card" style="display:flex;flex-direction:column;gap:12px" novalidate>
            <h2 style="margin:0">${title}</h2>
            ${mode !== 'newpw' ? `<label class="f">Email<input type="email" id="au-mail" autocomplete="email" inputmode="email" autocapitalize="off" value="${esc(email)}" placeholder="nome@esempio.it"></label>` : ''}
            ${mode !== 'reset' ? `<label class="f">Password<input type="password" id="au-pw" autocomplete="${mode === 'in' ? 'current-password' : 'new-password'}" placeholder="${mode === 'in' ? '' : 'almeno 8 caratteri'}"></label>` : ''}
            ${mode === 'up' || mode === 'newpw' ? `<label class="f">Ripeti la password<input type="password" id="au-pw2" autocomplete="new-password"></label>` : ''}
            <button class="btn primary addspend" type="submit" ${busy ? 'disabled' : ''}>${{ in: 'Entra', up: 'Crea account', reset: 'Mandami il link', newpw: 'Salva la password' }[mode]}</button>
            ${msg ? `<p class="sub" role="alert" style="color:var(--neg, #e5484d)">${esc(msg)}</p>` : ''}
            ${ok ? `<p class="sub" role="status">${esc(ok)}</p>` : ''}
          </form>
          <div style="display:flex;flex-direction:column;gap:8px;align-items:center;margin-top:14px">
            ${mode === 'in' ? `<button class="btn ghost" data-m="up">Non hai un account? Crealo</button><button class="btn ghost small" data-m="reset">Password dimenticata?</button>` : ''}
            ${mode === 'up' || mode === 'reset' ? `<button class="btn ghost" data-m="in">Hai già un account? Entra</button>` : ''}
          </div>
        </div>`;
        box.querySelector('form').onsubmit = e => { e.preventDefault(); submit(); };
        box.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { const i = box.querySelector('#au-mail'); if (i) email = i.value.trim(); mode = b.dataset.m; msg = ok = ''; draw(); });
        setTimeout(() => { const i = box.querySelector(mode === 'newpw' ? '#au-pw' : (email ? '#au-pw' : '#au-mail')) || box.querySelector('input'); if (i) i.focus(); }, 60);
      };
      async function submit() {
        const v = id => { const i = box.querySelector(id); return i ? i.value : ''; };
        if (mode !== 'newpw') email = v('#au-mail').trim().toLowerCase();
        const pw = v('#au-pw'), pw2 = v('#au-pw2');
        msg = ok = '';
        if (mode !== 'newpw' && !okMail(email)) { msg = 'Controlla l\'email.'; return draw(); }
        if ((mode === 'up' || mode === 'newpw') && pw.length < 8) { msg = 'La password deve avere almeno 8 caratteri.'; return draw(); }
        if ((mode === 'up' || mode === 'newpw') && pw !== pw2) { msg = 'Le due password non sono uguali.'; return draw(); }
        if (mode === 'in' && !pw) { msg = 'Scrivi la password.'; return draw(); }
        busy = true; draw();
        let r;
        if (mode === 'in') r = await sb.auth.signInWithPassword({ email, password: pw });
        else if (mode === 'up') r = await sb.auth.signUp({ email, password: pw, options: { emailRedirectTo: location.origin + location.pathname } });
        else if (mode === 'reset') r = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
        else r = await sb.auth.updateUser({ password: pw });
        busy = false;
        if (r.error) { msg = errText(r.error); return draw(); }
        if (mode === 'up' && !(r.data && r.data.session)) { ok = 'Account creato: conferma l\'email con il link che ti è arrivato, poi entra.'; mode = 'in'; return draw(); }
        if (mode === 'reset') { ok = 'Se l\'email è giusta, ti è arrivato un link per scegliere la nuova password.'; mode = 'in'; return draw(); }
        if (mode === 'newpw') { box.remove(); resolve(); return; }
        // entrato: chiude onAuthStateChange
      }
      sb.auth.onAuthStateChange((ev, session) => {
        if (ev === 'PASSWORD_RECOVERY') { if (mode !== 'newpw') { mode = 'newpw'; msg = ok = ''; draw(); } return; }
        if (session && mode !== 'newpw' && box.isConnected) { box.remove(); resolve(); }
      });
      draw();
    });
  }

  window.FP_AUTH = async function () {
    if (!sb) return; // aperta senza configurazione (per esempio dentro Claude): nessun accesso da fare
    const recovering = /type=recovery/.test(location.hash + location.search);
    const { data } = await sb.auth.getSession();
    if (data && data.session && !recovering) return;
    await gate(recovering ? 'newpw' : 'in');
  };

  window.FP_LOGOUT = async function () {
    if (!sb) return;
    await sb.auth.signOut();
    location.reload();
  };
})();

// Accesso con link via email (o codice a 6 cifre, utile nell'app installata sull'iPhone,
// dove il link si apre in Safari invece che nell'app).
(function () {
  const sb = window.FP_SB;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  window.FP_AUTH = async function () {
    if (!sb) return; // aperta senza configurazione (per esempio dentro Claude): nessun accesso da fare
    const { data } = await sb.auth.getSession();
    if (data && data.session) return;
    await new Promise(resolve => {
      const box = document.createElement('div');
      box.className = 'authgate';
      document.body.appendChild(box);
      let email = '', sent = false, busy = false, msg = '';
      const draw = () => {
        box.innerHTML = `<div class="welcome" style="max-width:440px;margin:0 auto">
          <div class="hello">Finanza Personale</div>
          <p class="lead">${sent ? `Ti ho mandato un'email a <b>${esc(email)}</b>. Tocca il link oppure scrivi qui il codice che trovi nell'email.` : 'Scrivi la tua email: ti mando un link per entrare. Niente password da ricordare.'}</p>
          <section class="card" style="display:flex;flex-direction:column;gap:12px">
            ${sent
              ? `<label class="f">Codice dall'email<input type="text" id="au-code" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="123456"></label>
                 <button class="btn primary addspend" id="au-go" ${busy ? 'disabled' : ''}>Entra</button>
                 <button class="btn ghost" id="au-back">Usa un'altra email</button>`
              : `<label class="f">Email<input type="email" id="au-mail" autocomplete="email" inputmode="email" value="${esc(email)}" placeholder="nome@esempio.it"></label>
                 <button class="btn primary addspend" id="au-send" ${busy ? 'disabled' : ''}>Mandami il link</button>`}
            ${msg ? `<p class="sub" role="status">${esc(msg)}</p>` : ''}
          </section>
          <p class="sub" style="text-align:center">Ognuno vede solo i propri dati.</p>
        </div>`;
        const send = box.querySelector('#au-send'), go = box.querySelector('#au-go'), back = box.querySelector('#au-back');
        if (send) { send.onclick = doSend; box.querySelector('#au-mail').onkeydown = e => { if (e.key === 'Enter') doSend(); }; }
        if (go) { go.onclick = doVerify; box.querySelector('#au-code').onkeydown = e => { if (e.key === 'Enter') doVerify(); }; }
        if (back) back.onclick = () => { sent = false; msg = ''; draw(); };
      };
      async function doSend() {
        email = (box.querySelector('#au-mail').value || '').trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { msg = 'Controlla l\'email.'; draw(); return; }
        busy = true; msg = ''; draw();
        const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
        busy = false;
        if (error) msg = /rate|limit/i.test(error.message) ? 'Troppe email in poco tempo: riprova tra qualche minuto.' : /not authorized/i.test(error.message) ? 'Questa email non può ancora ricevere messaggi dall\'app.' : 'Non riesco a mandare l\'email: ' + error.message;
        else sent = true;
        draw();
      }
      async function doVerify() {
        const token = (box.querySelector('#au-code').value || '').replace(/\D/g, '');
        if (token.length < 6) { msg = 'Il codice ha 6 cifre.'; draw(); return; }
        busy = true; msg = ''; draw();
        const { error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
        busy = false;
        if (error) { msg = 'Codice non valido o scaduto. Chiedine uno nuovo.'; draw(); }
      }
      sb.auth.onAuthStateChange((ev, session) => { if (session && box.isConnected) { box.remove(); resolve(); } });
      draw();
      setTimeout(() => { const i = box.querySelector('#au-mail'); if (i) i.focus(); }, 100);
    });
  };

  window.FP_LOGOUT = async function () {
    if (!sb) return;
    await sb.auth.signOut();
    location.reload();
  };
})();

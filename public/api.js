// Liga o app (index.html) ao servidor: troca os dados locais do protótipo pela API.
const TK = "ser_token";
let token = null, codeFor = "", devCode = "", offline = false;
try { token = localStorage.getItem(TK); } catch (e) {}
S = { members: [], avail: {}, scale: {}, notes: {}, pub: {}, meets: [], sugs: [], files: [], extra: [], nid: 10 };
me = null;

const KIND = { "Imagens": "Imagem", "Vídeos": "Vídeo", "Áudios": "Áudio" };
const cargoIdx = n => CARGOS.findIndex(c => c[0] === n);

async function api(path, o = {}) {
  const h = {};
  if (token) h.Authorization = "Bearer " + token;
  let body;
  if (o.json !== undefined) { h["Content-Type"] = "application/json"; body = JSON.stringify(o.json); }
  let r;
  try { r = await fetch("/api" + path, { method: o.method || "GET", headers: h, body }); }
  catch (e) { const x = new Error("Sem conexão. Tente de novo."); x.net = true; throw x; }
  let d = null;
  try { d = await r.json(); } catch (e) {}
  if (r.status === 401 && token && !path.startsWith("/auth")) { sair(); const x = new Error("Sessão expirada. Entre de novo."); x.status = 401; throw x; }
  if (!r.ok) { const x = new Error((d && d.erro) || "Erro " + r.status); x.status = r.status; throw x; }
  return d;
}

async function carregar() {
  const u = await api("/me");
  const [ms, evs, mine, meets, files] = await Promise.all([api("/members"), api("/events"), api("/avail"), api("/meetings"), api("/files")]);
  const sugs = u.role !== "member" ? await api("/suggestions") : [];
  const toM = m => ({ id: m.id, name: m.name, phone: m.phone || "", email: m.email || "", birth: m.birth || "", role: m.role, min: m.ministries });
  me = toM(u);
  S.members = ms.map(m => m.id === me.id ? me : toM(m));
  if (!S.members.includes(me)) S.members.push(me);
  S.avail = {}; S.scale = {}; S.notes = {}; S.pub = {}; S.extra = [];
  evs.forEach(e => {
    if (e.title && e.title !== holiday(e.date)) S.extra.push({ date: e.date, title: e.title });
    if (e.published) S.pub[e.date] = true;
    if (e.note) S.notes[e.date] = e.note;
    const sc = {};
    Object.entries(e.scale || {}).forEach(([c, id]) => { const i = cargoIdx(c); if (i >= 0) sc[i] = id; });
    if (Object.keys(sc).length) S.scale[e.date] = sc;
    (e.available || []).forEach(id => (S.avail[id] = S.avail[id] || []).push(e.date));
  });
  S.avail[me.id] = mine;
  S.meets = meets;
  S.sugs = sugs;
  S.files = files.map(f => ({ id: f.id, name: f.name, kb: Math.round(f.size / 1024), by: f.by || "—", kind: KIND[f.kind] || f.kind, hol: f.holyrics, off: false }));
  await Promise.all(S.files.map(async f => { try { f.off = !!(await idbGet(f.id)); } catch (e) {} }));
  offline = false;
  try { localStorage.setItem("ser_cache", JSON.stringify({ S, me })); } catch (e) {}
}

function R() {
  buildDays();
  const a = document.getElementById("app");
  a.innerHTML = me ? shell() : login();
  if (offline) a.insertAdjacentHTML("afterbegin", '<div style="background:#D4AF37;color:#0F172A;padding:6px 12px;font-size:13px;text-align:center">Sem conexão: mostrando os últimos dados salvos.</div>');
}
const falha = async e => { alert(e.message); try { await carregar(); } catch (_) {} R(); };

// ---------- Entrada ----------
function login() {
  if (reg) return regView();
  if (codeFor) return `<div class="lg"><header class="hero"><img src="logo.jpg" alt="Ser" width="230" height="230"><p>“Aquele que quer ser o maior, seja o que serve.”</p></header>
<main><h2>Código de acesso</h2><p class="muted">Enviamos um código de 6 dígitos para o seu WhatsApp.</p>
${devCode ? `<div class="card">Código de teste: <b>${devCode}</b></div>` : ""}
<label for="cd">Código</label><input id="cd" inputmode="numeric" maxlength="6" autocomplete="one-time-code">
${err ? `<p style="color:var(--er);margin:0 0 10px">${err}</p>` : ""}
<button class="btn block" onclick="doCode()">Entrar</button>
<button class="btn ghost block" style="margin-top:8px" onclick="codeFor='';err='';R()">Voltar</button></main></div>`;
  return `<div class="lg"><header class="hero"><img src="logo.jpg" alt="Ser" width="230" height="230"><p>“Aquele que quer ser o maior, seja o que serve.”</p></header>
<main><h2>Entrar</h2><p class="muted">Informe seu WhatsApp. No primeiro acesso, você cria seu cadastro na próxima tela.</p>
<label for="ph">WhatsApp (com DDD)</label><input id="ph" type="tel" inputmode="tel" placeholder="11 99999-0001" autocomplete="tel">
${err ? `<p style="color:var(--er);margin:0 0 10px">${err}</p>` : ""}
<button class="btn block" onclick="doLogin()">Continuar</button>
<p class="ios">No iPhone: abra no Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”. O Ser abre como um app.</p></main></div>`;
}
async function pedirCodigo(n) {
  const r = await api("/auth/code", { method: "POST", json: { phone: n } });
  codeFor = n; devCode = r.devCode || ""; err = ""; R();
}
async function doLogin() {
  const n = document.getElementById("ph").value.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (n.length < 10) { err = "Informe o WhatsApp com DDD."; return R(); }
  try { await pedirCodigo(n); }
  catch (e) { if (e.status === 404) { reg = n; err = ""; return R(); } err = e.message; R(); }
}
async function doCode() {
  try {
    const r = await api("/auth/verify", { method: "POST", json: { phone: codeFor, code: document.getElementById("cd").value.trim() } });
    token = r.token;
    try { localStorage.setItem(TK, token); } catch (e) {}
    codeFor = ""; devCode = ""; err = ""; tab = "inicio";
    await carregar(); R();
  } catch (e) { err = e.message; R(); }
}
async function doReg() {
  const n = rn.value.trim(), m = [...document.querySelectorAll(".rm:checked")].map(x => x.value);
  if (!n || !m.length) { err = "Informe seu nome e ao menos um ministério."; return R(); }
  if (!rb.value || rb.value > new Date().toISOString().slice(0, 10) || rb.value < "1900-01-01") { err = "Informe uma data de nascimento válida."; return R(); }
  if (!/^\S+@\S+\.\S+$/.test(re.value.trim())) { err = "Informe um e-mail válido."; return R(); }
  if (!rc.checked) { err = "Para usar o Ser, aceite receber as mensagens no WhatsApp."; return R(); }
  try {
    await api("/register", { method: "POST", json: { name: n, phone: reg, birth: rb.value, email: re.value.trim(), ministries: m, optin: true } });
    const p = reg; reg = ""; await pedirCodigo(p);
  } catch (e) { err = e.message; R(); }
}
function logout() {
  token = null; me = null; codeFor = ""; devCode = ""; err = "";
  try { localStorage.removeItem(TK); localStorage.removeItem("ser_cache"); } catch (e) {}
  R();
}
function sair() { logout(); }

// ---------- Disponibilidade e escala ----------
async function tog(d) {
  const a = S.avail[me.id] = S.avail[me.id] || [];
  const i = a.indexOf(d); i < 0 ? a.push(d) : a.splice(i, 1);
  R();
  try { await api("/avail", { method: "PUT", json: { dates: a } }); } catch (e) { falha(e); }
}
function evBody(d) {
  const o = {};
  Object.entries(S.scale[d] || {}).forEach(([i, id]) => { if (id) o[CARGOS[i][0]] = id; });
  return { title: evTitle(d) || "", note: S.notes[d] || "", published: !!S.pub[d], scale: o };
}
const putEv = (d, extra = {}) => api("/events/" + d, { method: "PUT", json: { ...evBody(d), ...extra } });
async function setS(i, v) {
  S.scale[day] = S.scale[day] || {};
  v ? S.scale[day][i] = +v : delete S.scale[day][i];
  R();
  try { await putEv(day); } catch (e) { falha(e); }
}
async function setN(v) { S.notes[day] = v; try { await putEv(day); } catch (e) { alert(e.message); } }
async function pub() {
  const d = day; S.pub[d] = !S.pub[d]; R();
  try { await putEv(d); } catch (e) { S.pub[d] = !S.pub[d]; alert(e.message); R(); }
}
async function addEv() {
  const t = et.value.trim(), d = ed.value;
  if (!t || !d) return alert("Informe o nome e a data do evento.");
  if (d < new Date().toISOString().slice(0, 10)) return alert("Escolha uma data a partir de hoje.");
  try { await putEv(d, { title: t }); day = d; await carregar(); R(); } catch (e) { alert(e.message); }
}
async function delEv(d) { try { await api("/events/" + d, { method: "DELETE" }); await carregar(); R(); } catch (e) { alert(e.message); } }

// ---------- Equipe, perfil, reuniões, sugestões ----------
async function setRole(id, r) { try { await api("/members/" + id + "/role", { method: "PATCH", json: { role: r } }); await carregar(); R(); } catch (e) { falha(e); } }
async function setMin(id, k, on) {
  const m = S.members.find(x => x.id === id); if (!m) return;
  const s = new Set(m.min); on ? s.add(k) : s.delete(k);
  if (!s.size) { alert("A pessoa precisa ter ao menos um ministério."); return R(); }
  try { await api("/members/" + id + "/ministries", { method: "PATCH", json: { ministries: [...s] } }); await carregar(); R(); } catch (e) { falha(e); }
}
async function savePerfil() {
  const n = pn.value.trim();
  if (!n) return alert("Informe o nome.");
  if (!pb.value || !/^\S+@\S+\.\S+$/.test(pe.value.trim())) return alert("Informe nascimento e e-mail válidos.");
  try { await api("/me", { method: "PATCH", json: { name: n, birth: pb.value, email: pe.value.trim(), ministries: me.min } }); await carregar(); alert("Perfil salvo."); R(); } catch (e) { alert(e.message); }
}
async function addM() {
  const t = mt.value.trim(), d = md.value;
  if (!t || !d) return alert("Preencha o assunto e a data.");
  try { await api("/meetings", { method: "POST", json: { title: t, date: d, min: mm.value } }); await carregar(); R(); } catch (e) { alert(e.message); }
}
async function addSg() {
  const t = sg.value.trim();
  if (!t) return alert("Escreva sua sugestão.");
  try { await api("/suggestions", { method: "POST", json: { text: t, anon: an.checked } }); alert("Sugestão enviada. Obrigado!"); await carregar(); R(); } catch (e) { alert(e.message); }
}

// ---------- Arquivos ----------
async function addF(el) {
  for (const f of [...el.files]) {
    try {
      const r = await fetch("/api/files", { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/octet-stream", "x-filename": encodeURIComponent(f.name) }, body: f });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.erro || "Falha no envio");
      try { await idbSet(d.id, f); } catch (e) {}
    } catch (e) { alert(f.name + ": " + e.message); }
  }
  try { await carregar(); } catch (e) {}
  R();
}
async function dl(id) {
  const f = S.files.find(x => x.id === id);
  try {
    let b = null;
    try { b = await idbGet(id); } catch (e) {}
    if (!b) {
      const r = await fetch("/api/files/" + id + "/download", { headers: { Authorization: "Bearer " + token } });
      if (!r.ok) throw 0;
      b = await r.blob();
      try { await idbSet(id, b); f.off = true; } catch (e) {}
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b); a.download = f.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    R();
  } catch (e) { alert("Não foi possível baixar. Verifique a conexão."); }
}
async function toHol(id) { try { await api("/files/" + id + "/holyrics", { method: "POST" }); await carregar(); R(); } catch (e) { alert(e.message); } }

// ---------- Início do app ----------
document.addEventListener("visibilitychange", () => {
  if (document.hidden || !token || !me) return;
  carregar().then(() => { if (tab === "inicio") R(); }).catch(() => {});
});
(async () => {
  if (token) {
    try { await carregar(); }
    catch (e) {
      if (e.status === 401) { token = null; try { localStorage.removeItem(TK); } catch (_) {} }
      else if (e.net) { try { const c = JSON.parse(localStorage.getItem("ser_cache") || "null"); if (c) { S = c.S; me = c.me; offline = true; } } catch (_) {} }
    }
  }
  R();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();

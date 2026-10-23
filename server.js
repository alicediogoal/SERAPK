// Ser: cadastro, escala e lembretes por WhatsApp (Cloud API da Meta). Só a escala finalizada gera mensagem.
import express from "express";
import Database from "better-sqlite3";
import cron from "node-cron";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { PORT = 3000, WA_TOKEN, WA_PHONE_ID, APP_SECRET, BRIDGE_KEY, DATA_DIR = ".", DEV_LOGIN, TZ = "America/Sao_Paulo" } = process.env;
if (!APP_SECRET) throw new Error("Defina APP_SECRET nas variáveis de ambiente");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS = path.join(DATA_DIR, "uploads");
fs.mkdirSync(DATA_DIR, { recursive: true });

const CARGOS = { "Projeção": "follow", "Fotografia": "follow", "Vídeo": "follow", "Story": "follow", "Técnico de Som": "som", "Técnico de Iluminação": "ilum" };
const MINS = ["follow", "som", "ilum"];
const ROLES = ["admin", "pastor", "lider", "member"];

const db = new Database(path.join(DATA_DIR, "ser.db"));
db.exec(`
CREATE TABLE IF NOT EXISTS members(id INTEGER PRIMARY KEY, name TEXT, phone TEXT UNIQUE, role TEXT DEFAULT 'member', ministries TEXT, optin INTEGER DEFAULT 0, birth TEXT, email TEXT);
CREATE TABLE IF NOT EXISTS events(date TEXT PRIMARY KEY, title TEXT DEFAULT '', published INTEGER DEFAULT 0, note TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS avail(member_id INTEGER, date TEXT, PRIMARY KEY(member_id, date));
CREATE TABLE IF NOT EXISTS scale(date TEXT, cargo TEXT, member_id INTEGER, PRIMARY KEY(date, cargo));
CREATE TABLE IF NOT EXISTS sent(date TEXT, member_id INTEGER, kind TEXT, PRIMARY KEY(date, member_id, kind));
CREATE TABLE IF NOT EXISTS codes(phone TEXT PRIMARY KEY, code TEXT, exp INTEGER);
CREATE TABLE IF NOT EXISTS files(id INTEGER PRIMARY KEY, name TEXT, kind TEXT, size INTEGER, by_id INTEGER, created TEXT, holyrics TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS meetings(id INTEGER PRIMARY KEY, title TEXT, starts TEXT, ministry TEXT DEFAULT 'geral');
CREATE TABLE IF NOT EXISTS suggestions(id INTEGER PRIMARY KEY, text TEXT, by_id INTEGER, created TEXT);
`);

// Bancos criados antes desta versão ganham as novas colunas
for (const c of ["birth TEXT", "email TEXT"]) { try { db.exec(`ALTER TABLE members ADD COLUMN ${c}`); } catch {} }

const today = (add = 0) => new Date(Date.now() + add * 864e5).toLocaleDateString("sv-SE", { timeZone: TZ });
const fmt = d => new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
const first = n => n.split(" ")[0];

// Envio por modelo (template) aprovado pela Meta. Obrigatório para mensagens iniciadas pelo app.
async function wa(phone, template, vars) {
  if (!WA_TOKEN || !WA_PHONE_ID) throw new Error("WhatsApp não configurado (WA_TOKEN e WA_PHONE_ID)");
  const r = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${WA_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", to: "55" + phone, type: "template",
      template: { name: template, language: { code: "pt_BR" }, components: [{ type: "body", parameters: vars.map(text => ({ type: "text", text: String(text) })) }] },
    }),
  });
  if (!r.ok) throw new Error(await r.text());
}

// Datas fixas: domingos, quartas, Natal e Ano Novo (150 dias à frente)
function seedDays() {
  const ins = db.prepare("INSERT OR IGNORE INTO events(date, title) VALUES(?, ?)");
  for (let i = 0; i < 150; i++) {
    const d = today(i), wd = new Date(d + "T12:00:00").getDay(), md = d.slice(5);
    const t = md === "12-25" ? "Natal" : md === "01-01" ? "Ano Novo" : "";
    if (wd === 0 || wd === 3 || t) ins.run(d, t);
  }
}

// Lembretes: 1 dia antes (09h) e no dia (07h), uma mensagem por pessoa, sem repetir
async function lembretes(offset, kind) {
  const date = today(offset);
  const ev = db.prepare("SELECT * FROM events WHERE date=? AND published=1").get(date);
  if (!ev) return;
  const rows = db.prepare("SELECT s.cargo, m.id, m.name, m.phone FROM scale s JOIN members m ON m.id=s.member_id WHERE s.date=? AND m.optin=1").all(date);
  const por = new Map();
  for (const r of rows) { if (!por.has(r.id)) por.set(r.id, { ...r, cargos: [] }); por.get(r.id).cargos.push(r.cargo); }
  for (const m of por.values()) {
    if (db.prepare("SELECT 1 FROM sent WHERE date=? AND member_id=? AND kind=?").get(date, m.id, kind)) continue;
    try {
      await wa(m.phone, "lembrete_escala", [first(m.name), kind === "D-1" ? "Amanhã" : "Hoje", fmt(date) + (ev.title ? ` (${ev.title})` : ""), m.cargos.join(", "), ev.note || "Sem observações."]);
      db.prepare("INSERT INTO sent VALUES(?,?,?)").run(date, m.id, kind);
    } catch (e) { console.error("Falha no envio para", m.phone, e.message); }
  }
}

fs.mkdirSync(UPLOADS, { recursive: true });
seedDays();
cron.schedule("0 6 * * *", seedDays, { timezone: TZ });
cron.schedule("0 7 * * *", () => lembretes(0, "D0"), { timezone: TZ });
cron.schedule("0 9 * * *", () => lembretes(1, "D-1"), { timezone: TZ });

// ---------- API ----------
const app = express();
app.use(express.json());
app.get("/healthz", (_, res) => res.send("ok"));
app.use(express.static(path.join(HERE, "public")));

const sig = p => crypto.createHmac("sha256", APP_SECRET).update(p).digest("hex");
const token = id => { const p = `${id}.${Date.now() + 30 * 864e5}`; return `${p}.${sig(p)}`; };
const auth = (req, res, next) => {
  const [id, exp, s] = (req.headers.authorization || "").replace("Bearer ", "").split(".");
  const ok = s && s.length === 64 && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(sig(`${id}.${exp}`))) && +exp > Date.now();
  const me = ok && db.prepare("SELECT * FROM members WHERE id=?").get(+id);
  if (!me) return res.status(401).json({ erro: "Sessão inválida" });
  req.me = me; next();
};
const need = (...roles) => (req, res, next) => roles.includes(req.me.role) ? next() : res.status(403).json({ erro: "Sem permissão" });
const validBirth = b => /^\d{4}-\d{2}-\d{2}$/.test(b || "") && b >= "1900-01-01" && b <= today();
const validEmail = e => /^\S+@\S+\.\S+$/.test(String(e || "").trim());
const phoneOf = v => String(v || "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");

// Cadastro próprio. O primeiro cadastro vira ADM.
app.post("/api/register", (req, res) => {
  const { name, ministries, optin, birth, email } = req.body, phone = phoneOf(req.body.phone);
  if (!name || phone.length < 10 || !Array.isArray(ministries) || !ministries.length) return res.status(400).json({ erro: "Dados incompletos" });
  if (!validBirth(birth)) return res.status(400).json({ erro: "Data de nascimento inválida" });
  if (!validEmail(email)) return res.status(400).json({ erro: "E-mail inválido" });
  if (!optin) return res.status(400).json({ erro: "É preciso aceitar receber mensagens no WhatsApp" });
  const isFirst = !db.prepare("SELECT 1 FROM members").get();
  try {
    db.prepare("INSERT INTO members(name, phone, role, ministries, optin, birth, email) VALUES(?,?,?,?,1,?,?)").run(name.trim(), phone, isFirst ? "admin" : "member", JSON.stringify(ministries.filter(m => MINS.includes(m))), birth, email.trim());
    res.json({ ok: true });
  } catch { res.status(409).json({ erro: "Número já cadastrado" }); }
});

// Login: código de 6 dígitos enviado por WhatsApp (prova que o número é da pessoa)
app.post("/api/auth/code", async (req, res) => {
  const phone = phoneOf(req.body.phone), m = db.prepare("SELECT * FROM members WHERE phone=?").get(phone);
  if (!m) return res.status(404).json({ erro: "Número não cadastrado" });
  const old = db.prepare("SELECT exp FROM codes WHERE phone=?").get(phone);
  if (old && old.exp - 600000 > Date.now() - 60000) return res.status(429).json({ erro: "Aguarde 1 minuto para pedir outro código" });
  const code = String(crypto.randomInt(100000, 1000000));
  db.prepare("INSERT OR REPLACE INTO codes VALUES(?,?,?)").run(phone, code, Date.now() + 600000);
  if (DEV_LOGIN === "true") { console.log(`[DEV_LOGIN] código de ${phone}: ${code}`); return res.json({ ok: true, devCode: code }); }
  try { await wa(phone, "codigo_login", [code]); res.json({ ok: true }); }
  catch (e) { console.error(e.message); res.status(502).json({ erro: "Não foi possível enviar o código" }); }
});
app.post("/api/auth/verify", (req, res) => {
  const phone = phoneOf(req.body.phone), c = db.prepare("SELECT * FROM codes WHERE phone=?").get(phone);
  if (!c || c.code !== String(req.body.code) || c.exp < Date.now()) return res.status(401).json({ erro: "Código inválido ou vencido" });
  db.prepare("DELETE FROM codes WHERE phone=?").run(phone);
  const m = db.prepare("SELECT id FROM members WHERE phone=?").get(phone);
  res.json({ token: token(m.id) });
});

app.get("/api/me", auth, (req, res) => res.json({ ...req.me, ministries: JSON.parse(req.me.ministries) }));

// Cada pessoa edita o próprio perfil (o WhatsApp é o login e não muda aqui)
app.patch("/api/me", auth, (req, res) => {
  const { name, birth, email, ministries } = req.body;
  if (!name || !Array.isArray(ministries) || !ministries.length) return res.status(400).json({ erro: "Dados incompletos" });
  if (!validBirth(birth)) return res.status(400).json({ erro: "Data de nascimento inválida" });
  if (!validEmail(email)) return res.status(400).json({ erro: "E-mail inválido" });
  db.prepare("UPDATE members SET name=?, birth=?, email=?, ministries=? WHERE id=?")
    .run(name.trim(), birth, email.trim(), JSON.stringify(ministries.filter(m => MINS.includes(m))), req.me.id);
  res.json({ ok: true });
});

// ADM define quem é líder, pastor ou membro
// Todos veem nomes e ministérios (necessário para mostrar a escala). Contatos só para ADM, líder e pastor.
app.get("/api/members", auth, (req, res) => {
  const full = req.me.role !== "member";
  const rows = db.prepare("SELECT id, name, phone, email, birth, role, ministries FROM members ORDER BY name").all();
  res.json(rows.map(m => ({ id: m.id, name: m.name, role: m.role, ministries: JSON.parse(m.ministries), ...(full ? { phone: m.phone, email: m.email, birth: m.birth } : {}) })));
});
app.patch("/api/members/:id/role", auth, need("admin"), (req, res) => {
  if (!ROLES.includes(req.body.role)) return res.status(400).json({ erro: "Função inválida" });
  if (+req.params.id === req.me.id) return res.status(400).json({ erro: "Você não pode mudar sua própria função" });
  db.prepare("UPDATE members SET role=? WHERE id=?").run(req.body.role, +req.params.id);
  res.json({ ok: true });
});

// ADM e líder ajustam os ministérios de cada pessoa (o membro não escolhe o próprio cargo)
app.patch("/api/members/:id/ministries", auth, need("admin", "lider"), (req, res) => {
  const m = (req.body.ministries || []).filter(x => MINS.includes(x));
  if (!m.length) return res.status(400).json({ erro: "Informe ao menos um ministério" });
  db.prepare("UPDATE members SET ministries=? WHERE id=?").run(JSON.stringify(m), +req.params.id);
  res.json({ ok: true });
});

// Disponibilidade (de quem está logado)
app.put("/api/avail", auth, (req, res) => {
  const dates = (req.body.dates || []).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));
  db.transaction(() => {
    db.prepare("DELETE FROM avail WHERE member_id=? AND date>=?").run(req.me.id, today());
    const ins = db.prepare("INSERT OR IGNORE INTO avail VALUES(?,?)");
    dates.forEach(d => ins.run(req.me.id, d));
  })();
  res.json({ ok: true });
});
app.get("/api/avail", auth, (req, res) =>
  res.json(db.prepare("SELECT date FROM avail WHERE member_id=?").all(req.me.id).map(r => r.date)));

// Tela inicial: a escala finalizada mais próxima, com todos os cargos
app.get("/api/next-scale", auth, (req, res) => {
  const e = db.prepare("SELECT * FROM events WHERE date>=? AND published=1 AND EXISTS(SELECT 1 FROM scale WHERE scale.date=events.date) ORDER BY date LIMIT 1").get(today());
  if (!e) return res.json(null);
  const rows = db.prepare("SELECT s.cargo, m.id, m.name FROM scale s JOIN members m ON m.id=s.member_id WHERE s.date=?").all(e.date);
  res.json({ date: e.date, title: e.title, note: e.note, scale: Object.keys(CARGOS).map(cargo => { const r = rows.find(x => x.cargo === cargo); return { cargo, member: r ? { id: r.id, name: r.name } : null }; }) });
});

// Datas com escala. Membros veem só o que foi publicado.
app.get("/api/events", auth, (req, res) => {
  const see = req.me.role !== "member";
  const evs = db.prepare("SELECT * FROM events WHERE date>=? ORDER BY date").all(today());
  res.json(evs.map(e => {
    const open = see || e.published;
    return {
      date: e.date, title: e.title, published: !!e.published,
      note: open ? e.note : "",
      scale: open ? Object.fromEntries(db.prepare("SELECT cargo, member_id FROM scale WHERE date=?").all(e.date).map(r => [r.cargo, r.member_id])) : {},
      available: see ? db.prepare("SELECT member_id FROM avail WHERE date=?").all(e.date).map(r => r.member_id) : undefined,
    };
  }));
});
app.put("/api/events/:date", auth, need("admin", "lider"), (req, res) => {
  const { title = "", note = "", published = false, scale = {} } = req.body, date = req.params.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ erro: "Data inválida" });
  db.transaction(() => {
    db.prepare("INSERT INTO events(date, title, note, published) VALUES(?,?,?,?) ON CONFLICT(date) DO UPDATE SET title=excluded.title, note=excluded.note, published=excluded.published").run(date, title, note, published ? 1 : 0);
    db.prepare("DELETE FROM scale WHERE date=?").run(date);
    for (const [cargo, id] of Object.entries(scale)) if (CARGOS[cargo] && id) db.prepare("INSERT INTO scale VALUES(?,?,?)").run(date, cargo, +id);
  })();
  res.json({ ok: true });
  // Escala finalizada depois do horário padrão: avisa na hora (sem repetir quem já recebeu)
  if (published) {
    const h = +new Date().toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: TZ });
    if (date === today(1) && h >= 9) lembretes(1, "D-1").catch(console.error);
    if (date === today() && h >= 7) lembretes(0, "D0").catch(console.error);
  }
});

// Remove evento atípico. Datas fixas (domingo, quarta, Natal, Ano Novo) só voltam ao nome padrão.
app.delete("/api/events/:date", auth, need("admin", "lider"), (req, res) => {
  const d = req.params.date, md = d.slice(5), wd = new Date(d + "T12:00:00").getDay();
  if (wd === 0 || wd === 3 || md === "12-25" || md === "01-01")
    db.prepare("UPDATE events SET title=? WHERE date=?").run(md === "12-25" ? "Natal" : md === "01-01" ? "Ano Novo" : "", d);
  else for (const t of ["events", "scale", "avail"]) db.prepare(`DELETE FROM ${t} WHERE date=?`).run(d);
  res.json({ ok: true });
});

// ---------- Reuniões e sugestões ----------
app.get("/api/meetings", auth, (req, res) => {
  const mins = JSON.parse(req.me.ministries);
  const rows = db.prepare(`SELECT id, title, starts AS date, ministry AS "min" FROM meetings ORDER BY starts`).all();
  res.json(req.me.role === "member" ? rows.filter(r => r.min === "geral" || mins.includes(r.min)) : rows);
});
app.post("/api/meetings", auth, need("admin", "lider", "pastor"), (req, res) => {
  const { title, date, min = "geral" } = req.body;
  if (!title || !date || !(min === "geral" || MINS.includes(min))) return res.status(400).json({ erro: "Dados incompletos" });
  db.prepare("INSERT INTO meetings(title, starts, ministry) VALUES(?,?,?)").run(String(title).trim(), date, min);
  res.json({ ok: true });
});
app.post("/api/suggestions", auth, (req, res) => {
  const text = String(req.body.text || "").trim();
  if (!text) return res.status(400).json({ erro: "Escreva a sugestão" });
  db.prepare("INSERT INTO suggestions(text, by_id, created) VALUES(?,?,?)").run(text.slice(0, 2000), req.body.anon ? null : req.me.id, today());
  res.json({ ok: true });
});
app.get("/api/suggestions", auth, need("admin", "lider", "pastor"), (req, res) =>
  res.json(db.prepare("SELECT s.text, m.name AS by FROM suggestions s LEFT JOIN members m ON m.id=s.by_id ORDER BY s.id DESC").all()));

// ---------- Arquivos (projeção e som) ----------
const kindOf = n => /\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(n) ? "Vídeos" : /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(n) ? "Áudios" : /\.(png|jpe?g|gif|webp|heic|bmp)$/i.test(n) ? "Imagens" : null;
const authQ = (req, res, next) => { if (req.query.t) req.headers.authorization = "Bearer " + req.query.t; auth(req, res, next); };
const fileOf = id => db.prepare("SELECT * FROM files WHERE id=?").get(+id);

// Qualquer membro envia. O corpo é o arquivo; o nome vai no cabeçalho x-filename (codificado).
app.post("/api/files", auth, express.raw({ type: "application/octet-stream", limit: "200mb" }), (req, res) => {
  const name = path.basename(decodeURIComponent(req.headers["x-filename"] || "")), kind = kindOf(name);
  if (!name || !kind || !req.body?.length) return res.status(400).json({ erro: "Arquivo inválido (use imagem, vídeo ou áudio)" });
  const r = db.prepare("INSERT INTO files(name, kind, size, by_id, created) VALUES(?,?,?,?,?)").run(name, kind, req.body.length, req.me.id, today());
  fs.writeFileSync(path.join(UPLOADS, String(r.lastInsertRowid)), req.body);
  res.json({ id: r.lastInsertRowid });
});
app.get("/api/files", auth, (req, res) =>
  res.json(db.prepare("SELECT f.id, f.name, f.kind, f.size, f.created, f.holyrics, m.name AS by FROM files f LEFT JOIN members m ON m.id=f.by_id ORDER BY f.id DESC").all()));
app.get("/api/files/:id/download", authQ, (req, res) => {
  const f = fileOf(req.params.id);
  f ? res.download(path.resolve(UPLOADS, String(f.id)), f.name) : res.sendStatus(404);
});
// ADM ou líder marca o arquivo para ir ao Holyrics
app.post("/api/files/:id/holyrics", auth, need("admin", "lider"), (req, res) => {
  db.prepare("UPDATE files SET holyrics='fila' WHERE id=? AND holyrics=''").run(+req.params.id);
  res.json({ ok: true });
});

// Ponte do computador do Holyrics (protegida por BRIDGE_KEY)
const bridge = (req, res, next) => BRIDGE_KEY && req.headers["x-bridge-key"] === BRIDGE_KEY ? next() : res.status(401).json({ erro: "Chave inválida" });
app.get("/api/bridge/pending", bridge, (req, res) => res.json(db.prepare("SELECT id, name, kind FROM files WHERE holyrics='fila'").all()));
app.get("/api/bridge/file/:id", bridge, (req, res) => {
  const f = fileOf(req.params.id);
  f ? res.download(path.resolve(UPLOADS, String(f.id)), f.name) : res.sendStatus(404);
});
app.post("/api/bridge/done/:id", bridge, (req, res) => { db.prepare("UPDATE files SET holyrics='ok' WHERE id=?").run(+req.params.id); res.json({ ok: true }); });

app.listen(PORT, () => {
  console.log(`Ser no ar na porta ${PORT}`);
  if (DEV_LOGIN === "true") console.warn("ATENÇÃO: DEV_LOGIN=true. O código de login aparece na tela. Use só para testes e desligue depois.");
  if (!WA_TOKEN) console.warn("WhatsApp não configurado: lembretes não serão enviados até definir WA_TOKEN e WA_PHONE_ID.");
});

// Ponte do Holyrics: roda no computador do culto (onde o Holyrics está instalado).
// A cada 15 segundos busca no servidor do Ser os arquivos que o líder marcou
// e os salva na pasta de mídia do Holyrics (Imagens, Vídeos e Áudios).
// Uso: node --env-file=.env.ponte ponte-holyrics.js
import fs from "node:fs";
import path from "node:path";

const { SER_URL, BRIDGE_KEY, HOLYRICS_MEDIA_DIR } = process.env;
if (!SER_URL || !BRIDGE_KEY || !HOLYRICS_MEDIA_DIR) throw new Error("Defina SER_URL, BRIDGE_KEY e HOLYRICS_MEDIA_DIR");
const h = { "x-bridge-key": BRIDGE_KEY };

async function ciclo() {
  const r = await fetch(`${SER_URL}/api/bridge/pending`, { headers: h });
  if (!r.ok) throw new Error("Servidor respondeu " + r.status);
  for (const f of await r.json()) {
    const dir = path.join(HOLYRICS_MEDIA_DIR, f.kind);
    fs.mkdirSync(dir, { recursive: true });
    let dest = path.join(dir, f.name);
    if (fs.existsSync(dest)) dest = path.join(dir, `${f.id}-${f.name}`);
    const d = await fetch(`${SER_URL}/api/bridge/file/${f.id}`, { headers: h });
    if (!d.ok) continue;
    fs.writeFileSync(dest, Buffer.from(await d.arrayBuffer()));
    await fetch(`${SER_URL}/api/bridge/done/${f.id}`, { method: "POST", headers: h });
    console.log("Salvo para o Holyrics:", dest);
  }
}
const rodar = () => ciclo().catch(e => console.error("Ponte:", e.message));
rodar();
setInterval(rodar, 15000);

# Ser

App de escalas dos ministérios técnicos (Follow, Sonoplastia e Iluminação). Servidor Node.js com o app em `public/`.

## Arquivos do repositório
| Arquivo | Para quê |
|---|---|
| `server.js` | Servidor: cadastro, login, escala, lembretes de WhatsApp, arquivos |
| `package.json` | Dependências e comando de início (`npm start`) |
| `render.yaml` | Configuração pronta para o Render |
| `public/index.html` | Telas do app |
| `public/api.js` | Liga as telas ao servidor |
| `public/sw.js`, `manifest.webmanifest`, `icon-*.png` | Instalação no iPhone/Android e uso offline |
| `ponte-holyrics.js` | Roda no computador do culto e leva arquivos ao Holyrics |
| `env.example`, `env.ponte.example` | Modelos de variáveis (não contêm segredos) |
| `.gitignore` | Impede subir senhas e dados |

## Sem custo: servidor gratuito
O Render grátis não serve (dorme e apaga os dados). Veja `docs/SERVIDOR-GRATIS.md` para usar uma máquina virtual gratuita.

## Publicar: GitHub e Render (plano pago)
1. No GitHub, apague `servidor.js` (o nome certo é `server.js`) e envie todos os arquivos deste projeto, mantendo a pasta `public`.
2. No Render: **New > Blueprint**, escolha o repositório. Ele lê o `render.yaml`.
3. Em **Environment**, preencha `WA_TOKEN` e `WA_PHONE_ID` (pode deixar em branco enquanto testa).
4. Abra o endereço do Render e **faça o primeiro cadastro você mesmo**: o primeiro cadastro vira ADM.
5. No iPhone: abra o endereço no Safari, toque em Compartilhar e em "Adicionar à Tela de Início".

Observações importantes:
- O servidor precisa ficar sempre ligado para enviar os lembretes nos horários. O plano gratuito do Render dorme por inatividade e não guarda dados em disco, por isso o `render.yaml` usa o plano pago (`starter`) com disco.
- `DEV_LOGIN=true` mostra o código de login na tela, sem WhatsApp. Serve só para testar. Depois da aprovação da Meta, mude para `false` (se ficar ligado, qualquer pessoa entra como qualquer número).

## WhatsApp (Meta)
Crie o app em developers.facebook.com, adicione o produto WhatsApp e cadastre um número exclusivo. Crie e envie para aprovação (pt_BR):
- `codigo_login`: "Seu código de acesso ao Ser é {{1}}. Ele vale por 10 minutos."
- `lembrete_escala`: "Olá, {{1}}! {{2}} você serve em {{3}} como {{4}}. Observação do líder: {{5}}"

Só vão por WhatsApp o código de login e o lembrete da escala (1 dia antes às 9h e no dia às 7h), depois que o ADM ou líder finaliza a escala. A Meta cobra por mensagem enviada.

## Funções
- `admin`: tudo; define líder, pastor e membro.
- `lider`: escolhe quem cumpre cada cargo, finaliza a escala, cria eventos e reuniões.
- `pastor`: acompanha escala, sugestões e reuniões, sem editar a escala.
- `member`: declara disponibilidade e vê a escala finalizada. Não escolhe cargo.

## Holyrics
No computador do culto: copie `env.ponte.example` para `.env.ponte`, ajuste e rode `node --env-file=.env.ponte ponte-holyrics.js`. O `BRIDGE_KEY` deve ser igual ao do servidor. Os arquivos marcados pelo líder são salvos em `HOLYRICS_MEDIA_DIR/Imagens`, `Vídeos` ou `Áudios`. Aponte essa pasta para uma pasta da biblioteca do Holyrics.

## Rodar no seu computador
`npm install`, depois `node --env-file=env.example server.js` (ou copie para `.env`). Abra http://localhost:3000.

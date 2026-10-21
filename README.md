# Ser: servidor

Cadastro, escala e lembretes automáticos por WhatsApp (1 dia antes e no dia da escala).

## O que vai por WhatsApp
Só o lembrete da escala (data e função), 1 dia antes e no dia, e apenas depois que o ADM ou líder finaliza a escala. Se a escala for finalizada depois do horário padrão, o lembrete sai na hora. Disponibilidade, vagas abertas, sugestões, reuniões e arquivos ficam só no app. Única exceção: o código de login (modelo `codigo_login`).

## Funções
- `admin` (ADM): tudo; define quem é líder, pastor ou membro.
- `lider`: escolhe quem cumpre cada cargo, finaliza a escala, cria eventos, agenda reuniões.
- `pastor`: acompanha escala, sugestões e reuniões, sem editar a escala.
- `member`: declara disponibilidade e vê a escala finalizada. Não escolhe cargo.
O primeiro cadastro feito vira ADM.

## Perfil de cada membro
Nome, data de nascimento, WhatsApp, e-mail e ministérios ficam guardados no cadastro. A pessoa edita o próprio perfil (`PATCH /api/me`). ADM, líderes e pastores veem a lista da equipe. Por serem dados pessoais (LGPD), use só para a gestão do ministério e informe isso no cadastro.

## Passo a passo
1. Crie uma conta em developers.facebook.com, um app do tipo Business e adicione o produto WhatsApp.
2. Cadastre o número que enviará as mensagens (não pode estar em uso no WhatsApp comum).
3. Em Gerenciador do WhatsApp > Modelos de mensagem, crie e envie para aprovação (idioma pt_BR), 2 modelos:
   - `codigo_login` (autenticação): "Seu código de acesso ao Ser é {{1}}. Ele vale por 10 minutos."
   - `lembrete_escala` (utilitário): "Olá, {{1}}! {{2}} você serve em {{3}} como {{4}}. Observação do líder: {{5}}"
4. Gere um token permanente (usuário do sistema) e copie o ID do número.
5. Copie `.env.example` para `.env` e preencha.
6. Rode: `npm install` e depois `node --env-file=.env server.js`.
7. Hospede em um serviço com disco persistente (o banco `ser.db` fica em arquivo). Ex.: Railway, Render ou Fly.io.

## Observações
- A Meta cobra por mensagem enviada com modelo. Consulte a tabela de preços atual.
- Só envie para quem aceitou receber mensagens (o cadastro já exige esse aceite).
- O app (HTML) deve ser servido pela pasta `public/` e passar a chamar a API `/api/...` no lugar dos dados locais.

## Arquivos e Holyrics
- Qualquer membro envia imagem, vídeo ou áudio (`POST /api/files`). Todos veem a lista e baixam (`/api/files/:id/download`).
- O ADM ou líder toca em "Enviar ao Holyrics". O arquivo entra na fila.
- No computador do culto, rode `ponte-holyrics.js` (copie `.env.ponte.example` para `.env.ponte` e ajuste). Ele baixa os arquivos da fila e salva em `HOLYRICS_MEDIA_DIR/Imagens`, `Vídeos` ou `Áudios`. Aponte essa pasta para uma pasta que o Holyrics usa na biblioteca de mídia.
- Defina o mesmo `BRIDGE_KEY` no servidor e na ponte.
- Esta versão copia para a pasta de mídia. A API Server do Holyrics (porta 8091, com token) é outra via possível; confira na documentação oficial em github.com/holyrics/API-Server se ela aceita envio de arquivos na sua versão.

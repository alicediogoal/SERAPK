# Servidor gratuito para o Ser

## Por que não o Render grátis
O Render grátis dorme após 15 minutos sem acesso e apaga os arquivos do servidor (banco e uploads) a cada reinício. Os lembretes não sairiam e os cadastros se perderiam.

## Caminho gratuito: uma máquina virtual sempre ligada
Serve Oracle Cloud (Always Free) ou Google Cloud (e2-micro). As duas pedem cartão só para verificar a conta. Confira os limites atuais nas páginas oficiais antes de começar. A Oracle às vezes está sem vagas de máquina grátis em certas regiões, e pode recolher máquinas ociosas. Faça cópia dos dados com frequência (veja o item 8).

1. Crie a conta e uma máquina Ubuntu (22.04 ou 24.04). Libere as portas 80 e 443 (na Oracle, na lista de segurança da rede e também no firewall do Ubuntu).
2. Endereço gratuito: em duckdns.org crie um nome (ex.: `ser-minhaigreja`) apontando para o IP da máquina. Fica `ser-minhaigreja.duckdns.org`. O HTTPS é obrigatório para instalar o app no iPhone.
3. Conecte por SSH e instale:
```
sudo apt update && sudo apt install -y git build-essential python3 curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```
4. Baixe o projeto (troque SEU_USUARIO; o repositório precisa ser público ou use um token):
```
git clone https://github.com/SEU_USUARIO/SERAPK.git ser
cd ser && npm install
mkdir -p ~/ser-dados
```
5. Variáveis: `sudo nano /etc/ser.env` com o conteúdo (ajuste):
```
PORT=3000
TZ=America/Sao_Paulo
APP_SECRET=uma-frase-longa-e-aleatoria
DATA_DIR=/home/ubuntu/ser-dados
DEV_LOGIN=true
BRIDGE_KEY=outra-frase-longa
WA_TOKEN=
WA_PHONE_ID=
```
6. Serviço que reinicia sozinho: `sudo nano /etc/systemd/system/ser.service`
```
[Unit]
Description=Ser
After=network.target
[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/ser
EnvironmentFile=/etc/ser.env
ExecStart=/usr/bin/node server.js
Restart=always
[Install]
WantedBy=multi-user.target
```
`sudo systemctl enable --now ser`
7. HTTPS: `sudo nano /etc/caddy/Caddyfile` com
```
ser-minhaigreja.duckdns.org {
  reverse_proxy localhost:3000
}
```
`sudo systemctl reload caddy`. Abra o endereço no celular e faça o primeiro cadastro (vira ADM).
8. Atualizar o app depois de mudanças no GitHub: `cd ~/ser && git pull && npm install && sudo systemctl restart ser`. Cópia dos dados: baixe a pasta `~/ser-dados` (banco e arquivos) para o seu computador regularmente.

Se o usuário da máquina não for `ubuntu`, ajuste `User` e os caminhos. Para trocar `DEV_LOGIN` para `false` depois da aprovação do WhatsApp: edite `/etc/ser.env` e rode `sudo systemctl restart ser`.

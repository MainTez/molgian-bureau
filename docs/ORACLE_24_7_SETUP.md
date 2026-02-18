# Oracle 24/7 Setup Guide (Molgian Bureau)

Use this on your other PC tomorrow (Thursday, February 19, 2026).

This guide is for running the bot on an Oracle Cloud VM so it stays online 24/7.

## 1. Create Oracle VM (Always Free)
1. Sign in to Oracle Cloud.
2. Create a compute instance.
3. Pick Ubuntu image (22.04 or newer).
4. Save your SSH private key (`.key`) safely.
5. In networking/security list, keep SSH (`22`) open.

You do not need to open Discord bot ports publicly.

## 2. SSH into the VM
From PowerShell on your other PC:

```powershell
ssh -i "C:\path\to\your\oracle-key.key" ubuntu@YOUR_VM_PUBLIC_IP
```

## 3. Install Node.js + tools
Run on the VM:

```bash
sudo apt update
sudo apt install -y curl git build-essential
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

## 4. Get your bot code onto the VM
If your project is on GitHub:

```bash
git clone YOUR_REPO_URL molgian-bureau
cd molgian-bureau
```

If not on GitHub, upload/copy the project folder to the VM, then `cd` into it.

## 5. Install dependencies

```bash
npm install
```

## 6. Create `.env`
In the project root:

```bash
nano .env
```

Paste and edit:

```env
DISCORD_TOKEN=your-discord-bot-token
GUILD_ID=your-server-id
TIMEZONE=Europe/Oslo
EVENT_CHANNEL_NAME=Special Place
FANDOM_WIKI_BASE_URL=https://molgian-bureau.fandom.com
DATABASE_URL=file:./data/molgian-bureau.db
NODE_ENV=production
REGISTER_GLOBAL_COMMANDS=false
ADMIN_USER_IDS=your-discord-user-id
ALLOW_SERVER_ADMINS=false
```

Save: `Ctrl+O`, Enter, then `Ctrl+X`.

## 7. Build and run once (sanity test)

```bash
npm run build
npm run start
```

If it logs in fine, press `Ctrl+C` to stop.

## 8. Run as a service (auto-start on reboot)
Create service:

```bash
sudo nano /etc/systemd/system/molgian-bureau.service
```

Paste:

```ini
[Unit]
Description=Molgian Bureau Discord Bot
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/molgian-bureau
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable + start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable molgian-bureau
sudo systemctl start molgian-bureau
sudo systemctl status molgian-bureau
```

Live logs:

```bash
journalctl -u molgian-bureau -f
```

## 9. Update bot later

```bash
cd /home/ubuntu/molgian-bureau
git pull
npm install
npm run build
sudo systemctl restart molgian-bureau
```

## 10. SQLite backup (important)
Your DB file is:

`/home/ubuntu/molgian-bureau/data/molgian-bureau.db`

Backup command example:

```bash
cp /home/ubuntu/molgian-bureau/data/molgian-bureau.db /home/ubuntu/molgian-bureau/data/molgian-bureau-backup-$(date +%F).db
```

## Quick Troubleshooting
- Bot offline + no logs: `sudo systemctl status molgian-bureau`
- Check logs: `journalctl -u molgian-bureau -n 200 --no-pager`
- Env typo: open `.env` and verify booleans are exactly `true` or `false`
- Rebuild after code change: `npm run build`

## Official docs
- Oracle compute instances: https://docs.oracle.com/en-us/iaas/Content/Compute/Tasks/launchinginstance.htm
- Oracle Always Free: https://www.oracle.com/cloud/free/

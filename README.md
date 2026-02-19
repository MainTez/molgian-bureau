# Molgian Bureau

Discord bot for one server (`Molgarians`) with:
- Economy (`Molgium`)
- Gacha pets
- Fishing
- Gambling + Treasury
- Scheduled chaotic events
- Egg mini-games in `Special Place`

## Tech Stack
- TypeScript
- discord.js v14
- SQLite (launch)
- Drizzle ORM + SQL migrations
- Vitest tests

## Prerequisites
- Node.js 20+ (installed)
- Bun (recommended by your choice)

If Bun is not installed yet:

```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

If you want to run immediately without Bun, npm also works for now.

## 1. Discord App Setup (Beginner Guide)
1. Go to Discord Developer Portal.
2. Create a new application named `Molgian Bureau`.
3. Open `Bot` tab, click `Add Bot`.
4. Copy bot token (you will put this in `.env` as `DISCORD_TOKEN`).
5. In `Bot` tab, enable these intents:
- `SERVER MEMBERS INTENT`
- `MESSAGE CONTENT INTENT`
6. In `OAuth2 > URL Generator`:
- Scopes: `bot`, `applications.commands`
- Bot permissions: `Administrator` (simplest launch setup)
7. Open generated URL and invite bot to your `Molgarians` server.
8. Get your server ID:
- Discord user settings -> Advanced -> enable Developer Mode
- Right-click server -> Copy Server ID

## 2. Environment
Create `.env` from `.env.example`:

```env
DISCORD_TOKEN=your-discord-bot-token
GUILD_ID=your-dev-guild-id
TIMEZONE=Europe/Oslo
EVENT_CHANNEL_NAME=Special Place
FANDOM_WIKI_BASE_URL=https://your-wiki-name.fandom.com
DATABASE_URL=file:./data/molgian-bureau.db
NODE_ENV=development
REGISTER_GLOBAL_COMMANDS=false
ADMIN_USER_IDS=123456789012345678
ALLOW_SERVER_ADMINS=false
```

`ADMIN_USER_IDS` is a comma-separated allowlist for `/admin` commands.
Example: `ADMIN_USER_IDS=123...,456...`
`FANDOM_WIKI_BASE_URL` is your Fandom wiki root URL used by `/wiki`.

## 3. Install + Run

### Bun
```bash
bun install
bun run db:migrate
bun run dev
```

### npm fallback
```bash
npm install
npm run db:migrate
npm run dev
```

The bot registers guild commands at startup and ensures `Special Place` exists.

## 4. Commands

Core:
- `/work`
- `/job list`
- `/job apply id:<1|2|3>`
- `/profile`
- `/profile user:@user` (optional target)
- `/leaderboard mode:<richest|most_eggs_hatched|most_mythics|top_fish_value>`

Shop/loadout:
- `/shop`
- `/shop buy_id:<cosmetic_id>`
- `/loadout view`
- `/loadout set title id:<id>`
- `/loadout set badge id:<id>`
- `/loadout set frame id:<id>`

Rods/fishing:
- `/rod shop`
- `/rod buy tier:<starter|improved|elite>`
- `/rod equip tier:<starter|improved|elite>`
- `/fish cast`
- `/fish sell catch_id:<id|last|all>`
- `/fish collection`
- `/fish rarities`
- `/fish index`

Fisher pet note:
- Active Fisher pets can increase fish sell payout (deterministic bonus by pet rarity).

Gambling:
- `/gamble coinflip amount:<n>`
- `/gamble dice amount:<n>`
- `/jackpot enter amount:<n>`
- `/jackpot status`
- `/treasury`

Eggs/pets:
- `/hatch egg_type:<normal|mythic>`
- `/pets`
- `/pet rarities`
- `/pet equip pet_instance_id:<id>`
- `/pet keep pet_instance_id:<id>`
- `/pet shard pet_instance_id:<id>`
- `/pet sell pet_instance_id:<id>`
- `/shards`
- `/forge mythic_egg`
- `/hof`
- `/wiki home`
- `/wiki page title:<name>`
- `/wiki search query:<text>`

Admin:
- `/admin give-molgium user:@user amount:<n>`
- `/admin give-egg user:@user amount:<n>`
- `/admin force-event name:<event>`
- `/admin set-treasury amount:<n>`
- `/admin post-citizens-panel` (posts/refreshes the Citizens role button in `#Immigration-Center`)
- `/purge amount:<1-100>` (deletes both recent and old messages; pinned messages are skipped)

## 5. Daily Rules Implemented
- Daily reset: `06:00 Europe/Oslo`
- `/work` once per reset window
- `/work` has a 1% robbery chance (you get 0 payout for that day)
- Egg target: 6 wins/day server-wide
- No egg buying
- No item durability
- No trading
- One active pet per user
- No back-to-back egg-event wins by same user
- Egg events use interactive formats (buttons/reaction/duel/memory/speed), with no math quiz flow
- Slash replies and event announcements use styled embeds for consistent UI
- Common duplicate pets shard for `0.5` shards
- Faster live events: micro every ~20-40 minutes, major every ~1-2 hours (max 3 major/day)
- Micro events are treasury-aware: when Treasury is empty, bot auto-runs refill-safe events (`tax_audit`/`pickpocket`) instead of dead payout events.
- Event pings mention `@Citizens` role only (not `@everyone`)
- Admins can post/refresh a `#Immigration-Center` panel via `/admin post-citizens-panel` for self-assigning `Citizens`

## 6. Tests

```bash
npm test
```

Includes tests for:
- Work reset window math
- Jackpot tax math
- Treasury flows
- Egg scheduling + anti back-to-back winner rule
- Hatch rarity output validity

## 7. Free Hosting Note
- Free hosts can restart unexpectedly.
- Current behavior on restart: no event backfill, continue from current time.
- For remote hosting, SQLite may be ephemeral on some free providers.
- Move to Postgres when you deploy to a host without persistent disk.

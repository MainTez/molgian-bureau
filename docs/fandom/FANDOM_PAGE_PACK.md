# Molgian Bureau Fandom Page Pack

Use this file to create your Fandom pages fast.

Your wiki base:
`https://molgian-bureau.fandom.com`

Create each page title exactly as listed, then paste the content block.

---

## Page: `Molgian_Bureau_Wiki`

```wiki
= Molgian Bureau Wiki =
Welcome to the official wiki for the '''Molgian Bureau''' Discord bot.

Molgian Bureau is built for the Molgarians server and combines:
* Economy (Molgium)
* Fishing and collection tracking
* Egg events and pet gacha
* Server chaos events

== Core Info ==
* Bot Name: '''Molgian Bureau'''
* Currency: '''Molgium'''
* Main Event Channel: '''Special Place'''
* Daily Reset: '''06:00 Europe/Oslo'''
* Launch Rule: No trading

== Quick Links ==
* [[Getting_Started]]
* [[Commands]]
* [[Economy]]
* [[Fishing]]
* [[Eggs_and_Hatching]]
* [[Pets]]
* [[Events]]
* [[FAQ]]
```

---

## Page: `Getting_Started`

```wiki
= Getting Started =

== First Steps ==
# Use `/work` once per day to earn Molgium.
# Buy your first rod with `/rod buy tier:starter`.
# Equip it with `/rod equip tier:starter`.
# Start fishing with `/fish cast`.
# Join egg events in '''Special Place''' to win eggs.

== Daily Reset ==
All daily windows reset at '''06:00 Europe/Oslo'''.

== Important Launch Rules ==
* No trading
* One active pet per user
* Eggs come from events, not shop purchases
```

---

## Page: `Commands`

```wiki
= Commands =

== Economy ==
* `/work`
* `/raise list`
* `/raise buy id:<1|2|3>`
* `/profile`
* `/leaderboard mode:<richest|most_eggs_hatched|most_mythics|top_fish_value>`

== Shop and Loadout ==
* `/shop`
* `/shop buy_id:<cosmetic_id>`
* `/loadout view`
* `/loadout set title id:<id>`
* `/loadout set badge id:<id>`
* `/loadout set frame id:<id>`

== Rods and Fishing ==
* `/rod shop`
* `/rod buy tier:<starter|improved|elite>`
* `/rod equip tier:<starter|improved|elite>`
* `/fish cast`
* `/fish sell catch_id:<id|last>`
* `/fish collection`
* `/fish rarities`
* `/fish index`

== Gambling and Treasury ==
* `/gamble coinflip amount:<n>`
* `/gamble dice amount:<n>`
* `/jackpot enter amount:<n>`
* `/jackpot status`
* `/treasury`

== Eggs and Pets ==
* `/hatch egg_type:<normal|mythic>`
* `/pets`
* `/pet rarities`
* `/pet equip pet_instance_id:<id>`
* `/pet keep pet_instance_id:<id>`
* `/pet shard pet_instance_id:<id>`
* `/pet sell pet_instance_id:<id>`
* `/shards`
* `/forge mythic_egg`
* `/hof`

== Wiki ==
* `/wiki home`
* `/wiki page title:<name>`
* `/wiki search query:<text>`

== Admin (restricted) ==
* `/purge amount:<1-100>`
* `/admin give-molgium user:@user amount:<n>`
* `/admin give-egg user:@user amount:<n>`
* `/admin force-event name:<event>`
* `/admin set-treasury amount:<n>`
```

---

## Page: `Economy`

```wiki
= Economy =

== Currency ==
The bot currency is '''Molgium'''.

== Daily Work ==
Use `/work` once per reset window.

Reset time: '''06:00 Europe/Oslo'''.

Base salary starts at '''100 Molgium'''.

== Raises ==
Raises permanently improve SalaryBase.

* Raise 1: Cost 10000 -> SalaryBase 250
* Raise 2: Cost 30000 -> SalaryBase 500
* Raise 3: Cost 75000 -> SalaryBase 900

== Treasury ==
Treasury stores taxed Molgium and funds some event payouts.
Use `/treasury` to view current amount.
```

---

## Page: `Fishing`

```wiki
= Fishing =

== Requirements ==
You must own and equip a rod before fishing.

== Rod Tiers ==
* Starter Rod (300): unlocks fishing
* Improved Rod (2000): less Trash weight, small sell bonus
* Elite Rod (7500): small double sell chance and rarity bump chance

== Cooldown ==
Fishing cooldown is 15 minutes per user.

== Base Catch Rarity ==
Starter rod baseline (no boosts):
* Trash: 38%
* Common: 39%
* Rare: 16%
* Epic: 5%
* Legendary: 1.7%
* Mythic: 0.3%

== Fish Index ==
`/fish index` shows discovered fish and includes:
* Rarity
* Best value
* Seen count
* First discovered by
```

---

## Page: `Eggs_and_Hatching`

```wiki
= Eggs and Hatching =

== Egg Source ==
Eggs come from mini game events in '''Special Place'''.

Daily target: 6 egg wins server-wide.

No egg buying at launch.

== Fairness Rule ==
The same person cannot win two egg events back-to-back.

== Hatch Command ==
Use `/hatch` to hatch manually with suspense roll output.

== Normal Egg Rates ==
* Common: 75%
* Rare: 18%
* Epic: 5%
* Legendary: 1.5%
* Mythic: 0.5%

== Mythic Egg Rates ==
* Epic: 2%
* Legendary: 49%
* Mythic: 49%

Mythic eggs are crafted with `/forge mythic_egg` for 250 shards.
```

---

## Page: `Pets`

```wiki
= Pets =

== Basics ==
A pet has:
* Rarity
* Type (Worker, Fisher, Gambler, Event)

One active pet per user.

== Pet Types ==
* Worker: boosts /work payout multiplier
* Fisher: chance to bump fish rarity tier up by one
* Gambler: small deterministic bonus on wins only
* Event: Molgium bonus when winning egg mini games

== Duplicate Pets ==
When hatch result is duplicate, choose:
* Keep
* Shard
* Sell

== Shards ==
Shard values:
* Common 1
* Rare 3
* Epic 10
* Legendary 30
* Mythic 100
```

---

## Page: `Events`

```wiki
= Events =

== Event Cadence ==
* Major events: every 2 to 3 hours (max 3 per day)
* Micro events: every 45 to 90 minutes
* Egg events: separate system targeting 6 wins/day

== Online-Focused Events ==
* Pickpocket
* Claim Rush
* Stimulus Drop

== Server-Wide Events ==
* Tax Audit
* Inflation Spike
* Egg Rate Boost
* Fishing Madness
* Coinflip Chaos
```

---

## Page: `FAQ`

```wiki
= FAQ =

== Can I buy eggs? ==
No. Eggs come from events only.

== Can players trade pets or Molgium? ==
No, trading is disabled in launch version.

== Can I use more than one active pet? ==
No. One active pet per user.

== Why did I not win two egg events in a row? ==
The bot blocks back-to-back egg wins by the same user.

== How do I get Mythic pets? ==
* Normal eggs have a low Mythic chance.
* Mythic eggs have high Legendary/Mythic odds.
```

---

## Publish Order (fastest)
1. `Molgian_Bureau_Wiki`
2. `Getting_Started`
3. `Commands`
4. `Economy`
5. `Fishing`
6. `Eggs_and_Hatching`
7. `Pets`
8. `Events`
9. `FAQ`

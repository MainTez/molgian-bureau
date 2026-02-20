import {
  ChannelType,
  PermissionFlagsBits,
  type ButtonInteraction,
  type ChatInputCommandInteraction
} from 'discord.js';
import { appEnv } from '../config/env.js';
import type { ServiceContainer } from '../services.js';
import { createBotEmbed, type EmbedTone } from './embeds.js';
import { CLAIM_CITIZENS_ROLE_BUTTON_ID } from './citizensRole.js';

const formatLeaderboard = (
  rows: Array<{ username: string; value: number; detail?: string }>
): string =>
  rows.length === 0
    ? 'No data yet.'
    : rows
        .map(
          (row, index) =>
            `${index + 1}. ${row.username} - ${row.value}${row.detail ? ` (${row.detail})` : ''}`
        )
        .join('\n');

const isPrivilegedAdmin = (interaction: ChatInputCommandInteraction): boolean => {
  const isListedAdmin = appEnv.ADMIN_USER_IDS.includes(interaction.user.id);
  const isServerAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
  return isListedAdmin || (appEnv.ALLOW_SERVER_ADMINS && isServerAdmin);
};

const buildEmbedOptions = (options?: {
  tone?: EmbedTone;
  title?: string;
}): { tone?: EmbedTone; title?: string } => ({
  ...(options?.tone ? { tone: options.tone } : {}),
  ...(options?.title ? { title: options.title } : {})
});

const replyWithEmbed = async (
  interaction: ChatInputCommandInteraction,
  message: string,
  options?: { ephemeral?: boolean; tone?: EmbedTone; title?: string }
): Promise<void> => {
  await interaction.reply({
    embeds: [createBotEmbed(message, buildEmbedOptions(options))],
    ephemeral: options?.ephemeral ?? false
  });
};

const editReplyWithEmbed = async (
  interaction: ChatInputCommandInteraction,
  message: string,
  options?: { tone?: EmbedTone; title?: string }
): Promise<void> => {
  await interaction.editReply({
    embeds: [createBotEmbed(message, buildEmbedOptions(options))]
  });
};

const formatShardValue = (amount: number): string =>
  Number.isInteger(amount) ? `${amount}` : amount.toFixed(1);

const COINFLIP_ANIMATION_FRAMES = ['Coin tossed...', 'Coin spinning...', 'Coin landing...'];
const ANIMATION_STEP_MS = 450;
const PURGE_OLD_DELETE_DELAY_MS = 150;

export const handleInteraction = async (
  interaction: ChatInputCommandInteraction,
  services: ServiceContainer
): Promise<void> => {
  const username = interaction.user.username;
  const discordId = interaction.user.id;
  services.game.noteUserActive(discordId);

  if (interaction.commandName === 'work') {
    const result = await services.game.claimWork(discordId, username);
    await replyWithEmbed(interaction, result.message, {
      tone: result.ok ? 'success' : 'warning',
      title: 'Work'
    });
    return;
  }

  if (interaction.commandName === 'job') {
    const sub = interaction.options.getSubcommand();
    if (sub === 'list') {
      const result = await services.game.jobList(discordId, username);
      const lines = result.tiers.map(
        (tier) =>
          `${tier.id}. apply cost ${tier.cost}, SalaryBase ${tier.newSalaryBase}${tier.owned ? ' [hired]' : ''}`
      );
      await replyWithEmbed(
        interaction,
        `Current SalaryBase: ${result.currentSalaryBase}\n${lines.length ? lines.join('\n') : 'No jobs configured.'}`,
        { title: 'Job List' }
      );
      return;
    }
    const jobId = interaction.options.getInteger('id', true);
    const result = await services.game.jobApply(discordId, username, jobId);
    await replyWithEmbed(interaction, result.message, {
      tone: result.ok ? 'success' : 'warning',
      title: 'Job Application'
    });
    return;
  }

  if (interaction.commandName === 'shop') {
    const buyId = interaction.options.getString('buy_id');
    if (buyId) {
      const buyResult = await services.game.buyShopItem(discordId, username, buyId);
      await replyWithEmbed(interaction, buyResult.message, {
        tone: buyResult.ok ? 'success' : 'warning',
        title: 'Shop'
      });
      return;
    }
    const shop = await services.game.getShop(discordId, username);
    const rotating = shop.rotating
      .map((item) => `${item.id} (${item.slot}) - ${item.price} Molgium`)
      .join('\n');
    await replyWithEmbed(
      interaction,
      `Balance: ${shop.balance} Molgium\n\nFixed: Rods + Jobs\n\nDaily rotation:\n${rotating || 'No rotation'}`,
      { title: 'Shop' }
    );
    return;
  }

  if (interaction.commandName === 'loadout') {
    const sub = interaction.options.getSubcommand();
    if (sub === 'view') {
      const view = await services.game.loadoutView(discordId, username);
      await replyWithEmbed(
        interaction,
        `Title: ${view.titleId ?? 'None'}\nBadge: ${view.badgeId ?? 'None'}\nFrame: ${view.frameId ?? 'None'}`,
        { title: 'Loadout' }
      );
      return;
    }
    const group = interaction.options.getSubcommandGroup(true);
    if (group === 'set') {
      const slot = interaction.options.getSubcommand(true) as 'title' | 'badge' | 'frame';
      const itemId = interaction.options.getString('id', true);
      const result = await services.game.loadoutSet(discordId, username, slot, itemId);
      await replyWithEmbed(interaction, result.message, {
        tone: result.ok ? 'success' : 'warning',
        title: 'Loadout'
      });
      return;
    }
  }

  if (interaction.commandName === 'rod') {
    const sub = interaction.options.getSubcommand();
    if (sub === 'shop') {
      const rods = await services.game.rodShop(discordId, username);
      const lines = rods.map(
        (rod) =>
          `${rod.tier}: ${rod.name} (${rod.cost})${rod.owned ? ' [owned]' : ''}${rod.equipped ? ' [equipped]' : ''} | ${rod.statsSummary}`
      );
      await replyWithEmbed(interaction, lines.join('\n'), { title: 'Rod Shop' });
      return;
    }
    const tier = interaction.options.getString('tier', true) as 'starter' | 'improved' | 'elite';
    if (sub === 'buy') {
      const result = await services.game.rodBuy(discordId, username, tier);
      await replyWithEmbed(interaction, result.message, {
        tone: result.ok ? 'success' : 'warning',
        title: 'Rod Purchase'
      });
      return;
    }
    const result = await services.game.rodEquip(discordId, username, tier);
    await replyWithEmbed(interaction, result.message, {
      tone: result.ok ? 'success' : 'warning',
      title: 'Rod Equip'
    });
    return;
  }

  if (interaction.commandName === 'fish') {
    const sub = interaction.options.getSubcommand();
    if (sub === 'cast') {
      const result = await services.game.fishCast(discordId, username);
      await replyWithEmbed(interaction, result.message, {
        tone: result.ok ? 'success' : 'warning',
        title: 'Fishing'
      });
      return;
    }
    if (sub === 'sell') {
      const catchId = interaction.options.getString('catch_id', true);
      const result = await services.game.fishSell(discordId, username, catchId);
      await replyWithEmbed(interaction, result.message, {
        tone: result.ok ? 'success' : 'warning',
        title: 'Fish Sell'
      });
      return;
    }
    if (sub === 'value') {
      const result = await services.game.fishValueView(discordId, username);
      if (result.unsold === 0) {
        await replyWithEmbed(interaction, 'No unsold fish in inventory.', {
          title: 'Fish Value'
        });
        return;
      }
      const maxLines = 20;
      const lines = result.entries.slice(0, maxLines).map(
        (entry) => `- ${entry.name} [${entry.rarity}] x${entry.count}: ${entry.totalValue} Molgium`
      );
      const hiddenCount = Math.max(0, result.entries.length - maxLines);
      const valueSummary =
        `Unsold catches: ${result.unsold}\n` +
        `Base value: ${result.baseTotal} Molgium\n` +
        (result.fisherBonus > 0
          ? `Fisher bonus if sold now: +${result.fisherBonus} Molgium\n`
          : '') +
        `Estimated sell value now: ${result.estimatedTotal} Molgium`;
      await replyWithEmbed(
        interaction,
        `${valueSummary}\n\nInventory breakdown:\n${lines.join('\n')}${hiddenCount > 0 ? `\n...and ${hiddenCount} more entries.` : ''}`,
        { title: 'Fish Value' }
      );
      return;
    }
    if (sub === 'rarities') {
      await replyWithEmbed(interaction, services.game.fishRarityGuideText(), {
        title: 'Fish Rarities'
      });
      return;
    }
    if (sub === 'index') {
      await replyWithEmbed(interaction, services.game.fishIndexBookText(), {
        title: 'Fish Index'
      });
      return;
    }
    const result = await services.game.fishCollectionView(discordId, username);
    const lines = result.entries.map((entry) => `${entry.fishKey}: x${entry.count}, best ${entry.bestValue}`);
    await replyWithEmbed(
      interaction,
      `Unsold catches: ${result.unsold}\n${lines.join('\n') || 'No fish yet.'}`,
      { title: 'Fish Collection' }
    );
    return;
  }

  if (interaction.commandName === 'gamble') {
    const sub = interaction.options.getSubcommand();
    const amount = interaction.options.getInteger('amount', true);
    if (sub === 'coinflip') {
      await interaction.deferReply();
      const result = await services.game.gambleCoinflip(discordId, username, amount);
      if (!result.ok) {
        await editReplyWithEmbed(interaction, result.message, { tone: 'warning', title: 'Coinflip' });
        return;
      }
      for (const frame of COINFLIP_ANIMATION_FRAMES) {
        await editReplyWithEmbed(interaction, frame, { tone: 'event', title: 'Coinflip' });
        await new Promise((resolve) => setTimeout(resolve, ANIMATION_STEP_MS));
      }
      const tone: EmbedTone = result.message.includes('WIN') ? 'success' : 'warning';
      await editReplyWithEmbed(interaction, result.message, { tone, title: 'Coinflip Result' });
      return;
    }
    const result = await services.game.gambleDice(discordId, username, amount);
    await replyWithEmbed(interaction, result.message, {
      tone: result.ok ? 'success' : 'warning',
      title: 'Gamble'
    });
    return;
  }

  if (interaction.commandName === 'jackpot') {
    const sub = interaction.options.getSubcommand();
    if (sub === 'enter') {
      const amount = interaction.options.getInteger('amount', true);
      const result = await services.game.jackpotEnter(discordId, username, amount);
      await replyWithEmbed(interaction, result.message, {
        tone: result.ok ? 'success' : 'warning',
        title: 'Jackpot'
      });
      return;
    }
    const status = services.game.jackpotStatus();
    const lines = status.entries.map(
      (entry) => `${entry.username}: ${entry.amount} (chance ${entry.winChancePct}%)`
    );
    await replyWithEmbed(interaction, `${status.header}\n${lines.join('\n') || 'No entries.'}`, {
      title: 'Jackpot'
    });
    return;
  }

  if (interaction.commandName === 'treasury') {
    await replyWithEmbed(interaction, `Treasury: ${services.game.getTreasury()} Molgium`, {
      title: 'Treasury'
    });
    return;
  }

  if (interaction.commandName === 'hatch') {
    const eggType = (interaction.options.getString('egg_type') ?? 'normal') as 'normal' | 'mythic';
    await interaction.deferReply();
    const result = await services.game.hatch(discordId, username, eggType);
    if (!result.ok) {
      await editReplyWithEmbed(interaction, result.final, { tone: 'warning', title: 'Hatch' });
      return;
    }
    for (const line of result.suspense) {
      await editReplyWithEmbed(interaction, line, { tone: 'event', title: 'Hatch Roll' });
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
    await editReplyWithEmbed(interaction, result.final, { tone: 'success', title: 'Hatch Result' });
    return;
  }

  if (interaction.commandName === 'pets') {
    const data = await services.game.petsList(discordId, username);
    const lines = data.pets.map(
      (pet) =>
        `#${pet.id} ${pet.generatedName} - ${pet.rarity} ${pet.petType} [${pet.status}]${data.activePetId === pet.id ? ' [ACTIVE]' : ''}`
    );
    await replyWithEmbed(interaction, lines.join('\n') || 'No pets yet.', { title: 'Pets' });
    return;
  }

  if (interaction.commandName === 'pet') {
    const sub = interaction.options.getSubcommand();
    if (sub === 'rarities') {
      await replyWithEmbed(interaction, services.game.petRarityGuideText(), { title: 'Pet Rarities' });
      return;
    }
    const petInstanceId = interaction.options.getInteger('pet_instance_id', true);
    if (sub === 'equip') {
      const result = await services.game.petEquip(discordId, username, petInstanceId);
      await replyWithEmbed(interaction, result.message, {
        tone: result.ok ? 'success' : 'warning',
        title: 'Pet Equip'
      });
      return;
    }
    const action = sub as 'keep' | 'shard' | 'sell';
    const result = await services.game.petResolve(discordId, username, petInstanceId, action);
    await replyWithEmbed(interaction, result.message, {
      tone: result.ok ? 'success' : 'warning',
      title: 'Pet Resolve'
    });
    return;
  }

  if (interaction.commandName === 'shards') {
    const amount = await services.game.shardsView(discordId, username);
    await replyWithEmbed(interaction, `Shards: ${formatShardValue(amount)}`, { title: 'Shards' });
    return;
  }

  if (interaction.commandName === 'forge') {
    const result = await services.game.forgeMythicEgg(discordId, username);
    await replyWithEmbed(interaction, result.message, {
      tone: result.ok ? 'success' : 'warning',
      title: 'Forge'
    });
    return;
  }

  if (interaction.commandName === 'missions') {
    const sub = interaction.options.getSubcommand(true);
    if (sub === 'view') {
      const data = await services.game.missionsView(discordId, username);
      const formatEntry = (entry: {
        id: string;
        label: string;
        progress: number;
        target: number;
        completed: boolean;
        claimed: boolean;
      }): string => {
        const status = entry.claimed ? 'CLAIMED' : entry.completed ? 'READY' : 'IN PROGRESS';
        return `- ${entry.id}: ${entry.label} (${entry.progress}/${entry.target}) [${status}]`;
      };
      const lines = [
        `Daily (${data.dailyKey}):`,
        ...data.daily.map(formatEntry),
        '',
        `Weekly (${data.weeklyKey}):`,
        ...data.weekly.map(formatEntry),
        '',
        'Rewards per mission claim: random 0.1 to 0.5 shards + Molgium (daily 50-150, weekly 300-700).'
      ];
      await replyWithEmbed(interaction, lines.join('\n'), { title: 'Missions' });
      return;
    }

    const missionId = interaction.options.getString('id', true);
    const result = await services.game.missionClaim(discordId, username, missionId);
    await replyWithEmbed(interaction, result.message, {
      tone: result.ok ? 'success' : 'warning',
      title: 'Mission Claim'
    });
    return;
  }

  if (interaction.commandName === 'profile') {
    const targetUser = interaction.options.getUser('user') ?? interaction.user;
    const profile = await services.game.profile(targetUser.id, targetUser.username);
    const passiveLines =
      profile.activePetBonuses.length > 0
        ? profile.activePetBonuses.map((line) => `- ${line}`).join('\n')
        : '- none';
    await replyWithEmbed(
      interaction,
      [
        `Profile: ${targetUser.username}`,
        `Balance: ${profile.balance}`,
        `SalaryBase: ${profile.salaryBase}`,
        `Work cooldown: ${profile.workReady ? 'Ready' : 'Not ready'}`,
        `Work streak: ${profile.workStreak} (+${profile.workStreakBonusPct.toFixed(1)}% /work payout)`,
        `Active pet: ${profile.activePet}`,
        `Active pet boosts:\n${passiveLines}`,
        `Eggs: ${profile.eggs} (Mythic eggs: ${profile.mythicEggs})`,
        `Shards: ${formatShardValue(profile.shards)}`,
        `Missions: daily ${profile.dailyMissionsCompleted}/${profile.dailyMissionsTotal}, weekly ${profile.weeklyMissionsCompleted}/${profile.weeklyMissionsTotal}`,
        `Loadout: title=${profile.loadout.title ?? 'none'}, badge=${profile.loadout.badge ?? 'none'}, frame=${profile.loadout.frame ?? 'none'}`,
        `Lifetime eggs hatched: ${profile.lifetimeEggsHatched}`,
        `Rarest pet owned: ${profile.rarestPetOwned}`,
        `Rarest fish: ${profile.rarestFishOwned}`
      ].join('\n'),
      { title: 'Profile' }
    );
    return;
  }

  if (interaction.commandName === 'leaderboard') {
    const mode = interaction.options.getString('mode', true) as
      | 'richest'
      | 'most_eggs_hatched'
      | 'most_mythics'
      | 'top_fish_value';
    const rows = await services.game.leaderboard(mode);
    await replyWithEmbed(interaction, `Leaderboard: ${mode}\n${formatLeaderboard(rows)}`, {
      title: 'Leaderboard'
    });
    return;
  }

  if (interaction.commandName === 'patchnotes') {
    await replyWithEmbed(interaction, services.game.patchNotesText(), { title: 'Patch Notes' });
    return;
  }

  if (interaction.commandName === 'hof') {
    const rows = services.game.hof();
    const text =
      rows.length === 0
        ? 'No Hall of Fame records yet.'
        : rows
            .map((row, index) => `${index + 1}. ${row.username} - ${row.entry} [${row.rarity}]`)
            .join('\n');
    await replyWithEmbed(interaction, text, { title: 'Hall of Fame' });
    return;
  }

  if (interaction.commandName === 'wiki') {
    const sub = interaction.options.getSubcommand(true);
    if (sub === 'home') {
      await replyWithEmbed(interaction, `Molgian Bureau Fandom: ${services.game.wikiHomeUrl()}`, {
        title: 'Wiki'
      });
      return;
    }
    if (sub === 'page') {
      const title = interaction.options.getString('title', true);
      await replyWithEmbed(interaction, `Wiki page: ${services.game.wikiPageUrl(title)}`, {
        title: 'Wiki'
      });
      return;
    }
    const query = interaction.options.getString('query', true);
    await replyWithEmbed(interaction, `Wiki search: ${services.game.wikiSearchUrl(query)}`, {
      title: 'Wiki'
    });
    return;
  }

  if (interaction.commandName === 'purge') {
    if (!isPrivilegedAdmin(interaction)) {
      await replyWithEmbed(
        interaction,
        'Admin command blocked. Ask bot owner to add your user ID to ADMIN_USER_IDS in .env.',
        { ephemeral: true, tone: 'error', title: 'Admin' }
      );
      return;
    }

    const amount = interaction.options.getInteger('amount', true);
    const channel = interaction.channel;
    if (
      !channel ||
      (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)
    ) {
      await replyWithEmbed(interaction, 'This command can only be used in a server text channel.', {
        ephemeral: true,
        tone: 'warning',
        title: 'Purge'
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const fetched = await channel.messages.fetch({ limit: amount });
    const now = Date.now();
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
    const unpinned = fetched.filter((message) => !message.pinned);
    const recent = unpinned.filter((message) => now - message.createdTimestamp < fourteenDaysMs);
    const old = unpinned.filter((message) => now - message.createdTimestamp >= fourteenDaysMs);
    const skippedPinned = fetched.size - unpinned.size;

    let deletedRecent = 0;
    let failedRecent = 0;
    if (recent.size > 0) {
      try {
        const deleted = await channel.bulkDelete(recent, true);
        deletedRecent = deleted.size;
        failedRecent = Math.max(0, recent.size - deletedRecent);
      } catch {
        failedRecent = recent.size;
      }
    }

    let deletedOld = 0;
    let failedOld = 0;
    const oldMessages = [...old.values()];
    for (const [index, message] of oldMessages.entries()) {
      try {
        await message.delete();
        deletedOld += 1;
      } catch {
        failedOld += 1;
      }
      if (index < oldMessages.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, PURGE_OLD_DELETE_DELAY_MS));
      }
    }

    const deletedCount = deletedRecent + deletedOld;
    const failedCount = failedRecent + failedOld;

    await editReplyWithEmbed(
      interaction,
      `Purged ${deletedCount} message(s): ${deletedRecent} recent + ${deletedOld} old. ` +
        `Skipped ${skippedPinned} pinned.` +
        `${failedCount > 0 ? ` Failed to delete ${failedCount} message(s).` : ''}`,
      { tone: 'success', title: 'Purge' }
    );
    return;
  }

  if (interaction.commandName === 'admin') {
    if (!isPrivilegedAdmin(interaction)) {
      await replyWithEmbed(
        interaction,
        'Admin command blocked. Ask bot owner to add your user ID to ADMIN_USER_IDS in .env.',
        { ephemeral: true, tone: 'error', title: 'Admin' }
      );
      return;
    }
    const sub = interaction.options.getSubcommand(true);
    if (sub === 'give-molgium') {
      const target = interaction.options.getUser('user', true);
      const amount = interaction.options.getInteger('amount', true);
      const result = await services.game.adminGiveMolgium(target.id, amount);
      await replyWithEmbed(interaction, result.message, {
        tone: result.ok ? 'success' : 'warning',
        title: 'Admin'
      });
      return;
    }
    if (sub === 'give-egg') {
      const target = interaction.options.getUser('user', true);
      const amount = interaction.options.getInteger('amount', true);
      const result = await services.game.adminGiveEgg(target.id, amount);
      await replyWithEmbed(interaction, result.message, {
        tone: result.ok ? 'success' : 'warning',
        title: 'Admin'
      });
      return;
    }
    if (sub === 'set-treasury') {
      const amount = interaction.options.getInteger('amount', true);
      const result = services.game.adminSetTreasury(amount);
      await replyWithEmbed(interaction, result.message, {
        tone: result.ok ? 'success' : 'warning',
        title: 'Admin'
      });
      return;
    }
    if (sub === 'post-citizens-panel') {
      const result = await services.game.adminPostCitizensPanel();
      await replyWithEmbed(interaction, result.message, {
        tone: result.ok ? 'success' : 'warning',
        title: 'Admin'
      });
      return;
    }
    if (sub === 'force-event') {
      const name = interaction.options.getString('name', true) as
        | 'pickpocket'
        | 'claim_rush'
        | 'stimulus_drop'
        | 'tax_audit'
        | 'inflation_spike'
        | 'egg_rate_boost'
        | 'fishing_madness'
          | 'coinflip_chaos'
          | 'egg_spawn';
      await interaction.deferReply();
      await services.game.runEvent(name, { bypassCooldown: true });
      await editReplyWithEmbed(interaction, `Forced event ${name} executed.`, {
        tone: 'success',
        title: 'Admin'
      });
      return;
    }
  }

  await replyWithEmbed(interaction, 'Command not implemented.', { ephemeral: true, tone: 'warning' });
};

export const handleButtonInteraction = async (
  interaction: ButtonInteraction,
  services: ServiceContainer
): Promise<void> => {
  if (interaction.customId !== CLAIM_CITIZENS_ROLE_BUTTON_ID) return;
  services.game.noteUserActive(interaction.user.id);
  const result = await services.game.claimCitizensRole(interaction.user.id);
  await interaction.reply({
    embeds: [
      createBotEmbed(result.message, {
        tone: result.ok ? 'success' : 'warning',
        title: 'Citizens Role'
      })
    ],
    ephemeral: true
  });
};

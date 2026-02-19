import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type MessageCreateOptions,
  type Role
} from 'discord.js';
import { createBotEmbed } from './embeds.js';

export const CITIZENS_ROLE_NAME = 'Citizens';
export const RULES_CHANNEL_NAME = 'da-rules';
export const CLAIM_CITIZENS_ROLE_BUTTON_ID = 'citizens_role_claim';

const panelDescription = (role: Role | null): string =>
  role
    ? `Click the button below to get ${role} and unlock community channels.`
    : `Click the button below to get the **${CITIZENS_ROLE_NAME}** role and unlock community channels.`;

export const createCitizensRolePanelPayload = (
  role: Role | null
): Pick<MessageCreateOptions, 'embeds' | 'components' | 'allowedMentions'> => ({
  embeds: [
    createBotEmbed(panelDescription(role), {
      tone: 'info',
      title: 'Welcome To Molgarians'
    })
  ],
  components: [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(CLAIM_CITIZENS_ROLE_BUTTON_ID)
        .setLabel('Get Citizens Role')
        .setStyle(ButtonStyle.Success)
    )
  ],
  allowedMentions: { parse: [] }
});

/**
 * /privacy Command
 *
 * User commands for managing their privacy preferences.
 * Allows users to opt-out of data collection and request deletion.
 */

import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { PrivacyManager } from '../services/privacyManager.js';

export const data = new SlashCommandBuilder()
  .setName('privacy')
  .setDescription('Manage your privacy settings')
  .addSubcommand(sub =>
    sub
      .setName('settings')
      .setDescription('View your current privacy settings')
  )
  .addSubcommand(sub =>
    sub
      .setName('opt-out')
      .setDescription('Opt out of data collection')
      .addStringOption(opt =>
        opt
          .setName('type')
          .setDescription('What to opt out of')
          .setRequired(true)
          .addChoices(
            { name: 'Message History', value: 'history' },
            { name: 'ML Training', value: 'training' },
            { name: 'All Data Collection', value: 'all' }
          )
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('opt-in')
      .setDescription('Opt back in to data collection')
      .addStringOption(opt =>
        opt
          .setName('type')
          .setDescription('What to opt in to')
          .setRequired(true)
          .addChoices(
            { name: 'Message History', value: 'history' },
            { name: 'ML Training', value: 'training' },
            { name: 'All Data Collection', value: 'all' }
          )
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('delete')
      .setDescription('Request deletion of all your data')
  )
  .addSubcommand(sub =>
    sub
      .setName('info')
      .setDescription('Learn about what data we collect and how it\'s used')
  );

export async function execute(interaction, services) {
  const { db } = services;
  const subcommand = interaction.options.getSubcommand();
  const privacyManager = new PrivacyManager(db);

  switch (subcommand) {
    case 'settings':
      return handleSettings(interaction, privacyManager);
    case 'opt-out':
      return handleOptOut(interaction, privacyManager);
    case 'opt-in':
      return handleOptIn(interaction, privacyManager);
    case 'delete':
      return handleDelete(interaction, privacyManager);
    case 'info':
      return handleInfo(interaction);
    default:
      return interaction.reply({ content: 'Unknown subcommand', ephemeral: true });
  }
}

async function handleSettings(interaction, privacyManager) {
  const result = await privacyManager.getSettings(interaction.user.id, interaction.guildId);

  if (!result.ok) {
    return interaction.reply({
      content: 'Failed to retrieve your privacy settings.',
      ephemeral: true,
    });
  }

  const settings = result.data;

  const embed = new EmbedBuilder()
    .setTitle('Your Privacy Settings')
    .setColor(settings.optOutHistory || settings.optOutTraining ? 0xff9900 : 0x00ff00)
    .setDescription('Here are your current privacy preferences for this server.')
    .addFields(
      {
        name: 'Message History Collection',
        value: settings.optOutHistory ? '🚫 Opted Out' : '✅ Opted In',
        inline: true,
      },
      {
        name: 'ML Training',
        value: settings.optOutTraining ? '🚫 Opted Out' : '✅ Opted In',
        inline: true,
      },
      {
        name: 'Embeddings',
        value: settings.optOutEmbeddings ? '🚫 Opted Out' : '✅ Opted In',
        inline: true,
      }
    )
    .setTimestamp();

  if (settings.requestedDeletion) {
    embed.addFields({
      name: '⚠️ Deletion Request',
      value: `You have requested deletion of your data on ${settings.deletionRequestedAt?.toLocaleDateString() || 'Unknown date'}. This will be processed within 7 days.`,
      inline: false,
    });
  }

  embed.setFooter({
    text: 'Use /privacy opt-out or /privacy delete to change these settings',
  });

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleOptOut(interaction, privacyManager) {
  const type = interaction.options.getString('type');
  const userId = interaction.user.id;
  const guildId = interaction.guildId;

  let result;
  let message;

  switch (type) {
    case 'history':
      result = await privacyManager.setHistoryOptOut(userId, true, guildId);
      message = 'You have opted out of message history collection. Your future messages in this server will not be stored.';
      break;
    case 'training':
      result = await privacyManager.setTrainingOptOut(userId, true, guildId);
      message = 'You have opted out of ML training. Your messages will not be used to train AI models.';
      break;
    case 'all':
      result = await privacyManager.updateSettings(userId, {
        optOutHistory: true,
        optOutTraining: true,
        optOutEmbeddings: true,
      }, guildId);
      message = 'You have opted out of all data collection. Your messages will not be stored, used for training, or embedded.';
      break;
  }

  if (!result.ok) {
    return interaction.reply({
      content: 'Failed to update your privacy settings. Please try again.',
      ephemeral: true,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle('Privacy Settings Updated')
    .setColor(0x00ff00)
    .setDescription(message)
    .setFooter({ text: 'Your preference has been saved.' })
    .setTimestamp();

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleOptIn(interaction, privacyManager) {
  const type = interaction.options.getString('type');
  const userId = interaction.user.id;
  const guildId = interaction.guildId;

  let result;
  let message;

  switch (type) {
    case 'history':
      result = await privacyManager.setHistoryOptOut(userId, false, guildId);
      message = 'You have opted back in to message history collection.';
      break;
    case 'training':
      result = await privacyManager.setTrainingOptOut(userId, false, guildId);
      message = 'You have opted back in to ML training.';
      break;
    case 'all':
      result = await privacyManager.updateSettings(userId, {
        optOutHistory: false,
        optOutTraining: false,
        optOutEmbeddings: false,
      }, guildId);
      message = 'You have opted back in to all data collection.';
      break;
  }

  if (!result.ok) {
    return interaction.reply({
      content: 'Failed to update your privacy settings. Please try again.',
      ephemeral: true,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle('Privacy Settings Updated')
    .setColor(0x00ff00)
    .setDescription(message)
    .setFooter({ text: 'Your preference has been saved.' })
    .setTimestamp();

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleDelete(interaction, privacyManager) {
  // Show confirmation dialog
  const embed = new EmbedBuilder()
    .setTitle('⚠️ Data Deletion Request')
    .setColor(0xff0000)
    .setDescription(
      'You are about to request deletion of all your data. This action:\n\n' +
      '• **Immediately** redacts all your stored messages\n' +
      '• **Permanently deletes** your data within 7 days\n' +
      '• **Cannot be undone** once processed\n\n' +
      'Are you sure you want to proceed?'
    )
    .setTimestamp();

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`privacy_delete_confirm_${interaction.user.id}`)
        .setLabel('Yes, Delete My Data')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`privacy_delete_cancel_${interaction.user.id}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

  const response = await interaction.reply({
    embeds: [embed],
    components: [row],
    ephemeral: true,
  });

  // Wait for button interaction
  try {
    const buttonInteraction = await response.awaitMessageComponent({
      filter: i => i.user.id === interaction.user.id,
      time: 60000,
    });

    if (buttonInteraction.customId.startsWith('privacy_delete_confirm')) {
      // Process deletion
      const result = await privacyManager.requestDeletion(interaction.user.id);

      if (!result.ok) {
        return buttonInteraction.update({
          content: 'Failed to process deletion request. Please try again.',
          embeds: [],
          components: [],
        });
      }

      const successEmbed = new EmbedBuilder()
        .setTitle('Deletion Request Submitted')
        .setColor(0x00ff00)
        .setDescription(
          'Your data deletion request has been submitted.\n\n' +
          `• **${result.data.messagesRedacted}** messages have been redacted\n` +
          '• Permanent deletion will occur within 7 days\n' +
          '• You have been opted out of all future data collection'
        )
        .setTimestamp();

      return buttonInteraction.update({
        embeds: [successEmbed],
        components: [],
      });
    } else {
      // Cancelled
      return buttonInteraction.update({
        content: 'Deletion request cancelled.',
        embeds: [],
        components: [],
      });
    }
  } catch {
    // Timeout
    return interaction.editReply({
      content: 'Deletion request timed out. Please try again if you still wish to delete your data.',
      embeds: [],
      components: [],
    });
  }
}

async function handleInfo(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('Privacy Information')
    .setColor(0x0099ff)
    .setDescription(
      'This bot collects certain data to provide its features. ' +
      'Here\'s what we collect and how it\'s used:'
    )
    .addFields(
      {
        name: '📝 Message History',
        value:
          'We store messages from channels for:\n' +
          '• Providing conversation context to the AI\n' +
          '• RAG (Retrieval-Augmented Generation) for better responses\n' +
          '• Channel activity analytics\n\n' +
          '*Retention: 90 days, then automatically deleted*',
      },
      {
        name: '🤖 ML Training',
        value:
          'Messages may be used to:\n' +
          '• Fine-tune AI models for better responses\n' +
          '• Train persona-specific language models\n\n' +
          '*Only messages marked as "training eligible" are used*',
      },
      {
        name: '🔍 Embeddings',
        value:
          'We may generate vector embeddings for:\n' +
          '• Semantic search capabilities\n' +
          '• Finding relevant context for AI responses\n\n' +
          '*Embeddings are mathematical representations, not raw text*',
      },
      {
        name: '🔒 Your Rights',
        value:
          '• **Opt-out**: Use `/privacy opt-out` to stop data collection\n' +
          '• **Delete**: Use `/privacy delete` to remove all your data\n' +
          '• **View**: Use `/privacy settings` to see your preferences',
      }
    )
    .setFooter({
      text: 'Your privacy matters. You can opt out at any time.',
    })
    .setTimestamp();

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

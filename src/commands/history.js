/**
 * /history Command
 *
 * Admin commands for managing channel message history.
 * Requires MANAGE_GUILD permission.
 */

import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { ChannelHistoryIngestion } from '../services/channelHistoryIngestion.js';
import { MessageArchive } from '../services/messageArchive.js';
import { syncSingleChannel } from '../jobs/channelHistorySync.js';

export const data = new SlashCommandBuilder()
  .setName('history')
  .setDescription('Manage channel message history')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand(sub =>
    sub
      .setName('sync')
      .setDescription('Sync messages from a channel')
      .addChannelOption(opt =>
        opt
          .setName('channel')
          .setDescription('Channel to sync (default: current)')
          .setRequired(false)
      )
      .addIntegerOption(opt =>
        opt
          .setName('days')
          .setDescription('Number of days to look back (default: 7)')
          .setMinValue(1)
          .setMaxValue(30)
          .setRequired(false)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('stats')
      .setDescription('View history storage statistics')
      .addChannelOption(opt =>
        opt
          .setName('channel')
          .setDescription('Channel to check (default: all)')
          .setRequired(false)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('search')
      .setDescription('Search message history')
      .addStringOption(opt =>
        opt
          .setName('query')
          .setDescription('Search query')
          .setRequired(true)
      )
      .addChannelOption(opt =>
        opt
          .setName('channel')
          .setDescription('Channel to search (default: all)')
          .setRequired(false)
      )
      .addIntegerOption(opt =>
        opt
          .setName('limit')
          .setDescription('Number of results (default: 5)')
          .setMinValue(1)
          .setMaxValue(20)
          .setRequired(false)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('config')
      .setDescription('Configure history sync for this server')
      .addBooleanOption(opt =>
        opt
          .setName('enabled')
          .setDescription('Enable/disable automatic sync')
          .setRequired(false)
      )
      .addBooleanOption(opt =>
        opt
          .setName('embeddings')
          .setDescription('Generate embeddings for RAG')
          .setRequired(false)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('exclude')
      .setDescription('Exclude a channel from sync')
      .addChannelOption(opt =>
        opt
          .setName('channel')
          .setDescription('Channel to exclude')
          .setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('include')
      .setDescription('Re-include a previously excluded channel')
      .addChannelOption(opt =>
        opt
          .setName('channel')
          .setDescription('Channel to include')
          .setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('activity')
      .setDescription('View channel activity summary')
      .addChannelOption(opt =>
        opt
          .setName('channel')
          .setDescription('Channel to analyze')
          .setRequired(true)
      )
      .addIntegerOption(opt =>
        opt
          .setName('days')
          .setDescription('Number of days to analyze (default: 7)')
          .setMinValue(1)
          .setMaxValue(30)
          .setRequired(false)
      )
  );

export async function execute(interaction, services) {
  const { db, ai } = services;
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'sync':
      return handleSync(interaction, db, ai);
    case 'stats':
      return handleStats(interaction, db);
    case 'search':
      return handleSearch(interaction, db);
    case 'config':
      return handleConfig(interaction, db);
    case 'exclude':
      return handleExclude(interaction, db);
    case 'include':
      return handleInclude(interaction, db);
    case 'activity':
      return handleActivity(interaction, db);
    default:
      return interaction.reply({ content: 'Unknown subcommand', ephemeral: true });
  }
}

async function handleSync(interaction, db, aiClient) {
  await interaction.deferReply({ ephemeral: true });

  const channel = interaction.options.getChannel('channel') || interaction.channel;
  const days = interaction.options.getInteger('days') || 7;

  // Verify it's a text channel
  if (channel.type !== 0) {
    return interaction.editReply('Can only sync text channels.');
  }

  const result = await syncSingleChannel(db, aiClient, channel, {
    maxDays: days,
    generateEmbeddings: false,
  });

  if (!result.ok) {
    return interaction.editReply(`Sync failed: ${result.error.message}`);
  }

  const embed = new EmbedBuilder()
    .setTitle('Channel Sync Complete')
    .setColor(0x00ff00)
    .addFields(
      { name: 'Channel', value: `<#${channel.id}>`, inline: true },
      { name: 'Days', value: String(days), inline: true },
      { name: 'Messages Fetched', value: String(result.data.totalFetched), inline: true },
      { name: 'New Messages Stored', value: String(result.data.totalStored), inline: true },
      { name: 'Skipped', value: String(result.data.totalSkipped), inline: true }
    )
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}

async function handleStats(interaction, db) {
  await interaction.deferReply({ ephemeral: true });

  const channel = interaction.options.getChannel('channel');
  const ingestion = new ChannelHistoryIngestion(db);

  const result = await ingestion.getStats(interaction.guildId);

  if (!result.ok) {
    return interaction.editReply(`Failed to get stats: ${result.error.message}`);
  }

  const stats = result.data;

  const embed = new EmbedBuilder()
    .setTitle('Message History Statistics')
    .setColor(0x0099ff)
    .addFields(
      { name: 'Total Messages', value: String(stats.totalMessages), inline: true },
      { name: 'Unique Authors', value: String(stats.uniqueAuthors), inline: true },
      { name: 'Channels', value: String(stats.uniqueChannels), inline: true },
      { name: 'Training Eligible', value: String(stats.trainingEligibleCount), inline: true },
      { name: 'With Embeddings', value: String(stats.withEmbeddingsCount), inline: true },
      { name: 'Opted Out', value: String(stats.optedOutCount), inline: true }
    );

  if (stats.oldestMessage) {
    embed.addFields({
      name: 'Date Range',
      value: `${stats.oldestMessage.toLocaleDateString()} - ${stats.newestMessage.toLocaleDateString()}`,
      inline: false,
    });
  }

  embed.setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}

async function handleSearch(interaction, db) {
  await interaction.deferReply({ ephemeral: true });

  const query = interaction.options.getString('query');
  const channel = interaction.options.getChannel('channel');
  const limit = interaction.options.getInteger('limit') || 5;

  const archive = new MessageArchive(db);

  const options = {
    guildId: interaction.guildId,
    limit,
  };

  if (channel) {
    options.channelId = channel.id;
  }

  const result = await archive.searchText(query, options);

  if (!result.ok) {
    return interaction.editReply(`Search failed: ${result.error.message}`);
  }

  if (result.data.length === 0) {
    return interaction.editReply('No messages found matching your query.');
  }

  const embed = new EmbedBuilder()
    .setTitle(`Search Results for "${query}"`)
    .setColor(0x0099ff)
    .setDescription(`Found ${result.data.length} result(s)`)
    .setTimestamp();

  for (const msg of result.data.slice(0, 5)) {
    const content = (msg.cleanContent || msg.content).substring(0, 100);
    embed.addFields({
      name: `${msg.authorName || 'Unknown'} - ${msg.timestamp.toLocaleDateString()}`,
      value: `${content}${content.length === 100 ? '...' : ''}\n<#${msg.channelId}>`,
    });
  }

  return interaction.editReply({ embeds: [embed] });
}

async function handleConfig(interaction, db) {
  const enabled = interaction.options.getBoolean('enabled');
  const embeddings = interaction.options.getBoolean('embeddings');

  if (enabled === null && embeddings === null) {
    // Show current config
    const config = await db.collection('guild_config').findOne({ guildId: interaction.guildId });
    const historyConfig = config?.historySync || {};

    const embed = new EmbedBuilder()
      .setTitle('History Sync Configuration')
      .setColor(0x0099ff)
      .addFields(
        { name: 'Auto Sync', value: historyConfig.enabled !== false ? 'Enabled' : 'Disabled', inline: true },
        { name: 'Embeddings', value: historyConfig.generateEmbeddings ? 'Enabled' : 'Disabled', inline: true },
        {
          name: 'Excluded Channels',
          value: historyConfig.excludeChannels?.length
            ? historyConfig.excludeChannels.map(id => `<#${id}>`).join(', ')
            : 'None',
        }
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // Update config
  const update = {};
  if (enabled !== null) {
    update['historySync.enabled'] = enabled;
  }
  if (embeddings !== null) {
    update['historySync.generateEmbeddings'] = embeddings;
  }

  await db.collection('guild_config').updateOne(
    { guildId: interaction.guildId },
    { $set: update },
    { upsert: true }
  );

  return interaction.reply({
    content: 'Configuration updated successfully.',
    ephemeral: true,
  });
}

async function handleExclude(interaction, db) {
  const channel = interaction.options.getChannel('channel');

  await db.collection('guild_config').updateOne(
    { guildId: interaction.guildId },
    {
      $addToSet: { 'historySync.excludeChannels': channel.id },
    },
    { upsert: true }
  );

  return interaction.reply({
    content: `<#${channel.id}> has been excluded from history sync.`,
    ephemeral: true,
  });
}

async function handleInclude(interaction, db) {
  const channel = interaction.options.getChannel('channel');

  await db.collection('guild_config').updateOne(
    { guildId: interaction.guildId },
    {
      $pull: { 'historySync.excludeChannels': channel.id },
    }
  );

  return interaction.reply({
    content: `<#${channel.id}> has been re-included in history sync.`,
    ephemeral: true,
  });
}

async function handleActivity(interaction, db) {
  await interaction.deferReply({ ephemeral: true });

  const channel = interaction.options.getChannel('channel');
  const days = interaction.options.getInteger('days') || 7;

  const archive = new MessageArchive(db);
  const result = await archive.getChannelActivity(channel.id, days);

  if (!result.ok) {
    return interaction.editReply(`Failed to get activity: ${result.error.message}`);
  }

  if (result.data.length === 0) {
    return interaction.editReply('No activity data found for this channel.');
  }

  const embed = new EmbedBuilder()
    .setTitle(`Activity for #${channel.name}`)
    .setColor(0x0099ff)
    .setDescription(`Last ${days} days`)
    .setTimestamp();

  // Format as a simple chart-like display
  const maxCount = Math.max(...result.data.map(d => d.messageCount));
  const chartLines = result.data.map(day => {
    const barLength = Math.round((day.messageCount / maxCount) * 10);
    const bar = '█'.repeat(barLength) + '░'.repeat(10 - barLength);
    return `\`${day.date}\` ${bar} ${day.messageCount} msgs (${day.uniqueAuthors} users)`;
  });

  embed.addFields({
    name: 'Daily Activity',
    value: chartLines.join('\n') || 'No data',
  });

  return interaction.editReply({ embeds: [embed] });
}

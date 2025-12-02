/**
 * Channel History Sync Job
 *
 * Cron job that periodically syncs Discord channel messages to MongoDB.
 * Default: Every 6 hours
 *
 * Features:
 * - Incremental sync (only fetches new messages since last sync)
 * - Guild-level configuration for which channels to sync
 * - Privacy opt-out respect
 * - Optional embedding generation
 */

import cron from 'node-cron';
import { ChannelHistoryIngestion } from '../services/channelHistoryIngestion.js';
import { PrivacyManager } from '../services/privacyManager.js';

const JOB_NAME = 'channelHistorySync';
const DEFAULT_CRON = '0 */6 * * *'; // Every 6 hours

/**
 * Get the last sync timestamp for a guild.
 */
async function getLastSyncTime(db, guildId) {
  const syncState = await db.collection('sync_state').findOne({
    type: 'channel_history',
    guildId,
  });
  return syncState?.lastSync || null;
}

/**
 * Update the last sync timestamp for a guild.
 */
async function updateLastSyncTime(db, guildId) {
  await db.collection('sync_state').updateOne(
    { type: 'channel_history', guildId },
    {
      $set: { lastSync: new Date(), updatedAt: new Date() },
      $setOnInsert: { type: 'channel_history', guildId, createdAt: new Date() },
    },
    { upsert: true }
  );
}

/**
 * Get channel sync configuration for a guild.
 */
async function getGuildSyncConfig(db, guildId) {
  const config = await db.collection('guild_config').findOne({ guildId });
  return {
    enabled: config?.historySync?.enabled ?? true,
    excludeChannels: config?.historySync?.excludeChannels || [],
    includeChannels: config?.historySync?.includeChannels || null,
    generateEmbeddings: config?.historySync?.generateEmbeddings ?? false,
  };
}

/**
 * Run the sync for a single guild.
 */
async function syncGuild(client, db, aiClient, guild, globalConfig) {
  const guildConfig = await getGuildSyncConfig(db, guild.id);

  if (!guildConfig.enabled) {
    console.log(`[${JOB_NAME}] Sync disabled for guild ${guild.name} (${guild.id})`);
    return { skipped: true, reason: 'disabled' };
  }

  const ingestion = new ChannelHistoryIngestion(db, aiClient);

  // Get last sync time for incremental sync
  const lastSync = await getLastSyncTime(db, guild.id);

  const options = {
    maxDays: globalConfig.maxDays || 7,
    generateEmbeddings: guildConfig.generateEmbeddings,
    excludeChannels: guildConfig.excludeChannels,
    includeChannels: guildConfig.includeChannels,
  };

  // If we have a last sync time, only fetch messages after that
  if (lastSync) {
    options.after = lastSync;
  }

  console.log(`[${JOB_NAME}] Starting sync for guild ${guild.name} (${guild.id})`);
  console.log(`[${JOB_NAME}] Options:`, {
    maxDays: options.maxDays,
    after: options.after?.toISOString() || 'none',
    generateEmbeddings: options.generateEmbeddings,
  });

  const result = await ingestion.ingestGuild(guild, options);

  if (result.ok) {
    await updateLastSyncTime(db, guild.id);
    console.log(`[${JOB_NAME}] Guild ${guild.name} sync complete:`, {
      channels: result.data.totalChannels,
      fetched: result.data.totalFetched,
      stored: result.data.totalStored,
    });
  } else {
    console.error(`[${JOB_NAME}] Guild ${guild.name} sync failed:`, result.error);
  }

  return result;
}

/**
 * Main job execution function.
 */
async function runJob(client, db, aiClient, config) {
  console.log(`[${JOB_NAME}] Job started at ${new Date().toISOString()}`);

  const results = {
    startTime: new Date(),
    guilds: [],
    totalFetched: 0,
    totalStored: 0,
    errors: [],
  };

  // Process each guild the bot is in
  for (const guild of client.guilds.cache.values()) {
    try {
      const result = await syncGuild(client, db, aiClient, guild, config);

      results.guilds.push({
        guildId: guild.id,
        guildName: guild.name,
        ...result,
      });

      if (result.ok && result.data) {
        results.totalFetched += result.data.totalFetched || 0;
        results.totalStored += result.data.totalStored || 0;
      }
    } catch (error) {
      console.error(`[${JOB_NAME}] Error processing guild ${guild.name}:`, error);
      results.errors.push({
        guildId: guild.id,
        guildName: guild.name,
        error: error.message,
      });
    }
  }

  // Run privacy sync to mark opted-out messages
  const privacyManager = new PrivacyManager(db);
  await privacyManager.syncOptOutStatus();

  results.endTime = new Date();
  results.duration = results.endTime - results.startTime;

  console.log(`[${JOB_NAME}] Job completed in ${results.duration}ms`);
  console.log(`[${JOB_NAME}] Summary: ${results.totalStored} new messages stored from ${results.guilds.length} guilds`);

  return results;
}

/**
 * Create and register the cron job.
 * @param {Client} client - Discord.js client
 * @param {Db} db - MongoDB database
 * @param {object} aiClient - AI service client
 * @param {object} config - Job configuration
 */
export function createChannelHistorySyncJob(client, db, aiClient, config = {}) {
  const cronSchedule = config.cron || process.env.CHANNEL_HISTORY_CRON || DEFAULT_CRON;
  const enabled = config.enabled ?? (process.env.CHANNEL_HISTORY_ENABLED !== 'false');

  if (!enabled) {
    console.log(`[${JOB_NAME}] Job disabled by configuration`);
    return null;
  }

  const jobConfig = {
    maxDays: parseInt(process.env.CHANNEL_HISTORY_MAX_DAYS || '7', 10),
    ...config,
  };

  console.log(`[${JOB_NAME}] Registering job with schedule: ${cronSchedule}`);

  const job = cron.schedule(cronSchedule, async () => {
    try {
      await runJob(client, db, aiClient, jobConfig);
    } catch (error) {
      console.error(`[${JOB_NAME}] Job execution failed:`, error);
    }
  });

  // Expose manual trigger function
  job.runNow = async () => {
    console.log(`[${JOB_NAME}] Manual trigger requested`);
    return runJob(client, db, aiClient, jobConfig);
  };

  return job;
}

/**
 * Run a one-time sync (useful for initial import or manual triggers).
 */
export async function runOnceSync(client, db, aiClient, options = {}) {
  const config = {
    maxDays: parseInt(process.env.CHANNEL_HISTORY_MAX_DAYS || '7', 10),
    ...options,
  };

  return runJob(client, db, aiClient, config);
}

/**
 * Sync a specific channel (for admin commands).
 */
export async function syncSingleChannel(db, aiClient, channel, options = {}) {
  const ingestion = new ChannelHistoryIngestion(db, aiClient);

  const syncOptions = {
    maxDays: options.maxDays || 7,
    generateEmbeddings: options.generateEmbeddings || false,
    limit: options.limit || null,
  };

  console.log(`[${JOB_NAME}] Single channel sync: ${channel.name} (${channel.id})`);

  return ingestion.ingestChannel(channel, syncOptions);
}

export default createChannelHistorySyncJob;

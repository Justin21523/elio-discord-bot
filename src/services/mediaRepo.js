import { collections } from "../db/mongo.js";

/**
 * Pick a random media.
 * - Public channels: only enabled && !nsfw
 * - NSFW channels:   enabled && (nsfw true/false 都可)
 */
export async function pickRandom({ allowNsfw = false, tags = [] } = {}) {
  const { media } = collections();
  const match = { enabled: true };
  if (!allowNsfw) match.nsfw = { $ne: true };
  if (tags.length) match.tags = { $in: tags };

  const docs = await media
    .aggregate([{ $match: match }, { $sample: { size: 1 } }])
    .toArray();

  return docs[0] || null;
}

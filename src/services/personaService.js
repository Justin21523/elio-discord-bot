/**
 * services/personasService.js
 * Persona management and affinity tracking.
 * Handles character interactions, config, and relationship stats.
 */

import { getDB } from "../db/mongo.js";
import { logger } from "../util/logger.js";
import { ErrorCode } from "../config.js";

/**
 * Get persona by name
 * @param {string} personaName
 * @returns {Promise<{ok: boolean, data?: Object, error?: AppError}>}
 */
export async function getPersona(personaName) {
  try {
    const db = getDB();
    const persona = await db.collection("personas").findOne({
      name: { $regex: new RegExp(`^${personaName}$`, "i") },
    });

    if (!persona) {
      return {
        ok: false,
        error: {
          code: ErrorCode.NOT_FOUND,
          message: `Persona "${personaName}" not found`,
        },
      };
    }

    return { ok: true, data: persona };
  } catch (error) {
    logger.error("[Personas] getPersona failed", {
      personaName,
      error: error.message,
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.DB_ERROR,
        message: "Failed to get persona",
        cause: error,
      },
    };
  }
}

/**
 * List all personas
 * @returns {Promise<{ok: boolean, data?: Array, error?: AppError}>}
 */
export async function listPersonas() {
  try {
    const db = getDB();
    const personas = await db
      .collection("personas")
      .find({})
      .project({ name: 1, avatarUrl: 1, traits: 1 })
      .toArray();

    return { ok: true, data: personas };
  } catch (error) {
    logger.error("[Personas] listPersonas failed", {
      error: error.message,
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.DB_ERROR,
        message: "Failed to list personas",
        cause: error,
      },
    };
  }
}

/**
 * Get or create persona config for a guild
 * @param {string} guildId
 * @returns {Promise<{ok: boolean, data?: Object, error?: AppError}>}
 */
export async function getConfig(guildId) {
  try {
    const db = getDB();

    let config = await db.collection("persona_config").findOne({ guildId });

    if (!config) {
      // Create default config
      const defaultConfig = {
        guildId,
        cooldownSec: 60,
        multipliers: {
          meet: 1.0,
          praise: 1.2,
          gift: 1.5,
          insult: 0.5,
        },
        keywordTriggersEnabled: false,
        memoryOptIn: false,
        createdAt: new Date(),
      };

      await db.collection("persona_config").insertOne(defaultConfig);
      config = defaultConfig;
    }

    return { ok: true, data: config };
  } catch (error) {
    logger.error("[Personas] getConfig failed", {
      guildId,
      error: error.message,
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.DB_ERROR,
        message: "Failed to get persona config",
        cause: error,
      },
    };
  }
}

/**
 * Update persona config for a guild
 * @param {string} guildId
 * @param {Object} updates - Config fields to update
 * @returns {Promise<{ok: boolean, data?: Object, error?: AppError}>}
 */
export async function setConfig(guildId, updates) {
  try {
    const db = getDB();

    // Validate updates
    const allowedFields = [
      "cooldownSec",
      "multipliers",
      "keywordTriggersEnabled",
      "memoryOptIn",
    ];

    const filteredUpdates = {};
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        filteredUpdates[key] = value;
      }
    }

    if (Object.keys(filteredUpdates).length === 0) {
      return {
        ok: false,
        error: {
          code: ErrorCode.VALIDATION_FAILED,
          message: "No valid config fields to update",
        },
      };
    }

    filteredUpdates.updatedAt = new Date();

    await db.collection("persona_config").updateOne(
      { guildId },
      {
        $set: filteredUpdates,
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );

    logger.info("[Personas] Config updated", {
      guildId,
      updates: Object.keys(filteredUpdates),
    });

    return { ok: true, data: filteredUpdates };
  } catch (error) {
    logger.error("[Personas] setConfig failed", {
      guildId,
      error: error.message,
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.DB_ERROR,
        message: "Failed to update persona config",
        cause: error,
      },
    };
  }
}

/**
 * Get user's affinity with a persona
 * @param {Object} params
 * @param {string} params.guildId
 * @param {string} params.userId
 * @param {string} params.personaId
 * @returns {Promise<{ok: boolean, data?: Object, error?: AppError}>}
 */
export async function getAffinity({ guildId, userId, personaId }) {
  try {
    const db = getDB();
    const { ObjectId } = await import("mongodb");

    const affinity = await db.collection("persona_affinity").findOne({
      guildId,
      userId,
      personaId: new ObjectId(personaId),
    });

    if (!affinity) {
      return {
        ok: true,
        data: {
          friendship: 0,
          trust: 0,
          dependence: 0,
          lastInteractAt: null,
        },
      };
    }

    return {
      ok: true,
      data: {
        friendship: affinity.friendship,
        trust: affinity.trust,
        dependence: affinity.dependence,
        lastInteractAt: affinity.lastInteractAt,
      },
    };
  } catch (error) {
    logger.error("[Personas] getAffinity failed", {
      guildId,
      userId,
      personaId,
      error: error.message,
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.DB_ERROR,
        message: "Failed to get affinity",
        cause: error,
      },
    };
  }
}

/**
 * Adjust affinity values
 * @param {Object} params
 * @param {string} params.guildId
 * @param {string} params.userId
 * @param {string} params.personaId
 * @param {Object} params.delta - Changes to apply { friendship?, trust?, dependence? }
 * @param {string} [params.action] - Action type for logging
 * @returns {Promise<{ok: boolean, data?: Object, error?: AppError}>}
 */
export async function affinityDelta({
  guildId,
  userId,
  personaId,
  delta,
  action = "unknown",
}) {
  try {
    const db = getDB();
    const { ObjectId } = await import("mongodb");

    // Build update object
    const updates = {};
    if (delta.friendship !== undefined)
      updates["friendship"] = delta.friendship;
    if (delta.trust !== undefined) updates["trust"] = delta.trust;
    if (delta.dependence !== undefined)
      updates["dependence"] = delta.dependence;

    if (Object.keys(updates).length === 0) {
      return {
        ok: false,
        error: {
          code: ErrorCode.VALIDATION_FAILED,
          message: "No affinity changes specified",
        },
      };
    }

    // Convert to $inc operations
    const incOps = {};
    for (const [key, value] of Object.entries(updates)) {
      incOps[key] = value;
    }

    const result = await db.collection("persona_affinity").findOneAndUpdate(
      {
        guildId,
        userId,
        personaId: new ObjectId(personaId),
      },
      {
        $inc: incOps,
        $set: {
          lastInteractAt: new Date(),
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      {
        upsert: true,
        returnDocument: "after",
      }
    );

    const affinity = result.value;

    // Clamp values to 0-100 range
    const clampedUpdates = {};
    let needsClamp = false;

    for (const key of ["friendship", "trust", "dependence"]) {
      if (affinity[key] < 0) {
        clampedUpdates[key] = 0;
        needsClamp = true;
      } else if (affinity[key] > 100) {
        clampedUpdates[key] = 100;
        needsClamp = true;
      }
    }

    if (needsClamp) {
      await db
        .collection("persona_affinity")
        .updateOne({ _id: affinity._id }, { $set: clampedUpdates });
      Object.assign(affinity, clampedUpdates);
    }

    logger.info("[Personas] Affinity delta applied", {
      guildId,
      userId,
      personaId,
      action,
      delta,
      newValues: {
        friendship: affinity.friendship,
        trust: affinity.trust,
        dependence: affinity.dependence,
      },
    });

    return {
      ok: true,
      data: {
        friendship: affinity.friendship,
        trust: affinity.trust,
        dependence: affinity.dependence,
      },
    };
  } catch (error) {
    logger.error("[Personas] affinityDelta failed", {
      guildId,
      userId,
      personaId,
      error: error.message,
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.DB_ERROR,
        message: "Failed to update affinity",
        cause: error,
      },
    };
  }
}

/**
 * Check if keyword triggers are enabled for guild
 * @param {string} guildId
 * @returns {Promise<boolean>}
 */
export async function keywordTriggersEnabled(guildId) {
  const configResult = await getConfig(guildId);
  if (!configResult.ok) return false;
  return configResult.data.keywordTriggersEnabled || false;
}

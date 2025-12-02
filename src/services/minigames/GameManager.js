/**
 * services/minigames/GameManager.js
 * Central manager for all mini-games
 */

import { getCollection } from "../../db/mongo.js";
import { logger } from "../../util/logger.js";

// Game registry - import game implementations here
import TriviaGame from "./games/TriviaGame.js";
import AdventureGame from "./games/AdventureGame.js";
import ReactionGame from "./games/ReactionGame.js";
import GuessNumberGame from "./games/GuessNumberGame.js";
import DiceRollGame from "./games/DiceRollGame.js";
import BattleGame from "./games/BattleGame.js";
import { getKeyItems } from "../loot.js";
import { logEvent } from "../analytics/events.js";
import { COOLDOWNS } from "../../config/cooldowns.js";
import IRClueGame from "./games/IRClueGame.js";
import IRDocHuntGame from "./games/IRDocHuntGame.js";
import HMMSequenceGame from "./games/HMMSequenceGame.js";
import NgramStoryGame from "./games/NgramStoryGame.js";
import PMIAssociationGame from "./games/PMIAssociationGame.js";
import KeywordPMIGame from "./games/KeywordPMIGame.js";

const GAME_TYPES = {
  trivia: TriviaGame,
  adventure: AdventureGame,
  reaction: ReactionGame,
  "guess-number": GuessNumberGame,
  "dice-roll": DiceRollGame,
  battle: BattleGame,
  "ir-clue": IRClueGame,
  "doc-hunt": IRDocHuntGame,
  "hmm-sequence": HMMSequenceGame,
  "ngram-story": NgramStoryGame,
  "pmi": PMIAssociationGame,
  "pmi-choice": KeywordPMIGame,
};

// Active game sessions (in-memory)
// Map<channelId, GameInstance>
const activeSessions = new Map();
const startCooldowns = new Map(); // Map<channelId, timestamp>
const START_COOLDOWN_MS = COOLDOWNS.minigameStartMs || 10_000;

export class GameManager {
  /**
   * Start a new game session
   */
  static async startGame(gameType, channel, user, options = {}) {
    try {
      const now = Date.now();
      const lastStart = startCooldowns.get(channel.id) || 0;
      if (now - lastStart < START_COOLDOWN_MS) {
        return {
          ok: false,
          error: "Too many game starts. Please wait a few seconds and try again.",
        };
      }

      // Check if game already active in this channel
      if (activeSessions.has(channel.id)) {
        const existingGame = activeSessions.get(channel.id);
        const age = now - (existingGame.startedAt || now);
        const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

        // Auto-clear stale sessions
        if (age > STALE_THRESHOLD_MS || existingGame.status === "ended") {
          activeSessions.delete(channel.id);
          startCooldowns.delete(channel.id);
          logger.info("[MINIGAME] Auto-cleared stale session", { channelId: channel.id, age });
        } else {
          return {
            ok: false,
            error: "A game is already active in this channel. Use `/minigame stop` to end it first!",
          };
        }
      }

      // Get game class
      const GameClass = GAME_TYPES[gameType];
      if (!GameClass) {
        return {
          ok: false,
          error: `Unknown game type: ${gameType}. Available: ${Object.keys(GAME_TYPES).join(", ")}`,
        };
      }

      // Create game instance
      let gameOptions = { ...options };

      // Inject key items into adventure from inventory
      if (gameType === "adventure") {
        const keyItems = await getKeyItems(user.id, options.guildId);
        gameOptions = { ...options, keyItems };
      }

      const game = new GameClass(channel, user, gameOptions);

      // Initialize game
      await game.initialize();

       // Log start
      await logEvent({
        userId: user.id,
        username: user.username,
        guildId: options.guildId,
        gameType,
        action: "start",
        meta: { scope: options.scope || "channel" },
      });

      // Store in active sessions
      activeSessions.set(channel.id, game);
      startCooldowns.set(channel.id, now);

      // Save to database
      await this._saveGameState(game);

      logger.info("[MINIGAME] Started game", {
        gameType,
        channelId: channel.id,
        userId: user.id,
      });

      // Start game
      await game.start();

      return { ok: true, game };
    } catch (error) {
      logger.error("[MINIGAME] Failed to start game", { error: error.message });
      return { ok: false, error: error.message };
    }
  }

  /**
   * Handle user action in active game
   */
  static async handleAction(channelId, userId, action, data = {}) {
    const game = activeSessions.get(channelId);

    if (!game) {
      return { ok: false, error: "No active game in this channel" };
    }

    try {
      const result = await game.handleAction(userId, action, data);

      // Update database + events
      await logEvent({
        userId,
        username: userId,
        guildId: data.guildId || null,
        gameType: game.constructor.name.replace("Game", "").toLowerCase(),
        action,
        meta: data,
      });

      // Update database
      await this._saveGameState(game);

      // Check if game ended
      if (game.isEnded()) {
        await this.endGame(channelId, result?.endReason || "completed");
      }

      return result;
    } catch (error) {
      logger.error("[MINIGAME] Action failed", { error: error.message });
      return { ok: false, error: error.message };
    }
  }

  /**
   * End game session
   */
  static async endGame(channelId, reason = "completed") {
    const game = activeSessions.get(channelId);

    if (!game) {
      return { ok: false, error: "No active game" };
    }

    try {
      await game.end(reason);
      // Log end
      await logEvent({
        userId: game.initiator?.id,
        username: game.initiator?.username,
        guildId: game.options?.guildId || null,
        gameType: game.constructor.name.replace("Game", "").toLowerCase(),
        action: "end",
        meta: {
          reason,
          winnerId: game.winner?.userId,
          winnerName: game.winner?.username,
        },
      });

      // Save final state
      await this._saveGameState(game);

      // Remove from active sessions
      activeSessions.delete(channelId);

      logger.info("[MINIGAME] Ended game", { channelId, reason });

      return { ok: true };
    } catch (error) {
      logger.error("[MINIGAME] Failed to end game", { error: error.message });
      return { ok: false, error: error.message };
    }
  }

  /**
   * Get active game in channel
   */
  static getGame(channelId) {
    return activeSessions.get(channelId);
  }

  /**
   * Get all active games
   */
  static getActiveGames() {
    return Array.from(activeSessions.values());
  }

  /**
   * Force clear a stuck game session (admin use)
   */
  static forceClear(channelId) {
    if (activeSessions.has(channelId)) {
      activeSessions.delete(channelId);
      startCooldowns.delete(channelId);
      logger.info("[MINIGAME] Force cleared session", { channelId });
      return { ok: true, message: "Session cleared" };
    }
    return { ok: false, error: "No session found for this channel" };
  }

  /**
   * Clear all stale sessions (older than 30 minutes)
   */
  static cleanupStaleSessions() {
    const now = Date.now();
    const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
    let cleared = 0;

    for (const [channelId, game] of activeSessions.entries()) {
      const age = now - (game.startedAt || now);
      if (age > STALE_THRESHOLD_MS) {
        activeSessions.delete(channelId);
        startCooldowns.delete(channelId);
        cleared++;
        logger.info("[MINIGAME] Cleared stale session", { channelId, age });
      }
    }

    return { ok: true, cleared };
  }

  /**
   * Get debug info about active sessions
   */
  static getDebugInfo() {
    const sessions = [];
    for (const [channelId, game] of activeSessions.entries()) {
      sessions.push({
        channelId,
        gameType: game.constructor.name,
        status: game.status,
        startedAt: game.startedAt,
        players: game.players?.length || 0,
      });
    }
    return sessions;
  }

  /**
   * Save game state to database
   */
  static async _saveGameState(game) {
    try {
      const col = getCollection("minigames");
      const state = game.serialize();

      await col.updateOne(
        { sessionId: state.sessionId },
        { $set: state },
        { upsert: true }
      );
    } catch (error) {
      logger.warn("[MINIGAME] Failed to save state", { error: error.message });
    }
  }

  /**
   * Get game statistics for user
   */
  static async getUserStats(userId) {
    try {
      const col = getCollection("minigames");
      const games = await col.find({ "players.userId": userId }).toArray();

      const stats = {
        totalGames: games.length,
        wins: 0,
        losses: 0,
        byType: {},
      };

      for (const game of games) {
        const player = game.players.find((p) => p.userId === userId);
        if (!player) continue;

        if (player.won) stats.wins++;
        else if (game.status === "ended") stats.losses++;

        if (!stats.byType[game.gameType]) {
          stats.byType[game.gameType] = { played: 0, won: 0 };
        }
        stats.byType[game.gameType].played++;
        if (player.won) stats.byType[game.gameType].won++;
      }

      return { ok: true, stats };
    } catch (error) {
      logger.error("[MINIGAME] Failed to get stats", { error: error.message });
      return { ok: false, error: error.message };
    }
  }
}

export default GameManager;

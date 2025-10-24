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

const GAME_TYPES = {
  trivia: TriviaGame,
  adventure: AdventureGame,
  reaction: ReactionGame,
};

// Active game sessions (in-memory)
// Map<channelId, GameInstance>
const activeSessions = new Map();

export class GameManager {
  /**
   * Start a new game session
   */
  static async startGame(gameType, channel, user, options = {}) {
    try {
      // Check if game already active in this channel
      if (activeSessions.has(channel.id)) {
        return {
          ok: false,
          error: "A game is already active in this channel. Finish it first!",
        };
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
      const game = new GameClass(channel, user, options);

      // Initialize game
      await game.initialize();

      // Store in active sessions
      activeSessions.set(channel.id, game);

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

      // Update database
      await this._saveGameState(game);

      // Check if game ended
      if (game.isEnded()) {
        await this.endGame(channelId);
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

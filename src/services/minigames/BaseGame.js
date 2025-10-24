/**
 * services/minigames/BaseGame.js
 * Base class for all mini-games
 */

import { nanoid } from "nanoid";
import { logger } from "../../util/logger.js";

export class BaseGame {
  constructor(channel, initiator, options = {}) {
    this.sessionId = nanoid();
    this.channel = channel;
    this.initiator = initiator;
    this.options = options;

    this.status = "created"; // created, active, paused, ended
    this.players = [];
    this.currentTurn = null;
    this.startedAt = null;
    this.endedAt = null;
    this.winner = null;

    this.gameData = {}; // Game-specific data
  }

  /**
   * Initialize game (override in subclasses)
   */
  async initialize() {
    // Add initiator as first player
    this.players.push({
      userId: this.initiator.id,
      username: this.initiator.username,
      score: 0,
      won: false,
    });

    logger.debug(`[GAME:${this.constructor.name}] Initialized`);
  }

  /**
   * Start the game (override in subclasses)
   */
  async start() {
    this.status = "active";
    this.startedAt = Date.now();
    this.currentTurn = 0;

    await this.channel.send({
      content: `🎮 **${this.getGameName()}** started!`,
      embeds: [this.getStatusEmbed()],
    });
  }

  /**
   * Handle player action (must override in subclasses)
   */
  async handleAction(userId, action, data = {}) {
    throw new Error("handleAction must be implemented in subclass");
  }

  /**
   * End the game
   */
  async end(reason = "completed") {
    this.status = "ended";
    this.endedAt = Date.now();

    const duration = Math.round((this.endedAt - this.startedAt) / 1000);

    await this.channel.send({
      embeds: [
        {
          title: `🏁 Game Over - ${this.getGameName()}`,
          description: this.getEndMessage(reason),
          color: 0x00ff00,
          fields: [
            {
              name: "Duration",
              value: `${duration} seconds`,
              inline: true,
            },
            {
              name: "Winner",
              value: this.winner
                ? `<@${this.winner.userId}>`
                : "No winner",
              inline: true,
            },
          ],
          footer: { text: `Session: ${this.sessionId}` },
        },
      ],
    });

    logger.info(`[GAME:${this.constructor.name}] Ended`, {
      sessionId: this.sessionId,
      reason,
      duration,
    });
  }

  /**
   * Check if game is ended
   */
  isEnded() {
    return this.status === "ended";
  }

  /**
   * Add player to game
   */
  addPlayer(user) {
    if (this.players.some((p) => p.userId === user.id)) {
      return false; // Already in game
    }

    this.players.push({
      userId: user.id,
      username: user.username,
      score: 0,
      won: false,
    });

    return true;
  }

  /**
   * Get player by userId
   */
  getPlayer(userId) {
    return this.players.find((p) => p.userId === userId);
  }

  /**
   * Get current player (for turn-based games)
   */
  getCurrentPlayer() {
    if (this.currentTurn === null || this.players.length === 0) {
      return null;
    }
    return this.players[this.currentTurn % this.players.length];
  }

  /**
   * Advance to next turn
   */
  nextTurn() {
    if (this.currentTurn !== null) {
      this.currentTurn++;
    }
  }

  /**
   * Serialize game state for database
   */
  serialize() {
    return {
      sessionId: this.sessionId,
      gameType: this.constructor.name.replace("Game", "").toLowerCase(),
      channelId: this.channel.id,
      guildId: this.channel.guild?.id,
      status: this.status,
      players: this.players,
      currentTurn: this.currentTurn,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      winner: this.winner,
      gameData: this.gameData,
      options: this.options,
    };
  }

  /**
   * Get game name (override in subclasses)
   */
  getGameName() {
    return "Mini Game";
  }

  /**
   * Get status embed (override in subclasses)
   */
  getStatusEmbed() {
    return {
      title: `🎮 ${this.getGameName()}`,
      description: "Game in progress...",
      color: 0x3498db,
      fields: [
        {
          name: "Players",
          value: this.players.map((p) => `<@${p.userId}>`).join(", "),
          inline: false,
        },
        {
          name: "Status",
          value: this.status,
          inline: true,
        },
      ],
      footer: { text: `Session: ${this.sessionId}` },
    };
  }

  /**
   * Get end message (override in subclasses)
   */
  getEndMessage(reason) {
    if (reason === "timeout") {
      return "Game ended due to timeout.";
    } else if (reason === "forfeit") {
      return "Game was forfeited.";
    } else {
      return "Game completed!";
    }
  }

  /**
   * Check if user can act (for turn-based games)
   */
  canAct(userId) {
    const current = this.getCurrentPlayer();
    return current && current.userId === userId;
  }
}

export default BaseGame;

/**
 * services/minigames/games/BattleGame.js
 * Turn-based battle (CPU-only) with simple stats and skills.
 * Uses PFA behavior model + error injection for human-like bot AI.
 */

import { BaseGame } from "../BaseGame.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { AI_ENABLED } from "../../../config.js";
import { logEvent } from "../../analytics/events.js";
import { COOLDOWNS } from "../../../config/cooldowns.js";

// Bot playstyles - assigned randomly or based on character
const BOT_PLAYSTYLES = ['aggressive', 'defensive', 'balanced', 'chaotic'];
const BOT_SKILL_LEVELS = { easy: 0.4, normal: 0.6, hard: 0.8, expert: 0.95 };

const DEFAULT_PLAYERS = [
  { name: "Warrior", hp: 30, atk: 6, def: 2, speed: 5, skills: ["strike", "guard"] },
  { name: "Rogue", hp: 24, atk: 5, def: 1, speed: 7, skills: ["strike", "quick"] },
  { name: "Guardian", hp: 35, atk: 4, def: 3, speed: 3, skills: ["strike", "block"] },
];

const SKILLS = {
  strike: { name: "Strike", desc: "Basic attack", dmg: 1.0, cd: 0 },
  guard: { name: "Guard", desc: "Raise defense", buff: { def: +2 }, cd: 1 },
  quick: { name: "Quick Stab", desc: "Fast hit", dmg: 0.8, cd: 0, speedBonus: 2 },
  block: { name: "Block", desc: "Reduce damage taken", buff: { def: +3 }, cd: 2 },
};

const TURN_TIMEOUT_MS = 20_000;
const TURN_TIMEOUT_CONFIG = COOLDOWNS.battleTurnMs || TURN_TIMEOUT_MS;

export class BattleGame extends BaseGame {
  async initialize() {
    await super.initialize();

    // Build two-player match: initiator + optional vsBot
    this.players = [];
    this.players.push(this.makeFighter(this.initiator));

    if (this.options.vsBot) {
      const difficulty = this.options.difficulty || 'normal';
      this.players.push(this.makeFighter({ id: "bot_opponent", username: "Bot Opponent" }, true, difficulty));
    }

    this.gameData = {
      turnIndex: 0,
      cooldowns: new Map(), // key: userId_skill -> remaining turns
      lastAction: null,
      botLastAction: null, // Track bot's previous action for AI
    };

    // Initialize bot AI if using AI service
    await this.initBotAI();
  }

  async initBotAI() {
    const bot = this.players.find((p) => p.isBot);
    if (!bot) return;

    const ai = this.options.aiService;
    if (!ai?.gameAI) return;

    try {
      const res = await ai.gameAI.battleInit({
        sessionId: this.sessionId,
        playstyle: bot.playstyle,
        skillLevel: bot.skillLevel,
        personalityWeight: 0.6,
      });
      if (res?.ok) {
        bot.aiInitialized = true;
        // Use the AI-assigned playstyle if different
        if (res.data?.playstyle) {
          bot.playstyle = res.data.playstyle;
        }
      }
    } catch (e) {
      // Fall back to simple AI
      bot.aiInitialized = false;
    }
  }

  makeFighter(user, isBot = false, difficulty = 'normal') {
    const template = DEFAULT_PLAYERS[Math.floor(Math.random() * DEFAULT_PLAYERS.length)];
    const fighter = {
      userId: user.id,
      username: user.username || template.name,
      isBot,
      hp: template.hp,
      maxHp: template.hp,
      atk: template.atk,
      def: template.def,
      speed: template.speed,
      skills: template.skills,
      buffs: { def: 0 },
    };

    // Add bot-specific properties
    if (isBot) {
      fighter.playstyle = BOT_PLAYSTYLES[Math.floor(Math.random() * BOT_PLAYSTYLES.length)];
      fighter.skillLevel = BOT_SKILL_LEVELS[difficulty] || 0.6;
      fighter.aiInitialized = false;
    }

    return fighter;
  }

  async start() {
    this.status = "active";
    this.startedAt = Date.now();
    await this.sendState("Battle started! Choose a skill.");
    this.scheduleTurnTimeout();
  }

  currentPlayer() {
    return this.players[this.gameData.turnIndex % this.players.length];
  }

  opponentOf(userId) {
    return this.players.find((p) => p.userId !== userId);
  }

  async handleAction(userId, action, data = {}) {
    if (this.status !== "active") return { ok: false, error: "Game ended" };

    const current = this.currentPlayer();
    if (current.userId !== userId && !current.isBot) {
      return { ok: false, error: "Not your turn" };
    }

    if (action !== "skill") return { ok: false, error: "Unknown action" };

    const skillId = data.skillId;
    const skill = SKILLS[skillId];
    if (!skill) return { ok: false, error: "Invalid skill" };

    const cdKey = `${userId}_${skillId}`;
    const cdRemaining = this.gameData.cooldowns.get(cdKey) || 0;
    if (cdRemaining > 0) {
      return { ok: false, error: `${skill.name} is on cooldown (${cdRemaining} turns left)` };
    }

    const target = this.opponentOf(userId);
    if (!target) return { ok: false, error: "No opponent" };

    let log = "";
    if (skill.dmg) {
      const base = current.atk * skill.dmg;
      const def = target.def + target.buffs.def;
      const dmg = Math.max(1, Math.round(base - def));
      target.hp -= dmg;
      log = `${current.username} used ${skill.name} on ${target.username} for ${dmg} dmg`;
    }

    if (skill.buff) {
      current.buffs.def = (current.buffs.def || 0) + (skill.buff.def || 0);
      log = `${current.username} used ${skill.name} and gained defense!`;
    }

    if (skill.cd && skill.cd > 0) {
      this.gameData.cooldowns.set(cdKey, skill.cd + 1); // include this turn
    }

    this.gameData.lastAction = log;

    // Add AI flavor text if provided
    if (data.flavorText && current.isBot) {
      this.gameData.lastAction += `\n_${data.flavorText}_`;
    }

    // Check end
    if (target.hp <= 0) {
      this.winner = current;
      current.won = true;
      this.status = "ended";
      await this.sendState(`${target.username} is defeated!`);
      await logEvent({
        userId,
        username: current.username,
        guildId: this.options.guildId,
        gameType: "battle",
        action: "win",
        meta: { skill: skill.name, target: target.userId },
      });
      await this.end("completed");
      return { ok: true };
    }

    // Advance turn
    this.advanceTurn();
    await this.sendState(log);
    this.scheduleTurnTimeout();

    // Bot turn
    const next = this.currentPlayer();
    if (next.isBot) {
      setTimeout(() => this.botTurn(next), 1200);
    }

    return { ok: true };
  }

  advanceTurn() {
    // reduce cooldowns
    for (const [key, cd] of this.gameData.cooldowns.entries()) {
      const nextCd = Math.max(0, cd - 1);
      this.gameData.cooldowns.set(key, nextCd);
    }
    this.gameData.turnIndex++;
  }

  async botTurn(bot) {
    if (this.status !== "active") return;

    let skillId;
    let flavorText = null;

    // Try AI-powered decision
    const ai = this.options.aiService;
    const player = this.players.find((p) => !p.isBot);

    if (AI_ENABLED && ai?.gameAI && bot.aiInitialized) {
      try {
        // Build available actions (skills not on cooldown)
        const availableActions = bot.skills.filter(
          (s) => (this.gameData.cooldowns.get(`${bot.userId}_${s}`) || 0) === 0
        );

        // Build cooldowns dict for AI
        const cooldowns = {};
        for (const skill of bot.skills) {
          const cd = this.gameData.cooldowns.get(`${bot.userId}_${skill}`) || 0;
          if (cd > 0) cooldowns[skill] = cd;
        }

        const res = await ai.gameAI.battleAction({
          sessionId: this.sessionId,
          myHp: bot.hp,
          enemyHp: player?.hp || 0,
          availableActions,
          cooldowns,
          enemyLastAction: this.gameData.botLastAction,
          myMaxHp: bot.maxHp,
          enemyMaxHp: player?.maxHp || 30,
          skillLevel: bot.skillLevel,
          injectErrors: true,
        });

        if (res?.ok && res.data?.action) {
          skillId = res.data.action;
          flavorText = res.data.flavor_text;

          // Log if an error was injected (for debugging/analytics)
          if (res.data.error_info?.error_type) {
            await logEvent({
              userId: bot.userId,
              guildId: this.options.guildId,
              gameType: "battle",
              action: "bot_error",
              meta: {
                errorType: res.data.error_info.error_type,
                intended: res.data.error_info.original_action,
                actual: skillId,
              },
            });
          }
        }
      } catch (e) {
        // Fall back to simple AI
      }
    }

    // Fallback: simple skill selection
    if (!skillId) {
      skillId = bot.skills.find(
        (s) => (this.gameData.cooldowns.get(`${bot.userId}_${s}`) || 0) === 0
      ) || bot.skills[0];
    }

    // Store bot's action for next turn's AI context
    this.gameData.botLastAction = skillId;

    // Execute the action with optional flavor
    await this.handleAction(bot.userId, "skill", { skillId, flavorText });
  }

  async sendState(prefix) {
    const fields = this.players.map((p) => {
      let name = `${p.isBot ? "🤖" : "🧑"} ${p.username}`;
      // Show bot playstyle if initialized
      if (p.isBot && p.playstyle && p.aiInitialized) {
        const styleEmojis = {
          aggressive: "🔥",
          defensive: "🛡️",
          balanced: "⚖️",
          chaotic: "🎲",
        };
        name += ` ${styleEmojis[p.playstyle] || ""}`;
      }
      return {
        name,
        value: `❤️ HP: ${Math.max(0, p.hp)}/${p.maxHp || p.hp}  | 🗡️ ATK: ${p.atk} | 🛡️ DEF: ${p.def}+${p.buffs.def || 0}`,
        inline: false,
      };
    });

    const current = this.currentPlayer();
    const buttons = current.skills.map((sid) =>
      new ButtonBuilder()
        .setCustomId(`battle_skill_${this.sessionId}_${sid}`)
        .setLabel(SKILLS[sid].name)
        .setStyle(ButtonStyle.Primary)
    );

    const row = new ActionRowBuilder().addComponents(buttons);

    const flavor = await this.generateFlavor(prefix);

    await this.channel.send({
      content: prefix || "Your turn",
      embeds: [
        {
          title: "⚔️ Battle",
          description: `Turn: ${current.username}${flavor ? `\n\n${flavor}` : ""}`,
          color: 0xe67e22,
          fields,
          footer: this.gameData.lastAction ? { text: this.gameData.lastAction } : undefined,
        },
      ],
      components: [row],
    });
  }

  scheduleTurnTimeout() {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = setTimeout(() => this.timeoutTurn(), TURN_TIMEOUT_CONFIG);
  }

  async timeoutTurn() {
    const current = this.currentPlayer();
    this.gameData.lastAction = `${current.username} timed out. Turn skipped.`;
    this.advanceTurn();
    await this.sendState(this.gameData.lastAction);
    this.scheduleTurnTimeout();
    const next = this.currentPlayer();
    if (next.isBot) setTimeout(() => this.botTurn(next), 1000);
  }

  getGameName() {
    return "Turn Battle";
  }

  async end(reason = "completed") {
    // Clean up AI session
    const bot = this.players.find((p) => p.isBot);
    if (bot?.aiInitialized) {
      try {
        const ai = this.options.aiService;
        if (ai?.gameAI) {
          await ai.gameAI.battleEnd(this.sessionId);
        }
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    // Clear turn timer
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }

    // Call parent end
    await super.end(reason);
  }

  async generateFlavor(base) {
    if (!AI_ENABLED) return "";
    try {
      const ai = this.options.aiService;
      if (!ai?.markov) return "";
      const res = await ai.markov.generate({
        seed: base || "battle",
        maxLen: 20,
        temperature: 0.9,
        repetitionPenalty: 1.2,
        modelName: "default",
      });
      if (res?.ok) return `_${res.data.text}_`;
    } catch (e) {
      // silent
    }
    return "";
  }
}

export default BattleGame;

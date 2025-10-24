/**
 * services/minigames/games/AdventureGame.js
 * Choose-your-own-adventure style game based on Communiverse scenarios
 */

import { BaseGame } from "../BaseGame.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

export class AdventureGame extends BaseGame {
  async initialize() {
    await super.initialize();

    this.gameData = {
      currentScene: 0,
      scenes: [],
      choices: new Map(), // Map<userId, choiceIndex>
      playerPath: [],
    };

    // Generate adventure from scenarios
    await this.generateAdventure();
  }

  async generateAdventure() {
    // Use scenarios or generate with AI
    this.gameData.scenes = [
      {
        description: "You find yourself at the entrance of the Communiverse embassy. What do you do?",
        choices: [
          { text: "Enter through the main door", next: 1 },
          { text: "Sneak around the back", next: 2 },
          { text: "Wait and observe", next: 3 },
        ],
      },
      {
        description: "You walk into the grand hall. Glordon greets you enthusiastically!",
        choices: [
          { text: "Greet back warmly", next: 4 },
          { text: "Ask about Elio", next: 5 },
        ],
      },
      // More scenes...
    ];
  }

  async start() {
    this.status = "active";
    this.startedAt = Date.now();

    await this.presentScene();
  }

  async presentScene() {
    const scene = this.gameData.scenes[this.gameData.currentScene];

    if (!scene) {
      await this.endGame();
      return;
    }

    const buttons = scene.choices.map((choice, idx) =>
      new ButtonBuilder()
        .setCustomId(`adventure_choice_${this.sessionId}_${idx}`)
        .setLabel(choice.text)
        .setStyle(ButtonStyle.Primary)
    );

    const row = new ActionRowBuilder().addComponents(buttons);

    await this.channel.send({
      embeds: [
        {
          title: "🗺️ Communiverse Adventure",
          description: scene.description,
          color: 0x9b59b6,
        },
      ],
      components: [row],
    });
  }

  async handleAction(userId, action, data = {}) {
    if (action === "choice") {
      const scene = this.gameData.scenes[this.gameData.currentScene];
      const choice = scene.choices[data.choiceIndex];

      this.gameData.playerPath.push(data.choiceIndex);
      this.gameData.currentScene = choice.next || this.gameData.currentScene + 1;

      await this.presentScene();
      return { ok: true };
    }

    return { ok: false, error: "Unknown action" };
  }

  getGameName() {
    return "Communiverse Adventure";
  }
}

export default AdventureGame;

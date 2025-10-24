/**
 * gameHandlers.js
 * Handlers for mini game button interactions
 */

import { ObjectId } from "mongodb";
import { getCollection } from "../db/mongo.js";
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { logger } from "../util/logger.js";

/**
 * Handle game accept button
 */
export async function handleGameAccept(interaction) {
  try {
    const sessionId = interaction.customId.replace("game_accept_", "");

    const session = await getCollection("game_sessions").findOne({
      _id: new ObjectId(sessionId)
    });

    if (!session) {
      await interaction.reply({
        content: "❌ This game session has expired!",
        ephemeral: true
      });
      return;
    }

    if (session.challengerId !== interaction.user.id) {
      await interaction.reply({
        content: "❌ This challenge is not for you!",
        ephemeral: true
      });
      return;
    }

    if (session.status !== "pending") {
      await interaction.reply({
        content: "❌ This game has already started or ended!",
        ephemeral: true
      });
      return;
    }

    // Update session status
    await getCollection("game_sessions").updateOne(
      { _id: session._id },
      { $set: { status: "active", startedAt: new Date() } }
    );

    // Start game based on type
    switch (session.type) {
      case "trivia":
        await startTriviaGame(interaction, session);
        break;
      case "riddle":
        await startRiddleGame(interaction, session);
        break;
      case "reaction":
        await startReactionGame(interaction, session);
        break;
      case "number_guess":
        await startNumberGuessGame(interaction, session);
        break;
      default:
        await interaction.reply({
          content: "❌ Unknown game type!",
          ephemeral: true
        });
    }
  } catch (error) {
    logger.error("[GAME] Accept handler error", { error: error.message });
    await interaction.reply({
      content: "❌ An error occurred while starting the game!",
      ephemeral: true
    });
  }
}

/**
 * Handle game decline button
 */
export async function handleGameDecline(interaction) {
  try {
    const sessionId = interaction.customId.replace("game_decline_", "");

    const session = await getCollection("game_sessions").findOne({
      _id: new ObjectId(sessionId)
    });

    if (!session) {
      await interaction.reply({
        content: "❌ This game session has expired!",
        ephemeral: true
      });
      return;
    }

    if (session.challengerId !== interaction.user.id) {
      await interaction.reply({
        content: "❌ This challenge is not for you!",
        ephemeral: true
      });
      return;
    }

    await interaction.update({
      content: `${interaction.user.username} declined the challenge. Maybe next time! 🏳️`,
      embeds: [],
      components: []
    });

    // Mark session as declined
    await getCollection("game_sessions").updateOne(
      { _id: session._id },
      { $set: { status: "declined", endedAt: new Date() } }
    );

    logger.info("[GAME] Challenge declined", {
      sessionId: sessionId,
      challenger: interaction.user.username
    });
  } catch (error) {
    logger.error("[GAME] Decline handler error", { error: error.message });
  }
}

/**
 * Handle game answer button
 */
export async function handleGameAnswer(interaction) {
  try {
    const parts = interaction.customId.split("_");
    const sessionId = parts[2];
    const answer = parts[3];

    const session = await getCollection("game_sessions").findOne({
      _id: new ObjectId(sessionId)
    });

    if (!session) {
      await interaction.reply({
        content: "❌ This game session has expired!",
        ephemeral: true
      });
      return;
    }

    if (session.challengerId !== interaction.user.id) {
      await interaction.reply({
        content: "❌ This is not your game!",
        ephemeral: true
      });
      return;
    }

    // Check answer based on game type
    let isCorrect = false;
    let resultMessage = "";

    switch (session.type) {
      case "trivia":
        isCorrect = session.gameData.correct === answer;
        resultMessage = isCorrect
          ? `🎉 Correct! ${interaction.user.username} wins!`
          : `❌ Wrong! The correct answer was ${session.gameData.correct}.`;
        break;

      case "reaction":
        const reactionTime = Date.now() - session.gameData.readyTime;
        isCorrect = true; // They clicked the button
        resultMessage = `⚡ ${interaction.user.username} reacted in ${reactionTime}ms!`;
        break;

      default:
        resultMessage = "Game completed!";
    }

    await interaction.update({
      content: resultMessage,
      embeds: [],
      components: []
    });

    // Update session with result
    await getCollection("game_sessions").updateOne(
      { _id: session._id },
      {
        $set: {
          status: "completed",
          result: {
            winner: isCorrect ? session.challengerId : null,
            isCorrect,
            answer,
            completedAt: new Date()
          },
          endedAt: new Date()
        }
      }
    );

    logger.info("[GAME] Game completed", {
      sessionId: sessionId,
      type: session.type,
      winner: interaction.user.username,
      isCorrect
    });
  } catch (error) {
    logger.error("[GAME] Answer handler error", { error: error.message });
  }
}

/**
 * Start trivia game
 */
async function startTriviaGame(interaction, session) {
  const embed = new EmbedBuilder()
    .setColor("#5865F2")
    .setTitle("🎯 Trivia Question")
    .setDescription(session.gameData.question)
    .setFooter({ text: "Click the correct answer!" });

  const buttons = new ActionRowBuilder().addComponents(
    ...session.gameData.answers.map((answer, idx) => {
      const letter = String.fromCharCode(65 + idx); // A, B, C, D
      return new ButtonBuilder()
        .setCustomId(`game_answer_${session._id}_${letter}`)
        .setLabel(answer)
        .setStyle(ButtonStyle.Primary);
    })
  );

  await interaction.update({
    content: `Let's go, ${interaction.user.username}! 🎮`,
    embeds: [embed],
    components: [buttons]
  });
}

/**
 * Start riddle game
 */
async function startRiddleGame(interaction, session) {
  const embed = new EmbedBuilder()
    .setColor("#9B59B6")
    .setTitle("🧩 Riddle Challenge")
    .setDescription(session.gameData.riddle)
    .setFooter({ text: "Reply with your answer in chat!" });

  await interaction.update({
    content: `Solve this, ${interaction.user.username}! 🤔`,
    embeds: [embed],
    components: []
  });

  // Set up message collector for the answer
  const filter = m => m.author.id === session.challengerId;
  const collector = interaction.channel.createMessageCollector({
    filter,
    time: 60000, // 1 minute
    max: 3 // 3 attempts
  });

  collector.on('collect', async (message) => {
    const userAnswer = message.content.toLowerCase().trim();
    const correctAnswer = session.gameData.answer.toLowerCase().trim();

    if (userAnswer === correctAnswer || userAnswer.includes(correctAnswer)) {
      await message.reply(`🎉 Correct! The answer was "${session.gameData.answer}"!`);

      await getCollection("game_sessions").updateOne(
        { _id: session._id },
        {
          $set: {
            status: "completed",
            result: { winner: session.challengerId, isCorrect: true },
            endedAt: new Date()
          }
        }
      );

      collector.stop('answered');
    } else {
      await message.reply("❌ Not quite! Try again...");
    }
  });

  collector.on('end', async (collected, reason) => {
    if (reason !== 'answered') {
      await interaction.channel.send(
        `Time's up! The answer was "${session.gameData.answer}".`
      );

      await getCollection("game_sessions").updateOne(
        { _id: session._id },
        {
          $set: {
            status: "completed",
            result: { winner: null, isCorrect: false },
            endedAt: new Date()
          }
        }
      );
    }
  });
}

/**
 * Start reaction game
 */
async function startReactionGame(interaction, session) {
  await interaction.update({
    content: `Get ready, ${interaction.user.username}... 🎯`,
    embeds: [],
    components: []
  });

  // Wait 2-5 seconds randomly
  const delay = 2000 + Math.random() * 3000;
  await new Promise(resolve => setTimeout(resolve, delay));

  const readyTime = Date.now();

  // Update session with ready time
  await getCollection("game_sessions").updateOne(
    { _id: session._id },
    { $set: { "gameData.readyTime": readyTime } }
  );

  const button = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`game_answer_${session._id}_click`)
      .setLabel("CLICK NOW!")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("⚡")
  );

  await interaction.editReply({
    content: "**NOW! CLICK THE BUTTON!** 🔥",
    components: [button]
  });
}

/**
 * Start number guessing game
 */
async function startNumberGuessGame(interaction, session) {
  const embed = new EmbedBuilder()
    .setColor("#E67E22")
    .setTitle("🔢 Guess the Number")
    .setDescription("I'm thinking of a number between 1 and 100!")
    .addFields(
      { name: "Attempts", value: `0/${session.gameData.maxAttempts}`, inline: true },
      { name: "Range", value: "1 - 100", inline: true }
    )
    .setFooter({ text: "Reply with your guess in chat!" });

  await interaction.update({
    content: `Let's play, ${interaction.user.username}! 🎲`,
    embeds: [embed],
    components: []
  });

  // Set up message collector
  const filter = m => m.author.id === session.challengerId && !isNaN(m.content);
  const collector = interaction.channel.createMessageCollector({
    filter,
    time: 120000, // 2 minutes
    max: session.gameData.maxAttempts
  });

  let attempts = 0;
  const targetNumber = session.gameData.targetNumber;

  collector.on('collect', async (message) => {
    attempts++;
    const guess = parseInt(message.content);

    if (guess === targetNumber) {
      await message.reply(
        `🎉 Correct! The number was ${targetNumber}! You got it in ${attempts} ${attempts === 1 ? 'try' : 'tries'}!`
      );

      await getCollection("game_sessions").updateOne(
        { _id: session._id },
        {
          $set: {
            status: "completed",
            result: { winner: session.challengerId, attempts, isCorrect: true },
            endedAt: new Date()
          }
        }
      );

      collector.stop('guessed');
    } else if (attempts >= session.gameData.maxAttempts) {
      await message.reply(
        `❌ Out of attempts! The number was ${targetNumber}.`
      );
    } else {
      const hint = guess < targetNumber ? "📈 Higher!" : "📉 Lower!";
      await message.reply(
        `${hint} (${attempts}/${session.gameData.maxAttempts} attempts used)`
      );
    }
  });

  collector.on('end', async (collected, reason) => {
    if (reason !== 'guessed') {
      await interaction.channel.send(
        `⏰ Time's up! The number was ${targetNumber}.`
      );

      await getCollection("game_sessions").updateOne(
        { _id: session._id },
        {
          $set: {
            status: "completed",
            result: { winner: null, attempts, isCorrect: false },
            endedAt: new Date()
          }
        }
      );
    }
  });
}

/**
 * Start a quick reaction game
 */
export async function startGame({ guildId, channelId, messageId }) {
  try {
    const gameId = new ObjectId();

    const gameDoc = {
      _id: gameId,
      type: "quick_react",
      guildId,
      channelId,
      messageId,
      status: "active",
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
    };

    await getCollection("quick_games").insertOne(gameDoc);

    logger.info("[GAME] Quick game started", {
      gameId: gameId.toString(),
      guildId,
      channelId,
    });

    return { ok: true, data: { gameId: gameId.toString() } };
  } catch (error) {
    logger.error("[GAME] startGame failed", { error: error.message });
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message: "Failed to start game",
        cause: error,
      },
    };
  }
}

/**
 * Handle quick game click
 */
export async function handleClick({ gameId, userId, guildId }) {
  try {
    const game = await getCollection("quick_games").findOne({
      _id: new ObjectId(gameId),
    });

    if (!game) {
      return {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "⚠️ This game has expired!",
        },
      };
    }

    if (game.status !== "active") {
      return {
        ok: false,
        error: {
          code: "GAME_ENDED",
          message: "⚠️ This game has already ended!",
        },
      };
    }

    // Check cooldown (30 seconds)
    const cooldownKey = `game_cooldown_${guildId}_${userId}`;
    const lastWin = await getCollection("game_cooldowns").findOne({
      _id: cooldownKey,
    });

    if (lastWin) {
      const elapsed = (Date.now() - lastWin.lastWinAt.getTime()) / 1000;
      if (elapsed < 30) {
        return {
          ok: false,
          error: {
            code: "COOLDOWN",
            message: `⏳ You're on cooldown! Wait ${Math.ceil(30 - elapsed)} more seconds.`,
          },
        };
      }
    }

    // Mark game as completed
    await getCollection("quick_games").updateOne(
      { _id: new ObjectId(gameId) },
      {
        $set: {
          status: "completed",
          winnerId: userId,
          completedAt: new Date(),
        },
      }
    );

    // Update cooldown
    await getCollection("game_cooldowns").updateOne(
      { _id: cooldownKey },
      { $set: { lastWinAt: new Date() } },
      { upsert: true }
    );

    // Award points
    const { award } = await import("../services/points.js");
    const pointsResult = await award(guildId, userId, 10);

    logger.info("[GAME] Quick game won", {
      gameId,
      userId,
      guildId,
      points: pointsResult.ok ? pointsResult.data.awarded : 0,
    });

    return {
      ok: true,
      data: {
        gameId,
        points: pointsResult.ok ? pointsResult.data : { awarded: 10, points: 10, level: 1 },
      },
    };
  } catch (error) {
    logger.error("[GAME] handleClick failed", { error: error.message });
    return {
      ok: false,
      error: {
        code: "UNKNOWN",
        message: "Failed to process click",
        cause: error,
      },
    };
  }
}

/**
 * Start a DM game session with a persona
 */
export async function startDmSession({ userId, guildId, personaName }) {
  try {
    // Check if user already has an active session
    const existing = await getCollection("dm_game_sessions").findOne({
      userId,
      status: "active",
    });

    if (existing) {
      return {
        ok: false,
        error: {
          code: "ALREADY_ACTIVE",
          message: "You already have an active DM game! Finish it first with `/game dm-answer` or cancel it with `/game dm-cancel`.",
        },
      };
    }

    // Pick a random persona if not specified
    const persona = personaName || ["Elio", "Olga", "Glordon"][Math.floor(Math.random() * 3)];

    // Generate questions (simplified - in production, use AI service)
    const questions = [
      { question: "What color is the Communiverse portal?", answer: "blue" },
      { question: "Who is the Earth Ambassador?", answer: "elio" },
      { question: "What is Glordon's favorite food?", answer: "potato" },
    ];

    const sessionDoc = {
      userId,
      guildId,
      personaName: persona,
      status: "active",
      turn: 1,
      totalTurns: questions.length,
      questions,
      currentQuestionIndex: 0,
      score: 0,
      correctAnswers: 0,
      startedAt: new Date(),
    };

    await getCollection("dm_game_sessions").insertOne(sessionDoc);

    logger.info("[GAME] DM session started", {
      userId,
      persona,
      totalQuestions: questions.length,
    });

    return {
      ok: true,
      data: {
        persona,
        turn: 1,
        totalTurns: questions.length,
        question: questions[0].question,
      },
    };
  } catch (error) {
    logger.error("[GAME] startDmSession failed", { error: error.message });
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message: "Failed to start DM game session",
        cause: error,
      },
    };
  }
}

/**
 * Answer current DM game question
 */
export async function answerDm({ userId, answer }) {
  try {
    const session = await getCollection("dm_game_sessions").findOne({
      userId,
      status: "active",
    });

    if (!session) {
      return {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "You don't have an active DM game. Start one with `/game dm-start`!",
        },
      };
    }

    const currentQ = session.questions[session.currentQuestionIndex];
    const userAnswer = answer.toLowerCase().trim();
    const correctAnswer = currentQ.answer.toLowerCase().trim();

    const isCorrect = userAnswer === correctAnswer || userAnswer.includes(correctAnswer);

    const pointsEarned = isCorrect ? 5 : 0;
    const newScore = session.score + pointsEarned;
    const newCorrectAnswers = session.correctAnswers + (isCorrect ? 1 : 0);

    let feedback = isCorrect
      ? `✅ Correct! You earned ${pointsEarned} points!`
      : `❌ Not quite. The answer was "${currentQ.answer}".`;

    const nextIndex = session.currentQuestionIndex + 1;
    const gameComplete = nextIndex >= session.questions.length;

    if (gameComplete) {
      // Award final score to user points
      const { award } = await import("../services/points.js");
      await award(session.guildId, userId, newScore);

      await getCollection("dm_game_sessions").updateOne(
        { _id: session._id },
        {
          $set: {
            status: "completed",
            score: newScore,
            correctAnswers: newCorrectAnswers,
            completedAt: new Date(),
          },
        }
      );

      const perfectGame = newCorrectAnswers === session.questions.length;

      logger.info("[GAME] DM game completed", {
        userId,
        score: newScore,
        correctAnswers: newCorrectAnswers,
        perfectGame,
      });

      return {
        ok: true,
        data: {
          correct: isCorrect,
          feedback,
          gameComplete: true,
          finalScore: newScore,
          correctAnswers: newCorrectAnswers,
          totalQuestions: session.questions.length,
          perfectGame,
        },
      };
    } else {
      // Move to next question
      await getCollection("dm_game_sessions").updateOne(
        { _id: session._id },
        {
          $set: {
            currentQuestionIndex: nextIndex,
            turn: nextIndex + 1,
            score: newScore,
            correctAnswers: newCorrectAnswers,
          },
        }
      );

      const nextQuestion = session.questions[nextIndex];

      return {
        ok: true,
        data: {
          correct: isCorrect,
          feedback,
          gameComplete: false,
          nextQuestion: nextQuestion.question,
          turn: nextIndex + 1,
          totalTurns: session.questions.length,
          currentScore: newScore,
        },
      };
    }
  } catch (error) {
    logger.error("[GAME] answerDm failed", { error: error.message });
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message: "Failed to process answer",
        cause: error,
      },
    };
  }
}

/**
 * Get DM game status
 */
export async function getDmStatus(userId) {
  try {
    const session = await getCollection("dm_game_sessions").findOne({
      userId,
      status: "active",
    });

    if (!session) {
      return {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "No active DM game found",
        },
      };
    }

    return {
      ok: true,
      data: {
        session: {
          personaName: session.personaName,
          turn: session.turn,
          totalTurns: session.totalTurns,
          score: session.score,
          correctAnswers: session.correctAnswers,
        },
      },
    };
  } catch (error) {
    logger.error("[GAME] getDmStatus failed", { error: error.message });
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message: "Failed to get status",
        cause: error,
      },
    };
  }
}

/**
 * Cancel DM game session
 */
export async function cancelDm(userId) {
  try {
    const result = await getCollection("dm_game_sessions").updateOne(
      { userId, status: "active" },
      { $set: { status: "cancelled", cancelledAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "No active DM game to cancel",
        },
      };
    }

    logger.info("[GAME] DM game cancelled", { userId });

    return { ok: true };
  } catch (error) {
    logger.error("[GAME] cancelDm failed", { error: error.message });
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message: "Failed to cancel game",
        cause: error,
      },
    };
  }
}

export default {
  handleGameAccept,
  handleGameDecline,
  handleGameAnswer,
  startGame,
  handleClick,
  startDmSession,
  answerDm,
  getDmStatus,
  cancelDm,
};

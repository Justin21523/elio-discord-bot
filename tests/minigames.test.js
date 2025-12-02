import test from "node:test";
import assert from "node:assert/strict";
import GuessNumberGame from "../src/services/minigames/games/GuessNumberGame.js";
import DiceRollGame from "../src/services/minigames/games/DiceRollGame.js";

const mockChannel = () => {
  const messages = [];
  return {
    id: "channel-1",
    guild: { id: "guild-1" },
    messages,
    async send(payload) {
      messages.push(payload);
      return payload;
    },
  };
};

const mockUser = (id = "user-1") => ({ id, username: `user-${id}` });

test("GuessNumberGame: correct guess ends game", async () => {
  const channel = mockChannel();
  const user = mockUser();
  const game = new GuessNumberGame(channel, user, {
    targetNumber: 10,
    maxAttempts: 2,
    min: 1,
    max: 20,
  });

  await game.initialize();
  await game.start();

  const miss = await game.handleAction(user.id, "guess", { value: 5 });
  assert.equal(miss.ok, true);
  assert.equal(game.gameData.attemptsLeft, 1);
  assert.equal(game.status, "active");

  const hit = await game.handleAction(user.id, "guess", { value: 10 });
  assert.equal(hit.ok, true);
  assert.equal(game.status, "ended");
  assert.equal(game.winner.userId, user.id);
  assert.equal(hit.endReason, "guessed");
});

test("GuessNumberGame: runs out of attempts", async () => {
  const channel = mockChannel();
  const user = mockUser();
  const game = new GuessNumberGame(channel, user, {
    targetNumber: 3,
    maxAttempts: 1,
    min: 1,
    max: 5,
  });

  await game.initialize();
  await game.start();

  const miss = await game.handleAction(user.id, "guess", { value: 1 });
  assert.equal(miss.ok, true);
  assert.equal(game.status, "ended");
  assert.equal(miss.endReason, "out_of_attempts");
});

test("DiceRollGame: tracks rolls and winner", async () => {
  const channel = mockChannel();
  const user1 = mockUser("u1");
  const user2 = mockUser("u2");
  const game = new DiceRollGame(channel, user1, { maxRounds: 2 });

  // deterministic rolls
  let rollIdx = 0;
  const fixed = [6, 2];
  game.randomRoll = () => fixed[rollIdx++ % fixed.length];

  await game.initialize();
  await game.start();

  const r1 = await game.handleAction(user1.id, "roll", {});
  assert.equal(r1.ok, true);
  assert.equal(game.gameData.rolls.length, 1);

  const r2 = await game.handleAction(user2.id, "roll", {});
  assert.equal(r2.ok, true);
  assert.equal(game.status, "ended");
  assert.equal(game.winner.userId, user1.id);
  assert.equal(r2.endReason, "max_rounds");
});

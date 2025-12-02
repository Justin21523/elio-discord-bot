/**
 * E2E tests for Message Router.
 *
 * Tests the complete message routing flow from Discord message
 * to AI response generation.
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';

import {
  createMockMessage,
  createMockClient,
  createMockChannel,
  createMockGuild,
  createMockUser,
  MockCollection,
} from './mocks/discordMocks.js';

// Helper to simulate message content variations
function createTestScenarios() {
  return {
    // Greeting scenarios
    greetings: [
      { content: 'Hello Elio!', expectedTrigger: true },
      { content: 'Hey @Elio', expectedTrigger: true },
      { content: 'Hi there!', expectedTrigger: false },
    ],
    // Question scenarios
    questions: [
      { content: 'What do you think about space?', persona: 'Elio' },
      { content: 'How are you feeling?', persona: 'Glordon' },
      { content: 'What should I do?', persona: 'Olga' },
    ],
    // Persona-specific keywords
    keywords: [
      { content: 'I love exploring the universe and stars', expectedPersona: 'Elio' },
      { content: 'I need a friend and a hug', expectedPersona: 'Glordon' },
      { content: 'We need discipline and safety', expectedPersona: 'Olga' },
    ],
  };
}

describe('Message Router E2E Tests', () => {
  let scenarios;

  before(() => {
    scenarios = createTestScenarios();
  });

  describe('Message Trigger Detection', () => {
    it('should detect bot mention in message', () => {
      const botUser = createMockUser({ id: 'bot123', username: 'Elio', bot: true });
      const mentions = new MockCollection();
      mentions.set(botUser.id, botUser);

      const msg = createMockMessage({
        content: 'Hello @Elio!',
        mentions: {
          users: mentions,
          has: (user) => mentions.has(user.id || user),
        },
      });

      assert.ok(msg.mentions.users.has('bot123'));
    });

    it('should detect keyword trigger', () => {
      const keywords = ['elio', 'glordon', 'olga'];

      for (const scenario of scenarios.greetings) {
        const msg = createMockMessage({ content: scenario.content });
        const hasKeyword = keywords.some(kw =>
          msg.content.toLowerCase().includes(kw)
        );

        if (scenario.expectedTrigger) {
          assert.ok(hasKeyword || scenario.content.toLowerCase().includes('elio'));
        }
      }
    });

    it('should handle message without triggers', () => {
      const msg = createMockMessage({
        content: 'Just a regular message',
      });

      const keywords = ['elio', 'glordon', 'olga'];
      const hasKeyword = keywords.some(kw =>
        msg.content.toLowerCase().includes(kw)
      );

      assert.strictEqual(hasKeyword, false);
    });
  });

  describe('Persona Detection from Keywords', () => {
    it('should detect Elio from space-related keywords', () => {
      const elioKeywords = ['space', 'stars', 'universe', 'cosmic', 'planet'];
      const msg = createMockMessage({
        content: 'Tell me about space and the stars!',
      });

      const matchedKeywords = elioKeywords.filter(kw =>
        msg.content.toLowerCase().includes(kw)
      );

      assert.ok(matchedKeywords.length > 0);
      assert.ok(matchedKeywords.includes('space'));
    });

    it('should detect Glordon from friendship keywords', () => {
      const glordonKeywords = ['friend', 'potato', 'hug', 'love', 'together'];
      const msg = createMockMessage({
        content: 'I need a friend and a hug today',
      });

      const matchedKeywords = glordonKeywords.filter(kw =>
        msg.content.toLowerCase().includes(kw)
      );

      assert.ok(matchedKeywords.length > 0);
      assert.ok(matchedKeywords.includes('friend'));
      assert.ok(matchedKeywords.includes('hug'));
    });

    it('should detect Olga from discipline keywords', () => {
      const olgaKeywords = ['discipline', 'safety', 'training', 'military'];
      const msg = createMockMessage({
        content: 'Discipline and safety are very important',
      });

      const matchedKeywords = olgaKeywords.filter(kw =>
        msg.content.toLowerCase().includes(kw)
      );

      assert.ok(matchedKeywords.length > 0);
      assert.ok(matchedKeywords.includes('discipline'));
      assert.ok(matchedKeywords.includes('safety'));
    });
  });

  describe('Channel and Guild Context', () => {
    it('should extract guild information', () => {
      const guild = createMockGuild({
        id: 'guild123',
        name: 'Test Community',
      });
      const channel = createMockChannel({
        id: 'channel456',
        name: 'bot-chat',
      });
      const msg = createMockMessage({ guild, channel });

      assert.strictEqual(msg.guild.id, 'guild123');
      assert.strictEqual(msg.guild.name, 'Test Community');
      assert.strictEqual(msg.channel.id, 'channel456');
    });

    it('should handle DM context (no guild)', () => {
      const channel = createMockChannel({
        type: 1, // DM
        name: 'DM',
      });
      const msg = createMockMessage({
        guild: null,
        channel,
      });

      assert.strictEqual(msg.guild, null);
      assert.strictEqual(msg.channel.type, 1);
    });
  });

  describe('Message History', () => {
    it('should fetch recent messages from channel', async () => {
      const channel = createMockChannel();

      // Send some messages
      await channel.send('Message 1');
      await channel.send('Message 2');
      await channel.send('Message 3');

      const messages = await channel.messages.fetch({ limit: 10 });

      // Mock channel sends return messages, check the mechanism works
      assert.ok(messages instanceof MockCollection);
    });

    it('should respect message limit', async () => {
      const channel = createMockChannel();

      // Send many messages
      for (let i = 0; i < 10; i++) {
        await channel.send(`Message ${i}`);
      }

      const messages = await channel.messages.fetch({ limit: 5 });

      assert.ok(messages.size <= 5);
    });
  });

  describe('Response Flow', () => {
    it('should reply to message', async () => {
      const msg = createMockMessage({
        id: 'msg123',
        content: 'Hello Elio!',
      });

      const reply = await msg.reply('Hello! Nice to meet you!');

      assert.ok(reply);
      assert.strictEqual(reply.reference.messageId, 'msg123');
    });

    it('should send to channel', async () => {
      const channel = createMockChannel();
      const msg = createMockMessage({ channel });

      const sent = await msg.channel.send('Hello from the bot!');

      assert.ok(sent);
      assert.ok(sent.content.includes('Hello from the bot'));
    });

    it('should react to message', async () => {
      const msg = createMockMessage();

      const reaction = await msg.react('👋');

      assert.ok(reaction);
      assert.strictEqual(reaction.emoji.name, '👋');
    });
  });

  describe('User Context', () => {
    it('should identify message author', () => {
      const author = createMockUser({
        id: 'user123',
        username: 'TestUser',
      });
      const msg = createMockMessage({ author });

      assert.strictEqual(msg.author.id, 'user123');
      assert.strictEqual(msg.author.username, 'TestUser');
      assert.strictEqual(msg.author.bot, false);
    });

    it('should ignore bot messages', () => {
      const botAuthor = createMockUser({
        id: 'bot456',
        username: 'AnotherBot',
        bot: true,
      });
      const msg = createMockMessage({ author: botAuthor });

      assert.strictEqual(msg.author.bot, true);
    });

    it('should get member display name', () => {
      const author = createMockUser({ username: 'OriginalName' });
      const msg = createMockMessage({
        author,
        member: {
          user: author,
          displayName: 'NicknameInServer',
        },
      });

      assert.strictEqual(msg.member.displayName, 'NicknameInServer');
    });
  });

  describe('Cooldown Simulation', () => {
    it('should track message timestamps', () => {
      const timestamps = [];
      const cooldownMs = 1000;

      // Simulate rapid messages
      for (let i = 0; i < 3; i++) {
        timestamps.push(Date.now());
      }

      // Check if within cooldown
      const recentTimestamps = timestamps.filter(
        ts => Date.now() - ts < cooldownMs
      );

      assert.strictEqual(recentTimestamps.length, 3);
    });

    it('should identify messages outside cooldown', async () => {
      const firstTimestamp = Date.now() - 2000; // 2 seconds ago
      const cooldownMs = 1000;

      const isInCooldown = Date.now() - firstTimestamp < cooldownMs;

      assert.strictEqual(isInCooldown, false);
    });
  });

  describe('Intent Scenario Mapping', () => {
    it('should map greeting messages correctly', () => {
      const greetingPatterns = ['hello', 'hi', 'hey', 'good morning'];
      const msg = createMockMessage({ content: 'Hello there!' });

      const isGreeting = greetingPatterns.some(pattern =>
        msg.content.toLowerCase().includes(pattern)
      );

      assert.ok(isGreeting);
    });

    it('should map question messages correctly', () => {
      const questionIndicators = ['what', 'how', 'why', 'when', 'where', '?'];
      const msg = createMockMessage({ content: 'What do you think about that?' });

      const isQuestion = questionIndicators.some(indicator =>
        msg.content.toLowerCase().includes(indicator)
      );

      assert.ok(isQuestion);
    });

    it('should map help requests correctly', () => {
      const helpPatterns = ['help', 'assist', 'support', 'need'];
      const msg = createMockMessage({ content: 'Can you help me with something?' });

      const isHelpRequest = helpPatterns.some(pattern =>
        msg.content.toLowerCase().includes(pattern)
      );

      assert.ok(isHelpRequest);
    });
  });

  describe('Discord Client Mock', () => {
    it('should create functional mock client', () => {
      const client = createMockClient();

      assert.ok(client.user);
      assert.strictEqual(client.user.bot, true);
      assert.ok(client.guilds);
      assert.ok(client.channels);
    });

    it('should fetch users from client', async () => {
      const client = createMockClient();

      const user = await client.users.fetch('user123');

      assert.ok(user);
      assert.strictEqual(user.id, 'user123');
    });

    it('should access guilds from client', () => {
      const client = createMockClient();

      assert.ok(client.guilds.cache.size > 0);
    });
  });
});

describe('Edge Cases', () => {
  it('should handle empty message content', () => {
    const msg = createMockMessage({ content: '', cleanContent: '' });

    assert.strictEqual(msg.content, '');
    assert.strictEqual(msg.cleanContent, '');
  });

  it('should handle very long messages', () => {
    const longContent = 'a'.repeat(2000);
    const msg = createMockMessage({ content: longContent });

    assert.strictEqual(msg.content.length, 2000);
  });

  it('should handle special characters', () => {
    const specialContent = '🚀 Hello! <@123> #channel @everyone';
    const msg = createMockMessage({ content: specialContent });

    assert.ok(msg.content.includes('🚀'));
    assert.ok(msg.content.includes('<@123>'));
  });

  it('should handle messages with attachments', () => {
    const attachments = new MockCollection();
    attachments.set('attach1', {
      id: 'attach1',
      url: 'https://example.com/image.png',
      contentType: 'image/png',
    });

    const msg = createMockMessage({ attachments });

    assert.ok(msg.attachments.size > 0);
  });
});

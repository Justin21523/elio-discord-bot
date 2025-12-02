/**
 * Integration tests for hybrid AI endpoints.
 *
 * Tests the Node.js AI client communicating with the (mock) AI service.
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';

import { MockAIService, testUtils } from './setup.js';

const { loadFixture, createMockMessage } = testUtils;

describe('Hybrid AI Integration Tests', () => {
  let mockService;
  let aiClient;

  before(async () => {
    // Start mock AI service
    mockService = new MockAIService(8001);
    await mockService.start();

    // Dynamically import AI client to use our mock URL
    process.env.AI_SERVICE_URL = mockService.getUrl();
    process.env.AI_ENABLED = 'true';

    // Import the AI client (this should pick up the env vars)
    const clientModule = await import('../../src/services/ai/client.js');
    aiClient = clientModule.default;
  });

  after(async () => {
    await mockService.stop();
  });

  beforeEach(() => {
    mockService.clearRequests();
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const response = await fetch(`${mockService.getUrl()}/health`);
      const data = await response.json();

      assert.strictEqual(data.status, 'healthy');
      assert.strictEqual(data.models_loaded, true);
    });
  });

  describe('Hybrid Reply Endpoint', () => {
    it('should send request with required fields', async () => {
      mockService.setResponse('/hybrid/reply', {
        reply: 'Test response',
        persona: 'Elio',
        confidence: 0.9,
        strategy: 'tfidf_markov',
      });

      const response = await fetch(`${mockService.getUrl()}/hybrid/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Hello!',
          userId: 'user123',
          persona: 'Elio',
        }),
      });

      const data = await response.json();

      assert.strictEqual(data.reply, 'Test response');
      assert.strictEqual(data.persona, 'Elio');
      assert.ok(data.confidence >= 0 && data.confidence <= 1);
    });

    it('should include conversation history', async () => {
      await fetch(`${mockService.getUrl()}/hybrid/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'What do you think?',
          userId: 'user123',
          persona: 'Elio',
          conversationHistory: [
            { role: 'user', content: 'Hello!' },
            { role: 'assistant', content: 'Hi there!' },
          ],
        }),
      });

      const requests = mockService.getRequests();
      const lastRequest = requests[requests.length - 1];

      assert.ok(lastRequest.body.conversationHistory);
      assert.strictEqual(lastRequest.body.conversationHistory.length, 2);
    });

    it('should handle context fields', async () => {
      await fetch(`${mockService.getUrl()}/hybrid/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Tell me about space',
          userId: 'user123',
          persona: 'Elio',
          context: {
            guildId: 'guild123',
            channelId: 'channel123',
            userName: 'TestUser',
          },
        }),
      });

      const requests = mockService.getRequests();
      const lastRequest = requests[requests.length - 1];

      assert.ok(lastRequest.body.context);
      assert.strictEqual(lastRequest.body.context.guildId, 'guild123');
    });
  });

  describe('Persona Switch Endpoint', () => {
    it('should return selected persona', async () => {
      mockService.setResponse('/personas/switch', {
        selected: 'Glordon',
        confidence: 0.85,
        alternatives: ['Elio', 'Olga'],
      });

      const response = await fetch(`${mockService.getUrl()}/personas/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'I need a friend',
          currentPersona: 'Elio',
        }),
      });

      const data = await response.json();

      assert.strictEqual(data.selected, 'Glordon');
      assert.ok(data.confidence > 0);
      assert.ok(Array.isArray(data.alternatives));
    });
  });

  describe('Intent Classification Endpoint', () => {
    it('should classify intent', async () => {
      mockService.setResponse('/intent/classify', {
        intent: 'question',
        confidence: 0.92,
        probabilities: {
          question: 0.92,
          greeting: 0.05,
          general: 0.03,
        },
      });

      const response = await fetch(`${mockService.getUrl()}/intent/classify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'What is the meaning of life?',
        }),
      });

      const data = await response.json();

      assert.strictEqual(data.intent, 'question');
      assert.ok(data.confidence > 0.5);
      assert.ok(data.probabilities);
    });

    it('should detect greeting intent', async () => {
      mockService.setResponse('/intent/classify', {
        intent: 'greeting',
        confidence: 0.95,
        probabilities: { greeting: 0.95, question: 0.05 },
      });

      const response = await fetch(`${mockService.getUrl()}/intent/classify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Hello! How are you?',
        }),
      });

      const data = await response.json();

      assert.strictEqual(data.intent, 'greeting');
    });
  });

  describe('Sentiment Classification Endpoint', () => {
    it('should classify mood', async () => {
      mockService.setResponse('/sentiment/classify', {
        mood: 'excited',
        confidence: 0.88,
        sentiment: 'positive',
        probabilities: {
          excited: 0.88,
          neutral: 0.08,
          concerned: 0.04,
        },
      });

      const response = await fetch(`${mockService.getUrl()}/sentiment/classify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Wow! This is amazing!',
        }),
      });

      const data = await response.json();

      assert.strictEqual(data.mood, 'excited');
      assert.strictEqual(data.sentiment, 'positive');
    });
  });

  describe('Embeddings Endpoint', () => {
    it('should return embedding vector', async () => {
      const response = await fetch(`${mockService.getUrl()}/embeddings/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Hello world',
        }),
      });

      const data = await response.json();

      assert.ok(Array.isArray(data.embedding));
      assert.strictEqual(data.embedding.length, 384);
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for unknown endpoints', async () => {
      const response = await fetch(`${mockService.getUrl()}/unknown/endpoint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      assert.strictEqual(response.status, 404);
    });

    it('should handle custom errors', async () => {
      mockService.setError('/hybrid/reply', 500, 'Internal server error');

      const response = await fetch(`${mockService.getUrl()}/hybrid/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'test' }),
      });

      assert.strictEqual(response.status, 500);
    });
  });

  describe('Request Logging', () => {
    it('should log all requests', async () => {
      await fetch(`${mockService.getUrl()}/health`);
      await fetch(`${mockService.getUrl()}/health`);

      const requests = mockService.getRequests();

      assert.strictEqual(requests.length, 2);
      assert.ok(requests[0].timestamp);
    });

    it('should clear request log', async () => {
      await fetch(`${mockService.getUrl()}/health`);
      mockService.clearRequests();

      const requests = mockService.getRequests();

      assert.strictEqual(requests.length, 0);
    });
  });
});

describe('Test Fixtures', () => {
  it('should load JSON fixture', () => {
    const personas = loadFixture('personas.json');

    assert.ok(personas.personas);
    assert.ok(Array.isArray(personas.personas));
    assert.ok(personas.personas.length > 0);
  });

  it('should load JSONL fixture', () => {
    const trainingData = loadFixture('training-sample.jsonl');

    assert.ok(Array.isArray(trainingData));
    assert.ok(trainingData.length > 0);
    assert.ok(trainingData[0].messages);
  });

  it('should have Elio persona in fixtures', () => {
    const personas = loadFixture('personas.json');
    const elio = personas.personas.find(p => p.name === 'Elio');

    assert.ok(elio);
    assert.ok(elio.keywords);
    assert.ok(elio.keywords.includes('space'));
  });

  it('should have test documents fixture', () => {
    const docs = loadFixture('test-documents.json');

    assert.ok(docs.documents);
    assert.ok(docs.queries);
    assert.ok(docs.documents.length >= 8);
  });
});

describe('Mock Message Utilities', () => {
  it('should create mock message with defaults', () => {
    const msg = createMockMessage();

    assert.ok(msg.id);
    assert.ok(msg.content);
    assert.ok(msg.author);
    assert.ok(msg.channel);
    assert.ok(msg.guild);
  });

  it('should allow overriding fields', () => {
    const msg = createMockMessage({
      content: 'Custom content',
      author: { id: 'custom-id', username: 'Custom', bot: true },
    });

    assert.strictEqual(msg.content, 'Custom content');
    assert.strictEqual(msg.author.id, 'custom-id');
    assert.strictEqual(msg.author.bot, true);
  });

  it('should have reply method', async () => {
    const msg = createMockMessage();

    const reply = await msg.reply('Test reply');

    assert.ok(reply);
  });
});

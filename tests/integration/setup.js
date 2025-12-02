/**
 * Integration test setup and utilities.
 *
 * Provides mock AI service and common test utilities.
 */
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load test fixtures
const fixturesPath = join(__dirname, '..', 'fixtures');

export function loadFixture(filename) {
  const filePath = join(fixturesPath, filename);
  const content = readFileSync(filePath, 'utf-8');

  if (filename.endsWith('.json')) {
    return JSON.parse(content);
  }
  if (filename.endsWith('.jsonl')) {
    return content.split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
  }
  return content;
}

/**
 * Mock AI Service for testing.
 *
 * Simulates the Python AI service endpoints.
 */
export class MockAIService {
  constructor(port = 8001) {
    this.port = port;
    this.server = null;
    this.requestLog = [];
    this.responses = new Map();

    // Default responses
    this.setDefaultResponses();
  }

  setDefaultResponses() {
    // /hybrid/reply endpoint
    this.responses.set('/hybrid/reply', {
      reply: 'Hello! This is a mock response from the AI service.',
      persona: 'Elio',
      confidence: 0.85,
      strategy: 'mock',
      tokens_used: 50,
    });

    // /personas/switch endpoint
    this.responses.set('/personas/switch', {
      selected: 'Elio',
      confidence: 0.9,
      alternatives: ['Glordon', 'Olga'],
    });

    // /embeddings/text endpoint
    this.responses.set('/embeddings/text', {
      embedding: new Array(384).fill(0.1),
      model: 'mock-embeddings',
    });

    // /health endpoint
    this.responses.set('/health', {
      status: 'healthy',
      models_loaded: true,
    });

    // /intent/classify endpoint
    this.responses.set('/intent/classify', {
      intent: 'greeting',
      confidence: 0.9,
      probabilities: { greeting: 0.9, question: 0.1 },
    });

    // /sentiment/classify endpoint
    this.responses.set('/sentiment/classify', {
      mood: 'neutral',
      confidence: 0.8,
      sentiment: 'neutral',
    });
  }

  /**
   * Set custom response for an endpoint.
   */
  setResponse(endpoint, response) {
    this.responses.set(endpoint, response);
  }

  /**
   * Set error response for an endpoint.
   */
  setError(endpoint, statusCode, message) {
    this.responses.set(endpoint, {
      __error: true,
      statusCode,
      message,
    });
  }

  /**
   * Start the mock server.
   */
  async start() {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        let body = '';

        req.on('data', chunk => {
          body += chunk;
        });

        req.on('end', () => {
          // Log request
          this.requestLog.push({
            method: req.method,
            url: req.url,
            body: body ? JSON.parse(body) : null,
            timestamp: new Date().toISOString(),
          });

          // Find response
          const response = this.responses.get(req.url);

          if (!response) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));
            return;
          }

          if (response.__error) {
            res.writeHead(response.statusCode, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: response.message }));
            return;
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(response));
        });
      });

      this.server.listen(this.port, () => {
        console.log(`Mock AI service started on port ${this.port}`);
        resolve();
      });

      this.server.on('error', reject);
    });
  }

  /**
   * Stop the mock server.
   */
  async stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('Mock AI service stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Get logged requests.
   */
  getRequests() {
    return this.requestLog;
  }

  /**
   * Clear request log.
   */
  clearRequests() {
    this.requestLog = [];
  }

  /**
   * Get URL for the mock service.
   */
  getUrl() {
    return `http://localhost:${this.port}`;
  }
}

/**
 * Mock Discord message object.
 */
export function createMockMessage(overrides = {}) {
  return {
    id: '123456789',
    content: 'Hello Elio!',
    author: {
      id: '987654321',
      username: 'TestUser',
      tag: 'TestUser#1234',
      bot: false,
    },
    channel: {
      id: '111111111',
      name: 'general',
      type: 0, // GUILD_TEXT
      send: async () => createMockMessage(),
      sendTyping: async () => {},
    },
    guild: {
      id: '222222222',
      name: 'Test Server',
      members: {
        fetch: async () => ({ displayName: 'TestUser' }),
      },
    },
    mentions: {
      users: new Map(),
      has: () => false,
    },
    reply: async () => createMockMessage(),
    react: async () => {},
    ...overrides,
  };
}

/**
 * Mock Discord interaction object.
 */
export function createMockInteraction(overrides = {}) {
  let replied = false;
  let deferred = false;

  return {
    id: '123456789',
    type: 2, // APPLICATION_COMMAND
    commandName: 'test',
    user: {
      id: '987654321',
      username: 'TestUser',
      tag: 'TestUser#1234',
    },
    guild: {
      id: '222222222',
      name: 'Test Server',
    },
    channel: {
      id: '111111111',
      name: 'general',
      send: async () => createMockMessage(),
    },
    options: {
      getString: () => null,
      getInteger: () => null,
      getBoolean: () => null,
      getUser: () => null,
      getChannel: () => null,
      getSubcommand: () => null,
    },
    replied,
    deferred,
    reply: async (content) => {
      replied = true;
      return { content };
    },
    deferReply: async () => {
      deferred = true;
    },
    editReply: async (content) => ({ content }),
    followUp: async (content) => ({ content }),
    ...overrides,
  };
}

/**
 * Wait for a specified duration.
 */
export function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Test utilities.
 */
export const testUtils = {
  loadFixture,
  createMockMessage,
  createMockInteraction,
  wait,
};

export default {
  MockAIService,
  testUtils,
};

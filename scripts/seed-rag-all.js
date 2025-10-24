#!/usr/bin/env node
/**
 * Seed all markdown files from data/rag-resources/ into RAG
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RAG_DIR = path.join(__dirname, '../data/rag-resources');
const API_URL = 'http://localhost:8000/rag/insert';

async function findMarkdownFiles(dir) {
  const files = [];

  async function walk(currentPath) {
    const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  }

  await walk(dir);
  return files;
}

async function addDocumentToRAG(filePath) {
  const relativePath = path.relative(RAG_DIR, filePath);
  const sourceName = relativePath.replace(/\.md$/, '').replace(/\//g, '_');
  const category = path.dirname(relativePath).split(path.sep)[0];

  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');

    const payload = {
      text: content,
      source: sourceName,
      metadata: {
        category: category === '.' ? 'general' : category,
        file_path: relativePath,
        tags: [category === '.' ? 'general' : category, 'doc']
      }
    };

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (result.ok) {
      console.log(`✓ ${relativePath} -> ${result.data.doc_id}`);
      return { success: true, file: relativePath };
    } else {
      console.error(`✗ ${relativePath}: ${result.error?.message || 'Unknown error'}`);
      return { success: false, file: relativePath, error: result.error };
    }
  } catch (error) {
    console.error(`✗ ${relativePath}: ${error.message}`);
    return { success: false, file: relativePath, error: error.message };
  }
}

async function main() {
  console.log(`=== Batch RAG Import from ${RAG_DIR} ===\n`);

  const files = await findMarkdownFiles(RAG_DIR);
  console.log(`Found ${files.length} markdown files\n`);

  let success = 0;
  let failed = 0;

  for (const file of files) {
    const result = await addDocumentToRAG(file);
    if (result.success) {
      success++;
    } else {
      failed++;
    }

    // Small delay to avoid overwhelming the API
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`\n=== RAG Import Complete ===`);
  console.log(`Total files: ${files.length}`);
  console.log(`Success: ${success}`);
  console.log(`Failed: ${failed}`);
}

main().catch(console.error);

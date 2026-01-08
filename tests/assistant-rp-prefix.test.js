import test from "node:test";
import assert from "node:assert/strict";
import { detectRpPrefix } from "../src/util/rpPrefix.js";

const personas = [{ name: "Caleb" }, { name: "Elio" }, { name: "Ambassador Questa" }];

test("detectRpPrefix: matches lowercase prefix with ':'", () => {
  const res = detectRpPrefix("caleb: hey", personas);
  assert.equal(res.isRp, true);
  assert.equal(res.rpAsPersona, "Caleb");
  assert.equal(res.messageContent, "hey");
});

test("detectRpPrefix: does not match capitalized prefix", () => {
  const res = detectRpPrefix("Caleb: hey", personas);
  assert.equal(res.isRp, false);
});

test("detectRpPrefix: matches fullwidth colon '：'", () => {
  const res = detectRpPrefix("caleb：hey", personas);
  assert.equal(res.isRp, true);
  assert.equal(res.rpAsPersona, "Caleb");
  assert.equal(res.messageContent, "hey");
});

test("detectRpPrefix: supports multi-word persona names (exact match)", () => {
  const res = detectRpPrefix("ambassador questa: hello there", personas);
  assert.equal(res.isRp, true);
  assert.equal(res.rpAsPersona, "Ambassador Questa");
  assert.equal(res.messageContent, "hello there");
});

test("detectRpPrefix: requires the typed prefix to be fully lowercase", () => {
  const res = detectRpPrefix("ambassador Questa: hello", personas);
  assert.equal(res.isRp, false);
});

test("detectRpPrefix: requires non-empty content after colon", () => {
  const res = detectRpPrefix("caleb:   ", personas);
  assert.equal(res.isRp, false);
});

test("detectRpPrefix: requires prefix to start with a lowercase letter", () => {
  const res = detectRpPrefix("_caleb: hey", personas);
  assert.equal(res.isRp, false);
});


#!/usr/bin/env node
/**
 * Writes docs/copy-deck.md: every sentence a person can read in Andy, by
 * screen, with where it lives and what the Terminology rules (STYLE.md) will
 * change it to. A report: it reads the code and changes none of it.
 *
 *   npm run copy-deck
 *
 * Parsed with the TypeScript compiler rather than searched with patterns, so
 * a string split across lines, a ternary inside JSX, or a template with a
 * name in it is still one string — and a comment never is.
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const ROOT = process.cwd();
const OUT = "docs/copy-deck.md";

/** Prompts sent to Claude are not read by a person; only their errors are. */
const MODEL_ONLY = new Set([
  "convex/extractionPrompt.ts",
  "convex/answerPrompt.ts",
  "convex/emailPrompt.ts",
]);

/** Attributes and object keys whose string value a person reads or hears. */
const SHOWN_ATTRIBUTES = new Set([
  "accessibilityLabel",
  "accessibilityHint",
  "placeholder",
  "title",
  "label",
  "note",
]);
const SHOWN_KEYS = new Set([
  "title",
  "headerTitle",
  "text",
  "body",
  "subtitle",
  "message",
]);
const SHOWN_SETTERS = /^set(Error|Status|Message|Notice|Warning)$/;

/**
 * What STYLE.md → Terminology will change, as decided on 2026-10-02. Exact
 * strings first (REFACTOR.md → J1 lists them); the word rules after, marked
 * "by rule" so a reader knows nobody looked at that sentence yet.
 */
const EXACT = new Map([
  ["New person — nobody by this name yet.", "Someone new — no one by this name yet."],
  ["A different {…}, kept separately", "A different {…}, with their own notes"],
  ["You already keep somebody by this name. Is this them?", "You've written about someone by this name. Is this them?"],
  ["This note goes to whoever you pick — or to somebody new.", "This note goes to whoever you pick — or to someone new."],
  ["Andy heard a name that might belong to somebody you already keep. Pick them, or keep it as a new person.", "Andy heard a name that might belong to someone you've written about. Pick them, or choose someone new."],
  ["Anyone who only ever came up inside those notes goes too. People with notes of their own stay.", "Anyone who only ever came up in those notes goes too. People with notes of their own stay."],
  ["Keep my facts", "Keep my edits"],
  ["That's longer than a fact. Try splitting it up.", "That's too long for one detail. Try splitting it in two."],
]);
const RULES = [
  [/\bsomebody\b/g, "someone"],
  [/\bSomebody\b/g, "Someone"],
  [/\bnobody\b/g, "no one"],
  [/\bNobody\b/g, "No one"],
  [/\bEveryone you keep in Andy\b/g, "Everyone in Andy"],
  [/\bfacts\b/g, "details"],
  [/\bFacts\b/g, "Details"],
  [/\bfact\b/g, "detail"],
  [/\bFact\b/g, "Detail"],
];

/** "Keep" said of people, not notes — the Terminology rule has no mechanical fix for it. */
// Fixed by hand: the three "you keep" strings (copy/people-written-about-not-kept).
const KEEPS_PEOPLE = /\b[Yy]ou (already )?keep (more than one|somebody|someone|people|\{…\})/;

function planned(text) {
  if (EXACT.has(text)) return EXACT.get(text);
  let next = text;
  for (const [pattern, replacement] of RULES) next = next.replace(pattern, replacement);
  const review = KEEPS_PEOPLE.test(next) ? " *(review: people are \"written about\", not kept)*" : "";
  if (next === text) return review.trim();
  return `${next} *(by rule)*${review}`;
}

function files(dir, keep) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== "_generated" && name !== "node_modules") out.push(...files(path, keep));
    } else if (keep(path)) {
      out.push(path);
    }
  }
  return out;
}

/** A template literal as it reads, with each `${…}` shown as `{…}`. */
function textOf(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    return node.head.text + node.templateSpans.map((span) => "{…}" + span.literal.text).join("");
  }
  return null;
}

/** Looks like a sentence or label, not an id, a route, or a style value. */
function readable(text) {
  const t = text.trim();
  if (t.length < 2) return false;
  if (/^[a-z0-9_./:#@-]+$/.test(t)) return false; // ids, routes, keys
  if (/^[A-Z0-9_]+$/.test(t)) return false; // CONSTANTS
  if (/^(https?:|andy:|\/)/.test(t)) return false;
  if (/^[a-z]{2}-[A-Z]{2}$/.test(t)) return false; // locale codes
  return /[A-Za-z]/.test(t);
}

const ENTITIES = { "&apos;": "'", "&quot;": '"', "&amp;": "&", "&lt;": "<", "&gt;": ">", "&ldquo;": "“", "&rdquo;": "”", "&rsquo;": "’", "&nbsp;": " " };
const decode = (s) => s.replace(/&[a-z]+;/g, (e) => ENTITIES[e] ?? e);

/**
 * A JSX element whose children are only text and `{…}` — "A different
 * {name}, kept separately" — read as the one sentence a person sees, not
 * three fragments. Null when the element has nested elements.
 */
function sentenceOf(element) {
  const children = element.children;
  if (!children.some((c) => ts.isJsxText(c) && c.getText().trim() !== "")) return null;
  if (!children.some((c) => ts.isJsxExpression(c))) return null;
  let out = "";
  for (const child of children) {
    if (ts.isJsxText(child)) out += child.getText();
    else if (ts.isJsxExpression(child)) {
      const literal = child.expression && textOf(child.expression);
      out += literal ?? (child.expression ? "{…}" : "");
    } else return null;
  }
  return out.replace(/\s+/g, " ").trim();
}

/** Starts like a sentence or label and has words in it. */
function sentenceLike(text) {
  return /^[A-Z{]/.test(text) && /\s/.test(text) || /[.?!…]$/.test(text);
}

function insideDevOnly(node) {
  for (let n = node.parent; n; n = n.parent) {
    if (ts.isBinaryExpression(n) && n.left.getText() === "__DEV__") return true;
    if (ts.isIfStatement(n) && n.expression.getText() === "__DEV__") return true;
  }
  return false;
}

function kindOf(node) {
  if (ts.isJsxText(node)) return "text";
  const raw = textOf(node) ?? "";
  // Walk up to whatever decides where this string ends up.
  for (let n = node.parent; n; n = n.parent) {
    if (ts.isJsxAttribute(n)) {
      const name = n.name.getText();
      if (!SHOWN_ATTRIBUTES.has(name)) return null;
      return name.startsWith("accessibility") ? "VoiceOver" : name;
    }
    if (ts.isJsxExpression(n)) {
      if (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent)) return "text";
      continue; // an attribute's {…}: keep walking to the attribute
    }
    if (ts.isNewExpression(n)) {
      const name = n.expression.getText();
      if (name === "ConvexError") return "server error";
      return null; // new Error(…) and friends are for developers
    }
    if (ts.isCallExpression(n)) {
      const callee = n.expression.getText();
      if (callee === "Alert.alert") return "alert";
      if (SHOWN_SETTERS.test(callee)) return "message";
      if (/^console\.|^(require|import)$/.test(callee)) return null;
      continue; // a helper that passes the string through
    }
    if (ts.isPropertyAssignment(n)) {
      const key = n.name.getText();
      if (SHOWN_KEYS.has(key)) return key === "text" ? "button" : key;
      continue; // maybe a constant table of sentences
    }
    if (ts.isVariableDeclaration(n)) {
      // A sentence kept in a constant or variable first — the lock screen's
      // COPY table, "1 other note came up". Only when it reads as a sentence,
      // so ids and option values stored the same way stay out.
      return sentenceLike(raw) ? "text" : null;
    }
    if (ts.isReturnStatement(n) || (ts.isArrowFunction(n) && n.body !== undefined && !ts.isBlock(n.body))) {
      return sentenceLike(raw) ? "text" : null;
    }
    if (ts.isBlock(n) || ts.isSourceFile(n) || ts.isFunctionDeclaration(n)) return null;
  }
  return null;
}

function collect(path) {
  const rel = relative(ROOT, path).split(sep).join("/");
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const modelOnly = MODEL_ONLY.has(rel);
  const backend = rel.startsWith("convex/");
  const rows = [];
  const visit = (node) => {
    if (ts.isJsxElement(node) && !insideDevOnly(node)) {
      const sentence = sentenceOf(node);
      if (sentence !== null && readable(sentence) && !backend) {
        const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        rows.push({ text: decode(sentence), kind: "text", where: `${rel}:${line}` });
        // Its attributes still hold readable strings (labels); its children were just read.
        ts.forEachChild(node.openingElement, visit);
        return;
      }
    }
    let text = null;
    if (ts.isJsxText(node)) text = node.getText().replace(/\s+/g, " ").trim();
    else text = textOf(node);
    if (text !== null && readable(text) && !insideDevOnly(node)) {
      const kind = kindOf(node);
      const serverOnly = kind === "server error";
      if (kind && (!backend || serverOnly) && (!modelOnly || serverOnly)) {
        const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        rows.push({ text: decode(text.replace(/\s+/g, " ").trim()), kind, where: `${rel}:${line}` });
      }
      if (!ts.isJsxText(node)) return; // a template's parts are not separate strings
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return rows;
}

const SCREENS = [
  ["Sign-in", (f) => f.includes("(auth)/")],
  ["Home", (f) => f.endsWith("(app)/index.tsx") || f.includes("briefing-card") || f.includes("connecting")],
  ["Record a note (capture)", (f) => f.includes("capture")],
  ["Profile", (f) => f.includes("profile/[id]/index") || f.includes("draft-sheet")],
  ["Edit a person", (f) => f.includes("profile/[id]/edit")],
  ["A note", (f) => f.includes("note/[id]")],
  ["Ask Andy", (f) => f.includes("search")],
  ["Settings", (f) => f.includes("settings")],
  ["App lock", (f) => f.includes("lock-screen") || f.includes("app-lock")],
  ["Notifications and calendar", (f) => f.includes("notifications") || f.includes("calendar") || f.includes("briefing")],
  ["Navigation titles", (f) => f.includes("_layout")],
  ["Server messages", (f) => f.startsWith("convex/")],
  ["Other", () => true],
];

const sources = [
  ...files("src", (p) => /\.(tsx?|ts)$/.test(p) && !/\.test\./.test(p)),
  ...files("convex", (p) => p.endsWith(".ts") && !p.endsWith(".test.ts")),
];

const groups = new Map(SCREENS.map(([name]) => [name, []]));
for (const path of sources) {
  const rel = relative(ROOT, path).split(sep).join("/");
  const screen = SCREENS.find(([, match]) => match(rel))[0];
  groups.get(screen).push(...collect(path));
}

const escape = (s) => s.replace(/\|/g, "\\|");
let total = 0;
let changing = 0;
let body = "";
for (const [screen, rows] of groups) {
  if (rows.length === 0) continue;
  const seen = new Set();
  const unique = rows.filter((r) => (seen.has(r.text + r.kind) ? false : seen.add(r.text + r.kind)));
  body += `\n## ${screen}\n\n| What a person reads | Kind | Where | Planned change (STYLE.md → Terminology) |\n|---|---|---|---|\n`;
  for (const r of unique) {
    const next = planned(r.text);
    total += 1;
    if (next) changing += 1;
    body += `| ${escape(r.text)} | ${r.kind} | \`${r.where}\` | ${escape(next)} |\n`;
  }
}

const header = `# Copy deck — every sentence in Andy

**Generated by \`npm run copy-deck\`. Do not edit by hand; edit the code, then regenerate.**

This is every string a person can read or hear in Andy:
- screen text, buttons and titles
- VoiceOver labels, placeholders and alerts
- error messages, including the server's

Each row shows where the string lives. Developer-only text (inside \`__DEV__\`) and the prompts sent to Claude are left out, because no person reads them.

**Planned change** shows what the Terminology table in \`STYLE.md\` (decided 2026-10-02) will turn a string into once the copy PR lands. Rows marked *(by rule)* were changed by the word rule alone; nobody has read that sentence yet.

**For the designer:** read top to bottom and mark anything that sounds wrong, unclear, or unlike the rest. Quote the string and its \`Where\` when you report it.

${total} strings, ${changing} with a planned change.
`;

writeFileSync(OUT, header + body);
console.log(`Wrote ${OUT}: ${total} strings, ${changing} with a planned change.`);

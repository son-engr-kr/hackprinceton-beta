// Reactive MirrorMeal loop built on spectrum-ts.
// Responds on iMessage (local mode) + terminal simultaneously.
//
// Features:
//   • Slash commands: /budget 50, /vegan, /allergy <item>, /new, /help
//   • Tapback: incoming "Liked/Loved" → YES, "Disliked" → PASS, "Emphasized" → regen
//   • Image attachment: auto-attach meal image from assets/meals if filename matches
//   • Self-echo filter: skip our own messages looped back on self-chat
//   • Typing indicator during Gemini generation
//
// Flow:
//   any incoming text
//     ├─ self echo          → skip
//     ├─ tel: space         → skip (invalid recipient format on reply)
//     ├─ slash command      → apply (+ feedback / reset / help)
//     ├─ tapback text       → map to YES / PASS / MODIFY
//     └─ plain text         → YES / MODIFY / PASS via Python parse_intent
//   then:
//     ├─ YES  → Knot /cart + /cart/checkout → reply
//     ├─ PASS → close session
//     └─ MODIFY / UNKNOWN(first turn) → generate (+ image) → reply

import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, mkdirSync, readdirSync, writeFileSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { createRequire } from "node:module";

import { Spectrum, attachment } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { terminal } from "spectrum-ts/providers/terminal";

const require = createRequire(import.meta.url);

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_DIR = dirname(__dirname); // api/
const REPO_ROOT = dirname(API_DIR); // repo top level
config({ path: join(REPO_ROOT, ".env") });

const PYTHON = join(API_DIR, ".venv", "bin", "python");
const ASSETS_DIR = join(API_DIR, "assets", "meals");
const INCOMING_DIR = join(API_DIR, "assets", "incoming");
if (!existsSync(INCOMING_DIR)) mkdirSync(INCOMING_DIR, { recursive: true });

const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_ROUNDS_PER_SESSION = 8;

// ─── Self-echo filter ──────────────────────────────────────────────────

const BOT_MESSAGE_PREFIXES = ["🍳", "🔄", "✅", "⚠", "👌", "⌛", "🧪", "🛒", "ℹ", "🆕"];

const recentOutgoing = [];
function rememberOutgoing(text) {
  recentOutgoing.push({ text, at: Date.now() });
  while (recentOutgoing.length > 40) recentOutgoing.shift();
}
function isOwnEcho(text) {
  const now = Date.now();
  return recentOutgoing.some(
    (e) => now - e.at < 60_000 && (e.text === text || e.text.startsWith(text.slice(0, 40))),
  );
}

// ─── Python bridge ─────────────────────────────────────────────────────

function callPython(cmd, body) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON, ["-m", "flanner.cli", cmd], {
      cwd: API_DIR,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => {
      err += d;
      process.stderr.write(`[py:${cmd}] ${d}`);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`plan_cli ${cmd} exit=${code}\n${err}`));
        return;
      }
      try {
        resolve(JSON.parse(out));
      } catch {
        reject(new Error(`plan_cli ${cmd} invalid JSON: ${out.slice(0, 200)}`));
      }
    });
    child.stdin.write(JSON.stringify(body));
    child.stdin.end();
  });
}

// ─── Session state ─────────────────────────────────────────────────────

const sessions = new Map();
function getSession(spaceId) {
  const now = Date.now();
  const cur = sessions.get(spaceId);
  if (cur && now - cur.lastTouched < SESSION_TTL_MS) {
    cur.lastTouched = now;
    return cur;
  }
  const fresh = {
    feedback: [],
    plan: null,
    round: 0,
    lastTouched: now,
    capNotified: false,
    checkinPending: null, // {meal_title, day} when waiting for check-in reply
    lastPlanSnapshot: null, // persisted across resets so /checkin works after YES
  };
  sessions.set(spaceId, fresh);
  return fresh;
}
function resetSession(spaceId) {
  sessions.delete(spaceId);
}

// ─── Slash commands ────────────────────────────────────────────────────

const HELP_TEXT = [
  "🆕 MirrorMeal commands:",
  "  /new                — start a fresh plan",
  "  /budget 50          — cap grocery cost at $50",
  "  /vegan              — vegan plan",
  "  /veggie             — vegetarian (eggs/dairy ok)",
  "  /allergy <item>     — exclude an ingredient (e.g. /allergy shrimp)",
  "  /modify <change>    — freeform revision",
  "  /checkin            — did you cook today's meal? (logs adherence)",
  "  /help               — show this list",
  "📷 Send a photo: receipt → pantry auto-updates; food dish → logged as eaten.",
  "Natural language also works: 'no shrimp', 'under $60', 'less spicy'.",
  "Confirm: 'yes' / ❤️ / 👍     Revise: 'modify <change>'     Cancel: 'skip' / 👎",
].join("\n");

/** Returns { kind: 'command'|'feedback'|'reset'|'help'|'unknown', ... } */
function parseSlash(text) {
  if (!text.startsWith("/")) return null;
  const [cmd, ...rest] = text.slice(1).trim().split(/\s+/);
  const arg = rest.join(" ").trim();
  switch (cmd.toLowerCase()) {
    case "help":
    case "도움말":
    case "?":
      return { kind: "help" };
    case "new":
    case "restart":
    case "reset":
    case "새로":
      return { kind: "reset" };
    case "budget":
    case "예산":
      if (!arg) return { kind: "error", msg: "Usage: /budget 50" };
      return { kind: "feedback", feedback: `keep grocery cost under $${arg}` };
    case "vegan":
    case "비건":
      return { kind: "feedback", feedback: "make it vegan" };
    case "veggie":
    case "vegetarian":
    case "채식":
      return { kind: "feedback", feedback: "make it vegetarian (eggs/dairy ok)" };
    case "allergy":
    case "알러지":
    case "no":
      if (!arg) return { kind: "error", msg: "Usage: /allergy shrimp" };
      return { kind: "feedback", feedback: `allergy: no ${arg}` };
    case "modify":
    case "수정":
    case "change":
    case "변경":
      if (!arg) return { kind: "error", msg: "Usage: /modify less spicy" };
      return { kind: "feedback", feedback: arg };
    case "checkin":
    case "체크인":
      return { kind: "checkin" };
    default:
      return { kind: "error", msg: `Unknown command: /${cmd} — try /help` };
  }
}

/** Bare help words that don't use the `/` prefix. */
function isBareHelp(text) {
  const t = text.trim().toLowerCase();
  return t === "help" || t === "?" || t === "commands" || t === "도움말" || t === "명령어";
}

// ─── Tapback parsing (iMessage echoes reactions as text) ───────────────

const TAPBACK_RE = /^(Loved|Liked|Disliked|Laughed at|Emphasized|Questioned)\s+["\u201C](.+)["\u201D]/s;

function parseTapback(text) {
  const m = TAPBACK_RE.exec(text);
  if (!m) return null;
  const verb = m[1].toLowerCase();
  if (verb === "loved" || verb === "liked") return { intent: "YES" };
  if (verb === "disliked") return { intent: "PASS" };
  if (verb === "emphasized") return { intent: "MODIFY", feedback: "regenerate this plan with different meals" };
  if (verb === "laughed at") return { intent: "YES" };
  return null;
}

// ─── Image attachment lookup ───────────────────────────────────────────

function listAssets() {
  if (!existsSync(ASSETS_DIR)) return [];
  return readdirSync(ASSETS_DIR).filter((f) => /\.(png|jpe?g|gif|webp|heic)$/i.test(f));
}

function pickMealImage(plan) {
  const assets = listAssets();
  if (!assets.length) return null;
  const meals = plan?.meals || [];
  const haystack = meals
    .flatMap((m) => [m.title, m.mirrors, ...(m.ingredients || [])])
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  for (const file of assets) {
    const stem = file.replace(/\.[^.]+$/, "").replace(/_/g, " ").toLowerCase();
    if (stem === "default") continue;
    if (haystack.includes(stem)) return join(ASSETS_DIR, file);
  }
  const fallback = assets.find((f) => /^default\.(png|jpe?g|gif|webp)$/i.test(f));
  return fallback ? join(ASSETS_DIR, fallback) : null;
}

// ─── Send helpers ──────────────────────────────────────────────────────

async function botSend(space, text) {
  rememberOutgoing(text);
  await space.send(text);
}

async function botSendWithImage(space, text, imagePath) {
  rememberOutgoing(text);
  if (imagePath) {
    await space.send(text, attachment(imagePath));
  } else {
    await space.send(text);
  }
}

// ─── Orchestration ─────────────────────────────────────────────────────

async function generateAndSend(space, session) {
  session.round += 1;
  const resp = await callPython("generate", {
    feedback_history: session.feedback,
    round_num: session.round,
    space_id: space.id,
  });
  session.plan = resp.plan;
  session.lastPlanSnapshot = resp.plan;
  session.planId = resp.plan_id || resp.plan?._plan_id || null;
  const img = pickMealImage(resp.plan);
  await botSendWithImage(space, resp.message, img);
  if (img) console.log(`   📎 attached: ${img}`);
}

async function orderAndSend(space, session, message) {
  if (!session.plan) {
    await botSend(space, "⚠ No plan yet — generating one first.");
    await generateAndSend(space, session);
    return;
  }
  try {
    await message?.react?.("love");
  } catch {}
  const resp = await callPython("order", { plan: session.plan });
  await botSend(space, resp.message);
  // Preserve plan snapshot for future /checkin; clear feedback so next /new starts clean
  const snapshot = session.plan;
  resetSession(space.id);
  const reborn = getSession(space.id);
  reborn.lastPlanSnapshot = snapshot;
}

async function checkinPrompt(space, session) {
  const resp = await callPython("checkin_prompt", {
    last_plan: session.lastPlanSnapshot || session.plan,
  });
  session.checkinPending = resp.meal_title
    ? { meal_title: resp.meal_title, day: resp.day }
    : null;
  if (resp.adherence_summary) {
    // Silently push adherence into next plan's feedback so LLM sees history
    if (!session.feedback.some((f) => f.startsWith("Last week adherence"))) {
      session.feedback.push(resp.adherence_summary);
    }
  }
  await botSend(space, resp.message);
}

async function checkinRecord(space, session, text) {
  const pending = session.checkinPending;
  session.checkinPending = null;
  const resp = await callPython("checkin_record", {
    reply: text,
    meal_title: pending?.meal_title || null,
    day: pending?.day || null,
    space_id: space.id,
  });
  await botSend(space, resp.ack);
}

async function handleIncomingAttachment(space, message) {
  const att = message.content;
  if (!att || att.type !== "attachment") return;

  if (space.id.includes(";tel:")) {
    console.log(`⏭  skip tel: space ${space.id}`);
    return;
  }

  const mime = att.mimeType || "image/jpeg";
  if (!mime.startsWith("image/")) {
    console.log(`⏭  skip non-image attachment (${mime})`);
    return;
  }

  console.log(`📷 [${message.platform}|${space.id}] ${att.name || "(unnamed)"} (${mime})`);
  const ext = (att.name && att.name.includes(".")
    ? att.name.slice(att.name.lastIndexOf("."))
    : mime === "image/heic"
      ? ".heic"
      : ".jpg");
  const savedPath = join(INCOMING_DIR, `${Date.now()}-${randomUUID().slice(0, 8)}${ext}`);

  try {
    const buf = await att.read();
    writeFileSync(savedPath, buf);
    console.log(`   💾 saved: ${savedPath} (${buf.length} bytes)`);
  } catch (e) {
    console.error("attachment read failed:", e);
    await space.send(`⚠ Couldn't read the attachment: ${String(e?.message || e).slice(0, 100)}`);
    return;
  }

  await space.responding(async () => {
    await botSend(space, "📷 Analyzing image with Gemma 4 Vision…");
    try {
      const resp = await callPython("photo", {
        image_path: savedPath,
        mime_type: mime,
        space_id: space.id,
      });
      await botSend(space, resp.ack || "📷 Analyzed.");
      if (resp.kind === "food") {
        console.log(`   🍽 food logged — ${resp.pantry_deltas?.length || 0} ingredients deducted`);
      } else if (resp.kind === "receipt") {
        console.log(`   🧾 receipt logged — ${resp.pantry_deltas?.length || 0} items added`);
      }
    } catch (e) {
      console.error("photo pipeline failed:", e);
      await botSend(space, `⚠ Vision pipeline error: ${String(e?.message || e).slice(0, 120)}`);
    }
  });
}

// ─── chat.db fallback for missed attachments ───────────────────────────
//
// spectrum-ts + @photon-ai/advanced-imessage has a race: sometimes an
// inbound photo arrives as a text message containing only "\uFFFC"
// (Object Replacement Character, the iMessage placeholder) because
// `event.message.attachments` is empty at emit time. When we see that
// placeholder we query ~/Library/Messages/chat.db directly via sqlite,
// resolve the filename, and drive the vision pipeline manually.
//
// Requires Full Disk Access on Messages.app — same permission the
// Photon kit already needs.
const OBJ_REPLACE = "\uFFFC";
const processedAttachmentFiles = new Set();

let _chatDb = null;
function getChatDb() {
  if (_chatDb) return _chatDb;
  const Database = require("better-sqlite3");
  _chatDb = new Database(join(homedir(), "Library/Messages/chat.db"), {
    readonly: true,
    fileMustExist: true,
  });
  return _chatDb;
}

function findLatestAttachmentForSpace(spaceId) {
  const phone = spaceId.split(";-;").pop();  // "+16178615781"
  if (!phone) return null;
  const row = getChatDb().prepare(`
    SELECT a.filename, a.mime_type, m.ROWID AS msg_rowid
    FROM attachment a
    JOIN message_attachment_join maj ON maj.attachment_id = a.ROWID
    JOIN message m ON m.ROWID = maj.message_id
    JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
    JOIN chat c ON c.ROWID = cmj.chat_id
    WHERE c.guid LIKE '%' || ? || '%'
      AND m.is_from_me = 0
    ORDER BY m.date DESC
    LIMIT 1
  `).get(phone);
  if (!row || !row.filename) return null;
  const resolved = row.filename.startsWith("~")
    ? join(homedir(), row.filename.slice(1))
    : row.filename;
  return { path: resolved, mime: row.mime_type || "image/jpeg", rowid: row.msg_rowid };
}

async function handleOrphanPhotoPlaceholder(space) {
  console.log("   🔍 text is U+FFFC placeholder — looking up attachment in chat.db");
  let found;
  try {
    found = findLatestAttachmentForSpace(space.id);
  } catch (e) {
    console.error("chat.db query failed:", e);
    await botSend(space, "⚠ Got your photo but couldn't read the Messages DB. Check Full Disk Access.");
    return;
  }
  if (!found) {
    await botSend(space, "📷 Got a photo — couldn't locate the attachment. Mind sending it again?");
    return;
  }
  if (processedAttachmentFiles.has(found.path)) {
    console.log(`   ⏭  already processed: ${found.path}`);
    return;
  }
  processedAttachmentFiles.add(found.path);

  if (!existsSync(found.path)) {
    await botSend(space, `⚠ Attachment file not on disk: ${found.path}`);
    return;
  }

  let buf;
  try {
    buf = readFileSync(found.path);
  } catch (e) {
    await botSend(space, `⚠ File read failed: ${String(e?.message || e).slice(0, 80)}`);
    return;
  }

  const ext = found.path.slice(found.path.lastIndexOf(".")) || ".jpg";
  const savedPath = join(INCOMING_DIR, `${Date.now()}-${randomUUID().slice(0, 8)}${ext}`);
  writeFileSync(savedPath, buf);
  console.log(`   💾 copied from Messages: ${savedPath} (${buf.length} bytes, ${found.mime})`);

  await space.responding(async () => {
    await botSend(space, "📷 Analyzing image with Gemma 4 Vision…");
    try {
      const resp = await callPython("photo", {
        image_path: savedPath,
        mime_type: found.mime,
        space_id: space.id,
      });
      await botSend(space, resp.ack || "📷 Analyzed.");
    } catch (e) {
      console.error("photo pipeline failed:", e);
      await botSend(space, `⚠ Vision pipeline error: ${String(e?.message || e).slice(0, 120)}`);
    }
  });
}

// Registry of Space objects we've seen messages from. Needed because local-mode
// spectrum-ts can't create a space out of thin air — we can only push to a
// space that's already spawned by an inbound message. Presenter: have the
// teammate send you any text first so their space gets registered here.
const knownSpaces = new Map(); // space.id → Space object
let lastKnownSpaceId = null;

async function handleIncoming(space, message) {
  // Remember every space we see — enables later POST /push to reach it.
  knownSpaces.set(space.id, space);
  lastKnownSpaceId = space.id;

  if (message.content?.type === "attachment") {
    return handleIncomingAttachment(space, message);
  }

  const text = message.content?.type === "text" ? message.content.text : "";
  if (!text) return;

  if (space.id.includes(";tel:")) {
    console.log(`⏭  skip tel: space ${space.id}`);
    return;
  }

  // spectrum-ts sometimes misses attachments and delivers them as a
  // text-only message containing only U+FFFC. Intercept and resolve
  // against the Messages.app DB before any slash/plan parsing.
  const trimmedForPlaceholder = text.replace(/\s/g, "");
  if (trimmedForPlaceholder === OBJ_REPLACE || trimmedForPlaceholder === "") {
    if (trimmedForPlaceholder === OBJ_REPLACE) {
      return handleOrphanPhotoPlaceholder(space);
    }
    return;
  }

  if (BOT_MESSAGE_PREFIXES.some((p) => text.startsWith(p)) || isOwnEcho(text)) {
    console.log(`⏭  skip own echo: ${text.slice(0, 40)}`);
    return;
  }

  console.log(`📩 [${message.platform}|${space.id}] ${text}`);

  const session = getSession(space.id);
  const isFirstTurn = session.round === 0;

  // Bare "help" without slash
  if (isBareHelp(text)) return botSend(space, HELP_TEXT);

  // 0. Pending check-in reply — intercept before any other parsing
  if (session.checkinPending) {
    return space.responding(() => checkinRecord(space, session, text));
  }

  // 1. Slash commands
  const slash = parseSlash(text);
  if (slash) {
    if (slash.kind === "help") return botSend(space, HELP_TEXT);
    if (slash.kind === "reset") {
      const snapshot = session.lastPlanSnapshot;
      resetSession(space.id);
      await botSend(space, "🆕 Session reset. Generating a fresh plan...");
      const fresh = getSession(space.id);
      fresh.lastPlanSnapshot = snapshot; // preserve for /checkin
      return space.responding(() => generateAndSend(space, fresh));
    }
    if (slash.kind === "error") return botSend(space, `⚠ ${slash.msg}`);
    if (slash.kind === "checkin") {
      return space.responding(() => checkinPrompt(space, session));
    }
    if (slash.kind === "feedback") {
      session.feedback.push(slash.feedback);
      await botSend(space, `🔄 Applying: "${slash.feedback}"`);
      return space.responding(() => generateAndSend(space, session));
    }
  }

  // 2. Tapback
  const tap = parseTapback(text);
  if (tap) {
    if (tap.intent === "YES")
      return space.responding(() => orderAndSend(space, session, message));
    if (tap.intent === "PASS") {
      if (session.planId) {
        try {
          await callPython("plan_status", { plan_id: session.planId, status: "skipped" });
        } catch (e) { console.error("plan_status skip failed:", e); }
      }
      await botSend(space, "👌 Skipping this week.");
      resetSession(space.id);
      return;
    }
    if (tap.intent === "MODIFY") {
      session.feedback.push(tap.feedback);
      return space.responding(() => generateAndSend(space, session));
    }
  }

  // 3. Natural language intent via Python
  const parsed = await callPython("parse", { text });
  const intent = parsed.intent;

  if (intent === "YES")
    return space.responding(() => orderAndSend(space, session, message));
  if (intent === "PASS") {
    if (session.planId) {
      try {
        await callPython("plan_status", { plan_id: session.planId, status: "skipped" });
      } catch (e) {
        console.error("plan_status skip failed:", e);
      }
    }
    await botSend(space, "👌 Skipping this week. Ping me again anytime.");
    resetSession(space.id);
    return;
  }

  if (intent === "MODIFY" && parsed.feedback) {
    session.feedback.push(parsed.feedback);
  } else if (intent === "UNKNOWN" && !isFirstTurn) {
    // Don't silently regen on greetings/acks — ask for clarification instead
    return botSend(
      space,
      "🤔 How would you like to adjust?\nTry: 'no shrimp', 'under $50', '/vegan', '/help'.\nTo confirm, reply 'yes' or ❤️.",
    );
  }

  if (session.round >= MAX_ROUNDS_PER_SESSION) {
    if (!session.capNotified) {
      session.capNotified = true;
      await botSend(
        space,
        `🔄 That's ${MAX_ROUNDS_PER_SESSION} revisions. Go with the current plan? Reply 'yes' / ❤️ or 'skip'.`,
      );
    }
    return;
  }

  await space.responding(async () => {
    await botSend(space, isFirstTurn ? "🍳 Building your weekly plan..." : "🔄 Applying your feedback — regenerating...");
    await generateAndSend(space, session);
  });
}

// ─── Boot ──────────────────────────────────────────────────────────────

async function main() {
  const projectId = process.env.PHOTON_PROJECT_ID;
  const projectSecret = process.env.PHOTON_PROJECT_SECRET;
  if (!projectId || !projectSecret) {
    console.error("❌ PHOTON_PROJECT_ID / PHOTON_PROJECT_SECRET missing");
    process.exit(1);
  }

  // Cloud mode: allows outbound-initiate to phone numbers on the Photon
  // dashboard allowlist. Local mode was easier to set up but restricted us
  // to "reply-only" — no proactive weekly push. Swap back to local if
  // allowlist approvals fail at demo time.
  const CLOUD_MODE = process.env.SPECTRUM_CLOUD !== "false";
  const app = await Spectrum({
    projectId,
    projectSecret,
    providers: [
      CLOUD_MODE ? imessage.config() : imessage.config({ local: true }),
      terminal.config(),
    ],
  });

  const assetCount = listAssets().length;
  console.log("▶ MirrorMeal spectrum loop ready.");
  console.log(`  providers: iMessage(${CLOUD_MODE ? "cloud" : "local"}) + terminal`);
  console.log(`  assets: ${assetCount} meal image(s) in ${ASSETS_DIR}`);
  console.log(`  try:  /help  |  'start'  |  ❤️/👍 tapback\n`);

  const shutdown = async () => {
    console.log("\n▶ stopping…");
    await app.stop();
    process.exit(0);
  };
  // ─── Proactive push control server ────────────────────────────────────
  //
  //   POST /push   — generate a plan and push it to the teammate's space.
  //                  Body: {space_id?, feedback_history?}
  //                  If space_id omitted → uses last known space.
  //   POST /send   — send raw text to a space.
  //                  Body: {space_id?, text}
  //   GET  /spaces — list registered space ids
  //
  // Default port 8765 (override with CONTROL_PORT env).
  //
  // Demo trigger:
  //   curl -X POST http://127.0.0.1:8765/push -H 'Content-Type: application/json' -d '{}'
  //
  const CONTROL_PORT = Number(process.env.CONTROL_PORT || 8765);
  // Kick off a conversation via AppleScript (bypasses spectrum-ts's local-mode
  // "no space creation" restriction). Requires Messages.app Full Disk Access.
  // After this first send, incoming messages from the target will register
  // the space for regular spectrum-ts sends on subsequent pushes.
  function sendViaAppleScript(phone, text) {
    return new Promise((resolve, reject) => {
      const script = `
tell application "Messages"
  set targetService to 1st service whose service type = iMessage
  set theBuddy to buddy "${phone}" of targetService
  send "${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}" to theBuddy
end tell`;
      const p = spawn("osascript", ["-e", script], { stdio: ["ignore", "pipe", "pipe"] });
      let err = "";
      p.stderr.on("data", d => (err += d));
      p.on("close", code => {
        if (code !== 0) reject(new Error(`osascript exit ${code}: ${err.trim()}`));
        else resolve();
      });
      p.on("error", reject);
    });
  }

  const control = createServer(async (req, res) => {
    try {
      let body = "";
      for await (const chunk of req) body += chunk;
      const j = body ? JSON.parse(body) : {};

      if (req.method === "GET" && req.url === "/spaces") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ spaces: Array.from(knownSpaces.keys()), last: lastKnownSpaceId }));
        return;
      }

      if (req.method === "POST" && (req.url === "/push" || req.url === "/send")) {
        const targetId = j.space_id || lastKnownSpaceId;
        let space = targetId ? knownSpaces.get(targetId) : null;
        const phone = j.phone;   // E.164 like "+16178615781"
        let via = "spectrum";

        if (!space && !phone) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            error: "need either space_id of a known chat OR a phone number",
            known_spaces: Array.from(knownSpaces.keys()),
            hint: "first push to a new person: POST /push with {phone:'+1...'}",
          }));
          return;
        }

        // No known space yet → try cloud first (requires allowlist), then
        // AppleScript fallback.
        if (!space && phone) {
          if (CLOUD_MODE) {
            try {
              space = await openCloudSpace(phone);
              knownSpaces.set(space.id, space);
              via = "cloud";
            } catch (e) {
              console.log(`   ℹ cloud space open failed (${e.message}) — falling back to AppleScript`);
            }
          }
        }
        const useAppleScript = !space && phone;

        if (req.url === "/send") {
          const text = j.text || "(empty)";
          if (useAppleScript) {
            await sendViaAppleScript(phone, text);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true, sent_to: phone, via: "applescript" }));
          } else {
            rememberOutgoing(text);
            await space.send(text);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true, sent_to: space.id, via: "spectrum" }));
          }
          return;
        }

        // /push — generate a plan and send it.
        // If we have a spectrum Space object, use it (supports attachments).
        // Otherwise (first contact), AppleScript the plan text directly.
        const spaceIdForSession = space ? space.id : `iMessage;-;${phone}`;
        const session = getSession(spaceIdForSession);
        session.round += 1;
        const resp = await callPython("generate", {
          feedback_history: j.feedback_history || session.feedback,
          round_num: session.round,
          space_id: spaceIdForSession,
        });
        session.plan = resp.plan;
        session.lastPlanSnapshot = resp.plan;
        session.planId = resp.plan_id || resp.plan?._plan_id || null;

        const intro = "📬 Your weekly meal plan is ready:";

        if (useAppleScript) {
          await sendViaAppleScript(phone, intro);
          // Small delay so messages arrive in order
          await new Promise(r => setTimeout(r, 700));
          await sendViaAppleScript(phone, resp.message);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            ok: true,
            sent_to: phone,
            via: "applescript",
            plan_id: session.planId,
            note: "space will register once recipient replies; subsequent pushes use spectrum",
          }));
        } else {
          await botSend(space, intro);
          const img = pickMealImage(resp.plan);
          await botSendWithImage(space, resp.message, img);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            ok: true,
            sent_to: space.id,
            via: "spectrum",
            plan_id: session.planId,
          }));
        }
        return;
      }

      res.writeHead(404);
      res.end("not found");
    } catch (e) {
      console.error("control server error:", e);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(e?.message || e) }));
    }
  });
  control.listen(CONTROL_PORT, "127.0.0.1", () => {
    console.log(`  control: http://127.0.0.1:${CONTROL_PORT}  (POST /push · /send · GET /spaces)`);
  });

  // ─── Cloud-mode outbound helper ───────────────────────────────────────
  //
  // In cloud mode we can open a new DM by phone via imessage(app).space(user).
  // Populated once we know the platform handle is ready.
  async function openCloudSpace(phone) {
    if (!CLOUD_MODE) throw new Error("cloud mode disabled (SPECTRUM_CLOUD=false)");
    const im = imessage(app);
    const user = await im.user(phone);
    return im.space(user);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  for await (const [space, message] of app.messages) {
    handleIncoming(space, message).catch((e) => {
      console.error("handler error:", e);
      space.send(`⚠ Internal error: ${String(e.message || e).slice(0, 120)}`).catch(() => {});
    });
  }
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});

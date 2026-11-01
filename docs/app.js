(() => {
  // src/json.mjs
  var JSON_LIMITS = { bytes: 5 * 1024 * 1024, depth: 40, nodes: 2e5, string: 1e5 };
  var BAD = /* @__PURE__ */ new Set(["__proto__", "prototype", "constructor"]);
  var object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  var own = (o, k) => Object.hasOwn(o, k);
  var clone = (v) => structuredClone(v);
  var pointer = (p) => p.length ? "/" + p.map((k) => String(k).replaceAll("~", "~0").replaceAll("/", "~1")).join("/") : "";
  function fail(message) {
    throw Error(message);
  }
  function checkedString(s, max = JSON_LIMITS.string) {
    if (typeof s !== "string" || s.length > max) fail("Invalid or oversized string.");
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c >= 55296 && c <= 56319) {
        const n = s.charCodeAt(++i);
        if (!(n >= 56320 && n <= 57343)) fail("Ill-formed Unicode rejected.");
      } else if (c >= 56320 && c <= 57343) fail("Ill-formed Unicode rejected.");
    }
    return s;
  }
  function parseJSON(text, limits = JSON_LIMITS) {
    if (typeof text !== "string" || new TextEncoder().encode(text).byteLength > limits.bytes) fail("JSON input exceeds its byte limit.");
    let i = 0, nodes = 0;
    const whitespace = () => {
      while (/[\x20\n\r\t]/.test(text[i] ?? "!")) i++;
    };
    function string() {
      const start = i++;
      let closed = false;
      while (i < text.length) {
        const c = text[i++];
        if (c === "\\") {
          i++;
          continue;
        }
        if (c === '"') {
          closed = true;
          break;
        }
      }
      if (!closed) fail("Unterminated JSON string.");
      return checkedString(JSON.parse(text.slice(start, i)), limits.string);
    }
    function value(depth) {
      if (depth > limits.depth || ++nodes > limits.nodes) fail("JSON depth/node bound exceeded.");
      whitespace();
      const c = text[i];
      if (c === '"') return string();
      if (c === "{") {
        i++;
        whitespace();
        const out2 = /* @__PURE__ */ Object.create(null);
        if (text[i] === "}") {
          i++;
          return out2;
        }
        while (true) {
          whitespace();
          if (text[i] !== '"') fail("Expected JSON object key.");
          const key = string();
          if (BAD.has(key)) fail("Unsafe object key rejected.");
          if (own(out2, key)) fail("Duplicate object key rejected.");
          whitespace();
          if (text[i++] !== ":") fail("Expected JSON colon.");
          out2[key] = value(depth + 1);
          whitespace();
          if (text[i] === "}") {
            i++;
            return out2;
          }
          if (text[i++] !== ",") fail("Expected JSON object comma.");
        }
      }
      if (c === "[") {
        i++;
        whitespace();
        const out2 = [];
        if (text[i] === "]") {
          i++;
          return out2;
        }
        while (true) {
          out2.push(value(depth + 1));
          whitespace();
          if (text[i] === "]") {
            i++;
            return out2;
          }
          if (text[i++] !== ",") fail("Expected JSON array comma.");
        }
      }
      for (const [token, v] of [["true", true], ["false", false], ["null", null]]) if (text.startsWith(token, i)) {
        i += token.length;
        return v;
      }
      const match = text.slice(i).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
      if (!match) fail("Invalid JSON value.");
      i += match[0].length;
      const number = Number(match[0]);
      if (!Number.isFinite(number) || Number.isInteger(number) && !Number.isSafeInteger(number) || Object.is(number, -0)) fail("Unsafe/nonfinite/negative-zero number rejected.");
      return number;
    }
    const out = value(0);
    whitespace();
    if (i !== text.length) fail("Trailing JSON data rejected.");
    return out;
  }
  function canonical(v) {
    if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
    if (object(v)) return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
    return JSON.stringify(v);
  }
  async function hash(v) {
    const bytes = new TextEncoder().encode(canonical(v));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  function keysExactly(value, keys) {
    if (!object(value) || Object.keys(value).some((k) => !keys.includes(k)) || keys.some((k) => !own(value, k))) fail("Unsupported fields or incomplete transaction shape.");
  }

  // src/core.mjs
  var FORMAT = "pen-transaction-project";
  var MANIFEST = "pen-transaction-manifest";
  var LIMITS = { documentBytes: 1024 * 1024, documentDepth: 30, documentNodes: 3e4, nodes: 1500, history: 30, operations: 20 };
  var TYPES = ["frame", "rectangle", "ellipse", "text"];
  var PROPERTIES = ["x", "y", "width", "height", "fill", "opacity", "cornerRadius", "content", "fontSize"];
  var HEX = /^#(?:[a-f\d]{3}|[a-f\d]{6}|[a-f\d]{8})$/i;
  var HASH = /^[a-f\d]{64}$/;
  function nodeIndex(doc) {
    const map = /* @__PURE__ */ new Map();
    function walk(children, parent, path, ancestors) {
      if (!Array.isArray(children)) fail("Node children must be an array.");
      for (let i = 0; i < children.length; i++) {
        const node = children[i];
        if (!object(node) || typeof node.id !== "string" || !node.id || node.id.length > 128 || /[\x00-\x20/]/.test(node.id) || typeof node.type !== "string" || !node.type || node.type.length > 64) fail("Every tree node needs a bounded unique ID (no spaces/slashes) and type.");
        if (map.has(node.id)) fail(`Ambiguous duplicate ID: ${node.id}`);
        if (map.size >= LIMITS.nodes) fail("Node count bound exceeded.");
        map.set(node.id, { node, parent, index: i, path: [...path, i], ancestors });
        if (own(node, "children")) walk(node.children, node.id, [...path, i, "children"], [...ancestors, node.id]);
      }
    }
    walk(doc.children, null, ["children"], []);
    return map;
  }
  function validateDocument(doc) {
    const safe = parseJSON(JSON.stringify(doc), { ...JSON_LIMITS, bytes: LIMITS.documentBytes, depth: LIMITS.documentDepth, nodes: LIMITS.documentNodes });
    if (!object(safe) || safe.version !== "2.21" || !Array.isArray(safe.children)) fail("Only strict-JSON .pen documents declaring version2.21 and a children array are accepted. Other versions/comments are refused, not converted.");
    nodeIndex(safe);
    return safe;
  }
  function mutable(entry, index) {
    if (!entry || !TYPES.includes(entry.node.type)) fail("Unknown/unsupported node type is opaque and not mutable.");
    if ([entry.node, ...entry.ancestors.map((id) => index.get(id).node)].some((n) => !TYPES.includes(n.type) || n.reusable === true || n.type === "ref" || own(n, "descendants"))) fail("Opaque/reusable/component override subtrees are outside this transaction subset.");
  }
  function absoluteParent(id, index) {
    if (id === null) return;
    const node = index.get(id)?.node;
    if (!node || node.type !== "frame" || node.layout !== "none") fail("Geometry/move requires root or an explicit layout:none frame parent.");
  }
  function propertyValue(node, key, value) {
    if (!PROPERTIES.includes(key)) fail("Unsupported set property. IDs, references, children and unknown fields cannot be overwritten.");
    if (key === "fill") {
      if (typeof value !== "string" || !HEX.test(value)) fail("Set fill accepts only a literal hex color.");
      return;
    }
    if (key === "content") {
      if (node.type !== "text") fail("content is limited to text nodes.");
      checkedString(value, 4e3);
      return;
    }
    if (key === "fontSize" && node.type !== "text") fail("fontSize is limited to text nodes.");
    if (typeof value !== "number" || !Number.isFinite(value) || Object.is(value, -0)) fail("Set geometry/style requires a finite number.");
    const bounds = { x: [-1e5, 1e5], y: [-1e5, 1e5], width: [1, 1e4], height: [1, 1e4], opacity: [0, 1], cornerRadius: [0, 1e3], fontSize: [1, 200] }[key];
    if (value < bounds[0] || value > bounds[1]) fail("Set value exceeds the supported range.");
    if (key === "cornerRadius" && !["frame", "rectangle"].includes(node.type)) fail("cornerRadius is limited to frames/rectangles.");
  }
  async function guardedOperation(doc, spec) {
    const index = nodeIndex(doc), entry = index.get(spec.id);
    mutable(entry, index);
    const common = { ...clone(spec), expectNodeHash: await hash(entry.node) };
    if (spec.op === "move") {
      common.expectDestinationHash = await hash(spec.toParent === null ? doc : index.get(spec.toParent)?.node ?? fail("Destination not found."));
    }
    return common;
  }
  async function single(doc, op) {
    if (!object(op) || !["rename", "set", "move"].includes(op.op)) fail("Unsupported operation. This grammar is not executable JavaScript or Pencil MCP DSL.");
    const names = op.op === "rename" ? ["op", "id", "name", "expectNodeHash"] : op.op === "set" ? ["op", "id", "property", "value", "expectNodeHash"] : ["op", "id", "toParent", "index", "expectNodeHash", "expectDestinationHash"];
    keysExactly(op, names);
    const index = nodeIndex(doc), entry = index.get(op.id);
    mutable(entry, index);
    if (!HASH.test(op.expectNodeHash) || await hash(entry.node) !== op.expectNodeHash) fail("Stale target-object hash guard.");
    if (op.op === "rename") {
      checkedString(op.name, 200);
      if (!op.name.trim()) fail("Name cannot be empty.");
      entry.node.name = op.name;
      return;
    }
    if (op.op === "set") {
      propertyValue(entry.node, op.property, op.value);
      if (["x", "y"].includes(op.property)) absoluteParent(entry.parent, index);
      entry.node[op.property] = op.value;
      return;
    }
    if (op.toParent !== null && (typeof op.toParent !== "string" || !index.has(op.toParent))) fail("Move destination does not exist.");
    if (op.toParent === op.id || index.get(op.toParent)?.ancestors.includes(op.id)) fail("Move would create a cycle.");
    absoluteParent(entry.parent, index);
    absoluteParent(op.toParent, index);
    if (op.toParent !== null) mutable(index.get(op.toParent), index);
    const destination = op.toParent === null ? doc : index.get(op.toParent).node;
    if (!HASH.test(op.expectDestinationHash) || await hash(destination) !== op.expectDestinationHash) fail("Stale destination hash guard.");
    const subtree = [...index.values()].filter((e) => e.node.id === op.id || e.ancestors.includes(op.id));
    if (subtree.some((e) => !TYPES.includes(e.node.type) || e.node.reusable === true || own(e.node, "descendants") || e.node.type === "frame" && e.node.children?.length && e.node.layout !== "none")) fail("Moving a subtree with opaque/component/flex constructs is refused.");
    const source = entry.parent === null ? doc.children : index.get(entry.parent).node.children;
    const target = op.toParent === null ? doc.children : destination.children ??= [];
    const length = target.length - (target === source ? 1 : 0);
    if (!Number.isInteger(op.index) || op.index < 0 || op.index > length) fail("Move index must address the destination after removal.");
    const [node] = source.splice(entry.index, 1);
    target.splice(op.index, 0, node);
  }
  async function objectDiff(before, after) {
    const left = nodeIndex(before), right = nodeIndex(after), diff = [];
    for (const [id, a] of left) {
      const b = right.get(id);
      if (!b) fail("ID set changed unexpectedly.");
      const changes = [];
      for (const key of [.../* @__PURE__ */ new Set([...Object.keys(a.node), ...Object.keys(b.node)])].sort()) {
        if (key === "children") continue;
        const x = { present: own(a.node, key), ...own(a.node, key) ? { value: a.node[key] } : {} }, y = { present: own(b.node, key), ...own(b.node, key) ? { value: b.node[key] } : {} };
        if (canonical(x) !== canonical(y)) changes.push({ property: key, before: x, after: y });
      }
      const beforeChildren = (a.node.children ?? []).map((n) => n.id), afterChildren = (b.node.children ?? []).map((n) => n.id);
      const locationBefore = { parent: a.parent, index: a.index }, locationAfter = { parent: b.parent, index: b.index };
      if (changes.length || canonical(beforeChildren) !== canonical(afterChildren) || canonical(locationBefore) !== canonical(locationAfter)) {
        diff.push({ id, beforeHash: await hash(a.node), afterHash: await hash(b.node), changes, locationBefore, locationAfter, childOrderBefore: beforeChildren, childOrderAfter: afterChildren });
      }
    }
    if (left.size !== right.size) fail("ID set changed unexpectedly.");
    return diff;
  }
  async function applyBatch(doc, batch) {
    keysExactly(batch, ["baseHash", "operations"]);
    if (!HASH.test(batch.baseHash)) fail("Invalid checkpoint hash.");
    const next = validateDocument(doc), beforeHash = await hash(next);
    if (beforeHash !== batch.baseHash) fail("Baseline/current checkpoint mismatch. No transaction applied.");
    if (!Array.isArray(batch.operations) || !batch.operations.length || batch.operations.length > LIMITS.operations) fail("A transaction requires1\u201320 explicit operations.");
    for (const op of batch.operations) await single(next, op);
    validateDocument(next);
    const afterHash = await hash(next);
    if (afterHash === beforeHash) fail("No-op transaction refused.");
    return { document: next, beforeHash, afterHash, diff: await objectDiff(doc, next) };
  }
  async function createProject(doc) {
    const baseline = validateDocument(doc), baselineHash = await hash(baseline);
    return { format: FORMAT, version: 1, baseline, baselineHash, history: [], cursor: 0, checkpoint: baselineHash };
  }
  function budget(project2) {
    parseJSON(JSON.stringify(project2));
    if (new TextEncoder().encode(JSON.stringify(project2.history)).byteLength > 2 * 1024 * 1024) fail("History exceeds2 MiB. Export the current document as a new baseline to start a separate history.");
  }
  async function replayHistory(baseline, history, cursor = history.length) {
    if (!Array.isArray(history) || history.length > LIMITS.history || !Number.isInteger(cursor) || cursor < 0 || cursor > history.length) fail("Invalid durable history/cursor bounds.");
    let document2 = validateDocument(baseline), selected2 = clone(document2);
    for (let i = 0; i < history.length; i++) {
      const record = history[i];
      keysExactly(record, ["sequence", "label", "operations", "beforeHash", "afterHash", "diff", "recordHash"]);
      if (record.sequence !== i + 1) fail("Transaction sequence mismatch.");
      checkedString(record.label, 160);
      if (!record.label.trim()) fail("Empty transaction label refused.");
      const { recordHash, ...body } = record;
      if (!HASH.test(recordHash) || await hash(body) !== recordHash) fail("Transaction manifest hash mismatch.");
      const applied = await applyBatch(document2, { baseHash: record.beforeHash, operations: record.operations });
      if (applied.afterHash !== record.afterHash || canonical(applied.diff) !== canonical(record.diff)) fail("Transaction result/diff mismatch during deterministic replay.");
      document2 = applied.document;
      if (i + 1 === cursor) selected2 = clone(document2);
    }
    return selected2;
  }
  async function verifyProject(project2) {
    keysExactly(project2, ["format", "version", "baseline", "baselineHash", "history", "cursor", "checkpoint"]);
    if (project2.format !== FORMAT || project2.version !== 1) fail("Unsupported project format/version.");
    budget(project2);
    const baseline = validateDocument(project2.baseline);
    if (await hash(baseline) !== project2.baselineHash) fail("Exact baseline hash mismatch.");
    const document2 = await replayHistory(baseline, project2.history, project2.cursor);
    if (await hash(document2) !== project2.checkpoint) fail("Current checkpoint mismatch.");
    return { project: clone(project2), document: document2 };
  }
  async function commit(project2, label, batch) {
    checkedString(label, 160);
    if (!label.trim()) fail("Give this transaction a label.");
    const current = await verifyProject(project2);
    const applied = await applyBatch(current.document, batch);
    const next = clone(project2);
    next.history = next.history.slice(0, next.cursor);
    if (next.history.length >= LIMITS.history) fail("History limit reached (30). Save current .pen as a separate baseline.");
    const body = { sequence: next.history.length + 1, label, operations: clone(batch.operations), beforeHash: applied.beforeHash, afterHash: applied.afterHash, diff: applied.diff };
    next.history.push({ ...body, recordHash: await hash(body) });
    next.cursor = next.history.length;
    next.checkpoint = applied.afterHash;
    budget(next);
    return { project: next, document: applied.document };
  }
  async function setCursor(project2, cursor) {
    const current = await verifyProject(project2);
    if (!Number.isInteger(cursor) || cursor < 0 || cursor > project2.history.length) fail("Undo/redo cursor out of range.");
    const next = clone(project2);
    next.cursor = cursor;
    next.checkpoint = cursor ? next.history[cursor - 1].afterHash : next.baselineHash;
    const document2 = await replayHistory(next.baseline, next.history, cursor);
    return { project: next, document: document2 };
  }
  function nativeJSON(project2) {
    return JSON.stringify(project2) + "\n";
  }
  function penJSON(document2) {
    return JSON.stringify(document2, null, 2) + "\n";
  }
  async function manifest(project2) {
    await verifyProject(project2);
    const body = { format: MANIFEST, version: 1, baselineHash: project2.baselineHash, history: clone(project2.history), cursor: project2.cursor, checkpoint: project2.checkpoint };
    return { ...body, manifestHash: await hash(body) };
  }
  async function replayManifest(baseline, input) {
    keysExactly(input, ["format", "version", "baselineHash", "history", "cursor", "checkpoint", "manifestHash"]);
    if (input.format !== MANIFEST || input.version !== 1) fail("Unsupported replay manifest.");
    const { manifestHash, ...body } = input;
    if (!HASH.test(manifestHash) || await hash(body) !== manifestHash) fail("Replay manifest SHA-256 mismatch.");
    const project2 = { format: FORMAT, version: 1, baseline: validateDocument(baseline), baselineHash: input.baselineHash, history: clone(input.history), cursor: input.cursor, checkpoint: input.checkpoint };
    return verifyProject(project2);
  }
  async function importText(text) {
    const data = parseJSON(text);
    if (object(data) && data.format === FORMAT) return verifyProject(data);
    const project2 = await createProject(data);
    return { project: project2, document: clone(project2.baseline) };
  }
  function previewModel(document2) {
    const entries = [], warnings = [];
    let count = 0;
    const issue = (path, reason) => warnings.push({ path: pointer(path), reason });
    const used = /* @__PURE__ */ new Set(["id", "name", "type", "x", "y", "width", "height", "fill", "opacity", "cornerRadius", "content", "fontSize", "children", "layout"]);
    function walk(children, ox, oy, path, visible = true) {
      for (let i = 0; i < children.length; i++) {
        const node = children[i], p = [...path, i];
        let supported = TYPES.includes(node.type) && visible;
        let x = typeof node.x === "number" ? node.x : 0, y = typeof node.y === "number" ? node.y : 0;
        let width = typeof node.width === "number" && node.width > 0 ? node.width : 160, height = typeof node.height === "number" && node.height > 0 ? node.height : node.type === "text" ? 32 : 80;
        if (!TYPES.includes(node.type)) issue(p, `${node.type} is an opaque visual construct; not rendered by this wireframe.`);
        if (node.type === "frame" && node.layout !== "none") {
          issue([...p, "layout"], "Only explicit layout:none frames use the supported absolute preview. Subtree is a placeholder.");
          supported = false;
        }
        for (const [k, v] of Object.entries(node)) if (!used.has(k)) issue([...p, k], "Field is preserved but not interpreted by this preview.");
        for (const k of ["x", "y", "width", "height"]) if (typeof node[k] !== "number" || ["width", "height"].includes(k) && node[k] <= 0) issue([...p, k], `Missing/variable/dynamic/invalid ${k} uses a wireframe fallback.`);
        if (node.fill !== void 0 && (typeof node.fill !== "string" || !HEX.test(node.fill))) issue([...p, "fill"], "Variables, gradients, images and layered fills are retained but not rendered.");
        if (node.type === "text") issue(p, "Text uses a local sans-serif wireframe; font metrics, wrapping, shaping and growth are not engine-validated.");
        if (node.cornerRadius !== void 0 && typeof node.cornerRadius !== "number") issue([...p, "cornerRadius"], "Per-corner/variable radius is not rendered.");
        for (const key of ["content", "fontSize", "opacity"]) if (node[key] !== void 0 && (typeof node[key] === "string" && node[key].startsWith("$") || key !== "content" && typeof node[key] !== "number")) issue([...p, key], "Variable/unsupported value uses a wireframe fallback; bindings are not resolved.");
        if (typeof node.fontSize === "number" && (node.fontSize < 1 || node.fontSize > 200) || typeof node.opacity === "number" && (node.opacity < 0 || node.opacity > 1) || typeof node.cornerRadius === "number" && node.cornerRadius < 0) issue(p, "Out-of-range text/opacity/radius values are clamped by the wireframe only.");
        if (typeof node.content === "string" && (node.content.length > 2e3 || node.content.split(/\r?\n/).length > 20)) issue([...p, "content"], "Wireframe text is limited to2000 characters/20 lines; full text is retained in JSON.");
        if (Math.abs(ox + x) > 1e5 || Math.abs(oy + y) > 1e5 || width > 1e4 || height > 1e4) issue(p, "Geometry exceeds wireframe bounds and is clamped visually; native JSON is unchanged.");
        if (++count <= 500) entries.push({ id: node.id, name: typeof node.name === "string" ? node.name : node.id, type: node.type, x: Math.max(-1e5, Math.min(1e5, ox + x)), y: Math.max(-1e5, Math.min(1e5, oy + y)), width: Math.min(width, 1e4), height: Math.min(height, 1e4), fill: typeof node.fill === "string" && HEX.test(node.fill) ? node.fill : "#253a49", opacity: typeof node.opacity === "number" ? Math.max(0, Math.min(1, node.opacity)) : 1, radius: typeof node.cornerRadius === "number" ? Math.max(0, node.cornerRadius) : 0, content: typeof node.content === "string" ? node.content.slice(0, 2e3).split(/\r?\n/).slice(0, 20).join("\n") : "", fontSize: typeof node.fontSize === "number" ? Math.min(200, Math.max(1, node.fontSize)) : 16, supported });
        if (node.children) walk(node.children, ox + x, oy + y, [...p, "children"], supported);
      }
    }
    walk(document2.children, 0, 0, ["children"]);
    if (count > 500) issue(["children"], "Preview limit500 nodes; remaining nodes are retained in JSON but omitted visually.");
    for (const key of Object.keys(document2)) if (!["version", "children"].includes(key)) issue([key], "Document themes/imports/variables/unknown fields are preserved, not resolved or loaded.");
    return { entries, warnings, contract: "Independent absolute wireframe, not Pencil/pen.dev rendering. No assets, scripts, fonts, refs or libraries are fetched or executed." };
  }

  // src/fixture.mjs
  var fixture = { version: "2.21", metadata: { synthetic: true, workbench: "original research fixture" }, children: [
    { id: "lab-a", type: "frame", name: "Observation workspace", layout: "none", x: 0, y: 0, width: 620, height: 390, fill: "#142632", cornerRadius: 18, children: [
      { id: "title-a", type: "text", name: "Research heading", x: 28, y: 28, width: 550, height: 40, content: "OBSERVATION / 01", fontSize: 25, fill: "#D4EEE7", future_text: { keep: "all fields" } },
      { id: "sample-card", type: "rectangle", name: "Measured sample", x: 28, y: 104, width: 256, height: 200, fill: "#36596B", cornerRadius: 12, metadata: { type: "research-sample", provenance: "synthetic", uncertainty: 0.12 } },
      { id: "sample-label", type: "text", name: "Sample caption", x: 48, y: 132, width: 210, height: 60, content: "Reference sample\n42 \xB1 2 units", fontSize: 18, fill: "#EFF5F7" },
      { id: "signal", type: "ellipse", name: "Signal marker", x: 362, y: 120, width: 144, height: 144, fill: "#C4B58A", opacity: 0.9 }
    ] },
    { id: "lab-b", type: "frame", name: "Comparison workspace", layout: "none", x: 690, y: 0, width: 620, height: 390, fill: "#18222F", cornerRadius: 18, children: [
      { id: "title-b", type: "text", name: "Comparison heading", x: 28, y: 28, width: 550, height: 40, content: "COMPARISON / 02", fontSize: 25, fill: "#B7CEDF" },
      { id: "target-slot", type: "rectangle", name: "Target region", x: 28, y: 104, width: 256, height: 200, fill: "#233747", cornerRadius: 12, future_setting: { preserve: true } }
    ] },
    { id: "opaque-script", type: "script", name: "Opaque script (never executed)", x: 0, y: 455, width: 300, height: 70, scriptUri: "./never-executed.js", inputs: { seed: 17 }, future_shader: { untouched: true } }
  ] };

  // src/app.mjs
  var $ = (s) => document.querySelector(s);
  var el = (tag, text, cls) => {
    const n = document.createElement(tag);
    if (text !== void 0) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
  var svgEl = (tag, attrs = {}) => {
    const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    return n;
  };
  var project;
  var documentState;
  var staged;
  var operations = [];
  var draftDiff = [];
  var batchBase;
  var selected = "sample-card";
  var saved;
  var busy = false;
  var notify = (message, error = false) => {
    $("#notice").textContent = message;
    $("#notice").className = error ? "notice error" : "notice";
  };
  async function run(fn) {
    if (busy) return;
    busy = true;
    document.body.classList.add("busy");
    try {
      await fn();
    } catch (error) {
      notify(error.message, true);
    } finally {
      busy = false;
      document.body.classList.remove("busy");
    }
  }
  function download(name, text, type = "application/json") {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = el("a");
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1e4);
  }
  async function resetDraft() {
    operations = [];
    draftDiff = [];
    staged = clone(documentState);
    batchBase = project.checkpoint;
    $("#batch-json").value = JSON.stringify({ baseHash: batchBase, operations }, null, 2);
  }
  async function install(result, message) {
    if (project && (nativeJSON(project) !== saved || operations.length) && !confirm("Replace this workbench? Save the native project first to preserve history and discard pending operations.")) return;
    project = result.project;
    documentState = result.document;
    saved = nativeJSON(project);
    selected = nodeIndex(documentState).keys().next().value ?? "";
    await resetDraft();
    notify(message);
    render();
  }
  function tree() {
    const root = $("#node-list");
    root.replaceChildren();
    const index = nodeIndex(staged);
    for (const [id, entry] of index) {
      const button = el("button", void 0, `node-item ${selected === id ? "selected" : ""}`);
      button.style.paddingLeft = `${12 + entry.ancestors.length * 12}px`;
      button.append(el("span", `${entry.node.type} \xB7 ${id}`, "node-id"), el("strong", typeof entry.node.name === "string" ? entry.node.name : id));
      if (!TYPES.includes(entry.node.type)) button.append(el("small", "OPAQUE"));
      button.onclick = () => {
        selected = id;
        render();
      };
      root.append(button);
    }
    const current = $("#target-id").value;
    $("#target-id").replaceChildren();
    for (const id of index.keys()) {
      const option = el("option", id);
      option.value = id;
      $("#target-id").append(option);
    }
    if (index.has(selected)) $("#target-id").value = selected;
    else if (index.has(current)) $("#target-id").value = current;
    const dest = $("#destination").value;
    $("#destination").replaceChildren();
    const top = el("option", "Document root");
    top.value = "";
    $("#destination").append(top);
    for (const [id, e] of index) if (e.node.type === "frame" && e.node.layout === "none") {
      const option = el("option", id);
      option.value = id;
      $("#destination").append(option);
    }
    $("#destination").value = dest;
  }
  function draw(target, doc) {
    const root = $(target);
    root.replaceChildren();
    const model = previewModel(doc);
    const visible = model.entries;
    const minX = Math.min(0, ...visible.map((n) => n.x)), minY = Math.min(0, ...visible.map((n) => n.y)), maxX = Math.max(200, ...visible.map((n) => n.x + n.width)), maxY = Math.max(150, ...visible.map((n) => n.y + n.height));
    const svg = svgEl("svg", { viewBox: `${minX - 20} ${minY - 20} ${maxX - minX + 40} ${maxY - minY + 40}`, role: "img", "aria-label": "Independent absolute wireframe preview" });
    for (const n of visible) {
      const group = svgEl("g", { "data-node": n.id, opacity: n.opacity });
      if (!n.supported) {
        group.append(svgEl("rect", { x: n.x, y: n.y, width: n.width, height: n.height, fill: "#272F39", stroke: "#BB9C68", "stroke-dasharray": "7 5" }));
        const text = svgEl("text", { x: n.x + 10, y: n.y + 24, fill: "#DBC497", "font-size": 15 });
        text.textContent = `[opaque ${n.type}: ${n.id}]`;
        group.append(text);
      } else if (n.type === "text") {
        const text = svgEl("text", { x: n.x, y: n.y + n.fontSize, fill: n.fill, "font-size": n.fontSize, "font-family": "sans-serif" });
        for (const [i, line] of n.content.split(/\r?\n/).entries()) {
          const span = svgEl("tspan", { x: n.x, dy: i ? "1.25em" : 0 });
          span.textContent = line;
          text.append(span);
        }
        group.append(text);
      } else if (n.type === "ellipse") group.append(svgEl("ellipse", { cx: n.x + n.width / 2, cy: n.y + n.height / 2, rx: n.width / 2, ry: n.height / 2, fill: n.fill }));
      else group.append(svgEl("rect", { x: n.x, y: n.y, width: n.width, height: n.height, rx: n.radius, fill: n.fill }));
      if (n.id === selected) group.append(svgEl("rect", { x: n.x - 2, y: n.y - 2, width: n.width + 4, height: n.height + 4, fill: "none", stroke: "#E8DBAE", "stroke-width": 2, "stroke-dasharray": "4 3" }));
      group.onclick = () => {
        selected = n.id;
        render();
      };
      svg.append(group);
    }
    root.append(svg);
    return model;
  }
  function fields() {
    const op = $("#op-type").value;
    $(".rename-fields").hidden = op !== "rename";
    $(".set-fields").hidden = op !== "set";
    $(".move-fields").hidden = op !== "move";
  }
  function render() {
    tree();
    fields();
    $("#staged-diff").textContent = draftDiff.length ? JSON.stringify(draftDiff, null, 2) : "No staged object changes.";
    const before = draw("#before-preview", documentState), after = draw("#after-preview", staged);
    $("#checkpoint").textContent = project.checkpoint;
    $("#draft-count").textContent = String(operations.length);
    $("#history-count").textContent = `${project.cursor} / ${project.history.length}`;
    $("#node-count").textContent = String(nodeIndex(staged).size);
    $("#undo").disabled = project.cursor === 0 || operations.length > 0;
    $("#redo").disabled = project.cursor === project.history.length || operations.length > 0;
    $("#commit").disabled = !operations.length;
    $("#dirty").textContent = nativeJSON(project) === saved ? "Saved/imported native state" : "Unsaved history/cursor changes";
    $("#batch-json").value = JSON.stringify({ baseHash: batchBase, operations }, null, 2);
    const entry = nodeIndex(staged).get(selected);
    $("#selected-json").textContent = entry ? JSON.stringify(entry.node, null, 2) : "No node selected.";
    $("#selected-id").textContent = selected || "\u2014";
    const warnings = $("#warnings");
    warnings.replaceChildren();
    $("#warning-count").textContent = String(after.warnings.length);
    for (const warning of after.warnings.slice(0, 100)) {
      const item = el("li");
      item.append(el("code", warning.path), el("span", warning.reason));
      warnings.append(item);
    }
    if (after.warnings.length > 100) warnings.append(el("li", `Showing100 of${after.warnings.length}; download the full fidelity report.`));
    const history = $("#history");
    history.replaceChildren();
    for (const record of project.history) {
      const row = el("div", void 0, `history-row ${record.sequence > project.cursor ? "inactive" : ""}`);
      row.append(el("strong", `${record.sequence}. ${record.label}`), el("small", `${record.operations.length} operations \xB7 ${record.diff.length} changed objects`), el("code", record.recordHash));
      const details = el("details");
      details.append(el("summary", "Object-level before/after differential"), el("pre", JSON.stringify(record.diff, null, 2)));
      row.append(details);
      history.append(row);
    }
    if (!project.history.length) history.append(el("p", "No committed transactions. Stage one or several guarded operations, inspect both views, then commit.", "muted"));
  }
  $("#queue-op").onclick = () => run(async () => {
    const op = $("#op-type").value, id = $("#target-id").value;
    let spec;
    if (op === "rename") spec = { op, id, name: $("#new-name").value };
    else if (op === "set") {
      const property = $("#property").value, raw = $("#property-value").value;
      spec = { op, id, property, value: ["fill", "content"].includes(property) ? raw : parseJSON(raw) };
    } else spec = { op, id, toParent: $("#destination").value || null, index: parseJSON($("#move-index").value) };
    const guarded = await guardedOperation(staged, spec);
    const result = await applyBatch(staged, { baseHash: await hash(staged), operations: [guarded] });
    if (operations.length >= 20) throw Error("Queue limit20 operations.");
    operations.push(guarded);
    staged = result.document;
    draftDiff = await objectDiff(documentState, staged);
    notify("Operation staged with an exact target hash. Review the after view; the checkpoint is unchanged until commit.");
    render();
  });
  $("#preview-json").onclick = () => run(async () => {
    const batch = parseJSON($("#batch-json").value), result = await applyBatch(documentState, batch);
    operations = clone(batch.operations);
    batchBase = batch.baseHash;
    staged = result.document;
    draftDiff = result.diff;
    notify("External JSON batch validated atomically and staged; no history change yet.");
    render();
  });
  $("#discard").onclick = () => run(async () => {
    await resetDraft();
    notify("Pending transaction discarded. Committed history is unchanged.");
    render();
  });
  $("#commit").onclick = () => run(async () => {
    if (project.cursor < project.history.length && !confirm("This commit replaces the redo branch. Save a native project first if you need that branch.")) return;
    const result = await commit(project, $("#transaction-label").value, { baseHash: batchBase, operations });
    project = result.project;
    documentState = result.document;
    await resetDraft();
    notify("Transaction committed. Record SHA-256, object differential and guarded operations are now in durable exportable history.");
    render();
  });
  for (const [id, delta] of [["#undo", -1], ["#redo", 1]]) $(id).onclick = () => run(async () => {
    if (operations.length) throw Error("Discard or commit pending operations before undo/redo.");
    const result = await setCursor(project, project.cursor + delta);
    project = result.project;
    documentState = result.document;
    await resetDraft();
    notify(delta < 0 ? "Undo cursor restored by replay from exact baseline." : "Redo cursor restored by replay from exact baseline.");
    render();
  });
  $("#save-project").onclick = () => run(async () => {
    await verifyProject(project);
    const text = nativeJSON(project);
    download("research.penwork.json", text);
    saved = text;
    notify("Native project saved with baseline, complete history, redo branch, cursor and checkpoint. Pending staged operations are not committed or saved.");
    render();
  });
  $("#export-pen").onclick = () => run(async () => {
    download("research-candidate.pen", penJSON(documentState));
    notify("Exported the committed checkpoint as a separate .pen candidate. Pending staged operations are excluded; native engine compatibility remains unverified.");
  });
  $("#export-manifest").onclick = () => run(async () => download("research.transactions.json", JSON.stringify(await manifest(project)) + "\n"));
  $("#export-baseline").onclick = () => download("research-baseline.pen", penJSON(project.baseline));
  $("#export-fidelity").onclick = () => download("wireframe-fidelity-report.json", JSON.stringify(previewModel(staged), null, 2) + "\n");
  $("#open-file").onchange = (event) => run(async () => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw Error("File exceeds5 MiB.");
      await install(await importText(await file.text()), "Imported locally. Native projects were replayed and hash-checked before replacing the workbench.");
    } finally {
      event.target.value = "";
    }
  });
  $("#import-pasted").onclick = () => run(async () => install(await importText($("#import-json").value), "JSON imported; original values and unknown fields preserved."));
  $("#replay-file").onchange = (event) => run(async () => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw Error("Manifest exceeds5 MiB.");
      const result = await replayManifest(project.baseline, parseJSON(await file.text()));
      await install(result, "Manifest replayed against the exact loaded baseline. All hashes and object differentials verified.");
    } finally {
      event.target.value = "";
    }
  });
  $("#load-demo").onclick = () => run(async () => install({ project: await createProject(fixture), document: clone(fixture) }, "Synthetic .pen2.21-shaped design loaded; no official engine validation claimed."));
  $("#op-type").onchange = fields;
  $("#target-id").onchange = () => {
    selected = $("#target-id").value;
    render();
  };
  for (const property of PROPERTIES) {
    const option = el("option", property);
    option.value = property;
    $("#property").append(option);
  }
  $("#property").value = "fill";
  window.addEventListener("beforeunload", (event) => {
    if (project && (nativeJSON(project) !== saved || operations.length)) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  run(async () => {
    project = await createProject(fixture);
    documentState = clone(project.baseline);
    saved = nativeJSON(project);
    await resetDraft();
    render();
  });
})();

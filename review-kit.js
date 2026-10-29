/* Mahendra Dashboard Evaluation Feedback
   Students drop a Tableau (.twbx/.twb), Power BI (.pbix/.pbit) or Excel (.xlsx/.xlsm) dashboard and/or a screenshot.
   The file is opened only in the browser (never uploaded, macros never run). Code extracts its structure and runs
   automatic checks; a text summary (no data rows) + optional compressed screenshot go to /api/review (Groq) which
   returns a 100-point scorecard. Reviews are kept only in this browser. */
(function () {
  if (window.__rvKit) return; window.__rvKit = true;
  const CFG = Object.assign({ weights: { visual: 20, kpi: 20, model: 20, insight: 20, usability: 20 }, focus: [], siteKey: "" }, window.REVIEW_CONFIG || {});
  const SKEY = (CFG.siteKey || document.title.toLowerCase().replace(/[^a-z]+/g, "_").slice(0, 30)) + "_reviews_v1";
  const API = "api/review";
  const MB = 1024 * 1024, LIM = { zip: 80 * MB, twb: 30 * MB, img: 15 * MB, entry: 60 * MB };
  const CATS = [["visual", "Visual design & layout"], ["kpi", "KPI logic"], ["model", "Data model & quality"], ["insight", "Business insights"], ["usability", "Filters & usability"]];
  const KIND_LABEL = { tableau: "Tableau", powerbi: "Power BI", excel: "Excel", image: "Screenshot" };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (id) => document.getElementById(id);
  const uniq = (a) => [...new Set(a.filter(Boolean))];
  const cut = (s, n) => { s = String(s || ""); return s.length > n ? s.slice(0, n) + "…" : s; };
  const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

  /* ================= file type check (real signatures, not just the extension) ================= */
  async function sniff(file) {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const hex = [...head].map(b => b.toString(16).padStart(2, "0")).join("");
    const txt = new TextDecoder().decode(head).replace(/^﻿/, "").trim();
    const isZip = hex.startsWith("504b0304");
    if (["twbx", "xlsx", "xlsm", "pbix", "pbit"].includes(ext)) {
      if (!isZip) throw new Error(`This .${ext} file is not a valid ${ext.toUpperCase()} (its content does not match the extension). Save it again from ${ext.startsWith("tw") ? "Tableau" : ext.startsWith("pb") ? "Power BI" : "Excel"} and retry.`);
      if (file.size > LIM.zip) throw new Error(`The file is ${(file.size / MB).toFixed(0)} MB. The limit is 80 MB. For Tableau, save as .twb (without the data extract); for Power BI, save as a template (.pbit).`);
      return { ext, kind: ext.startsWith("tw") ? "tableau" : ext.startsWith("pb") ? "powerbi" : "excel" };
    }
    if (ext === "twb") {
      if (!/^<(\?xml|workbook)/.test(txt)) throw new Error("This .twb file does not look like a Tableau workbook.");
      if (file.size > LIM.twb) throw new Error("The .twb file is larger than 30 MB.");
      return { ext, kind: "tableau" };
    }
    if (["png", "jpg", "jpeg", "webp"].includes(ext)) {
      const ok = hex.startsWith("89504e47") || hex.startsWith("ffd8ff") || (hex.startsWith("52494646") && hex.slice(16, 24) === "57454250");
      if (!ok) throw new Error("This image file is damaged or not really a PNG/JPG/WEBP.");
      if (file.size > LIM.img) throw new Error("The image is larger than 15 MB.");
      return { ext, kind: "image" };
    }
    if (ext === "xls") throw new Error("Old .xls files are not supported. In Excel use File → Save As → Excel Workbook (.xlsx).");
    throw new Error(`.${ext} files are not supported. Upload .twbx, .twb, .pbix, .pbit, .xlsx, .xlsm, or a PNG/JPG/WEBP screenshot.`);
  }
  function loadZipLib() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    return new Promise((ok, no) => { const s = document.createElement("script"); s.src = "jszip.min.js"; s.onload = () => ok(window.JSZip); s.onerror = () => no(new Error("Could not load the file reader (jszip.min.js).")); document.head.appendChild(s); });
  }
  async function openZip(file) {
    const JSZip = await loadZipLib(); const z = await JSZip.loadAsync(file);
    const names = Object.keys(z.files); if (names.length > 20000) throw new Error("The archive has too many entries.");
    const size = (n) => { const f = z.files[n]; return f && f._data && f._data.uncompressedSize || 0; };
    const read = async (n, type) => { const f = z.files[n]; if (!f || f.dir) return null; if (size(n) > LIM.entry) throw new Error(`${n} is too large to read safely.`); return f.async(type || "string"); };
    return { names, read, size };
  }
  const withTimeout = (p, ms, msg) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error(msg)), ms))]);

  /* ================= Tableau ================= */
  function parseTwb(xml) {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.querySelector("parsererror")) throw new Error("The Tableau workbook XML could not be read.");
    const all = (sel, root) => [...(root || doc).querySelectorAll(sel)];
    const capByName = {};
    all("datasource column[name]").forEach(c => { const n = c.getAttribute("name"), cap = c.getAttribute("caption"); if (cap) capByName[n.replace(/^\[|\]$/g, "")] = cap; });
    const field = (raw) => {
      if (!raw) return ""; let s = String(raw); const m = s.match(/\[([^\]]+)\]$/); if (m) s = m[1];
      const p = s.split(":"); let agg = "", nm = s;
      if (p.length >= 3) { agg = p[0]; nm = p.slice(1, -1).join(":"); }
      nm = capByName[nm] || nm.replace(/^Calculation_\d+$/, "calc");
      return agg && !/^(none|attr|yr|mn|qr|tyr|tmn|tqr|twk|wk|dy|tdy)$/i.test(agg) ? `${agg.toUpperCase()}(${nm})` : (agg && /^(yr|tyr)$/i.test(agg) ? `YEAR(${nm})` : agg && /^(mn|tmn)$/i.test(agg) ? `MONTH(${nm})` : nm);
    };
    const shelf = (txt) => uniq((String(txt || "").match(/\[[^\]]+\]\.\[[^\]]+\]/g) || []).map(field)).join(", ");
    const dss = all("workbook > datasources > datasource").filter(d => d.getAttribute("name") !== "Parameters");
    const datasources = dss.map(d => {
      const tables = uniq(all("relation[type='table']", d).filter(r => !r.closest("extract") && r.getAttribute("name") !== "Extract").map(r => (r.getAttribute("name") || r.getAttribute("table") || "").replace(/[\[\]]/g, "")));
      const conns = uniq(all("connection[class]", d).map(c => c.getAttribute("class")).filter(c => c !== "federated"));
      const joins = all("relation[type='join']", d).map(j => `${j.getAttribute("join") || "inner"} join on ${all("expression[op]", j).filter(e => e.getAttribute("op") !== "=" && e.getAttribute("op") !== "AND").map(e => e.getAttribute("op")).join(" = ")}`);
      const rels = all("relationships relationship", d).map(r => all("expression[op]", r).filter(e => !/^(=|AND|&&)$/.test(e.getAttribute("op"))).map(e => e.getAttribute("op").replace(/[\[\]]/g, "")).join(" = ")).filter(Boolean);
      const extract = !!d.querySelector("extract");
      return { name: d.getAttribute("caption") || d.getAttribute("name"), conns, tables, joins, rels, extract };
    });
    const calcs = []; const seen = new Set();
    dss.forEach(d => all("column", d).forEach(c => {
      const k = c.querySelector(":scope > calculation[formula]"); if (!k || (k.getAttribute("class") || "tableau") !== "tableau") return;
      const name = c.getAttribute("caption") || (c.getAttribute("name") || "").replace(/[\[\]]/g, "");
      if (seen.has(name)) return; seen.add(name);
      const f = k.getAttribute("formula").replace(/\[(Calculation_\d+)\]/g, (_, n) => "[" + (capByName[n] || n) + "]");
      calcs.push({ name, formula: f, role: c.getAttribute("role"), type: c.getAttribute("datatype") });
    }));
    const params = all("datasource[name='Parameters'] column").map(c => c.getAttribute("caption") || c.getAttribute("name"));
    const worksheets = all("workbook > worksheets > worksheet").map(w => ({
      name: w.getAttribute("name"),
      title: ((w.querySelector("layout-options title") || {}).textContent || "").replace(/\s+/g, " ").trim(),
      rows: shelf((w.querySelector("table > rows") || {}).textContent), cols: shelf((w.querySelector("table > cols") || {}).textContent),
      marks: uniq(all("panes pane mark", w).map(m => m.getAttribute("class"))),
      filters: uniq(all("view > filter", w).map(f => field(f.getAttribute("column")))),
    }));
    const wsNames = new Set(worksheets.map(w => w.name));
    const dashboards = all("workbook > dashboards > dashboard").map(db => {
      const zones = all("zone", db); const types = {};
      zones.forEach(z => { const t = z.getAttribute("type-v2") || z.getAttribute("type"); if (t) types[t] = (types[t] || 0) + 1; });
      const sheets = uniq(zones.filter(z => !z.getAttribute("type-v2") && !z.getAttribute("type") && wsNames.has(z.getAttribute("name"))).map(z => z.getAttribute("name")));
      const sz = db.querySelector("size");
      return { name: db.getAttribute("name"), story: db.getAttribute("type") === "storyboard", sheets, types, size: sz ? `${sz.getAttribute("maxwidth") || sz.getAttribute("minwidth") || "auto"}x${sz.getAttribute("maxheight") || sz.getAttribute("minheight") || "auto"}` : "automatic" };
    });
    const layout = (() => {
      let best = null;
      all("workbook > dashboards > dashboard").filter(db => db.getAttribute("type") !== "storyboard").forEach(db => {
        const leaf = all("zone", db).filter(z => !z.closest("devicelayout, devicelayouts") && !z.querySelector("zone"));
        const boxes = leaf.map(z => {
          const t = z.getAttribute("type-v2") || z.getAttribute("type") || "", nm = z.getAttribute("name") || "";
          if (/^layout|^empty$|blank/.test(t)) return null;
          const kind = !t && nm ? "sheet" : t === "filter" ? "filter" : t === "paramctrl" ? "filter" : /color|size|shape|legend/.test(t) ? "legend" : t === "title" ? "title" : t === "text" ? "text" : t === "bitmap" ? "image" : t || "object";
          const label = kind === "sheet" ? nm : kind === "filter" ? "Filter: " + field(z.getAttribute("param")) : kind === "title" ? "Dashboard title" : kind === "text" ? "Text box" : kind === "legend" ? "Legend" : kind;
          return { x: +z.getAttribute("x") / 1000, y: +z.getAttribute("y") / 1000, w: +z.getAttribute("w") / 1000, h: +z.getAttribute("h") / 1000, label, kind };
        }).filter(b => b && b.w > 0 && b.h > 0);
        if (!best || boxes.length > best.boxes.length) best = { name: db.getAttribute("name"), boxes, ratio: 16 / 9 };
      });
      return best && best.boxes.length ? best : null;
    })();
    const actions = all("workbook > actions > action").map(a => `${a.getAttribute("caption") || a.getAttribute("name")} (${((a.querySelector("command") || {}).getAttribute ? a.querySelector("command").getAttribute("command") : "") || "action"})`.replace("tsc:", ""));
    const used = new Set(dashboards.flatMap(d => d.sheets));
    const unused = worksheets.filter(w => !used.has(w.name)).map(w => w.name);
    const wb = doc.documentElement;

    let S = `Tableau workbook (version ${wb.getAttribute("version") || "?"}, ${wb.getAttribute("source-build") || ""})\n`;
    S += `\nDATA SOURCES (${datasources.length}):\n` + datasources.map(d => `- ${d.name}: connection ${d.conns.join("/") || "?"}${d.extract ? " (extract)" : ""}; tables: ${d.tables.join(", ") || "?"}${d.rels.length ? `; relationships: ${d.rels.join(" | ")}` : ""}${d.joins.length ? `; joins: ${d.joins.join(" | ")}` : ""}`).join("\n");
    S += `\n\nCALCULATED FIELDS (${calcs.length}):\n` + calcs.slice(0, 60).map(c => `- [${c.name}] = ${cut(c.formula.replace(/\s+/g, " "), 300)}`).join("\n");
    if (params.length) S += `\n\nPARAMETERS: ${params.join(", ")}`;
    S += `\n\nWORKSHEETS (${worksheets.length}):\n` + worksheets.slice(0, 50).map(w => `- "${w.name}"${w.title ? ` title "${cut(w.title, 80)}"` : " (no custom title)"}: mark ${w.marks.join("/") || "automatic"}; cols ${w.cols || "-"}; rows ${w.rows || "-"}${w.filters.length ? `; filters ${w.filters.join(", ")}` : ""}`).join("\n");
    S += `\n\nDASHBOARDS (${dashboards.length}):\n` + dashboards.map(d => `- "${d.name}"${d.story ? " (story)" : ""}, size ${d.size}: sheets ${d.sheets.join(", ") || "none"}; objects ${Object.entries(d.types).map(([k, v]) => `${k}×${v}`).join(", ") || "none"}`).join("\n");
    if (actions.length) S += `\n\nACTIONS: ${actions.join("; ")}`;

    const facts = [];
    facts.push(`${dashboards.filter(d => !d.story).length} dashboard(s), ${worksheets.length} worksheet(s), ${calcs.length} calculated field(s), ${datasources.length} data source(s).`);
    if (unused.length) facts.push(`${unused.length} worksheet(s) are not placed on any dashboard: ${cut(unused.join(", "), 300)}.`);
    const noFilter = dashboards.filter(d => !d.story && !d.types.filter && !d.types.paramctrl);
    if (dashboards.length && noFilter.length) facts.push(`Dashboard(s) with no filter or parameter control: ${noFilter.map(d => d.name).join(", ")}.`);
    if (!actions.length && dashboards.length) facts.push("No dashboard actions (filter/highlight/URL) are defined.");
    const untitled = worksheets.filter(w => !w.title).length; if (untitled) facts.push(`${untitled} of ${worksheets.length} worksheets use the default title (no custom title).`);
    const multiTable = datasources.filter(d => d.tables.length > 1 && !d.rels.length && !d.joins.length);
    if (multiTable.length) facts.push(`Data source(s) with several tables but no relationships or joins found: ${multiTable.map(d => d.name).join(", ")}.`);
    const lod = calcs.filter(c => /\{\s*(FIXED|INCLUDE|EXCLUDE)/i.test(c.formula)).length; if (lod) facts.push(`${lod} calculated field(s) use LOD expressions.`);
    const auto = dashboards.filter(d => d.size === "automatic").length; if (auto) facts.push(`${auto} dashboard(s) use Automatic size.`);
    return { kind: "tableau", summary: S, facts, names: [...calcs.map(c => c.name + " " + c.formula), ...worksheets.map(w => w.name + " " + w.title), ...dashboards.map(d => d.name)],
      stats: [["Dashboards", dashboards.length], ["Worksheets", worksheets.length], ["Calculated fields", calcs.length], ["Actions", actions.length]], limits: [], layout };
  }
  async function readTableau(file, ext) {
    if (ext === "twb") return parseTwb(await file.text());
    const z = await openZip(file); const twb = z.names.find(n => /\.twb$/i.test(n) && !/\//.test(n.replace(/^[^/]*$/, ""))) || z.names.find(n => /\.twb$/i.test(n));
    if (!twb) throw new Error("No .twb workbook was found inside this .twbx.");
    const r = parseTwb(await z.read(twb));
    if (z.names.some(n => /\.hyper$|\.tde$/i.test(n))) r.limits.push("The data extract inside the .twbx was not opened (only the workbook design is reviewed).");
    return r;
  }

  /* ================= Excel ================= */
  async function readExcel(file, ext) {
    const z = await openZip(file);
    const xmlAttr = (s, a) => { const m = s.match(new RegExp(`\\b${a}="([^"]*)"`)); return m ? m[1] : ""; };
    const dec = (s) => String(s || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
    const wbx = await z.read("xl/workbook.xml"); if (!wbx) throw new Error("This does not look like an Excel workbook (xl/workbook.xml missing).");
    const rels = (await z.read("xl/_rels/workbook.xml.rels")) || "";
    const relMap = {}; (rels.match(/<Relationship\b[^>]*>/g) || []).forEach(r => { relMap[xmlAttr(r, "Id")] = xmlAttr(r, "Target").replace(/^\/?xl\//, "").replace(/^\//, ""); });
    const sheets = (wbx.match(/<sheet\b[^>]*>/g) || []).map(s => ({ name: dec(xmlAttr(s, "name")), state: xmlAttr(s, "state") || "visible", path: "xl/" + (relMap[xmlAttr(s, "r:id")] || "") }));
    const names = (wbx.match(/<definedName\b[^>]*>[^<]*<\/definedName>/g) || []).map(d => dec(xmlAttr(d, "name"))).filter(n => !/^_xlnm\./.test(n));
    const ssx = (await z.read("xl/sharedStrings.xml")) || "";
    const sst = (ssx.match(/<si>[\s\S]*?<\/si>/g) || []).slice(0, 50000).map(si => dec((si.match(/<t[^>]*>([^<]*)<\/t>/g) || []).map(t => t.replace(/<[^>]+>/g, "")).join("")));
    let fTotal = 0, cfTotal = 0, dvTotal = 0; const fSamples = [], errs = {}; const sheetInfo = [];
    for (const sh of sheets.slice(0, 40)) {
      const x = await z.read(sh.path); if (!x) continue;
      const fs = x.match(/<f\b[^>]*>([^<]*)<\/f>|<f\b[^>]*\/>/g) || []; fTotal += fs.length;
      fs.forEach(f => { const t = dec(f.replace(/<[^>]+>/g, "")); if (t && fSamples.length < 40 && !fSamples.some(s => s.f === t)) fSamples.push({ sheet: sh.name, f: t }); });
      (x.match(/<c\b[^>]*t="e"[^>]*>[\s\S]*?<\/c>/g) || []).forEach(c => { const v = (c.match(/<v>([^<]*)<\/v>/) || [])[1]; if (v) errs[v] = (errs[v] || 0) + 1; });
      cfTotal += (x.match(/<conditionalFormatting\b/g) || []).length; dvTotal += (x.match(/<dataValidation\b/g) || []).length;
      const row1 = (x.match(/<row\b[^>]*\br="1"[^>]*>([\s\S]*?)<\/row>/) || [])[1] || "";
      const heads = (row1.match(/<c\b[^>]*>[\s\S]*?<\/c>/g) || []).slice(0, 25).map(c => { const v = (c.match(/<v>([^<]*)<\/v>/) || [])[1]; const it = (c.match(/<t[^>]*>([^<]*)<\/t>/) || [])[1]; return /t="s"/.test(c) ? sst[+v] : dec(it || v || ""); }).filter(Boolean);
      const hasDrawing = /<drawing\b/.test(x), pivots = (x.match(/pivotTable/g) || []).length;
      sheetInfo.push({ name: sh.name, state: sh.state, dim: xmlAttr((x.match(/<dimension\b[^>]*>/) || [""])[0], "ref"), formulas: fs.length, heads, hasDrawing });
    }
    const charts = [];
    for (const n of z.names.filter(n => /^xl\/charts\/chart\d+\.xml$/.test(n)).slice(0, 60)) {
      const x = (await z.read(n)) || ""; const types = uniq((x.match(/<c:(\w+)Chart>/g) || []).map(t => t.replace(/<c:|Chart>/g, "")));
      const dir = xmlAttr((x.match(/<c:barDir\b[^>]*>/) || [""])[0], "val");
      const title = dec(((x.match(/<c:title>[\s\S]*?<\/c:title>/) || [""])[0].match(/<a:t>([^<]*)<\/a:t>/g) || []).map(t => t.replace(/<[^>]+>/g, "")).join(""));
      charts.push({ type: types.map(t => t === "bar" && dir === "col" ? "column" : t).join("+"), title, series: (x.match(/<c:ser>/g) || []).length, autoTitleDeleted: /<c:autoTitleDeleted val="1"/.test(x) });
    }
    const tables = [];
    for (const n of z.names.filter(n => /^xl\/tables\/table\d+\.xml$/.test(n)).slice(0, 40)) { const x = (await z.read(n)) || ""; tables.push(`${dec(xmlAttr(x, "displayName") || xmlAttr(x, "name"))} (${xmlAttr(x, "ref")})`); }
    const pivots = [];
    for (const n of z.names.filter(n => /^xl\/pivotTables\/pivotTable\d+\.xml$/.test(n)).slice(0, 40)) {
      const x = (await z.read(n)) || ""; pivots.push(`${dec(xmlAttr(x, "name"))}: values ${(x.match(/<dataField\b[^>]*>/g) || []).map(d => dec(xmlAttr(d, "name"))).join(", ") || "-"}; ${(x.match(/<field\b/g) || []).length} row/column fields`);
    }
    const slicers = z.names.filter(n => /^xl\/slicers\/slicer\d*\.xml$/.test(n)).length, timelines = z.names.filter(n => /^xl\/timelines\//.test(n)).length;
    const macros = z.names.some(n => /vbaProject\.bin$/i.test(n)), ext_links = z.names.filter(n => /^xl\/externalLinks\//.test(n) && /\.xml$/.test(n)).length;

    let S = `Excel workbook (.${ext}) with ${sheets.length} sheet(s)\n\nSHEETS:\n` + sheetInfo.map(s => `- "${s.name}"${s.state !== "visible" ? ` (${s.state})` : ""}: range ${s.dim || "?"}, ${s.formulas} formula cells${s.hasDrawing ? ", has charts/shapes" : ""}${s.heads.length ? `; header row: ${cut(s.heads.join(" | "), 300)}` : ""}`).join("\n");
    S += `\n\nCHARTS (${charts.length}):\n` + (charts.map(c => `- ${c.type || "chart"}${c.title ? ` "${cut(c.title, 80)}"` : " (no title)"}, ${c.series} series`).join("\n") || "none");
    S += `\n\nPIVOT TABLES (${pivots.length}):\n` + (pivots.join("\n") || "none");
    S += `\n\nTABLES: ${tables.join(", ") || "none"}\nSLICERS: ${slicers}, TIMELINES: ${timelines}, CONDITIONAL FORMATS: ${cfTotal}, DATA VALIDATIONS: ${dvTotal}\nNAMED RANGES: ${names.slice(0, 30).join(", ") || "none"}`;
    S += `\n\nSAMPLE FORMULAS (${fSamples.length} of ${fTotal} formula cells):\n` + fSamples.map(f => `- [${f.sheet}] =${cut(f.f, 200)}`).join("\n");

    const facts = [`${sheets.length} sheet(s), ${fTotal} formula cell(s), ${charts.length} chart(s), ${pivots.length} pivot table(s), ${slicers} slicer(s).`];
    if (!fTotal) facts.push("No formulas were found: the KPI numbers appear to be typed or pasted values, not calculated.");
    const errList = Object.entries(errs); if (errList.length) facts.push(`Error values saved in cells: ${errList.map(([k, v]) => `${k} ×${v}`).join(", ")}.`);
    const untitled = charts.filter(c => !c.title).length; if (untitled) facts.push(`${untitled} of ${charts.length} chart(s) have no chart title.`);
    const pies = charts.filter(c => /pie|doughnut|3D/i.test(c.type)).length; if (pies) facts.push(`${pies} pie/doughnut/3-D chart(s) are used.`);
    if (!slicers && !timelines && (charts.length || pivots.length)) facts.push("No slicers or timelines: the dashboard has no interactive filters.");
    if (macros) facts.push("The workbook contains VBA macros (they were NOT opened or run).");
    if (ext_links) facts.push(`${ext_links} external workbook link(s): the file depends on other files.`);
    const hidden = sheetInfo.filter(s => s.state !== "visible").length; if (hidden) facts.push(`${hidden} hidden sheet(s).`);
    return { kind: "excel", summary: S, facts, names: [...fSamples.map(f => f.f), ...charts.map(c => c.title), ...sheetInfo.map(s => s.name + " " + s.heads.join(" ")), ...pivots, ...names],
      stats: [["Sheets", sheets.length], ["Formulas", fTotal], ["Charts", charts.length], ["Pivots", pivots.length]], limits: [] };
  }

  /* ================= Power BI ================= */
  async function readPowerBI(file, ext) {
    const z = await openZip(file);
    const u16 = async (n) => { const b = await z.read(n, "uint8array"); if (!b) return null; let t = (b[0] === 0xff && b[1] === 0xfe) ? new TextDecoder("utf-16le").decode(b.subarray(2)) : (b[1] === 0 ? new TextDecoder("utf-16le").decode(b) : new TextDecoder().decode(b)); return t.replace(/^﻿/, ""); };
    const J = (s, d) => { try { return typeof s === "string" ? JSON.parse(s) : (s || d); } catch (e) { return d; } };
    const lit = (v) => { const s = v && v.expr && v.expr.Literal && v.expr.Literal.Value; return s ? String(s).replace(/^'|'$/g, "") : ""; };
    const pages = [];
    const lay = await u16("Report/Layout");
    if (lay) {
      const L = J(lay, {});
      (L.sections || []).forEach(sec => {
        const visuals = (sec.visualContainers || []).map(vc => {
          const c = J(vc.config, {}); const sv = c.singleVisual || {};
          const sel = ((sv.prototypeQuery || {}).Select || []).map(s => s.NativeReferenceName || s.Name || "").map(s => s.replace(/^[^.]*\./, "")).filter(Boolean);
          const title = lit((((sv.vcObjects || {}).title || [])[0] || {}).properties && sv.vcObjects.title[0].properties.text);
          return { type: sv.visualType || (c.singleVisualGroup ? "group" : "?"), title, fields: uniq(sel).slice(0, 8), filters: J(vc.filters, []).length, pos: { x: +vc.x || 0, y: +vc.y || 0, w: +vc.width || 0, h: +vc.height || 0 } };
        }).filter(v => v.type !== "group");
        pages.push({ name: sec.displayName || sec.name, visuals, filters: J(sec.filters, []).length, size: `${sec.width || "?"}x${sec.height || "?"}`, W: +sec.width || 1280, H: +sec.height || 720 });
      });
    } else {
      const pj = z.names.filter(n => /^Report\/definition\/pages\/[^/]+\/page\.json$/.test(n));
      for (const n of pj.slice(0, 40)) {
        const P = J(await z.read(n), {}); const dir = n.replace(/page\.json$/, "visuals/");
        const visuals = [];
        for (const v of z.names.filter(x => x.startsWith(dir) && /visual\.json$/.test(x)).slice(0, 80)) {
          const V = J(await z.read(v), {}); const vis = V.visual || {};
          const fields = []; JSON.stringify(vis.query || {}).replace(/"Property":"([^"]+)"/g, (_, p) => fields.push(p));
          const ps = V.position || {}; visuals.push({ pos: { x: +ps.x || 0, y: +ps.y || 0, w: +ps.width || 0, h: +ps.height || 0 }, type: vis.visualType || "?", title: lit((((vis.visualContainerObjects || {}).title || [])[0] || {}).properties && vis.visualContainerObjects.title[0].properties.text), fields: uniq(fields).slice(0, 8), filters: 0 });
        }
        pages.push({ name: P.displayName || P.name, visuals, filters: (P.filterConfig && P.filterConfig.filters || []).length, size: `${P.width || "?"}x${P.height || "?"}`, W: +P.width || 1280, H: +P.height || 720 });
      }
    }
    let model = null; const dms = await u16("DataModelSchema");
    if (dms) { const D = J(dms, {}); model = D.model || null; }
    const tables = model ? (model.tables || []).filter(t => !/^(LocalDateTable_|DateTableTemplate_)/.test(t.name)) : [];
    const autoDates = model ? (model.tables || []).filter(t => /^LocalDateTable_/.test(t.name)).length : 0;
    const measures = tables.flatMap(t => (t.measures || []).map(m => ({ table: t.name, name: m.name, expr: Array.isArray(m.expression) ? m.expression.join("\n") : String(m.expression || "") })));
    const calcCols = tables.flatMap(t => (t.columns || []).filter(c => c.type === "calculated").map(c => ({ table: t.name, name: c.name, expr: Array.isArray(c.expression) ? c.expression.join(" ") : String(c.expression || "") })));
    const relsAll = model ? (model.relationships || []) : [];
    const rels = relsAll.filter(r => !/^(LocalDateTable_|DateTableTemplate_)/.test(r.toTable || ""));
    const visuals = pages.flatMap(p => p.visuals);
    const types = {}; visuals.forEach(v => { types[v.type] = (types[v.type] || 0) + 1; });

    let S = `Power BI ${ext === "pbit" ? "template (.pbit)" : "report (.pbix)"}\n\nPAGES (${pages.length}):\n` + pages.map(p => `- "${p.name}" (${p.size}, ${p.filters} page filter(s)): ` + p.visuals.slice(0, 25).map(v => `${v.type}${v.title ? ` "${cut(v.title, 60)}"` : ""}${v.fields.length ? ` [${v.fields.join(", ")}]` : ""}`).join("; ")).join("\n");
    if (model) {
      S += `\n\nTABLES (${tables.length}): ` + tables.map(t => `${t.name}(${(t.columns || []).length} cols)`).join(", ");
      S += `\n\nRELATIONSHIPS (${rels.length}):\n` + rels.slice(0, 40).map(r => `- ${r.fromTable}[${r.fromColumn}] → ${r.toTable}[${r.toColumn}]${r.crossFilteringBehavior === "bothDirections" ? " (both directions)" : ""}${r.isActive === false ? " (inactive)" : ""}`).join("\n");
      S += `\n\nMEASURES (${measures.length}):\n` + measures.slice(0, 60).map(m => `- [${m.name}] (${m.table}) = ${cut(m.expr.replace(/\s+/g, " "), 300)}`).join("\n");
      if (calcCols.length) S += `\n\nCALCULATED COLUMNS (${calcCols.length}):\n` + calcCols.slice(0, 25).map(c => `- ${c.table}[${c.name}] = ${cut(c.expr.replace(/\s+/g, " "), 200)}`).join("\n");
    }
    const facts = [`${pages.length} page(s), ${visuals.length} visual(s): ${Object.entries(types).map(([k, v]) => `${k}×${v}`).join(", ") || "none"}.`];
    const slicers = types.slicer || 0; if (!slicers) facts.push("No slicer visuals were found on any page.");
    const untitledV = visuals.filter(v => !v.title && !/slicer|card|textbox|shape|image|actionButton|basicShape/i.test(v.type)).length; if (untitledV) facts.push(`${untitledV} chart visual(s) have no custom title (default field-name titles).`);
    const pies = (types.pieChart || 0) + (types.donutChart || 0); if (pies) facts.push(`${pies} pie/donut chart(s) are used.`);
    const limits = [];
    if (model) {
      facts.push(`${tables.length} table(s), ${rels.length} relationship(s), ${measures.length} measure(s), ${calcCols.length} calculated column(s).`);
      const slash = measures.filter(m => /[^/]\/[^/*]/.test(m.expr.replace(/\/\/.*$/gm, "")) && !/DIVIDE\s*\(/i.test(m.expr)).map(m => m.name);
      if (slash.length) facts.push(`Measures that divide with "/" instead of DIVIDE(): ${cut(slash.join(", "), 300)}.`);
      const both = rels.filter(r => r.crossFilteringBehavior === "bothDirections").length; if (both) facts.push(`${both} relationship(s) use both-direction filtering.`);
      if (autoDates) facts.push(`Auto date/time is ON (${autoDates} hidden date tables); there may be no dedicated Date table.`);
      if (tables.length > 1 && !rels.length) facts.push("Several tables but no relationships.");
    } else limits.push("A .pbix stores DAX measures and relationships in a compressed binary model that cannot be read in the browser. Only pages and visuals were reviewed. For a full review, in Power BI use File → Export → Power BI template and upload the .pbit, or paste your DAX measures in the notes box.");
    return { kind: "powerbi", summary: S, facts, names: [...measures.map(m => m.name + " " + m.expr), ...visuals.map(v => v.title + " " + v.fields.join(" ")), ...pages.map(p => p.name)],
      stats: [["Pages", pages.length], ["Visuals", visuals.length], ["Measures", model ? measures.length : "n/a"], ["Relationships", model ? rels.length : "n/a"]], limits,
      layout: (() => { const pg = pages.slice().sort((a, b) => b.visuals.length - a.visuals.length)[0]; if (!pg) return null;
        const boxes = pg.visuals.filter(v => v.pos && v.pos.w > 0).map(v => ({ x: v.pos.x / pg.W * 100, y: v.pos.y / pg.H * 100, w: v.pos.w / pg.W * 100, h: v.pos.h / pg.H * 100, kind: /slicer/i.test(v.type) ? "filter" : /card|kpi/i.test(v.type) ? "kpi" : /textbox/i.test(v.type) ? "text" : "sheet", label: v.title || v.type }));
        return boxes.length ? { name: pg.name, boxes, ratio: pg.W / pg.H } : null; })() };
  }

  /* ================= screenshot → compressed JPEG ================= */
  async function shrinkImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("The image could not be opened.")); i.src = url; });
      const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
      const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      let q = 0.85, d = c.toDataURL("image/jpeg", q); while (d.length > 1.4e6 && q > 0.4) { q -= 0.15; d = c.toDataURL("image/jpeg", q); }
      return { dataUrl: d, w: img.naturalWidth, h: img.naturalHeight };
    } finally { URL.revokeObjectURL(url); }
  }

  /* ================= project requirements from this site ================= */
  function projectInfo() {
    const g = (n) => { try { return eval("typeof " + n + " !== 'undefined' ? " + n + " : null"); } catch (e) { return null; } };   // site constants (const, not on window)
    const K = g("KPIS") || [];
    const kpis = (Array.isArray(K) ? K : []).filter(k => k && k.name).map(k => ({ name: String(k.name), formula: String(k.formula || k.dax || ""), prio: String(k.prio || ""), cat: String(k.cat || "") }));
    let ctx = "";
    const ps = g("PROBLEM_STATEMENT"); if (ps) ctx += "Problem: " + cut(typeof ps === "string" ? ps : JSON.stringify(ps), 900) + "\n";
    const rq = g("REQUIREMENTS"); if (Array.isArray(rq) && rq.length) ctx += "Required dashboards/views:\n" + rq.slice(0, 12).map(r => "- " + (Array.isArray(r) ? r.filter(x => typeof x === "string").join(" · ") : JSON.stringify(r))).join("\n").slice(0, 1500) + "\n";
    if (kpis.length) ctx += `KPI list (${kpis.length}):\n` + kpis.slice(0, 45).map(k => `- ${k.name}${k.prio ? ` [${k.prio}]` : ""}: ${cut(k.formula, 110)}`).join("\n") + "\n";
    const GT = g("GOTCHAS"); if (Array.isArray(GT) && GT.length) ctx += "Known data traps:\n" + GT.slice(0, 8).map(x => "- " + cut((x.t || x.title || "") + ": " + (x.d || x.desc || ""), 200)).join("\n") + "\n";
    if (!kpis.length) { const v = document.getElementById("view-kpis"); if (v) ctx += "KPI page: " + cut(v.textContent.replace(/\s+/g, " "), 2500) + "\n"; }
    if (CFG.focus && CFG.focus.length) ctx += "Trainer's review rules for this project:\n" + CFG.focus.map(f => "- " + f).join("\n") + "\n";
    const name = (document.querySelector(".sidebar-header, .brand, header") || {}).textContent;
    return { name: document.title.split(/[—|-]/)[0].trim() || cut((name || "").trim(), 80), context: ctx.slice(0, 7000), kpis };
  }
  const KSTOP = new Set("total rate of by per the and in on for to a an avg average count number no % percent ratio value amount sum".split(" "));
  function kpiCoverage(kpis, names) {
    if (!kpis.length || !names.length) return null;
    const hay = names.join(" \n ").toLowerCase().replace(/[_\-]/g, " ");
    const found = [], missing = [];
    kpis.forEach(k => {
      const t = k.name.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 1 && !KSTOP.has(w));
      if (!t.length) return; const hit = t.filter(w => hay.includes(w.length > 5 ? w.slice(0, w.length - 1) : w)).length;
      (hit / t.length >= 0.6 ? found : missing).push(k);
    });
    return { found, missing, total: found.length + missing.length };
  }

  /* ================= state + history ================= */
  const hist = { all() { try { return JSON.parse(ls.get(SKEY)) || []; } catch (e) { return []; } }, save(a) { ls.set(SKEY, JSON.stringify(a.slice(0, 15))); } };
  function me() { try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/_student_v1$/.test(k)) { const m = JSON.parse(localStorage.getItem(k)); if (m && m.name) return m; } } } catch (e) {} return null; }
  let state = { main: null, shot: null, busy: false, step: 0, error: "", result: null, ai: null };
  const STEPS = ["Checking the file", "Reading the workbook", "Running automatic checks", "AI review (10–40 s)", "Designing a better wireframe", "Done"];

  /* ================= render ================= */
  function render() {
    const root = $("rv-root"); if (!root) return;
    const H = hist.all(); const m = me();
    root.innerHTML = `
      <div class="section-head rv-head"><div class="eyebrow">AI dashboard review</div><h2>Mahendra Dashboard Evaluation Feedback</h2>
        <p>Upload your Tableau, Power BI or Excel dashboard and get a 100-point scorecard with evidence, fixes and a resubmission checklist, based on this project's KPIs and requirements.</p></div>
      ${state.ai === false ? `<div class="rv-note warn">⚠️ AI review is not switched on for this site yet. Your trainer needs to add the free Groq key in Vercel (GROQ_API_KEY). You can still upload a file to see the automatic checks.</div>` : ""}
      <div class="rv-grid">
        <div class="card rv-card">
          <h3>1 · Your dashboard file</h3>
          <label class="rv-drop" id="rv-drop" tabindex="0" role="button" aria-label="Choose or drop your dashboard file">
            <input type="file" id="rv-file" accept=".twbx,.twb,.pbix,.pbit,.xlsx,.xlsm,.png,.jpg,.jpeg,.webp" hidden>
            ${state.main ? `<span class="rv-file">📄 <b>${esc(state.main.file.name)}</b> · ${KIND_LABEL[state.main.kind]} · ${(state.main.file.size / MB).toFixed(1)} MB <button type="button" class="rv-x" data-clear="main" aria-label="Remove file">✕</button></span>`
              : `<span class="rv-big">⬆️</span><span><b>Drop your file here</b> or click to choose</span><span class="rv-mute">.twbx · .twb · .pbix · .pbit · .xlsx · .xlsm · or a dashboard screenshot (.png/.jpg/.webp)</span>`}
          </label>
          <h3 class="rv-mt">2 · Screenshot of the dashboard <span class="rv-mute">(recommended)</span></h3>
          <label class="rv-drop small" id="rv-drop2" tabindex="0" role="button" aria-label="Choose a screenshot">
            <input type="file" id="rv-shot" accept=".png,.jpg,.jpeg,.webp" hidden>
            ${state.shot ? `<span class="rv-file">🖼️ <b>${esc(state.shot.name)}</b> <button type="button" class="rv-x" data-clear="shot" aria-label="Remove screenshot">✕</button></span>` : `<span>Add a PNG/JPG of the full dashboard so colours, layout and readability can be judged.</span>`}
          </label>
          <h3 class="rv-mt">3 · Anything the reviewer should know? <span class="rv-mute">(optional)</span></h3>
          <textarea id="rv-notes" rows="3" maxlength="1500" placeholder="e.g. This is my Tableau dashboard for the Production KPIs. For .pbix you can paste your DAX measures here.">${esc(state.notes || "")}</textarea>
          <div class="rv-row"><button class="btn-blue" id="rv-go" ${!state.main && !state.shot || state.busy ? "disabled" : ""}>${state.busy ? "Reviewing…" : "✨ Review my dashboard"}</button>
            <span class="rv-mute">${m ? `Saved for <b>${esc(m.name)}</b>${m.group ? " · " + esc(m.group) : ""}${m.batch ? " · " + esc(m.batch) : ""}` : ""}</span></div>
          ${state.error ? `<div class="rv-note err" role="alert">❌ ${esc(state.error)}</div>` : ""}
          ${state.busy ? `<ol class="rv-steps" aria-live="polite">${STEPS.map((s, i) => `<li class="${i < state.step ? "done" : i === state.step ? "now" : ""}">${i < state.step ? "✓" : i === state.step ? "⏳" : "○"} ${s}</li>`).join("")}</ol>` : ""}
          <p class="rv-privacy">🔒 Your file is opened only in your browser and is never uploaded. Only a text summary of its structure (sheet names, fields, formulas, visuals — no data rows) and your screenshot are sent to the AI (Groq) to write the review. Macros are never run. Reviews are saved only in this browser.</p>
        </div>
        <div class="card rv-card rv-side">
          <h3>What gets scored</h3>
          <ul class="rv-cats">${CATS.map(([id, n]) => `<li><span>${n}</span><b>${(CFG.weights || {})[id] || 20}</b></li>`).join("")}<li class="tot"><span>Total</span><b>100</b></li></ul>
          <h3 class="rv-mt">Supported files</h3>
          <ul class="rv-sup"><li><b>Tableau .twbx / .twb</b>: full design: sheets, dashboards, calculated fields, filters, actions, relationships.</li>
            <li><b>Excel .xlsx / .xlsm</b>: sheets, formulas, charts, pivots, slicers, errors.</li>
            <li><b>Power BI .pbit</b>: full: pages, visuals, DAX measures, relationships. <b>.pbix</b>: pages and visuals only (DAX can't be read in the browser).</li>
            <li><b>Screenshot</b>: visual design and story only.</li></ul>
          <h3 class="rv-mt">My reviews</h3>
          ${H.length ? `<ul class="rv-hist">${H.map((h, i) => `<li><button type="button" data-open="${i}"><span><b>${h.review.overall}</b>/100 · ${esc(cut(h.file, 26))} <span class="rv-tag">${KIND_LABEL[h.kind] || ""}</span></span><span class="rv-mute">${new Date(h.ts).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} ${new Date(h.ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span></button><button type="button" class="rv-x" data-del="${i}" aria-label="Delete review">✕</button></li>`).join("")}</ul>` : `<p class="rv-mute">No reviews yet.</p>`}
        </div>
      </div>
      <div id="rv-out">${state.result ? reportHtml(state.result, true) : ""}</div>`;
    bind();
  }
  const sevIc = { critical: "🔴", high: "🟠", medium: "🟡", low: "🔵" }, stLbl = { verified: "Verified", likely: "Likely", not_checked: "Not checked" };
  function reportHtml(R, live) {
    const r = R.review, prev = R.prev;
    const band = r ? (r.overall >= 85 ? ["Excellent", "g"] : r.overall >= 70 ? ["Good", "g"] : r.overall >= 55 ? ["Needs work", "a"] : ["Major gaps", "r"]) : null;
    const delta = (a, b) => b == null ? "" : `<span class="rv-d ${a - b >= 0 ? "up" : "dn"}">${a - b >= 0 ? "▲" : "▼"} ${Math.abs(a - b)}</span>`;
    const cov = R.coverage;
    return `<div class="card rv-report" id="rv-report">
      <div class="rv-rhead"><div><div class="eyebrow">Mahendra Dashboard Evaluation Feedback</div><h3>${esc(R.file)} <span class="rv-tag">${KIND_LABEL[R.kind] || ""}</span></h3>
        <div class="rv-mute">${esc(R.project)} · ${new Date(R.ts).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}${R.student ? ` · ${esc(R.student)}` : ""}</div></div>
        ${live ? `<div class="rv-acts"><button class="btn-outline" id="rv-print">🖨️ Print / PDF</button><button class="btn-outline" id="rv-dl">⬇️ Download</button></div>` : ""}</div>
      ${r ? `<div class="rv-score"><div class="rv-dial ${band[1]}"><b>${r.overall}</b><span>/100</span></div><div><div class="rv-band ${band[1]}">${band[0]} ${prev ? delta(r.overall, prev.overall) + `<span class="rv-mute"> vs your last ${KIND_LABEL[R.kind]} review (${prev.overall})</span>` : ""}</div>
        <p>${esc(r.summary)}</p><div class="rv-mute">Review confidence: <b>${esc(r.confidence)}</b>${r.confidence_reason ? " · " + esc(r.confidence_reason) : ""}</div></div></div>
      ${live && window.KICKOFF_CAST ? window.KICKOFF_CAST.reviewStrip(r) : ""}
      <div class="rv-bars">${r.categories.map(c => { const pc = prev && (prev.categories || []).find(x => x.id === c.id); return `<div class="rv-bar"><div class="rv-bl"><span>${esc(c.name)}</span><b>${c.score}/${c.max}${pc ? " " + delta(c.score, pc.score) : ""}</b></div><div class="rv-bt"><i style="width:${c.max ? Math.round(c.score / c.max * 100) : 0}%"></i></div><div class="rv-bc">${esc(c.comment)}</div></div>`; }).join("")}</div>`
        : `<div class="rv-note warn">The AI review could not run${R.aiError ? `: ${esc(R.aiError)}` : ""} The automatic checks below were still done.</div>`}
      <h4>🔎 Automatic checks (done by code — reliable)</h4>
      <div class="rv-stats">${(R.stats || []).map(([k, v]) => `<div><b>${esc(v)}</b><span>${esc(k)}</span></div>`).join("")}</div>
      <ul class="rv-facts">${(R.facts || []).map(f => `<li>${esc(f)}</li>`).join("")}</ul>
      ${cov ? `<div class="rv-cov"><b>KPI coverage by name: ${cov.found.length} of ${cov.total}</b> project KPIs found in your field / measure / sheet names.${cov.missing.length ? `<div class="rv-mute">Not found by name (may exist under another name): ${esc(cov.missing.slice(0, 25).map(k => k.name).join(", "))}${cov.missing.length > 25 ? "…" : ""}</div>` : ""}</div>` : ""}
      ${r ? `
      ${r.strengths.length ? `<h4>✅ Strengths</h4><ul class="rv-list">${r.strengths.map(s => `<li>${esc(s)}</li>`).join("")}</ul>` : ""}
      ${problemsHtml(R)}
      ${r.issues.length ? `<h4>🛠️ Issues (most important first)</h4>${r.issues.map((i, k) => `<div class="rv-issue ${i.severity}"><div class="rv-ih"><span class="rv-pin">${k + 1}</span> ${sevIc[i.severity]} <b>${esc(i.title)}</b><span class="rv-chip ${i.severity}">${i.severity}</span><span class="rv-chip st-${i.status}">${stLbl[i.status]}</span><span class="rv-chip">${esc((CATS.find(c => c[0] === i.category) || ["", ""])[1])}</span></div>
        ${i.evidence ? `<div><em>Evidence:</em> ${esc(i.evidence)}</div>` : ""}${i.impact ? `<div><em>Why it matters:</em> ${esc(i.impact)}</div>` : ""}${i.fix ? `<div><em>Fix:</em> ${esc(i.fix)}</div>` : ""}${i.example ? `<pre class="rv-code">${esc(i.example)}</pre>` : ""}</div>`).join("")}` : ""}
      ${r.missing.length ? `<h4>❓ Missing KPIs / requirements</h4><ul class="rv-list">${r.missing.map(s => `<li>${esc(s)}</li>`).join("")}</ul>` : ""}
      ${r.action_plan.length ? `<h4>📋 Action plan</h4><ol class="rv-list">${r.action_plan.map(s => `<li>${esc(s)}</li>`).join("")}</ol>` : ""}
      ${wireHtml(R, live)}
      ${r.checklist.length ? `<h4>☑️ Before you resubmit</h4><ul class="rv-check">${r.checklist.map((s, k) => `<li><label><input type="checkbox"> ${esc(s)}</label></li>`).join("")}</ul>` : ""}` : ""}
      ${(R.limits || []).length || (r && r.limitations.length) ? `<h4>ℹ️ Limitations</h4><ul class="rv-list rv-mute">${[...(R.limits || []), ...(r ? r.limitations : [])].map(s => `<li>${esc(s)}</li>`).join("")}</ul>` : ""}
      <p class="rv-mute rv-foot">AI feedback can be wrong. Verified items were proven from your file; "likely" items need your check. Your trainer's evaluation is final.</p>
    </div>`;
  }
  /* ================= where the problems are + suggested wireframe ================= */
  const norm = (t) => String(t || "").toLowerCase().replace(/^filter:\s*/, "").replace(/[^a-z0-9%]+/g, " ").trim();
  function matchBox(boxes, target) {
    const t = norm(target); if (!t || t.length < 2) return -1;
    let best = -1, bl = 0;
    boxes.forEach((b, i) => { const l = norm(b.label); if (!l) return; if ((l === t || t.includes(l) || l.includes(t)) && l.length > bl) { best = i; bl = l.length; } });
    return best;
  }
  function problemsHtml(R) {
    const r = R.review; if (!r || !r.issues.length) return "";
    const nums = (list) => list.map(n => `<span class="rv-pin">${n}</span>`).join("");
    let vis = "", placed = new Set();
    if (R.shot && r.issues.some(i => i.region)) {
      vis = `<div class="rv-shotwrap"><img src="${R.shot}" alt="Your dashboard screenshot">${r.issues.map((i, k) => i.region ? (placed.add(k), `<div class="rv-hot ${i.severity}" style="left:${i.region.x}%;top:${i.region.y}%;width:${i.region.w}%;height:${i.region.h}%"><span class="rv-pin">${k + 1}</span></div>`) : "").join("")}</div>
        <div class="rv-mute">Boxes are approximate: the AI marks where it sees each problem on your screenshot.</div>`;
    } else if (R.layout && R.layout.boxes.length) {
      const L = R.layout, W = 1000, H = Math.round(W / (L.ratio || 16 / 9)); const hits = L.boxes.map(() => []);
      r.issues.forEach((i, k) => { const b = matchBox(L.boxes, i.target); if (b >= 0) { hits[b].push(k + 1); placed.add(k); } });
      const col = { filter: "#2563EB", kpi: "#7C3AED", legend: "#64748B", title: "#0F172A", text: "#64748B", sheet: "#475569" };
      vis = `<svg class="rv-cur" viewBox="0 0 ${W} ${H}" role="img" aria-label="Layout of your dashboard"><rect width="${W}" height="${H}" fill="#fff" stroke="#CBD5E1"/>
        ${L.boxes.map((b, i) => { const x = b.x / 100 * W, y = b.y / 100 * H, w = Math.max(8, b.w / 100 * W), h = Math.max(8, b.h / 100 * H), bad = hits[i].length;
          return `<g><rect x="${x + 2}" y="${y + 2}" width="${w - 4}" height="${h - 4}" rx="6" fill="${bad ? "#FEF2F2" : "#F8FAFC"}" stroke="${bad ? "#DC2626" : col[b.kind] || "#94A3B8"}" stroke-width="${bad ? 3 : 1.5}" ${b.kind === "filter" ? 'stroke-dasharray="6 4"' : ""}/>
          <text x="${x + 10}" y="${y + 22}" font-size="${h < 34 ? 11 : 14}" fill="#0F172A" font-family="Arial">${esc(cut(b.label, Math.max(6, Math.floor(w / 8))))}</text>
          ${hits[i].map((n, j) => `<g transform="translate(${x + w - 18 - j * 24},${y + 16})"><circle r="11" fill="#DC2626"/><text text-anchor="middle" y="4" font-size="12" font-weight="700" fill="#fff" font-family="Arial">${n}</text></g>`).join("")}</g>`; }).join("")}</svg>
        <div class="rv-mute">Your dashboard "${esc(L.name)}" as built in the file. Red boxes have problems; numbers match the issues below. Dashed = filters.</div>`;
    }
    if (!vis) return "";
    const general = r.issues.map((i, k) => k).filter(k => !placed.has(k)).map(k => k + 1);
    return `<h4>📍 Where the problems are on your dashboard</h4>${vis}${general.length ? `<div class="rv-mute">Issues about the whole dashboard or the data model: ${nums(general)}</div>` : ""}`;
  }

  /* ---- wireframe: realistic mock-up + blueprint + step-by-step build guide ---- */
  const WF = { W: 1200, pad: 16, gap: 12, unit: 66, top: 0 };
  function wireLayout(page) {
    const colW = (WF.W - 2 * WF.pad - 11 * WF.gap) / 12; let y = WF.pad, n = 0; const out = [];
    page.rows.forEach(row => {
      const h = row.h * WF.unit + (row.h - 1) * WF.gap; let c = 0;
      row.blocks.forEach(b => { const x = WF.pad + c * (colW + WF.gap), w = b.span * colW + (b.span - 1) * WF.gap; out.push(Object.assign({}, b, { dim: typeof b.x === "string" ? b.x : "", mea: typeof b.y === "string" ? b.y : "", x, y, w, h, n: ++n })); c += b.span; });
      y += h + WF.gap;
    });
    return { blocks: out, H: y + WF.pad - WF.gap };
  }
  // colours come from the site's own theme so the mock-up looks like it belongs here (resolved to hex for PNG/SVG export)
  function theme() {
    const cs = getComputedStyle(document.documentElement), bs = getComputedStyle(document.body);
    const v = (n, d) => ((bs.getPropertyValue(n) || cs.getPropertyValue(n) || "").trim() || d);
    const pal = [v("--teal", "#0E86C9"), v("--blue", "#2856A3"), v("--amber", "#A15C07"), v("--teal-deep", "#0A5A87"), "#94A3B8", "#7C3AED"];
    return { pal, acc: pal[0], tint: "#EEF4F8", ink: "#0F172A", mute: "#64748B", line: "#E2E8F0", grid: "#EEF2F6", bg: "#F5F7FA", card: "#FFFFFF", up: "#15803D", down: "#B91C1C" };
  }
  const F = 'font-family="Inter, Segoe UI, Arial, Helvetica, sans-serif"';
  function rng(seed) { let s = (seed * 9301 + 49297) % 233280; return () => (s = (s * 9301 + 49297) % 233280) / 233280; }
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function catsOf(b, k) {
    if (b.cats && b.cats.length >= 2) return b.cats.slice(0, k);
    if (/date|month|week|day|year|time|period|quarter/i.test(b.dim || "")) return MONTHS.slice(0, k);
    const base = (b.dim || "Category").replace(/[_]/g, " ").split(/[·,]/)[0].trim();
    return Array.from({ length: k }, (_, i) => `${cut(base, 10)} ${String.fromCharCode(65 + i)}`);
  }
  function sampleVal(b, r) {
    if (b.value) return b.value;
    const l = (b.label + " " + (b.mea || "") + " " + (b.fields || "")).toLowerCase();
    if (/%|rate|ratio|share|margin|percent/.test(l)) return (8 + r() * 70).toFixed(1) + "%";
    if (/revenue|sales|amount|cost|spend|premium|salary|value|profit|₹|inr/.test(l)) return "₹" + (1 + r() * 9).toFixed(1) + " Cr";
    if (/day|time|tat|duration|hours|minutes/.test(l)) return (2 + r() * 30).toFixed(1) + " days";
    if (/avg|average|aov|adr|per /.test(l)) return "₹" + Math.round(400 + r() * 4000).toLocaleString("en-IN");
    return Math.round(200 + r() * 9000).toLocaleString("en-IN");
  }
  const fmtN = (v, pct) => pct ? Math.round(v) + "%" : v >= 1000 ? (v / 1000).toFixed(1) + "k" : String(Math.round(v));
  function T(x, y, s, o) { o = o || {}; return `<text x="${x}" y="${y}" font-size="${o.fs || 11}" ${o.b ? 'font-weight="700"' : ""} fill="${o.c || "#64748B"}" ${o.a ? `text-anchor="${o.a}"` : ""} ${o.rot ? `transform="rotate(${o.rot} ${x} ${y})"` : ""} ${F}>${esc(s)}</text>`; }
  const WORDS = ["North", "South", "East", "West", "Central", "Online", "Retail"];
  function cellVal(c, i, r) {
    const n = String(c).toLowerCase();
    if (/rating|score|stars/.test(n)) return (1 + r() * 4).toFixed(1);
    if (/tenure|year|age/.test(n)) return (1 + r() * 9).toFixed(1) + (/age/.test(n) ? "" : " yrs");
    if (/%|rate|ratio|share|margin/.test(n)) return Math.round(5 + r() * 60) + "%";
    if (/date|month/.test(n)) return MONTHS[(i * 3) % 12] + " 2025";
    if (/revenue|amount|sales|cost|salary|spend|value|premium|price/.test(n)) return "₹" + Math.round(10 + r() * 990).toLocaleString("en-IN") + "k";
    if (/count|qty|quantity|orders|total|number|units|visits|leads/.test(n)) return Math.round(20 + r() * 2000).toLocaleString("en-IN");
    return cut(c, 10) + " " + WORDS[i % WORDS.length].slice(0, 1) + (i + 1);
  }
  function chartMock(b, x, y, w, h, th) {
    const r = rng(b.n * 7 + 3), t = b.chart, P = th.pal, isPct = /%|rate|ratio|share/i.test(b.mea || b.label);
    let s = "";
    const axisT = (xt, yt) => (xt ? T(x + w / 2, y + h + 2, xt, { a: "middle", fs: 10 }) : "") + (yt ? T(x - 34, y + h / 2, yt, { a: "middle", fs: 10, rot: -90 }) : "");
    const series = b.legend ? 2 : 1;
    const legend = (names, lx, ly) => names.map((nm, i) => `<rect x="${lx + i * 90}" y="${ly - 8}" width="10" height="10" rx="2" fill="${P[i]}"/>${T(lx + i * 90 + 14, ly + 1, cut(nm, 11), { fs: 10 })}`).join("");
    if (/^(bar|bullet|stacked-bar)$/.test(t)) {
      const cats = catsOf(b, Math.max(3, Math.min(6, Math.floor(h / 26)))), lw = Math.min(110, w * 0.3), bw = w - lw - 40, rh = h / cats.length;
      const vals = cats.map(() => 0.25 + r() * 0.75).sort((a, c) => c - a);
      cats.forEach((c, i) => { const yy = y + i * rh + rh * 0.18, bh = rh * 0.62, v = vals[i];
        s += T(x + lw - 6, yy + bh / 2 + 4, cut(c, Math.floor(lw / 6.3)), { a: "end", c: "#334155" });
        if (t === "stacked-bar") { const a = v * 0.6, c2 = v * 0.4; s += `<rect x="${x + lw}" y="${yy}" width="${bw * a}" height="${bh}" fill="${P[0]}" rx="2"/><rect x="${x + lw + bw * a}" y="${yy}" width="${bw * c2}" height="${bh}" fill="${P[1]}" rx="2"/>`; }
        else s += `<rect x="${x + lw}" y="${yy}" width="${bw * v}" height="${bh}" rx="3" fill="${i === 0 ? P[0] : P[0] + "99"}"/>`;
        if (t === "bullet") s += `<rect x="${x + lw + bw * Math.min(.97, v + .12)}" y="${yy - 3}" width="3" height="${bh + 6}" fill="${th.ink}"/>`;
        s += T(x + lw + bw * v + 5, yy + bh / 2 + 4, fmtN(v * (isPct ? 60 : 9000), isPct), { fs: 10, c: "#334155", b: true }); });
      if (b.legend || t === "stacked-bar") s += legend([b.legend ? b.legend + " 1" : "Part 1", b.legend ? b.legend + " 2" : "Part 2"], x + lw, y - 4);
      return s + (b.mea ? T(x + lw + bw / 2, y + h + 2, b.mea, { a: "middle", fs: 10 }) : "");
    }
    if (/^(column|histogram|waterfall|combo)$/.test(t)) {
      const cats = catsOf(b, Math.max(4, Math.min(8, Math.floor(w / 60)))), ph = h - 16, cw = w / cats.length;
      for (let g = 0; g <= 3; g++) s += `<line x1="${x}" x2="${x + w}" y1="${y + ph - ph * g / 3}" y2="${y + ph - ph * g / 3}" stroke="${th.grid}"/>`;
      let acc = 0.15; const pts = [];
      cats.forEach((c, i) => { const v = 0.3 + r() * 0.65, bw = cw * (series > 1 ? 0.32 : 0.56), x0 = x + i * cw + (cw - bw * series) / 2;
        if (t === "waterfall") { const d = (r() - 0.35) * 0.3, y0 = Math.min(acc, acc + d); s += `<rect x="${x0}" y="${y + ph - ph * (y0 + Math.abs(d))}" width="${bw}" height="${ph * Math.max(.02, Math.abs(d))}" fill="${d >= 0 ? th.up : th.down}" rx="2"/>`; acc += d; }
        else { s += `<rect x="${x0}" y="${y + ph - ph * v}" width="${bw}" height="${ph * v}" rx="3" fill="${P[0]}"/>`; if (series > 1) { const v2 = v * (0.5 + r() * 0.5); s += `<rect x="${x0 + bw}" y="${y + ph - ph * v2}" width="${bw}" height="${ph * v2}" rx="3" fill="${P[1]}"/>`; } }
        pts.push([x + i * cw + cw / 2, y + ph - ph * (0.35 + r() * 0.5)]);
        s += T(x + i * cw + cw / 2, y + ph + 12, cut(c, Math.max(3, Math.floor(cw / 6.5))), { a: "middle", fs: 10, c: "#334155" }); });
      if (t === "combo") s += `<polyline points="${pts.map(p => p.join(",")).join(" ")}" fill="none" stroke="${P[2]}" stroke-width="2.5"/>` + pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="${P[2]}"/>`).join("");
      if (b.legend) s += legend([b.legend + " 1", b.legend + " 2"], x, y - 4);
      return s + axisT("", b.mea);
    }
    if (/^(line|area)$/.test(t)) {
      const cats = catsOf(b, Math.max(5, Math.min(12, Math.floor(w / 50)))), ph = h - 16, step = w / (cats.length - 1);
      for (let g = 0; g <= 3; g++) s += `<line x1="${x}" x2="${x + w}" y1="${y + ph - ph * g / 3}" y2="${y + ph - ph * g / 3}" stroke="${th.grid}"/>`;
      for (let k = 0; k < series; k++) { let v = 0.35 + r() * 0.3; const pts = cats.map((c, i) => { v = Math.max(.08, Math.min(.95, v + (r() - 0.45) * 0.22)); return [x + i * step, y + ph - ph * v]; });
        if (t === "area" && k === 0) s += `<polygon points="${x},${y + ph} ${pts.map(p => p.join(",")).join(" ")} ${x + w},${y + ph}" fill="${P[0]}" opacity=".18"/>`;
        s += `<polyline points="${pts.map(p => p.map(n => n.toFixed(1)).join(",")).join(" ")}" fill="none" stroke="${P[k]}" stroke-width="2.6" stroke-linejoin="round"/>` + pts.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.6" fill="#fff" stroke="${P[k]}" stroke-width="2"/>`).join(""); }
      cats.forEach((c, i) => { if (cats.length <= 8 || i % 2 === 0) s += T(x + i * step, y + ph + 12, cut(c, 6), { a: "middle", fs: 10, c: "#334155" }); });
      if (b.legend) s += legend([b.legend + " 1", b.legend + " 2"], x, y - 4);
      return s + axisT("", b.mea);
    }
    if (/^(pie|donut|gauge)$/.test(t)) {
      const R = Math.min(h / 2 - 4, w * 0.28), cx = x + R + 6, cy = y + h / 2;
      if (t === "gauge") { const v = 0.35 + r() * 0.5, a = Math.PI * (1 - v); s += `<path d="M${cx - R},${cy + R / 3} A${R},${R} 0 0 1 ${cx + R},${cy + R / 3}" fill="none" stroke="${th.grid}" stroke-width="${R / 3}"/><path d="M${cx - R},${cy + R / 3} A${R},${R} 0 0 1 ${(cx + R * Math.cos(a)).toFixed(1)},${(cy + R / 3 - R * Math.sin(a)).toFixed(1)}" fill="none" stroke="${P[0]}" stroke-width="${R / 3}"/>` + T(cx, cy + R / 3, sampleVal(b, r), { a: "middle", fs: 18, b: true, c: th.ink }); return s; }
      const cats = catsOf(b, 4), vals = [0.42, 0.27, 0.19, 0.12]; let a0 = -Math.PI / 2;
      vals.forEach((v, i) => { const a1 = a0 + v * Math.PI * 2, lg = v > .5 ? 1 : 0; s += `<path d="M${cx},${cy} L${(cx + R * Math.cos(a0)).toFixed(1)},${(cy + R * Math.sin(a0)).toFixed(1)} A${R},${R} 0 ${lg} 1 ${(cx + R * Math.cos(a1)).toFixed(1)},${(cy + R * Math.sin(a1)).toFixed(1)} Z" fill="${P[i]}" stroke="#fff" stroke-width="2"/>`; a0 = a1; });
      if (t === "donut") s += `<circle cx="${cx}" cy="${cy}" r="${R * 0.58}" fill="#fff"/>` + T(cx, cy + 5, "100%", { a: "middle", fs: 13, b: true, c: th.ink });
      cats.forEach((c, i) => { const ly = y + 12 + i * 18; if (ly < y + h) s += `<rect x="${cx + R + 16}" y="${ly - 8}" width="10" height="10" rx="2" fill="${P[i]}"/>` + T(cx + R + 30, ly + 1, `${cut(c, 14)} · ${Math.round(vals[i] * 100)}%`, { fs: 10.5, c: "#334155" }); });
      return s;
    }
    if (t === "map") { s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#EEF4F8"/><path d="M${x + w * .18},${y + h * .55} q${w * .12},-${h * .42} ${w * .36},-${h * .3} t${w * .3},${h * .1} q-${w * .02},${h * .48} -${w * .32},${h * .52} t-${w * .34},-${h * .32}z" fill="#D7E2EC" stroke="#B6C6D6"/>`; catsOf(b, 4).forEach((c, i) => { const px = x + w * (.3 + i * .14), py = y + h * (.35 + (i % 2) * .22), rr = 6 + (4 - i) * 3; s += `<circle cx="${px}" cy="${py}" r="${rr}" fill="${P[0]}" opacity=".75"/>` + T(px, py - rr - 3, cut(c, 10), { a: "middle", fs: 9.5, c: "#334155" }); }); return s; }
    if (t === "scatter") { for (let i = 0; i < 22; i++) s += `<circle cx="${(x + 8 + r() * (w - 16)).toFixed(1)}" cy="${(y + 8 + r() * (h - 24)).toFixed(1)}" r="4" fill="${P[i % 5 ? 0 : 2]}" opacity=".8"/>`; return s + `<line x1="${x}" y1="${y + h - 14}" x2="${x + w}" y2="${y + h - 14}" stroke="${th.line}"/>` + axisT(b.dim, b.mea); }
    if (t === "funnel") { const cats = catsOf(b, 4); cats.forEach((c, i) => { const ww = w * (0.95 - i * 0.18), bh = h / 4 - 5; s += `<rect x="${x + (w - ww) / 2}" y="${y + i * h / 4}" width="${ww}" height="${bh}" rx="4" fill="${P[0]}" opacity="${1 - i * 0.18}"/>` + T(x + w / 2, y + i * h / 4 + bh / 2 + 4, `${cut(c, 16)} · ${fmtN(9000 * (1 - i * 0.28))}`, { a: "middle", fs: 10.5, c: "#fff", b: true }); }); return s; }
    if (t === "treemap") { const cats = catsOf(b, 5); const sz = [[0, 0, .55, 1], [.55, 0, .45, .55], [.55, .55, .25, .45], [.8, .55, .2, .25], [.8, .8, .2, .2]]; sz.forEach((z, i) => { s += `<rect x="${x + w * z[0]}" y="${y + h * z[1]}" width="${w * z[2] - 2}" height="${h * z[3] - 2}" fill="${P[i % 4]}" opacity="${.9 - i * .1}"/>`; if (w * z[2] > 40 && h * z[3] > 18) s += T(x + w * z[0] + 6, y + h * z[1] + 14, cut(cats[i], Math.floor(w * z[2] / 7)), { fs: 10.5, c: "#fff", b: true }); }); return s; }
    if (t === "heatmap") { const rows = catsOf(b, Math.min(5, Math.floor(h / 22))), cols = Math.min(7, Math.floor((w - 70) / 34)); rows.forEach((rw, i) => { s += T(x + 60, y + i * (h / rows.length) + h / rows.length / 2 + 4, cut(rw, 9), { a: "end", fs: 10, c: "#334155" }); for (let j = 0; j < cols; j++) s += `<rect x="${x + 66 + j * (w - 70) / cols}" y="${y + i * h / rows.length}" width="${(w - 70) / cols - 3}" height="${h / rows.length - 3}" rx="3" fill="${P[0]}" opacity="${(0.15 + r() * 0.85).toFixed(2)}"/>`; }); return s; }
    // table / matrix / card / slicer fallback → a real-looking table
    const cols = (b.fields || [b.dim, b.mea].filter(Boolean).join(" · ") || "Name · Value").split(/\s*[·,|]\s*/).filter(Boolean).slice(0, 5);
    const nr = Math.max(2, Math.min(7, Math.floor(h / 22) - 1)), cw = w / cols.length, cats = catsOf(b, nr);
    s += `<rect x="${x}" y="${y}" width="${w}" height="22" fill="${th.tint}"/>` + cols.map((c, j) => T(x + j * cw + 8, y + 15, cut(c, Math.floor(cw / 6.6)), { fs: 10.5, b: true, c: th.ink })).join("");
    for (let i = 0; i < nr; i++) { const yy = y + 22 + i * 22; s += `<line x1="${x}" x2="${x + w}" y1="${yy + 22}" y2="${yy + 22}" stroke="${th.grid}"/>`; cols.forEach((c, j) => { s += T(x + j * cw + 8, yy + 15, cut(j === 0 ? cats[i] : cellVal(c, i, r), Math.floor(cw / 6.6)), { fs: 10.5, c: "#334155" }); }); }
    return s;
  }
  function wireSvg(page, title, mode, th) {
    th = th || theme(); const L = wireLayout(page), bp = mode === "blueprint";
    const body = L.blocks.map(b => {
      const { x, y, w, h } = b, r = rng(b.n * 13 + 1); let inner = "";
      const head = (fs) => T(x + 14, y + 22, cut(b.label, Math.floor(w / (fs * 0.56))), { fs, b: true, c: th.ink });
      if (bp) {
        const lines = [];
        if (b.type === "chart" || b.type === "table") { if (b.dim) lines.push("Axis / rows: " + b.dim); if (b.mea) lines.push("Values: " + b.mea); if (b.legend) lines.push("Colour / legend: " + b.legend); }
        else if (b.type === "kpi") lines.push("Measure: " + (b.mea || b.fields || b.label), b.compare ? "Compare: " + b.compare : "");
        else if (b.type === "filter") lines.push("Field: " + (b.fields || b.label), b.options && b.options.length ? "Values: " + b.options.join(", ") : "");
        else if (b.fields) lines.push(b.fields);
        if (b.why) lines.push("Answers: " + b.why);
        inner = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#F8FAFC" stroke="${th.pal[1]}" stroke-dasharray="6 4" stroke-width="1.5"/>${head(13)}${T(x + 14, y + 38, (b.type === "chart" ? b.chart : b.type).toUpperCase(), { fs: 9.5, b: true, c: th.pal[1] })}
          ${lines.filter(Boolean).map((l, i) => y + 56 + i * 15 < y + h - 4 ? T(x + 14, y + 56 + i * 15, cut(l, Math.floor((w - 24) / 6)), { fs: 11, c: "#334155" }) : "").join("")}`;
      } else if (b.type === "title") inner = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${th.card}"/><rect x="${x}" y="${y + h - 4}" width="${w}" height="4" rx="2" fill="${th.acc}"/>${T(x + 16, y + Math.min(h / 2 + 4, 34), cut(b.label, Math.floor(w / 11)), { fs: 20, b: true, c: th.ink })}${h > 50 && page.purpose ? T(x + 16, y + Math.min(h / 2 + 22, 52), cut(page.purpose, Math.floor(w / 6.5)), { fs: 11 }) : ""}`;
      else if (b.type === "filter") { const bh = Math.min(30, h - 26), op = (b.options && b.options[0]) || "All"; inner = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${th.card}"/>${T(x + 12, y + 16, cut(b.label.toUpperCase(), Math.floor(w / 7)), { fs: 9.5, b: true })}<rect x="${x + 12}" y="${y + 22}" width="${w - 24}" height="${bh}" rx="6" fill="#fff" stroke="#CBD5E1"/>${T(x + 22, y + 22 + bh / 2 + 4, cut(op, Math.floor((w - 50) / 7)), { fs: 12, c: th.ink })}${T(x + w - 26, y + 22 + bh / 2 + 4, "▾", { fs: 12, c: th.acc })}`; }
      else if (b.type === "kpi") { const up = r() > 0.35, val = sampleVal(b, r), sp = Array.from({ length: 8 }, (_, i) => `${x + w - 74 + i * 9},${y + h - 14 - r() * 18}`).join(" ");
        inner = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${th.card}"/><rect x="${x}" y="${y}" width="4" height="${h}" rx="2" fill="${th.acc}"/>${T(x + 14, y + 20, cut(b.label.toUpperCase(), Math.floor(w / 7)), { fs: 10, b: true })}${T(x + 14, y + (h > 80 ? 54 : 43), val, { fs: h > 80 ? 26 : 20, b: true, c: th.ink })}${h > 60 ? T(x + 14, y + h - 9, `${up ? "▲" : "▼"} ${(1 + r() * 6).toFixed(1)}${/%/.test(val) ? " pts" : "%"} ${b.compare || "vs last period"}`, { fs: 10, b: true, c: up ? th.up : th.down }) : ""}${w > 150 && h > 60 ? `<polyline points="${sp}" fill="none" stroke="${th.acc}" stroke-width="2"/>` : ""}`; }
      else if (b.type === "text") inner = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#FFFBEB" stroke="#FCD34D"/>${T(x + 14, y + 22, "💡 " + cut(b.label, Math.floor(w / 7.5)), { fs: 13, b: true, c: th.ink })}${b.why ? T(x + 14, y + 42, cut(b.why, Math.floor((w - 28) / 6)), { fs: 11 }) : ""}`;
      else if (b.type === "legend" || b.type === "nav") inner = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${th.card}"/>${head(12)}${(b.options && b.options.length ? b.options : catsOf(b, 3)).slice(0, 4).map((c, i) => `<rect x="${x + 14 + i * Math.min(110, (w - 28) / 3)}" y="${y + 30}" width="${Math.min(100, (w - 40) / 3)}" height="22" rx="11" fill="${i ? "#F1F5F9" : th.acc}"/>${T(x + 24 + i * Math.min(110, (w - 28) / 3), y + 45, cut(c, 12), { fs: 10.5, c: i ? "#334155" : "#fff", b: true })}`).join("")}`;
      else { const top = 38, legendRoom = b.legend || b.chart === "stacked-bar" ? 16 : 0, padL = /^(bar|bullet|stacked-bar|pie|donut|gauge|map|treemap|funnel|heatmap|table|matrix|card|slicer)$/.test(b.chart) ? 14 : 46;
        inner = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${th.card}"/>${head(13.5)}${b.dim || b.mea ? T(x + 14, y + 34, cut([b.mea, b.dim].filter(Boolean).join(" by "), Math.floor((w - 28) / 6)), { fs: 10 }) : ""}
          ${h - top - 30 > 24 ? chartMock(b, x + padL, y + top + 8 + legendRoom, w - padL - 16, h - top - 34 - legendRoom, th) : ""}`; }
      return `<g class="rv-wb" data-n="${b.n}">${inner}${b.type === "title" ? "" : `<g transform="translate(${x + w - 15},${y + 14})"><circle r="11" fill="${th.pal[1]}"/><text text-anchor="middle" y="4" font-size="11" font-weight="700" fill="#fff" ${F}>${b.n}</text></g>`}</g>`;
    }).join("");
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WF.W} ${L.H}" width="${WF.W}" height="${L.H}" role="img" aria-label="${esc(title)}"><rect width="${WF.W}" height="${L.H}" fill="${bp ? "#FFFFFF" : th.bg}"/>${bp ? `<defs><pattern id="rvgrid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#E2E8F0" stroke-width=".6"/></pattern></defs><rect width="${WF.W}" height="${L.H}" fill="url(#rvgrid)"/>` : ""}${body}</svg>`, blocks: L.blocks, H: L.H };
  }
  function curThumb(R) {
    const L = R.layout; if (!L || !L.boxes || !L.boxes.length) return "";
    const W = 600, H = Math.round(W / (L.ratio || 16 / 9));
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Your current dashboard layout"><rect width="${W}" height="${H}" fill="#fff" stroke="#CBD5E1"/>${L.boxes.map(b => `<rect x="${b.x / 100 * W + 1}" y="${b.y / 100 * H + 1}" width="${Math.max(4, b.w / 100 * W - 2)}" height="${Math.max(4, b.h / 100 * H - 2)}" rx="3" fill="#F1F5F9" stroke="#94A3B8"/>`).join("")}</svg>`;
  }
  function excalidraw(wire) {
    const els = []; let seed = 1; let oy = 0;
    const base = (o) => Object.assign({ id: "e" + (seed++), angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 1, strokeStyle: "solid", roughness: 1, opacity: 100, groupIds: [], frameId: null, roundness: { type: 3 }, seed: seed * 7, version: 1, versionNonce: seed * 13, isDeleted: false, boundElements: null, updated: 1, link: null, locked: false }, o);
    const txt = (x, y, text, size, color) => base({ type: "text", x, y, width: Math.max(20, text.split("\n").reduce((m, l) => Math.max(m, l.length), 0) * size * 0.55), height: text.split("\n").length * size * 1.25, text, originalText: text, fontSize: size, fontFamily: 2, textAlign: "left", verticalAlign: "top", baseline: size, containerId: null, lineHeight: 1.25, strokeColor: color || "#1e1e1e", roundness: null });
    wire.pages.forEach(pg => {
      els.push(txt(0, oy, `${wire.title} · ${pg.name}`, 28)); oy += 50;
      const L = wireLayout(pg);
      L.blocks.forEach(b => {
        const bg = { title: "#1e1e1e", filter: "#dbe4ff", kpi: "#e6fcf5", text: "#fff9db" }[b.type] || "#ffffff";
        els.push(base({ type: "rectangle", x: b.x, y: oy + b.y, width: b.w, height: b.h, backgroundColor: bg, strokeStyle: b.type === "filter" ? "dashed" : "solid" }));
        const t = `${b.n}. ${b.label}${b.type === "chart" ? ` (${b.chart})` : b.type !== "title" ? ` [${b.type}]` : ""}${b.h > 60 ? "\n" + cut([b.dim && "Axis: " + b.dim, b.mea && "Values: " + b.mea].filter(Boolean).join(" · ") || b.fields || "", Math.floor(b.w / 8)) : ""}`;
        els.push(txt(b.x + 10, oy + b.y + 8, t, b.type === "title" ? 22 : 15, b.type === "title" ? "#ffffff" : "#1e1e1e"));
      });
      oy += L.H + 60;
    });
    return JSON.stringify({ type: "excalidraw", version: 2, source: "https://excalidraw.com", elements: els, appState: { viewBackgroundColor: "#ffffff", gridSize: null }, files: {} });
  }
  let wirePage = 0, wireMode = "mock";
  const doneKey = (R) => SKEY + "_wdone_" + R.ts;
  const getDone = (R) => { try { return JSON.parse(ls.get(doneKey(R)) || "{}"); } catch (e) { return {}; } };
  function wireHtml(R, live) {
    if (!R.review) return "";
    if (!R.wire) return `<h4>🧭 Suggested wireframe</h4>${R.wireError ? `<div class="rv-note warn">${esc(R.wireError)}</div>` : ""}${live ? `<button class="btn-outline" id="rv-wire">✨ Suggest a better wireframe</button>` : ""}`;
    const W = R.wire, pi = Math.min(wirePage, W.pages.length - 1), pg = W.pages[pi], ws = wireSvg(pg, W.title, live ? wireMode : "mock");
    const kindName = KIND_LABEL[R.kind] && R.kind !== "image" ? KIND_LABEL[R.kind] : "Tableau / Power BI";
    const items = ws.blocks.filter(b => b.type !== "title"), done = live ? getDone(R) : {}, nd = items.filter(b => done[pi + ":" + b.n]).length;
    const chip = (k, v) => v ? `<span class="rv-fchip"><b>${k}</b>${esc(v)}</span>` : "";
    const cards = items.map(b => {
      const steps = b.steps && b.steps.length ? b.steps : b.build ? [b.build] : [];
      const id = pi + ":" + b.n;
      return `<div class="rv-bcard ${done[id] ? "done" : ""}" id="rv-bc-${b.n}" data-n="${b.n}">
        <div class="rv-bhead"><span class="rv-bnum">${b.n}</span><b>${esc(b.label)}</b><span class="rv-chip">${esc(b.type === "chart" ? b.chart : b.type)}</span>${live ? `<label class="rv-bdone"><input type="checkbox" data-done="${id}" ${done[id] ? "checked" : ""}> Built</label>` : ""}</div>
        ${b.why ? `<div class="rv-bwhy">❓ <b>Answers:</b> ${esc(b.why)}</div>` : ""}
        <div class="rv-bf">${b.type === "kpi" ? chip("Measure", b.mea || b.fields || b.label) + chip("Compare", b.compare) : b.type === "filter" ? chip("Field", b.fields || b.label) + chip("Values", (b.options || []).join(", ")) : chip(b.type === "table" || b.chart === "table" || b.chart === "matrix" ? "Rows" : "Axis", b.dim) + chip("Values", b.mea) + chip("Colour", b.legend)}${!b.dim && !b.mea && b.type !== "kpi" && b.type !== "filter" ? chip("Fields", b.fields) : ""}</div>
        ${steps.length ? `<div class="rv-bsteps"><b>🛠 Build it in ${esc(kindName)}</b><ol>${steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol></div>` : ""}</div>`;
    }).join("");
    const cur = curThumb(R);
    return `<h4>🧭 Suggested dashboard: ${esc(W.title)}</h4>
      <div class="rv-howto"><div><b>1</b>Look at the mock-up: it shows how your dashboard should look.</div><div><b>2</b>Click any numbered box to see what it answers and how to build it.</div><div><b>3</b>Build each one in ${esc(kindName)} and tick <i>Built</i>.</div><div><b>4</b>Upload again for a new score.</div></div>
      <div class="rv-mute">${W.audience ? "For <b>" + esc(W.audience) + "</b> · " : ""}${pg.read ? esc(pg.read) : "Read it like a page: KPIs on top, the main chart top-left, details at the bottom."} Numbers and names in the mock-up are <b>sample values</b> to show the idea.</div>
      ${W.pages.length > 1 ? `<div class="rv-wtabs">${W.pages.map((p, i) => `<button type="button" class="${i === pi ? "on" : ""}" data-wpage="${i}">Page ${i + 1}: ${esc(p.name)}</button>`).join("")}</div>` : ""}
      ${live ? `<div class="rv-wmode" role="tablist"><button type="button" class="${wireMode === "mock" ? "on" : ""}" data-wmode="mock">🖼️ Mock-up</button><button type="button" class="${wireMode === "blueprint" ? "on" : ""}" data-wmode="blueprint">📐 Blueprint (which field goes where)</button></div>` : ""}
      <div class="rv-wire">${ws.svg}</div>
      ${live ? `<div class="rv-row"><button class="btn-outline" id="rv-wpng">⬇️ PNG</button><button class="btn-outline" id="rv-wsvg">⬇️ SVG</button><button class="btn-outline" id="rv-wex" title="Download an .excalidraw file and open excalidraw.com (free) to edit it">✏️ Edit in Excalidraw</button><button class="btn-outline" id="rv-wire">🔄 New suggestion</button></div>` : ""}
      ${cur ? `<details class="rv-cmp"><summary>Compare with your current dashboard</summary><div class="rv-cmpg"><div><div class="rv-mute">Your dashboard now</div>${cur}</div><div><div class="rv-mute">Suggested</div>${wireSvg(pg, W.title, "mock").svg}</div></div></details>` : ""}
      <h4>🧱 Build guide ${live ? `<span class="rv-bprog"><i style="width:${items.length ? nd / items.length * 100 : 0}%"></i></span><span class="rv-mute">${nd} of ${items.length} built</span>` : ""}</h4>
      <div class="rv-bgrid">${cards}</div>
      ${W.changes.length ? `<h4>🔁 What to change from your current dashboard</h4><ol class="rv-list">${W.changes.map(c => `<li>${esc(c)}</li>`).join("")}</ol>` : ""}
      ${W.tips.length ? `<h4>💡 Design tips</h4><ul class="rv-list">${W.tips.map(c => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}`;
  }
  function saveBlob(blob, name) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); }
  function bindWire() {
    const R = state.result; if (!R) return;
    document.querySelectorAll("#rv-root [data-wpage]").forEach(b => b.addEventListener("click", () => { wirePage = +b.dataset.wpage; render(); setTimeout(() => { const w = document.querySelector(".rv-wire"); if (w) w.scrollIntoView({ block: "center" }); }, 30); }));
    document.querySelectorAll("#rv-root [data-wmode]").forEach(b => b.addEventListener("click", () => { wireMode = b.dataset.wmode; const y = window.scrollY; render(); window.scrollTo(0, y); }));
    document.querySelectorAll("#rv-root .rv-wire .rv-wb").forEach(g => g.addEventListener("click", () => { const c = document.getElementById("rv-bc-" + g.dataset.n); if (!c) return; document.querySelectorAll("#rv-root .rv-bcard.hl").forEach(x => x.classList.remove("hl")); c.classList.add("hl"); c.scrollIntoView({ block: "center", behavior: "smooth" }); }));
    document.querySelectorAll("#rv-root .rv-bcard").forEach(c => c.addEventListener("mouseenter", () => { document.querySelectorAll("#rv-root .rv-wire .rv-wb").forEach(g => g.classList.toggle("dim", g.dataset.n !== c.dataset.n)); }));
    document.querySelectorAll("#rv-root .rv-bgrid").forEach(gr => gr.addEventListener("mouseleave", () => document.querySelectorAll("#rv-root .rv-wire .rv-wb").forEach(g => g.classList.remove("dim"))));
    document.querySelectorAll("#rv-root [data-done]").forEach(cb => cb.addEventListener("change", () => { const d = getDone(R); if (cb.checked) d[cb.dataset.done] = 1; else delete d[cb.dataset.done]; ls.set(doneKey(R), JSON.stringify(d)); const y = window.scrollY; render(); window.scrollTo(0, y); }));
    const nm = () => (R.file.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "_") || "dashboard") + "-wireframe";
    const svgNow = () => wireSvg(R.wire.pages[Math.min(wirePage, R.wire.pages.length - 1)], R.wire.title, wireMode);
    const s1 = $("rv-wsvg"); if (s1) s1.addEventListener("click", () => saveBlob(new Blob([svgNow().svg], { type: "image/svg+xml" }), nm() + ".svg"));
    const s2 = $("rv-wpng"); if (s2) s2.addEventListener("click", () => { const w = svgNow(); const img = new Image(); img.onload = () => { const c = document.createElement("canvas"); c.width = WF.W * 2; c.height = w.H * 2; const g = c.getContext("2d"); g.scale(2, 2); g.drawImage(img, 0, 0); c.toBlob(b => saveBlob(b, nm() + ".png"), "image/png"); }; img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(w.svg); });
    const s3 = $("rv-wex"); if (s3) s3.addEventListener("click", () => { saveBlob(new Blob([excalidraw(R.wire)], { type: "application/json" }), nm() + ".excalidraw"); setTimeout(() => { if (confirm("The .excalidraw file is downloaded.\n\nExcalidraw (free) will open now: click the menu ☰ → Open, and choose the downloaded file. You can then move boxes, rename charts and export.")) window.open("https://excalidraw.com/", "_blank", "noopener"); }, 300); });
    const s4 = $("rv-wire"); if (s4) s4.addEventListener("click", () => makeWire(R, true));
  }
  async function makeWire(R, manual) {
    if (!R || !R.review || !R.ctx) { if (R && !R.ctx) { R.wireError = "Run the review again to get a wireframe for this older review."; render(); } return; }
    if (manual) { R.wireError = "⏳ Designing a better wireframe…"; R.wire = null; render(); }
    let r = null, j = {};
    try {
      r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "wireframe", kind: R.kind, summary: R.ctx.summary, layout: R.ctx.layout, project: R.ctx.project,
        issues: R.review.issues.map((i, k) => `${k + 1}. [${i.severity}] ${i.title}${i.target ? " (on " + i.target + ")" : ""}: ${i.fix}`).join("\n") + (R.review.missing.length ? "\nMissing: " + R.review.missing.join("; ") : "") }) });
      j = await r.json().catch(() => ({}));
    } catch (e) { r = null; }
    if (r && r.ok && j.wireframe) { R.wire = j.wireframe; R.wireError = ""; wirePage = 0; }
    else R.wireError = (j && j.message) || "The wireframe could not be generated. Click the button to try again.";
    const a = hist.all(); const k = a.findIndex(h => h.ts === R.ts); if (k >= 0) { a[k] = slim(R); hist.save(a); }
    if (state.result === R) render();
  }
  function slim(R) { const o = Object.assign({}, R); delete o.ctx; if (o.shot && o.shot.length > 260000) delete o.shot; return o; }
  async function thumb(dataUrl) {
    return new Promise(ok => { const i = new Image(); i.onload = () => { const sc = Math.min(1, 1000 / i.naturalWidth); const c = document.createElement("canvas"); c.width = Math.round(i.naturalWidth * sc); c.height = Math.round(i.naturalHeight * sc); c.getContext("2d").drawImage(i, 0, 0, c.width, c.height); ok(c.toDataURL("image/jpeg", 0.6)); }; i.onerror = () => ok(null); i.src = dataUrl; });
  }
  const RCSS = `body{font-family:Inter,Segoe UI,Arial,sans-serif;max-width:900px;margin:24px auto;padding:0 16px;color:#0F172A;line-height:1.5}h3{margin:4px 0}h4{margin:20px 0 6px}.rv-mute{color:#64748B;font-size:13px}.rv-tag,.rv-chip{display:inline-block;font-size:11px;padding:1px 8px;border-radius:20px;background:#EEF2F7;margin-left:6px}.rv-score{display:flex;gap:18px;align-items:center;margin:14px 0}.rv-dial{width:96px;height:96px;border-radius:50%;border:6px solid #16A34A;display:flex;flex-direction:column;align-items:center;justify-content:center}.rv-dial.a{border-color:#D97706}.rv-dial.r{border-color:#DC2626}.rv-dial b{font-size:30px}.rv-bar{margin:8px 0}.rv-bl{display:flex;justify-content:space-between;font-size:14px}.rv-bt{height:8px;background:#EEF2F7;border-radius:4px}.rv-bt i{display:block;height:100%;background:#1F9E8B;border-radius:4px}.rv-bc{font-size:12.5px;color:#475569}.rv-issue{border:1px solid #E2E8F0;border-left:4px solid #94A3B8;border-radius:8px;padding:10px 12px;margin:8px 0;font-size:13.5px}.rv-issue.critical{border-left-color:#DC2626}.rv-issue.high{border-left-color:#EA580C}.rv-issue.medium{border-left-color:#CA8A04}.rv-issue.low{border-left-color:#2563EB}.rv-code{white-space:pre-wrap;background:#F1F5F9;padding:8px;border-radius:6px;font-size:12px}.rv-stats{display:flex;gap:10px;flex-wrap:wrap}.rv-stats div{border:1px solid #E2E8F0;border-radius:8px;padding:6px 12px;text-align:center}.rv-stats b{display:block;font-size:18px}.rv-stats span{font-size:11.5px;color:#64748B}.rv-d.up{color:#16A34A}.rv-d.dn{color:#DC2626}.rv-acts{display:none}.rv-pin{display:inline-block;min-width:18px;padding:0 5px;border-radius:10px;background:#DC2626;color:#fff;font-size:11px;font-weight:700;text-align:center;margin-right:4px}.rv-shotwrap{position:relative}.rv-shotwrap img{width:100%;display:block}.rv-hot{position:absolute;border:3px solid #DC2626;border-radius:6px}.rv-hot .rv-pin{position:absolute;top:-10px;left:-10px}.rv-cur,.rv-wire svg{width:100%;height:auto}.rv-wlist{padding-left:26px;font-size:13.5px}.rv-wlist li{margin-bottom:6px}.rv-build{font-size:12px;color:#475569}.rv-wire svg{width:100%;height:auto;display:block;border:1px solid #E2E8F0;border-radius:10px}.rv-howto{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:8px 0}.rv-howto div{background:#EEF4F8;border-radius:8px;padding:8px;font-size:12px}.rv-bgrid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.rv-bcard{border:1px solid #E2E8F0;border-radius:10px;padding:10px;break-inside:avoid}.rv-bhead{display:flex;gap:8px;align-items:center;margin-bottom:4px}.rv-bnum{display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;border-radius:50%;background:#2856A3;color:#fff;font-size:12px;font-weight:700}.rv-bwhy{font-size:12.5px;margin:4px 0}.rv-fchip{display:inline-block;font-size:11.5px;background:#F6F7F5;border:1px solid #E2E8F0;border-radius:6px;padding:2px 6px;margin:2px}.rv-fchip b{margin-right:4px}.rv-bsteps{font-size:12.5px;background:#F6F7F5;border-radius:6px;padding:6px 8px;margin-top:6px}.rv-bsteps ol{margin:4px 0 0;padding-left:18px}.rv-cmp{display:none}`;

  function bind() {
    const pick = (id, inp) => { const d = $(id), i = $(inp); if (!d || !i) return;
      d.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); i.click(); } });
      ["dragover", "dragenter"].forEach(ev => d.addEventListener(ev, e => { e.preventDefault(); d.classList.add("over"); }));
      ["dragleave", "drop"].forEach(ev => d.addEventListener(ev, e => { e.preventDefault(); d.classList.remove("over"); }));
      d.addEventListener("drop", e => { const f = e.dataTransfer.files[0]; if (f) choose(f, inp === "rv-shot"); });
      i.addEventListener("change", () => { if (i.files[0]) choose(i.files[0], inp === "rv-shot"); }); };
    pick("rv-drop", "rv-file"); pick("rv-drop2", "rv-shot");
    document.querySelectorAll("#rv-root [data-clear]").forEach(b => b.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); state[b.dataset.clear] = null; state.error = ""; render(); }));
    const n = $("rv-notes"); if (n) n.addEventListener("input", () => { state.notes = n.value; });
    const go = $("rv-go"); if (go) go.addEventListener("click", run);
    document.querySelectorAll("#rv-root [data-open]").forEach(b => b.addEventListener("click", () => { state.result = hist.all()[+b.dataset.open]; state.error = ""; render(); setTimeout(() => { const o = $("rv-report"); if (o) o.scrollIntoView({ behavior: "smooth" }); }, 50); }));
    document.querySelectorAll("#rv-root [data-del]").forEach(b => b.addEventListener("click", () => { if (!confirm("Delete this review?")) return; const a = hist.all(); const [x] = a.splice(+b.dataset.del, 1); hist.save(a); if (state.result && x && state.result.ts === x.ts) state.result = null; render(); }));
    bindWire();
    const pr = $("rv-print"); if (pr) pr.addEventListener("click", () => { document.body.classList.add("rv-printing"); window.print(); setTimeout(() => document.body.classList.remove("rv-printing"), 500); });
    const dl = $("rv-dl"); if (dl) dl.addEventListener("click", () => {
      const R = state.result; const html = `<!doctype html><html><head><meta charset="utf-8"><title>Dashboard review · ${esc(R.file)}</title><style>${RCSS}</style></head><body>${reportHtml(R, false)}</body></html>`;
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([html], { type: "text/html" })); a.download = `Dashboard-Review-${R.file.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "_")}-${new Date(R.ts).toISOString().slice(0, 10)}.html`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
  }
  async function choose(f, asShot) {
    state.error = "";
    try {
      const t = await sniff(f);
      if (asShot) { if (t.kind !== "image") throw new Error("The screenshot box takes PNG, JPG or WEBP images only."); state.shot = f; }
      else if (t.kind === "image" && state.main) state.shot = f;
      else state.main = { file: f, kind: t.kind, ext: t.ext };
    } catch (e) { state.error = e.message; }
    state.result = null; render();
  }
  async function run() {
    if (state.busy) return; state.busy = true; state.error = ""; state.result = null; state.step = 0; render();
    const step = (i) => { state.step = i; render(); };
    try {
      const main = state.main || { file: state.shot, kind: "image", ext: "png" };
      await sniff(main.file);
      step(1);
      let P = { kind: "image", summary: "", facts: [], names: [], stats: [], limits: [] };
      if (main.kind === "tableau") P = await withTimeout(readTableau(main.file, main.ext), 45000, "Reading the workbook took too long. Try the .twb, or a smaller file.");
      else if (main.kind === "excel") P = await withTimeout(readExcel(main.file, main.ext), 45000, "Reading the workbook took too long.");
      else if (main.kind === "powerbi") P = await withTimeout(readPowerBI(main.file, main.ext), 45000, "Reading the report took too long. Try a .pbit template.");
      const shotFile = main.kind === "image" ? main.file : state.shot;
      const shot = shotFile ? await shrinkImage(shotFile) : null;
      if (main.kind === "image") P.limits.push("Only a screenshot was reviewed: formulas, measures, data model and filters could not be checked. Upload the workbook too for a full review.");
      step(2);
      const proj = projectInfo(); const coverage = main.kind === "image" ? null : kpiCoverage(proj.kpis, P.names);
      const facts = P.facts.slice(); if (coverage) facts.push(`KPI names matched in the file: ${coverage.found.length} of ${coverage.total} project KPIs (simple name matching).`);
      const stu = me();
      const R = { ts: Date.now(), file: main.file.name, kind: main.kind, project: proj.name, student: stu ? [stu.name, stu.group, stu.batch].filter(Boolean).join(" · ") : "", facts, stats: P.stats, limits: P.limits, coverage: coverage ? { found: coverage.found.map(k => ({ name: k.name })), missing: coverage.missing.map(k => ({ name: k.name })), total: coverage.total } : null, review: null };
      const layoutTxt = P.layout ? `Dashboard "${P.layout.name}": ` + P.layout.boxes.slice(0, 40).map(b => `${b.label} [${b.kind}] at x${Math.round(b.x)} y${Math.round(b.y)} size ${Math.round(b.w)}x${Math.round(b.h)}`).join("; ") : "";
      R.layout = P.layout || null; R.ctx = { summary: P.summary.slice(0, 6000), layout: layoutTxt, project: { name: proj.name, context: proj.context.slice(0, 5000) } };
      if (shot) R.shot = await thumb(shot.dataUrl);
      step(3);
      if (state.ai !== false) {
        let r = null, j = {};
        try {
          r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: main.kind, fileName: main.file.name, summary: P.summary, facts, layout: layoutTxt, project: { name: proj.name, context: proj.context }, notes: state.notes || "", image: shot ? shot.dataUrl : undefined, weights: CFG.weights }) });
          j = await r.json().catch(() => ({}));
        } catch (e) { r = null; }
        if (r && r.ok && j.review) R.review = j.review;
        else R.aiError = ((j && j.message) || (r ? (r.status === 404 ? "the review service is not deployed on this site yet" : "error " + r.status) : "no internet connection")) + (j && j.detail ? ` (details: ${j.detail})` : "");
      } else R.aiError = "AI review is not switched on for this site yet";
      const prev = R.review ? hist.all().find(h => h.kind === R.kind && h.review) : null;
      if (prev) R.prev = { overall: prev.review.overall, categories: prev.review.categories.map(c => ({ id: c.id, score: c.score })) };
      if (R.review) { const a = hist.all(); a.unshift(slim(R)); hist.save(a); try { window.dispatchEvent(new Event("hub-progress")); } catch (e) {} step(4); wirePage = 0; await makeWire(R, false); }
      state.result = R; step(5);
    } catch (e) { state.error = e.message || String(e); }
    state.busy = false; render();
    setTimeout(() => { const o = $("rv-report"); if (o) o.scrollIntoView({ behavior: "smooth", block: "start" }); }, 60);
  }

  const css = document.createElement("style");
  css.textContent = `#rv-root .rv-grid{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:18px;align-items:start}
  @media(max-width:900px){#rv-root .rv-grid{grid-template-columns:1fr}}
  #rv-root .rv-card{padding:20px}#rv-root h3{margin:0 0 10px;font-size:16px}#rv-root .rv-mt{margin-top:18px}
  #rv-root .rv-mute,#rv-report .rv-mute{color:var(--ink-muted,#64748B);font-size:12.5px;font-weight:400}
  .rv-drop{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;text-align:center;border:2px dashed var(--line,#CBD5E1);border-radius:12px;padding:26px 16px;cursor:pointer;background:rgba(31,158,139,.03);transition:.15s}
  .rv-drop.small{padding:14px;font-size:13.5px}.rv-drop:hover,.rv-drop.over,.rv-drop:focus{border-color:var(--teal,#1F9E8B);background:rgba(31,158,139,.08);outline:none}.rv-big{font-size:28px}
  .rv-file{display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:center}
  .rv-x{border:1px solid var(--line,#CBD5E1);background:transparent;border-radius:6px;cursor:pointer;padding:1px 7px;color:inherit}
  #rv-notes{width:100%;box-sizing:border-box;border:1px solid var(--line,#CBD5E1);border-radius:8px;padding:10px;font:inherit;font-size:13.5px;background:transparent;color:inherit}
  .rv-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:14px}#rv-go[disabled]{opacity:.5;cursor:not-allowed}
  .rv-note{margin-top:12px;padding:10px 12px;border-radius:8px;font-size:13.5px}.rv-note.err{background:#FEF2F2;color:#991B1B;border:1px solid #FECACA}.rv-note.warn{background:#FFFBEB;color:#92400E;border:1px solid #FDE68A;margin-bottom:14px}
  .rv-steps{list-style:none;padding:0;margin:14px 0 0;font-size:13.5px}.rv-steps li{padding:3px 0;color:var(--ink-muted,#64748B)}.rv-steps li.done{color:#15803D}.rv-steps li.now{color:inherit;font-weight:600}
  .rv-privacy{font-size:12px;color:var(--ink-muted,#64748B);margin:16px 0 0;line-height:1.5}
  .rv-cats,.rv-sup,.rv-hist{list-style:none;padding:0;margin:0;font-size:13.5px}.rv-cats li{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--line,#E2E8F0)}.rv-cats li.tot{font-weight:700;border:0}
  .rv-sup li{padding:4px 0;line-height:1.45}.rv-hist li{display:flex;gap:6px;margin-bottom:6px}.rv-hist li>button:first-child{flex:1;text-align:left;border:1px solid var(--line,#E2E8F0);background:transparent;border-radius:8px;padding:7px 10px;cursor:pointer;color:inherit;font:inherit;font-size:13px;display:flex;flex-direction:column}
  #rv-out{margin-top:18px}.rv-report{padding:22px 24px}.rv-rhead{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start}.rv-rhead h3{font-size:19px;margin:4px 0}.rv-acts{display:flex;gap:8px}
  .rv-tag,.rv-chip{display:inline-block;font-size:11px;font-weight:600;padding:1px 8px;border-radius:20px;background:rgba(100,116,139,.12);margin-left:6px;vertical-align:middle}
  .rv-chip.critical{background:#FEE2E2;color:#991B1B}.rv-chip.high{background:#FFEDD5;color:#9A3412}.rv-chip.medium{background:#FEF9C3;color:#854D0E}.rv-chip.low{background:#DBEAFE;color:#1E40AF}.rv-chip.st-verified{background:#DCFCE7;color:#166534}.rv-chip.st-not_checked{background:#F1F5F9;color:#475569}
  .rv-score{display:flex;gap:20px;align-items:center;margin:16px 0}.rv-score p{margin:6px 0}
  .rv-dial{flex:none;width:104px;height:104px;border-radius:50%;border:7px solid #16A34A;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1}.rv-dial.a{border-color:#D97706}.rv-dial.r{border-color:#DC2626}.rv-dial b{font-size:32px}.rv-dial span{font-size:12px;color:var(--ink-muted,#64748B)}
  .rv-band{font-weight:700;font-size:16px}.rv-band.g{color:#15803D}.rv-band.a{color:#B45309}.rv-band.r{color:#B91C1C}.rv-d{font-size:12px;font-weight:700;margin-left:4px}.rv-d.up{color:#16A34A}.rv-d.dn{color:#DC2626}
  .rv-bars{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px 22px;margin:8px 0 6px}.rv-bl{display:flex;justify-content:space-between;gap:8px;font-size:13.5px}.rv-bt{height:8px;background:rgba(100,116,139,.15);border-radius:4px;margin:5px 0}.rv-bt i{display:block;height:100%;background:var(--teal,#1F9E8B);border-radius:4px}.rv-bc{font-size:12.5px;color:var(--ink-muted,#64748B)}
  .rv-report h4{margin:22px 0 8px;font-size:15px}.rv-stats{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px}.rv-stats div{border:1px solid var(--line,#E2E8F0);border-radius:10px;padding:8px 14px;text-align:center;min-width:84px}.rv-stats b{display:block;font-size:20px}.rv-stats span{font-size:11.5px;color:var(--ink-muted,#64748B)}
  .rv-facts,.rv-list{margin:0;padding-left:20px;font-size:13.5px;line-height:1.55}.rv-cov{margin-top:10px;font-size:13.5px;padding:10px 12px;border-radius:8px;background:rgba(31,158,139,.07)}
  .rv-issue{border:1px solid var(--line,#E2E8F0);border-left:4px solid #94A3B8;border-radius:10px;padding:12px 14px;margin:10px 0;font-size:13.5px;line-height:1.5}.rv-issue.critical{border-left-color:#DC2626}.rv-issue.high{border-left-color:#EA580C}.rv-issue.medium{border-left-color:#CA8A04}.rv-issue.low{border-left-color:#2563EB}
  .rv-issue em{font-style:normal;font-weight:600}.rv-ih{margin-bottom:4px}.rv-code{white-space:pre-wrap;background:rgba(15,23,42,.06);padding:8px 10px;border-radius:6px;font-size:12px;margin:6px 0 0;overflow-x:auto}
  .rv-check{list-style:none;padding:0;margin:0;font-size:13.5px}.rv-check li{padding:3px 0}.rv-foot{margin-top:18px}
  .rv-pin{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#DC2626;color:#fff;font-size:11.5px;font-weight:700;margin-right:4px;vertical-align:middle}
  .rv-shotwrap{position:relative;border:1px solid var(--line,#E2E8F0);border-radius:8px;overflow:hidden;margin-bottom:6px}.rv-shotwrap img{display:block;width:100%;height:auto}
  .rv-hot{position:absolute;border:3px solid #DC2626;border-radius:6px;background:rgba(220,38,38,.08)}.rv-hot.medium{border-color:#CA8A04;background:rgba(202,138,4,.08)}.rv-hot.low{border-color:#2563EB;background:rgba(37,99,235,.06)}.rv-hot .rv-pin{position:absolute;top:-10px;left:-10px}
  .rv-cur{width:100%;height:auto;display:block;border-radius:8px;margin-bottom:6px}
  .rv-wire{border:1px solid var(--line,#E2E8F0);border-radius:12px;overflow:auto;background:#F5F7FA;margin:8px 0;box-shadow:0 6px 20px rgba(16,24,38,.06)}.rv-wire svg{display:block;width:100%;min-width:720px;height:auto}
  .rv-wire .rv-wb{cursor:pointer;transition:opacity .2s}.rv-wire .rv-wb:hover>rect:first-child{stroke:var(--teal,#0E86C9);stroke-width:2}.rv-wire .rv-wb.dim{opacity:.35}
  .rv-howto{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:8px 0}.rv-howto div{background:var(--teal-tint,#E6F3FA);border-radius:10px;padding:9px 10px;font-size:12.5px;line-height:1.4}.rv-howto b{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;background:var(--teal,#0E86C9);color:#fff;font-size:11px;margin-right:6px}
  .rv-wmode{display:inline-flex;border:1px solid var(--line,#CBD5E1);border-radius:10px;overflow:hidden;margin:8px 0 2px}.rv-wmode button{border:0;background:transparent;padding:7px 12px;cursor:pointer;font:inherit;font-size:13px;color:inherit}.rv-wmode button.on{background:var(--teal,#0E86C9);color:#fff}
  .rv-cmp{margin:8px 0}.rv-cmp summary{cursor:pointer;font-weight:600;font-size:13.5px}.rv-cmpg{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px}.rv-cmpg svg{width:100%;height:auto;display:block;border-radius:8px;border:1px solid var(--line,#E2E8F0)}
  .rv-bgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px;margin-top:6px}
  .rv-bcard{border:1px solid var(--line,#E2E8F0);border-radius:12px;padding:12px;background:var(--paper-raised,#fff);transition:box-shadow .2s,border-color .2s}.rv-bcard.hl{border-color:var(--teal,#0E86C9);box-shadow:0 0 0 3px var(--teal-tint,#E6F3FA)}.rv-bcard.done{opacity:.72}.rv-bcard.done .rv-bnum{background:#15803D}
  .rv-bhead{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px}.rv-bnum{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:50%;background:var(--blue,#2856A3);color:#fff;font-size:12px;font-weight:700}.rv-bdone{margin-left:auto;font-size:12.5px;display:flex;align-items:center;gap:4px;cursor:pointer}
  .rv-bwhy{font-size:13px;margin:4px 0 8px;line-height:1.45}.rv-bf{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}.rv-fchip{font-size:12px;background:var(--paper,#F6F7F5);border:1px solid var(--line,#E2E8F0);border-radius:8px;padding:3px 8px}.rv-fchip b{color:var(--teal,#0E86C9);margin-right:5px;font-size:11px;text-transform:uppercase;letter-spacing:.03em}
  .rv-bsteps{font-size:12.8px;background:var(--paper,#F6F7F5);border-radius:8px;padding:8px 10px}.rv-bsteps ol{margin:6px 0 0;padding-left:18px}.rv-bsteps li{margin:3px 0;line-height:1.4}
  .rv-bprog{display:inline-block;vertical-align:middle;width:120px;height:8px;border-radius:99px;background:var(--line,#E2E8F0);overflow:hidden;margin:0 8px 0 10px}.rv-bprog i{display:block;height:100%;background:#15803D}
  @media(max-width:700px){.rv-howto{grid-template-columns:1fr 1fr}.rv-cmpg{grid-template-columns:1fr}}
  .rv-wtabs{display:flex;gap:6px;margin:8px 0}.rv-wtabs button{border:1px solid var(--line,#CBD5E1);background:transparent;border-radius:20px;padding:4px 12px;cursor:pointer;color:inherit;font:inherit;font-size:13px}.rv-wtabs button.on{background:#7C3AED;color:#fff;border-color:#7C3AED}
  .rv-wlist{padding-left:26px;font-size:13.5px;line-height:1.5;margin:10px 0 0}.rv-wlist li{margin-bottom:8px}.rv-wlist li::marker{color:#7C3AED;font-weight:700}.rv-build{font-size:12.5px;color:var(--ink-muted,#475569);background:rgba(124,58,237,.06);border-radius:6px;padding:3px 8px;margin-top:3px;display:inline-block}
  @media(max-width:600px){.rv-score{flex-direction:column;align-items:flex-start}.rv-report{padding:16px}}
  @media print{body.rv-printing *{visibility:hidden}body.rv-printing #rv-report,body.rv-printing #rv-report *{visibility:visible}body.rv-printing #rv-report{position:absolute;left:0;top:0;width:100%;box-shadow:none;border:0}body.rv-printing .rv-acts{display:none}}`;
  document.head.appendChild(css);

  function init() {
    if (!$("rv-root")) return;
    render();
    if (/^https?:$/.test(location.protocol)) fetch(API, { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(j => { state.ai = !!(j && j.configured); render(); }).catch(() => { state.ai = false; render(); });
    else { state.ai = false; render(); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();

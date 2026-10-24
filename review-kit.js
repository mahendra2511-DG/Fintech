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

  /* ---- wireframe SVG ---- */
  const WF = { W: 1200, pad: 16, gap: 12, unit: 66, top: 0 };
  function wireLayout(page) {
    const colW = (WF.W - 2 * WF.pad - 11 * WF.gap) / 12; let y = WF.pad, n = 0; const out = [];
    page.rows.forEach(row => {
      const h = row.h * WF.unit + (row.h - 1) * WF.gap; let c = 0;
      row.blocks.forEach(b => { const x = WF.pad + c * (colW + WF.gap), w = b.span * colW + (b.span - 1) * WF.gap; out.push(Object.assign({}, b, { x, y, w, h, n: ++n })); c += b.span; });
      y += h + WF.gap;
    });
    return { blocks: out, H: y + WF.pad - WF.gap };
  }
  function mini(b, x, y, w, h) {   // tiny placeholder drawing for each chart type
    const g = "#CBD5E1", a = "#1F9E8B", t = b.chart; let s = "";
    const bars = (k, horiz) => { for (let i = 0; i < k; i++) { const v = [0.9, 0.7, 0.55, 0.45, 0.35, 0.28][i % 6]; if (horiz) { const bh = h / k * 0.6; s += `<rect x="${x}" y="${y + i * h / k}" width="${w * v}" height="${bh}" rx="3" fill="${i ? g : a}"/>`; } else { const bw = w / k * 0.6; s += `<rect x="${x + i * w / k}" y="${y + h * (1 - v)}" width="${bw}" height="${h * v}" rx="3" fill="${i === 2 ? a : g}"/>`; } } };
    if (/^(bar|stacked-bar|bullet)$/.test(t)) bars(5, true);
    else if (/^(column|histogram|waterfall)$/.test(t)) bars(7, false);
    else if (/^(line|area|combo)$/.test(t)) { const pts = [0.6, 0.45, 0.55, 0.3, 0.4, 0.2, 0.25].map((v, i) => `${x + i * w / 6},${y + h * v}`).join(" "); if (t === "combo") bars(7, false); s += t === "area" ? `<polygon points="${x},${y + h} ${pts} ${x + w},${y + h}" fill="#CCEFE9"/>` : ""; s += `<polyline points="${pts}" fill="none" stroke="${a}" stroke-width="3"/>`; }
    else if (/^(pie|donut|gauge)$/.test(t)) { const r = Math.min(w, h) / 2, cx = x + w / 2, cy = y + h / 2; s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${g}"/><path d="M${cx},${cy} L${cx},${cy - r} A${r},${r} 0 0,1 ${cx + r * 0.95},${cy + r * 0.31} Z" fill="${a}"/>${t !== "pie" ? `<circle cx="${cx}" cy="${cy}" r="${r * 0.55}" fill="#fff"/>` : ""}`; }
    else if (t === "map") { s += `<path d="M${x + w * .1},${y + h * .5} q${w * .15},-${h * .45} ${w * .4},-${h * .3} t${w * .45},${h * .1} q-${w * .05},${h * .5} -${w * .4},${h * .55} t-${w * .45},-${h * .35}z" fill="${g}"/><circle cx="${x + w * .35}" cy="${y + h * .4}" r="6" fill="${a}"/><circle cx="${x + w * .65}" cy="${y + h * .55}" r="9" fill="${a}"/>`; }
    else if (t === "scatter") { for (let i = 0; i < 12; i++) s += `<circle cx="${x + ((i * 37) % 100) / 100 * w}" cy="${y + h - ((i * 53) % 100) / 100 * h}" r="4" fill="${i % 4 ? g : a}"/>`; }
    else if (t === "funnel") { for (let i = 0; i < 4; i++) { const ww = w * (1 - i * 0.2); s += `<rect x="${x + (w - ww) / 2}" y="${y + i * h / 4}" width="${ww}" height="${h / 4 - 4}" fill="${i ? g : a}"/>`; } }
    else { const cr = Math.max(2, Math.min(6, Math.floor(h / 18))), cc = t === "table" || t === "matrix" ? 4 : 5; for (let i = 0; i < cr; i++) for (let j = 0; j < cc; j++) s += `<rect x="${x + j * w / cc}" y="${y + i * h / cr}" width="${w / cc - 3}" height="${h / cr - 3}" fill="${i === 0 && /table|matrix/.test(t) ? "#94A3B8" : (t === "heatmap" || t === "treemap") && (i + j) % 3 === 0 ? a : "#E2E8F0"}"/>`; }
    return s;
  }
  function wireSvg(page, title) {
    const L = wireLayout(page); const F = 'font-family="Arial, Helvetica, sans-serif"';
    const body = L.blocks.map(b => {
      const { x, y, w, h } = b; let inner = "";
      const label = (fs, yy) => `<text x="${x + 12}" y="${y + yy}" font-size="${fs}" font-weight="700" fill="#0F172A" ${F}>${esc(cut(b.label, Math.floor(w / (fs * 0.58))))}</text>`;
      const sub = (yy) => b.fields ? `<text x="${x + 12}" y="${y + yy}" font-size="11" fill="#64748B" ${F}>${esc(cut(b.fields, Math.floor(w / 6.2)))}</text>` : "";
      if (b.type === "title") inner = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#0F172A"/><text x="${x + 16}" y="${y + Math.min(h / 2 + 8, 40)}" font-size="22" font-weight="700" fill="#fff" ${F}>${esc(cut(b.label, Math.floor(w / 12)))}</text>`;
      else if (b.type === "filter") inner = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#EFF6FF" stroke="#2563EB" stroke-dasharray="6 4"/><text x="${x + 12}" y="${y + 18}" font-size="10" fill="#2563EB" ${F}>FILTER</text><rect x="${x + 12}" y="${y + 26}" width="${w - 24}" height="${Math.min(30, h - 34)}" rx="6" fill="#fff" stroke="#93C5FD"/><text x="${x + 22}" y="${y + 26 + Math.min(30, h - 34) / 2 + 5}" font-size="13" fill="#0F172A" ${F}>${esc(cut(b.label, Math.floor((w - 50) / 7)))}</text><text x="${x + w - 26}" y="${y + 26 + Math.min(30, h - 34) / 2 + 5}" font-size="12" fill="#2563EB" ${F}>▾</text>`;
      else if (b.type === "kpi") inner = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#fff" stroke="#CBD5E1"/><rect x="${x}" y="${y}" width="${w}" height="4" rx="2" fill="#1F9E8B"/><text x="${x + 12}" y="${y + 22}" font-size="11" font-weight="700" fill="#475569" ${F}>${esc(cut(b.label.toUpperCase(), Math.floor(w / 7)))}</text><text x="${x + 12}" y="${y + Math.min(h - 12, 54)}" font-size="${h > 60 ? 26 : 20}" font-weight="700" fill="#94A3B8" ${F}>##.#</text>`;
      else if (b.type === "text") inner = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#FFFBEB" stroke="#FCD34D"/>${label(13, 22)}${[0, 1, 2].filter(i => 34 + i * 14 < h - 6).map(i => `<rect x="${x + 12}" y="${y + 34 + i * 14}" width="${(w - 24) * (1 - i * 0.2)}" height="6" rx="3" fill="#FDE68A"/>`).join("")}`;
      else if (b.type === "legend" || b.type === "nav") inner = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#F8FAFC" stroke="#CBD5E1"/>${label(12, 20)}${[0, 1, 2].map(i => `<rect x="${x + 12 + i * Math.min(70, (w - 24) / 3)}" y="${y + 30}" width="${Math.min(60, (w - 36) / 3)}" height="${Math.max(8, Math.min(18, h - 40))}" rx="4" fill="${i ? "#E2E8F0" : "#1F9E8B"}"/>`).join("")}`;
      else { const top = b.fields ? 44 : 32; inner = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#fff" stroke="#CBD5E1"/>${label(14, 22)}${sub(37)}${h - top - 14 > 16 ? mini(b, x + 14, y + top, w - 28, h - top - 14) : ""}`; }
      return `<g>${inner}<g transform="translate(${x + w - 16},${y + 14})"><circle r="11" fill="#7C3AED"/><text text-anchor="middle" y="4" font-size="11" font-weight="700" fill="#fff" ${F}>${b.n}</text></g></g>`;
    }).join("");
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WF.W} ${L.H}" width="${WF.W}" height="${L.H}" role="img" aria-label="${esc(title)}"><rect width="${WF.W}" height="${L.H}" fill="#F1F5F9"/>${body}</svg>`, blocks: L.blocks, H: L.H };
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
        const t = `${b.n}. ${b.label}${b.type === "chart" ? ` (${b.chart})` : b.type !== "title" ? ` [${b.type}]` : ""}${b.fields && b.h > 60 ? "\n" + cut(b.fields, Math.floor(b.w / 8)) : ""}`;
        els.push(txt(b.x + 10, oy + b.y + 8, t, b.type === "title" ? 22 : 15, b.type === "title" ? "#ffffff" : "#1e1e1e"));
      });
      oy += L.H + 60;
    });
    return JSON.stringify({ type: "excalidraw", version: 2, source: "https://excalidraw.com", elements: els, appState: { viewBackgroundColor: "#ffffff", gridSize: null }, files: {} });
  }
  let wirePage = 0;
  function wireHtml(R, live) {
    if (!R.review) return "";
    if (!R.wire) return `<h4>🧭 Suggested wireframe</h4>${R.wireError ? `<div class="rv-note warn">${esc(R.wireError)}</div>` : ""}${live ? `<button class="btn-outline" id="rv-wire">✨ Suggest a better wireframe</button>` : ""}`;
    const W = R.wire, pg = W.pages[Math.min(wirePage, W.pages.length - 1)], ws = wireSvg(pg, W.title);
    return `<h4>🧭 Suggested wireframe: ${esc(W.title)}</h4>
      <div class="rv-mute">${W.audience ? "For " + esc(W.audience) + " · " : ""}A layout you can build in your tool. Numbers match the build notes below.</div>
      ${W.pages.length > 1 ? `<div class="rv-wtabs">${W.pages.map((p, i) => `<button type="button" class="${p === pg ? "on" : ""}" data-wpage="${i}">${esc(p.name)}</button>`).join("")}</div>` : ""}
      ${pg.purpose ? `<p class="rv-mute">${esc(pg.purpose)}</p>` : ""}
      <div class="rv-wire">${ws.svg}</div>
      ${live ? `<div class="rv-row"><button class="btn-outline" id="rv-wsvg">⬇️ SVG</button><button class="btn-outline" id="rv-wpng">⬇️ PNG</button><button class="btn-outline" id="rv-wex" title="Download an .excalidraw file and open excalidraw.com (free) to edit it">✏️ Edit in Excalidraw</button><button class="btn-outline" id="rv-wire">🔄 New suggestion</button></div>` : ""}
      <ol class="rv-wlist">${ws.blocks.filter(b => b.type !== "title").map(b => `<li value="${b.n}"><b>${esc(b.label)}</b> <span class="rv-chip">${esc(b.type === "chart" ? b.chart : b.type)}</span>${b.fields ? ` <span class="rv-mute">${esc(b.fields)}</span>` : ""}${b.why ? `<div>${esc(b.why)}</div>` : ""}${b.build ? `<div class="rv-build">🛠 ${esc(b.build)}</div>` : ""}</li>`).join("")}</ol>
      ${W.changes.length ? `<h4>🔁 What to change from your current dashboard</h4><ol class="rv-list">${W.changes.map(c => `<li>${esc(c)}</li>`).join("")}</ol>` : ""}
      ${W.tips.length ? `<h4>💡 Design tips</h4><ul class="rv-list">${W.tips.map(c => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}`;
  }
  function saveBlob(blob, name) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); }
  function bindWire() {
    const R = state.result; if (!R) return;
    document.querySelectorAll("#rv-root [data-wpage]").forEach(b => b.addEventListener("click", () => { wirePage = +b.dataset.wpage; render(); setTimeout(() => { const w = document.querySelector(".rv-wire"); if (w) w.scrollIntoView({ block: "center" }); }, 30); }));
    const nm = () => (R.file.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "_") || "dashboard") + "-wireframe";
    const svgNow = () => wireSvg(R.wire.pages[Math.min(wirePage, R.wire.pages.length - 1)], R.wire.title);
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
  const RCSS = `body{font-family:Inter,Segoe UI,Arial,sans-serif;max-width:900px;margin:24px auto;padding:0 16px;color:#0F172A;line-height:1.5}h3{margin:4px 0}h4{margin:20px 0 6px}.rv-mute{color:#64748B;font-size:13px}.rv-tag,.rv-chip{display:inline-block;font-size:11px;padding:1px 8px;border-radius:20px;background:#EEF2F7;margin-left:6px}.rv-score{display:flex;gap:18px;align-items:center;margin:14px 0}.rv-dial{width:96px;height:96px;border-radius:50%;border:6px solid #16A34A;display:flex;flex-direction:column;align-items:center;justify-content:center}.rv-dial.a{border-color:#D97706}.rv-dial.r{border-color:#DC2626}.rv-dial b{font-size:30px}.rv-bar{margin:8px 0}.rv-bl{display:flex;justify-content:space-between;font-size:14px}.rv-bt{height:8px;background:#EEF2F7;border-radius:4px}.rv-bt i{display:block;height:100%;background:#1F9E8B;border-radius:4px}.rv-bc{font-size:12.5px;color:#475569}.rv-issue{border:1px solid #E2E8F0;border-left:4px solid #94A3B8;border-radius:8px;padding:10px 12px;margin:8px 0;font-size:13.5px}.rv-issue.critical{border-left-color:#DC2626}.rv-issue.high{border-left-color:#EA580C}.rv-issue.medium{border-left-color:#CA8A04}.rv-issue.low{border-left-color:#2563EB}.rv-code{white-space:pre-wrap;background:#F1F5F9;padding:8px;border-radius:6px;font-size:12px}.rv-stats{display:flex;gap:10px;flex-wrap:wrap}.rv-stats div{border:1px solid #E2E8F0;border-radius:8px;padding:6px 12px;text-align:center}.rv-stats b{display:block;font-size:18px}.rv-stats span{font-size:11.5px;color:#64748B}.rv-d.up{color:#16A34A}.rv-d.dn{color:#DC2626}.rv-acts{display:none}.rv-pin{display:inline-block;min-width:18px;padding:0 5px;border-radius:10px;background:#DC2626;color:#fff;font-size:11px;font-weight:700;text-align:center;margin-right:4px}.rv-shotwrap{position:relative}.rv-shotwrap img{width:100%;display:block}.rv-hot{position:absolute;border:3px solid #DC2626;border-radius:6px}.rv-hot .rv-pin{position:absolute;top:-10px;left:-10px}.rv-cur,.rv-wire svg{width:100%;height:auto}.rv-wlist{padding-left:26px;font-size:13.5px}.rv-wlist li{margin-bottom:6px}.rv-build{font-size:12px;color:#475569}`;

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
  .rv-wire{border:1px solid var(--line,#E2E8F0);border-radius:10px;overflow:auto;background:#F1F5F9;margin:8px 0}.rv-wire svg{display:block;width:100%;min-width:640px;height:auto}
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

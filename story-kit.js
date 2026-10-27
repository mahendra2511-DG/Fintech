/* Kick-off Story kit v2
   (1) animated, project-specific data architecture on Home, coloured from the site's own theme (light + dark)
   (2) "🎬 Kick-off Story": a comic-book role-play of a real BI kick-off (panels, backgrounds, posed characters).
   Content per project lives in story-data.js (window.KICKOFF_DATA[site]). No database, no network. */
(function () {
  "use strict";
  const me = document.currentScript;
  const SITE = (me && me.dataset.site) || "";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const RM = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ===================================================== styles ===================================================== */
  const STYLE = `
/* ---------- architecture (site theme colours) ---------- */
.arch2{--s-src:var(--blue,#2856A3);--t-src:var(--blue-tint,#E9F0FA);--s-ing:var(--teal,#0E86C9);--t-ing:var(--teal-tint,#E6F3FA);--s-stg:var(--blue,#2856A3);--t-stg:var(--blue-tint,#E9F0FA);--s-trf:var(--amber,#A15C07);--t-trf:var(--amber-tint,#FBF0DD);--s-mart:var(--teal-deep,#0A5A87);--t-mart:var(--teal-tint,#E6F3FA);
  position:relative;background:var(--paper-raised,#fff);border:1px solid var(--line,#DDE2E0);border-radius:16px;box-shadow:var(--shadow-card,0 6px 20px rgba(16,24,38,.06));padding:18px 18px 14px;color:var(--ink,#101826);overflow:hidden}
.arch2-top{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-bottom:10px}
.arch2-title{display:flex;align-items:center;gap:10px}
.arch2-title .lg{width:34px;height:34px;border-radius:10px;background:var(--teal,#0E86C9);display:grid;place-items:center;color:#fff;font-size:17px;box-shadow:0 6px 14px -6px var(--teal,#0E86C9)}
.arch2-title b{display:block;font:700 15px/1.2 var(--display,inherit);color:var(--ink,#101826)}
.arch2-title small{display:block;font:500 11.5px/1.3 var(--body,inherit);color:var(--ink-muted,#5B6472)}
.arch2-steps{display:flex;flex-wrap:wrap;gap:6px}
.arch2-steps span{font:600 11.5px/1 var(--body,inherit);padding:7px 10px;border-radius:99px;background:var(--paper,#F6F7F5);border:1px solid var(--line,#DDE2E0);color:var(--ink-muted,#5B6472);transition:all .25s}
.arch2-steps span i{font-style:normal;display:inline-grid;place-items:center;width:16px;height:16px;border-radius:50%;background:var(--line,#DDE2E0);color:var(--ink,#101826);font-size:10px;margin-right:6px}
.arch2-steps span.on{background:var(--teal,#0E86C9);border-color:var(--teal,#0E86C9);color:#fff;box-shadow:0 6px 16px -8px var(--teal,#0E86C9)}
.arch2-steps span.on i{background:rgba(255,255,255,.25);color:#fff}
.arch2-live{display:inline-flex;align-items:center;gap:7px;font:600 11px/1 var(--body,inherit);color:var(--teal-deep,#0A5A87);background:var(--teal-tint,#E6F3FA);padding:6px 10px;border-radius:99px}
.arch2-live i{width:7px;height:7px;border-radius:50%;background:#16a34a;animation:a2pulse 1.6s infinite}
@keyframes a2pulse{0%{box-shadow:0 0 0 0 rgba(22,163,74,.55)}70%{box-shadow:0 0 0 7px rgba(22,163,74,0)}100%{box-shadow:0 0 0 0 rgba(22,163,74,0)}}
.arch2 svg{display:block;width:100%;height:auto}
.arch2 .lane{fill:var(--paper,#F6F7F5)}
.arch2 .lane-h{font:700 10px var(--body,sans-serif);letter-spacing:.12em;fill:var(--ink-muted,#5B6472)}
.arch2 .nd .bg{fill:var(--paper-raised,#fff);stroke:var(--line,#DDE2E0);stroke-width:1.2;filter:drop-shadow(0 2px 5px rgba(16,24,38,.07));transition:stroke .25s,filter .25s}
.arch2 .nd.hit .bg{stroke:var(--c);stroke-width:2;filter:drop-shadow(0 6px 14px rgba(16,24,38,.16))}
.arch2 .nd .tile{fill:var(--t)}
.arch2 .nd .ic{color:var(--c)}
.arch2 .nd .t{font:700 12.5px var(--display,var(--body,sans-serif));fill:var(--ink,#101826)}
.arch2 .nd .s{font:500 10.5px var(--body,sans-serif);fill:var(--ink-muted,#5B6472)}
.arch2 .nd .k{font:700 9px var(--body,sans-serif);letter-spacing:.1em;fill:var(--c)}
.arch2 .nd .dot{fill:var(--line,#DDE2E0);transition:fill .2s}
.arch2 .nd.hit .dot{fill:#16a34a}
.arch2 .pth{fill:none;stroke:var(--line,#DDE2E0);stroke-width:2}
.arch2 .pth2{fill:none;stroke:var(--c);stroke-width:2;stroke-dasharray:3 9;opacity:.6;animation:a2dash 1.1s linear infinite}
@keyframes a2dash{to{stroke-dashoffset:-24}}
.arch2 .pk rect{fill:var(--c)}
.arch2 .pk text{font:700 9.5px var(--body,sans-serif);fill:#fff}
.arch2-feed{margin-top:12px;display:grid;grid-template-columns:1fr;gap:6px;background:var(--paper,#F6F7F5);border:1px solid var(--line,#DDE2E0);border-radius:12px;padding:10px 12px;height:116px;overflow:hidden}
.arch2-feed div{display:flex;align-items:center;gap:10px;font:500 12px/1.3 var(--body,inherit);color:var(--ink,#101826);white-space:nowrap;overflow:hidden;animation:a2in .35s ease}
.arch2-feed .tm{font:500 11px var(--mono,monospace);color:var(--ink-muted,#5B6472);flex:none}
.arch2-feed .bd{flex:none;font:700 10px/1 var(--body,inherit);letter-spacing:.06em;padding:4px 7px;border-radius:6px;background:var(--t);color:var(--c);min-width:78px;text-align:center}
.arch2-feed .mg{overflow:hidden;text-overflow:ellipsis}
@keyframes a2in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.arch2-cap{margin:10px 2px 0;font-size:13px;color:var(--ink-muted,#5B6472);line-height:1.55}
.arch2-cap b{color:var(--ink,#101826)}
.ko-teaser{margin-top:16px;display:flex;gap:16px;align-items:center;flex-wrap:wrap;border-radius:16px;padding:16px 18px;background:var(--teal-tint,#E6F3FA);border:1px solid var(--line,#DDE2E0);color:var(--ink,#101826);position:relative;overflow:hidden}
.ko-teaser:after{content:"";position:absolute;right:-40px;top:-40px;width:160px;height:160px;border-radius:50%;background:var(--teal,#0E86C9);opacity:.08}
.ko-teaser .em{font-size:36px}
.ko-teaser h4{margin:0 0 3px;font:800 16px/1.25 var(--display,inherit)}
.ko-teaser p{margin:0;font-size:13.5px;color:var(--ink-muted,#5B6472);max-width:640px}
.ko-teaser button{margin-left:auto;background:var(--teal,#0E86C9);color:#fff;border:0;border-radius:10px;padding:11px 16px;font-weight:700;cursor:pointer;position:relative;z-index:1}

/* ---------- story (clean professional storyboard) ---------- */
.ko{--ln:#e3e7ec;--y:#fff7e0;--acc:var(--teal,#0E86C9);--acc-t:var(--teal-tint,#E6F3FA);--acc-d:var(--teal-deep,#0A5A87);--amb:var(--amber,#A15C07);--tx:#1d2532;--mut:#5b6472;max-width:1100px;margin:0 auto}
.ko-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px}
.ko-head h2{margin:6px 0 0;font:800 28px/1.15 var(--display,inherit);letter-spacing:-.01em;color:var(--ink,#101826)}
.ko-head p{margin:6px 0 0;color:var(--ink-muted,#666);font-size:14px}
.ko-ep{display:inline-block;background:var(--acc-t);color:var(--acc-d);font:700 11px/1 var(--body,inherit);letter-spacing:.06em;padding:6px 10px;border-radius:99px}
.ko-book{position:relative;background:#fff;border:1px solid var(--line,#DDE2E0);border-radius:18px;box-shadow:0 10px 30px -12px rgba(16,24,38,.18);padding:18px 18px 84px;min-height:560px;color:var(--tx)}
body.dark-mode .ko-book{background:#f7f8fa;border-color:#2b3442}
.ko-page{animation:koPg .4s ease}
@keyframes koPg{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:none}}
.ko-ptitle{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 14px}
.ko-ptitle .no{font:700 11px/1 var(--body,inherit);letter-spacing:.06em;background:var(--acc);color:#fff;padding:6px 9px;border-radius:99px}
.ko-ptitle h3{margin:0;font:800 22px/1.2 var(--display,inherit);letter-spacing:-.01em;color:var(--tx)}
.ko-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px}
.kp{position:relative;grid-column:span 6;border:1px solid var(--ln);border-radius:14px;background:#fff;overflow:hidden;display:flex;flex-direction:column;min-height:250px;opacity:.28;filter:saturate(.2);transition:opacity .35s,filter .35s,box-shadow .35s}
.kp.in{opacity:1;filter:none;box-shadow:0 4px 14px -8px rgba(16,24,38,.2)}
.kp.w2{grid-column:span 2}.kp.w3{grid-column:span 3}.kp.w4{grid-column:span 4}
.kp-bg{position:absolute;inset:0;width:100%;height:100%;z-index:0;opacity:.85}
.kp>*:not(.kp-bg):not(.kp-sfx){position:relative;z-index:2}
.kp-cap{align-self:flex-start;margin:0;background:rgba(255,255,255,.92);border-right:1px solid var(--ln);border-bottom:1px solid var(--ln);border-radius:0 0 10px 0;padding:6px 11px;font:700 11px/1.35 var(--body,inherit);text-transform:uppercase;letter-spacing:.05em;max-width:90%;color:var(--acc-d)}
.kp-talk{flex:1;display:flex;flex-direction:column;gap:10px;padding:12px 12px 6px}
.kb{position:relative;max-width:86%;background:#fff;border:1px solid #dde2e8;border-radius:14px;padding:9px 13px;font:500 14px/1.5 var(--body,inherit);color:var(--tx);box-shadow:0 3px 10px -4px rgba(16,24,38,.16);opacity:0;transform:translateY(6px)}
.kb.show{animation:kbPop .35s ease forwards}
.kb.done{opacity:1;transform:none}
.kb .caret{display:inline-block;width:2px;height:1em;background:var(--acc);margin-left:1px;vertical-align:-2px;animation:caret .7s steps(1) infinite}
@keyframes caret{50%{opacity:0}}
.ch .mo{opacity:0}
.ch.talk .mouth{animation:mA .3s steps(1) infinite}.ch.talk .mo{animation:mB .3s steps(1) infinite}
@keyframes mA{0%{opacity:1}50%{opacity:0}}@keyframes mB{0%{opacity:0}50%{opacity:1}}
.ch .bd{transform-origin:50% 100%;transform-box:fill-box;animation:breathe 4s ease-in-out infinite}
.ch .hd{transform-origin:50% 95%;transform-box:fill-box}
.ch.talk .hd{animation:bob 1.3s ease-in-out infinite alternate}
.ch.talk .arms{transform-origin:50% 0;transform-box:fill-box;animation:gest 1.8s ease-in-out infinite alternate}
@keyframes breathe{50%{transform:translateY(.8px)}}
@keyframes bob{from{transform:rotate(-1deg)}to{transform:rotate(1deg)}}
@keyframes gest{from{transform:rotate(-.6deg)}to{transform:rotate(.6deg)}}
.kp.in .ch{animation:enter .5s ease backwards;animation-delay:var(--ed,0s)}
@keyframes enter{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%)}}
.ch.talk .tag{background:var(--acc)}
.ko-play{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:0 0 12px}
.ko-play .big{border:0;background:var(--acc);color:#fff;border-radius:12px;padding:12px 20px;font:700 15px/1 var(--body,inherit);cursor:pointer;box-shadow:0 8px 18px -10px var(--acc)}
.ko-play .big:active{transform:translateY(1px)}
.ko-play span{font-size:13px;color:var(--ink-muted,#555)}
.ko-nav button.pl{min-width:96px}
.ko-vbtn{border:1px solid var(--line,#d0d6de);background:var(--paper-raised,#fff);color:var(--ink,#1d2532);border-radius:10px;padding:9px 12px;font:600 13px/1 var(--body,inherit);cursor:pointer}
.ko-vbtn[aria-pressed="false"]{opacity:.7}
.ko-vsel{display:inline-flex;align-items:center;gap:6px;font:600 12.5px/1 var(--body,inherit);color:var(--ink,#1d2532)}
.ko-vsel select{border:1px solid var(--line,#d0d6de);border-radius:8px;padding:6px 6px;font:inherit;background:var(--paper-raised,#fff);color:var(--ink,#1d2532)}
@keyframes kbPop{to{opacity:1;transform:none}}
.kb .who{display:block;font:700 10px/1 var(--body,inherit);letter-spacing:.08em;text-transform:uppercase;color:var(--acc-d);margin-bottom:4px}
.kb:after{content:"";position:absolute;bottom:-6px;left:var(--tx2,26px);width:11px;height:11px;background:inherit;border-right:1px solid #dde2e8;border-bottom:1px solid #dde2e8;transform:rotate(45deg)}
.kb.al{align-self:flex-start}.kb.ac{align-self:center;--tx2:calc(50% - 6px)}.kb.ar{align-self:flex-end;--tx2:calc(100% - 40px)}
.kb.think{background:#f5f7fb;border-style:dashed;font-style:italic}
.kb.think:after{display:none}
.kb.shout{background:#fff6f5;border-color:#f6c9c4}
.kb.shout:after{border-color:#f6c9c4}
.kb.narr{background:var(--acc-t);border:0;border-left:3px solid var(--acc);border-radius:8px;box-shadow:none;color:var(--tx)}.kb.narr:after{display:none}
.kb .why{display:block;margin-top:6px;font:600 11.5px/1.45 var(--body,inherit);color:var(--acc-d);background:var(--acc-t);border-radius:8px;padding:5px 8px}
.kp-cast{position:relative;height:176px;flex:none}
.kp-cast .ch{position:absolute;bottom:0;width:150px;transform:translateX(-50%)}
.kp-cast .ch svg{display:block;width:150px;height:176px}
.kp-cast .ch.flip svg{transform:scaleX(-1)}
.kp-cast .ch .tag{position:absolute;left:50%;bottom:6px;transform:translateX(-50%);background:#1d2532;color:#fff;font:600 10px/1 var(--body,inherit);padding:4px 8px;border-radius:99px;white-space:nowrap;z-index:3}
.kp-front{position:absolute;left:0;right:0;bottom:0;width:100%;height:34px;z-index:2;pointer-events:none}
.kp-cast.tbl .ch .tag{bottom:36px}
.kp-sfx{position:absolute;right:12px;top:10px;z-index:4;font:700 10.5px/1 var(--body,inherit);letter-spacing:.08em;text-transform:uppercase;color:#fff;background:#1d2532;padding:6px 9px;border-radius:99px;box-shadow:0 4px 10px -6px rgba(0,0,0,.4)}
.kp.in .kp-sfx{animation:sfx .4s ease}
@keyframes sfx{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
.kp-note{background:#1d2532;color:#fff;font:500 12.5px/1.45 var(--body,inherit);padding:8px 12px}
.kp-info{padding:12px;display:flex;flex-direction:column;gap:10px;flex:1}
.kc{background:#fff;border:1px solid var(--ln);border-radius:12px;padding:11px 12px;box-shadow:0 2px 8px -6px rgba(16,24,38,.25)}
.kc h5{margin:0 0 4px;font:700 13.5px/1.3 var(--display,inherit);color:var(--tx)}
.kc p{margin:0;font-size:12.5px;line-height:1.5;color:#3d4653}
.kc .tg{display:inline-block;font:700 9.5px/1 var(--body,inherit);letter-spacing:.08em;text-transform:uppercase;background:var(--acc-t);color:var(--acc-d);border-radius:99px;padding:4px 8px;margin-bottom:6px}
.kc code{display:block;margin-top:6px;font:600 11.5px/1.45 var(--mono,monospace);background:#f5f7f9;border:1px solid #e6e9ee;border-radius:6px;padding:4px 6px;color:var(--tx);white-space:normal}
.kc.warn{border-left:3px solid var(--amb)}.kc.warn .tg{background:#fdf1dc;color:var(--amb)}
.kc.pain{border-left:3px solid #dc2626}.kc.pain .tg{background:#fde8e8;color:#b91c1c}
.kc.ok{border-left:3px solid #15803d}.kc.ok .tg{background:#e3f6ea;color:#15803d}
.kg{display:grid;gap:10px}.kg1{grid-template-columns:1fr}.kg2{grid-template-columns:repeat(2,minmax(0,1fr))}.kg3{grid-template-columns:repeat(3,minmax(0,1fr))}.kg4{grid-template-columns:repeat(4,minmax(0,1fr))}
.kn{background:#fffaeb;border:1px solid #f3e3b5;padding:10px 12px;border-radius:10px;font:500 13px/1.45 var(--body,inherit);color:var(--tx)}
.kn b{display:block;font:700 13.5px/1.2 var(--display,inherit);margin-bottom:4px;color:var(--amb)}
.kroster{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.kroster .kc{text-align:center;padding:8px}
.kroster svg{width:100px;height:134px;display:block;margin:0 auto -4px}
.kroster .nm{font:700 12.5px/1.2 var(--body,inherit);color:var(--tx)}
.kroster .rl{font:700 10.5px/1.2 var(--body,inherit);color:var(--acc-d);text-transform:uppercase;letter-spacing:.04em;margin:3px 0}
.kroster .sd{display:inline-block;font:700 9px/1 var(--body,inherit);letter-spacing:.08em;padding:3px 7px;border-radius:99px;margin-bottom:4px;background:#eef1f4;color:#3d4653}
.kroster .sd.cl{background:#fdf1dc;color:var(--amb)}
.kroster p{font-size:11.5px}
.ktime{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));position:relative;margin-top:6px}
.ktime>div{position:relative;padding:40px 6px 0;text-align:center}
.ktime>div:before{content:"";position:absolute;top:17px;left:0;right:0;height:3px;background:#dfe4ea}
.ktime>div:first-child:before{left:50%}.ktime>div:last-child:before{right:50%}
.ktime .dt{position:absolute;top:3px;left:50%;transform:translateX(-50%);width:30px;height:30px;border-radius:50%;background:#fff;border:2px solid var(--acc);display:grid;place-items:center;font-size:14px}
.ktime h6{margin:0;font:700 14px/1.2 var(--display,inherit);color:var(--tx)}
.ktime .wk{font:600 10px/1 var(--mono,monospace);color:var(--mut);margin-top:3px}
.ktime p{font-size:12px;line-height:1.4;margin:5px 0 0;color:#3d4653}
.kmom{background:#fff;border:1px solid var(--ln);border-radius:12px;box-shadow:0 6px 18px -12px rgba(16,24,38,.3);padding:14px 16px;font-size:13px;color:var(--tx)}
.kmom h5{margin:0 0 6px;font:800 16px/1.2 var(--display,inherit)}
.kmom table{width:100%;border-collapse:collapse}.kmom td,.kmom th{border-bottom:1px solid #eceff3;padding:6px 4px;text-align:left;vertical-align:top;font-size:12.5px}
.kmom th{font:700 10px/1 var(--body,inherit);text-transform:uppercase;letter-spacing:.06em;color:var(--mut)}
.kq{margin-bottom:12px}.kq p{font-weight:700;margin:0 0 6px;font-size:14px;color:var(--tx)}
.kq button{display:block;width:100%;text-align:left;border:1px solid #d6dbe2;background:#fff;border-radius:10px;padding:9px 12px;margin:6px 0;font:500 13.5px/1.4 var(--body,inherit);cursor:pointer;color:var(--tx)}
.kq button:hover{border-color:var(--acc)}
.kq button.ok{background:#e3f6ea;border-color:#86d19f}.kq button.no{background:#fde8e8;border-color:#f3a7a7}.kq .fb{font-size:12.5px;margin-top:4px;color:#3d4653}
.kcta{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.kcta button{border:1px solid var(--acc);background:var(--acc);border-radius:10px;padding:9px 13px;font:600 13px/1 var(--body,inherit);cursor:pointer;color:#fff}
.ko-nav{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;gap:10px;padding:12px 16px;border-top:1px solid var(--ln);background:#fff;border-radius:0 0 17px 17px;z-index:5}
.ko-nav button{border:1px solid #d6dbe2;background:#fff;color:var(--tx);border-radius:10px;padding:9px 14px;font:600 14px/1 var(--body,inherit);cursor:pointer}
.ko-nav button:hover:not(:disabled){border-color:var(--acc)}
.ko-nav button.go{background:var(--acc);border-color:var(--acc);color:#fff;min-width:140px}
.ko-nav button:disabled{opacity:.4;cursor:default}
.ko-prog{flex:1;min-width:80px;height:6px;border-radius:99px;overflow:hidden;background:#eef1f4}
.ko-prog i{display:block;height:100%;width:0;background:var(--acc);transition:width .3s}
.ko-scene{font:600 12px/1.2 var(--body,inherit);color:var(--mut);white-space:nowrap}
.ko-arch{border:1px solid var(--ln);border-radius:12px;overflow:hidden}
.ko-arch .arch2{border:0;border-radius:0;box-shadow:none}
.kp .ch .eye{transform-origin:center;transform-box:fill-box;animation:koBlink 5.5s infinite}
@keyframes koBlink{0%,95%,100%{transform:scaleY(1)}97%{transform:scaleY(.15)}}
@media (max-width:860px){.kp.w2,.kp.w3,.kp.w4{grid-column:span 6}.kg3,.kg4{grid-template-columns:repeat(2,minmax(0,1fr))}.ktime{grid-template-columns:1fr}.ktime>div{padding:0 0 12px 44px;text-align:left}.ktime>div:before{top:0;bottom:0;left:16px;right:auto;width:3px;height:auto}.ktime>div:first-child:before{top:16px;left:16px}.ktime>div:last-child:before{bottom:auto;height:16px;right:auto}.ktime .dt{left:17px;top:0}}
@media (max-width:560px){.ko-book{padding:10px 10px 84px}.kg2,.kg3,.kg4{grid-template-columns:1fr}.kp-cast{height:140px}.kp-cast .ch{width:118px}.kp-cast .ch svg{width:118px;height:140px}.kb{max-width:96%;font-size:13.5px}.ko-ptitle h3{font-size:19px}.ko-scene{display:none}.ko-teaser button{margin-left:0;width:100%}.ko-nav{gap:6px;padding:10px}.ko-nav button{padding:8px 10px;font-size:13px}.ko-nav button.go,.ko-nav button.pl{min-width:0}.ko-prog{min-width:24px}.ko-play .big{font-size:14px;padding:10px 14px}}
@media (prefers-reduced-motion:reduce){.kp,.kb,.ko-page,.arch2-feed div,.kp.in .ch{animation:none!important;transition:none!important;opacity:1!important}.kp,.kb{transform:none!important}.arch2 .pth2,.arch2-live i,.kp .ch .eye,.ch .bd,.ch.talk .hd,.ch.talk .arms{animation:none!important}}
`;
  function addCss() { if (document.getElementById("ko-css")) return; const s = document.createElement("style"); s.id = "ko-css"; s.textContent = STYLE; document.head.appendChild(s); }

  /* ===================================================== characters (clean flat business illustration) ===================================================== */
  // look: {skin, hair, hs, top, wear: blazer|shirt|hoodie|kurta|tee|coat, inner, glasses, beard, stubble, mustache, bindi, earrings, lanyard, tie}
  const K = "#1f2733";
  const shade = (hex, f) => { const n = parseInt(String(hex).slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255; r = Math.min(255, Math.round(r * f)); g = Math.min(255, Math.round(g * f)); b = Math.min(255, Math.round(b * f)); return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1); };
  // tone the bright data colours down a little so outfits look like real business clothing
  const calm = (hex) => { const n = parseInt(String(hex).slice(1), 16); const r = n >> 16, g = (n >> 8) & 255, b = n & 255; const m = (r + g + b) / 3; const mix = (c) => Math.round(c * .78 + m * .12); return "#" + ((1 << 24) + (mix(r) << 16) + (mix(g) << 8) + mix(b)).toString(16).slice(1); };
  function hairBack(L) {
    const d = shade(L.hairC, .85);
    if (L.hs === "long") return `<path d="M54 54 C48 84 48 112 54 126 C66 130 94 130 106 126 C112 112 112 84 106 54 Z" fill="${d}"/>`;
    if (L.hs === "wavy") return `<path d="M54 54 C46 82 50 106 52 116 C56 124 64 122 70 124 C78 122 86 124 92 122 C98 124 106 122 108 114 C112 102 114 80 106 54 Z" fill="${d}"/>`;
    if (L.hs === "pony") return `<path d="M100 44 C116 50 118 76 110 94 C107 82 104 70 98 62 Z" fill="${d}"/>`;
    if (L.hs === "bun") return `<circle cx="80" cy="26" r="9.5" fill="${d}"/>`;
    return "";
  }
  function hairFront(L) {
    const h = L.hairC, hi = `<path d="M66 34 C74 30 86 30 94 34" fill="none" stroke="#fff" stroke-width="1.6" opacity=".18" stroke-linecap="round"/>`;
    switch (L.hs) {
      case "short": return `<path d="M55 62 C52 38 65 27 80 27 C96 27 108 38 105 62 C102 51 97 45 89 42 C80 46 67 46 59 50 C57 54 55.5 58 55 62 Z" fill="${h}"/>${hi}`;
      case "side": return `<path d="M55 64 C51 36 67 26 84 27 C100 28 109 40 105 61 C100 47 90 40 75 41 C67 44 60 50 55 64 Z" fill="${h}"/>${hi}`;
      case "spiky": return `<path d="M55 61 C53 41 61 31 71 28 C74 24 79 23 83 25 C89 22 95 25 96 30 C104 34 108 44 105 61 C100 48 92 43 80 43 C68 44 59 50 55 61 Z" fill="${h}"/>${hi}`;
      case "curly": return `<g fill="${h}">${[[60, 44, 8], [69, 35, 9], [80, 31, 9.5], [91, 35, 9], [100, 44, 8], [56, 54, 6], [104, 54, 6]].map(c => `<circle cx="${c[0]}" cy="${c[1]}" r="${c[2]}"/>`).join("")}</g>`;
      case "long": case "wavy": return `<path d="M54 68 C49 37 65 26 80 26 C96 26 111 37 106 68 C103 52 95 44 85 41 C80 48 67 52 57 55 C55 59 54.5 63 54 68 Z" fill="${h}"/>${hi}`;
      case "bun": case "pony": return `<path d="M55 63 C52 37 66 28 80 28 C95 28 108 37 105 62 C101 50 93 43 80 42 C67 43 59 50 55 63 Z" fill="${h}"/>${hi}`;
      case "bald": return `<path d="M55 58 C55 52 56.5 49 58 47 L58 66 Z M105 58 C105 52 103.5 49 102 47 L102 66 Z" fill="${h}"/>`;
      case "grey": return `<path d="M55 62 C52 38 65 27 80 27 C96 27 108 38 105 62 C102 51 97 45 89 42 C80 46 67 46 59 50 C57 54 55.5 58 55 62 Z" fill="#c9ced6"/><path d="M66 34 C74 30 86 30 94 34" fill="none" stroke="#fff" stroke-width="1.6" opacity=".4" stroke-linecap="round"/>`;
      default: return "";
    }
  }
  function faceParts(L, mood) {
    const ink = "#2a221d", br = shade(L.hairC === "#c9ced6" ? "#8b9099" : L.hairC, 1), lip = shade(L.skin, .62);
    const brow = { worry: `<path d="M66 54 L74 56.5 M94 54 L86 56.5" stroke="${br}" stroke-width="2" stroke-linecap="round"/>`, angry: `<path d="M66 53.5 L74.5 57 M94 53.5 L85.5 57" stroke="${br}" stroke-width="2.2" stroke-linecap="round"/>`, think: `<path d="M66 55.5 L74 55 M86 53 Q90 51 94 53.5" fill="none" stroke="${br}" stroke-width="2" stroke-linecap="round"/>`, wow: `<path d="M66 52.5 Q70 50 74 52.5 M86 52.5 Q90 50 94 52.5" fill="none" stroke="${br}" stroke-width="2" stroke-linecap="round"/>` }[mood] || `<path d="M66 55 Q70 53 74 55 M86 55 Q90 53 94 55" fill="none" stroke="${br}" stroke-width="2" stroke-linecap="round"/>`;
    let eyes;
    if (mood === "happy") eyes = `<path class="eye" d="M67 62.5 Q70 59.5 73 62.5 M87 62.5 Q90 59.5 93 62.5" fill="none" stroke="${ink}" stroke-width="1.9" stroke-linecap="round"/>`;
    else { const px = mood === "think" ? 1.2 : 0, py = mood === "think" ? -1 : 0, r = mood === "wow" ? 2.6 : 2.2; eyes = `<g class="eye"><ellipse cx="${70 + px}" cy="${62 + py}" rx="${r}" ry="${r + .5}" fill="${ink}"/><ellipse cx="${90 + px}" cy="${62 + py}" rx="${r}" ry="${r + .5}" fill="${ink}"/><circle cx="${70.8 + px}" cy="${61.1 + py}" r=".7" fill="#fff"/><circle cx="${90.8 + px}" cy="${61.1 + py}" r=".7" fill="#fff"/></g>`; }
    const mouth = { worry: `<path d="M75 79 Q80 76.5 85 79" fill="none" stroke="${lip}" stroke-width="1.8" stroke-linecap="round"/>`, angry: `<path d="M75 78.5 Q80 76.8 85 78.5" fill="none" stroke="${lip}" stroke-width="2" stroke-linecap="round"/>`, think: `<path d="M76 78 Q80 77.6 85 76.6" fill="none" stroke="${lip}" stroke-width="1.8" stroke-linecap="round"/>`, wow: `<ellipse cx="80" cy="78" rx="2.6" ry="3.2" fill="#6e3b33"/>`, happy: `<path d="M73.5 75 Q80 83.5 86.5 75 Z" fill="#fff" stroke="${lip}" stroke-width="1.5" stroke-linejoin="round"/>` }[mood] || `<path d="M74.5 75.5 Q80 80.5 85.5 75.5" fill="none" stroke="${lip}" stroke-width="1.8" stroke-linecap="round"/>`;
    const nose = `<path d="M80 63 Q78 69.5 80.5 71" fill="none" stroke="${shade(L.skin, .78)}" stroke-width="1.5" stroke-linecap="round"/>`;
    const glasses = L.glasses ? `<g fill="rgba(255,255,255,.12)" stroke="#2b3340" stroke-width="1.5"><rect x="63.5" y="57" width="13" height="10" rx="3.5"/><rect x="83.5" y="57" width="13" height="10" rx="3.5"/><path d="M76.5 61 H83.5 M63.5 60.5 L57 59 M96.5 60.5 L103 59"/></g>` : "";
    const beard = L.beard ? `<path d="M57 68 C58 86 68 95 80 95 C92 95 102 86 103 68 C98 79 91 82 80 82 C69 82 62 79 57 68 Z" fill="${L.hairC}"/>` : "";
    const stub = L.stubble ? `<path d="M59 73 C62 85 70 92 80 92 C90 92 98 85 101 73" fill="none" stroke="${shade(L.skin, .7)}" stroke-width="6" opacity=".22"/>` : "";
    const must = L.mustache || L.beard ? `<path d="M73.5 73.4 Q77 70.8 80 72.6 Q83 70.8 86.5 73.4 Q83 75 80 73.9 Q77 75 73.5 73.4 Z" fill="${L.hairC}"/>` : "";
    const bindi = L.bindi ? `<circle cx="80" cy="51.5" r="1.4" fill="#c2410c"/>` : "";
    const open = `<ellipse class="mo" cx="80" cy="77.5" rx="3.4" ry="2.6" fill="#6e3b33"/>`;
    return brow + eyes + nose + stub + beard + `<g class="mouth">${mouth}</g>` + open + must + glasses + bindi;
  }
  function arm(pts, col, skin, hand) {
    const d = "M" + pts.map(p => p.join(",")).join(" L"), h = pts[pts.length - 1];
    const hs = hand === "point" ? `<g transform="translate(${h[0]},${h[1]})"><circle r="5.6" fill="${skin}"/><path d="M1 -3 L5 -12" stroke="${skin}" stroke-width="3.4" stroke-linecap="round"/></g>`
      : hand === "open" ? `<g transform="translate(${h[0]},${h[1]})"><path d="M-5 2 L-7 -7 M-2 -3 L-2.5 -11 M1.5 -3 L2 -11.5 M4.5 -2 L6.5 -9.5" stroke="${skin}" stroke-width="3" stroke-linecap="round"/><ellipse rx="6" ry="5.6" fill="${skin}"/></g>`
      : `<circle cx="${h[0]}" cy="${h[1]}" r="5.8" fill="${skin}"/>`;
    return `<path d="${d}" fill="none" stroke="${shade(col, .86)}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${col}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/>${hs}`;
  }
  const POSES = {
    idle: { l: [[46, 122], [39, 168], [42, 224]], r: [[114, 122], [121, 168], [118, 224]] },
    point: { l: [[46, 122], [39, 168], [42, 224]], r: [[114, 122], [134, 106], [146, 86]], rh: "point" },
    chin: { l: [[46, 122], [39, 168], [42, 224]], r: [[114, 124], [110, 160], [90, 97]] },
    present: { l: [[46, 122], [39, 168], [42, 224]], r: [[114, 122], [136, 150], [148, 134]], rh: "open" },
    cross: { l: [[46, 124], [58, 156], [104, 148]], r: [[114, 124], [102, 158], [56, 150]] },
    laptop: { l: [[46, 122], [46, 160], [68, 168]], r: [[114, 122], [114, 160], [92, 168]], prop: "laptop" },
    wave: { l: [[46, 122], [39, 168], [42, 224]], r: [[114, 122], [134, 100], [136, 74]], rh: "open" },
    cheer: { l: [[46, 122], [32, 98], [36, 70]], r: [[114, 122], [128, 98], [124, 70]] },
    phone: { l: [[46, 122], [39, 168], [42, 224]], r: [[114, 124], [122, 154], [103, 84]], prop: "phone" },
    facepalm: { l: [[46, 122], [39, 168], [42, 224]], r: [[114, 124], [118, 146], [92, 60]], rh: "open" },
    note: { l: [[46, 124], [50, 160], [70, 158]], r: [[114, 124], [112, 160], [94, 152]], prop: "note" },
    marker: { l: [[46, 122], [39, 168], [42, 224]], r: [[114, 122], [138, 108], [146, 88]], prop: "marker" },
    shrug: { l: [[46, 124], [32, 140], [28, 124]], r: [[114, 124], [128, 140], [132, 124]], lh: "open", rh: "open" }
  };
  function torso(L) {
    const c = L.topC, d = shade(c, .82), inner = L.inner || "#f8fafc";
    let s = `<path d="M30 214 C30 160 33 126 48 116 C55 111 63 109.5 70 108.5 L90 108.5 C97 109.5 105 111 112 116 C127 126 130 160 130 214 Z" fill="${c}"/><path d="M106 116 C122 128 128 160 130 214 L114 214 C114 174 112 140 104 120 Z" fill="#000" opacity=".07"/>`;
    if (L.wear === "blazer") s += `<path d="M69 110 L80 146 L91 110 Z" fill="${inner}"/><path d="M66 110 L80 152 L60 128 L62 112 Z M94 110 L80 152 L100 128 L98 112 Z" fill="${d}"/><path d="M80 152 V214" stroke="${shade(c, .7)}" stroke-width="1.2"/><circle cx="80" cy="172" r="1.6" fill="${shade(c, .6)}"/><circle cx="80" cy="186" r="1.6" fill="${shade(c, .6)}"/><path d="M104 140 h10" stroke="${shade(c, .7)}" stroke-width="1.4" stroke-linecap="round"/>`;
    else if (L.wear === "hoodie") s += `<path d="M60 112 C64 128 96 128 100 112" fill="${d}"/><path d="M75 124 L74 144 M85 124 L86 144" stroke="#f1f5f9" stroke-width="1.6" stroke-linecap="round"/><path d="M60 178 H100 V200 H60 Z" fill="${d}" opacity=".7"/>`;
    else if (L.wear === "kurta") s += `<path d="M72 110 L72 118 C72 123 88 123 88 118 L88 110" fill="${d}"/><path d="M80 120 V170" stroke="${shade(c, .7)}" stroke-width="1.4"/><circle cx="80" cy="132" r="1.3" fill="${shade(c, .55)}"/><circle cx="80" cy="144" r="1.3" fill="${shade(c, .55)}"/><circle cx="80" cy="156" r="1.3" fill="${shade(c, .55)}"/>`;
    else if (L.wear === "coat") s += `<path d="M69 110 L80 136 L91 110 Z" fill="${inner}"/><path d="M80 136 V214" stroke="${shade(c, .75)}" stroke-width="1.4"/><rect x="100" y="146" width="10" height="13" rx="1.5" fill="#93c5fd"/><path d="M58 122 C64 140 66 170 64 196" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round"/><circle cx="64" cy="198" r="3.5" fill="#94a3b8"/>`;
    else if (L.wear === "tee") s += `<path d="M69 110 Q80 121 91 110" fill="none" stroke="${shade(c, .7)}" stroke-width="2"/>`;
    else s += `<path d="M68 110 L80 124 L92 110 L88 104 L80 112 L72 104 Z" fill="${inner}"/><path d="M80 124 V214" stroke="${shade(c, .74)}" stroke-width="1.2"/><circle cx="80" cy="140" r="1.3" fill="${shade(c, .6)}"/><circle cx="80" cy="156" r="1.3" fill="${shade(c, .6)}"/><circle cx="80" cy="172" r="1.3" fill="${shade(c, .6)}"/>`;
    if (L.tie) s += `<path d="M77 122 L83 122 L82 127 L85 160 L80 166 L75 160 L78 127 Z" fill="${L.tie === true ? "#7f1d1d" : calm(L.tie)}"/>`;
    if (L.lanyard) s += `<path d="M68 112 L77 150 M92 112 L83 150" stroke="${calm(L.lanyard)}" stroke-width="2.4"/><rect x="73" y="148" width="14" height="18" rx="2" fill="#fff" stroke="#cbd5e1" stroke-width="1"/><rect x="75.5" y="151" width="9" height="5" rx="1" fill="${calm(L.lanyard)}"/>`;
    return s;
  }
  function prop(kind) {
    if (kind === "laptop") return `<g><path d="M44 170 L116 170 L122 186 L38 186 Z" fill="#cbd5e1"/><path d="M38 186 L122 186 L120 190 L40 190 Z" fill="#94a3b8"/><rect x="50" y="136" width="60" height="36" rx="3" fill="#334155" transform="rotate(-4 80 154)"/><circle cx="80" cy="154" r="3" fill="#e2e8f0" transform="rotate(-4 80 154)"/></g>`;
    if (kind === "phone") return `<rect x="99" y="62" width="9" height="18" rx="2.2" fill="#1f2937"/>`;
    if (kind === "note") return `<g transform="rotate(-6 84 150)"><rect x="64" y="132" width="38" height="44" rx="3" fill="#fff" stroke="#d6dbe1" stroke-width="1"/><path d="M70 144 h26 M70 151 h22 M70 158 h24 M70 165 h18" stroke="#94a3b8" stroke-width="1.6" stroke-linecap="round"/><rect x="64" y="132" width="38" height="6" rx="2" style="fill:var(--teal,#0E86C9)"/></g>`;
    if (kind === "marker") return `<rect x="143" y="72" width="5.5" height="18" rx="1.6" style="fill:var(--teal,#0E86C9)" transform="rotate(20 146 82)"/>`;
    return "";
  }
  function figure(look, mood, pose) {
    const L = Object.assign({ skin: "#D9A07A", hair: "#2a1d14", hs: "short", top: "#2563eb", wear: "shirt" }, look || {});
    L.topC = calm(L.top); L.hairC = L.hs === "grey" ? "#c9ced6" : L.hair;
    const Pz = POSES[pose] || POSES.idle; mood = mood || "smile";
    const front = ["chin", "facepalm", "phone"].includes(pose);
    const arms = arm(Pz.l, L.topC, L.skin, Pz.lh) + arm(Pz.r, L.topC, L.skin, Pz.rh);
    const sk = L.skin, skd = shade(sk, .9);
    const head = `<path d="M73 84 L87 84 L87 102 Q80 107 73 102 Z" fill="${skd}"/><path d="M73 96 Q80 101 87 96 L87 92 Q80 97 73 92 Z" fill="#000" opacity=".08"/>
      <ellipse cx="55.5" cy="64" rx="3.6" ry="6" fill="${skd}"/><ellipse cx="104.5" cy="64" rx="3.6" ry="6" fill="${skd}"/>
      ${L.earrings ? `<circle cx="55.5" cy="72" r="1.8" fill="#d4a017"/><circle cx="104.5" cy="72" r="1.8" fill="#d4a017"/>` : ""}
      <path d="M56 60 C56 38 66 30 80 30 C94 30 104 38 104 60 C104 80 94 92 80 92 C66 92 56 80 56 60 Z" fill="${sk}"/>
      <path d="M94 38 C104 50 104 74 92 88 C99 74 100 54 94 38 Z" fill="#000" opacity=".06"/>`;
    return `<svg viewBox="0 0 160 214" aria-hidden="true"><ellipse cx="80" cy="212" rx="50" ry="3" fill="#000" opacity=".06"/><g class="bd">${torso(L)}${front ? "" : `<g class="arms">${arms}</g>`}<g class="hd"><g transform="translate(0 6)">${hairBack(L)}${head}${hairFront(L)}${faceParts(L, mood)}</g></g>${front ? `<g class="arms">${arms}</g>` : ""}${prop(Pz.prop)}</g></svg>`;
  }

  /* ===================================================== backgrounds ===================================================== */
  const BG = {
    cabin: `<rect width="400" height="260" style="fill:var(--teal-tint,#E6F3FA)"/><rect x="220" y="24" width="150" height="120" rx="4" fill="#cfe8ff" stroke="#d5dbe2" stroke-width="1.5"/><path d="M220 144 V110 h20 V90 h16 v54 M262 144 V74 h22 v70 M290 144 V98 h18 v46 M314 144 V82 h24 v62 M344 144 V104 h26 v40" style="fill:var(--teal,#0E86C9)" opacity=".25"/><path d="M295 24 V144 M220 84 H370" stroke="#d5dbe2" stroke-width="1.5"/><rect x="30" y="40" width="70" height="52" rx="3" fill="#fff" stroke="#d5dbe2" stroke-width="1.5"/><path d="M40 80 l12 -12 l10 6 l14 -18 l14 8" fill="none" style="stroke:var(--teal,#0E86C9)" stroke-width="3"/><rect y="200" width="400" height="60" fill="#e8dccb" stroke="#d5dbe2" stroke-width="1.5"/>`,
    meeting: `<rect width="400" height="260" style="fill:var(--paper,#F6F7F5)"/><rect width="400" height="24" style="fill:var(--teal-tint,#E6F3FA)"/><rect x="120" y="30" width="160" height="90" rx="6" fill="#1f2937" stroke="#d5dbe2" stroke-width="1.5"/><rect x="132" y="42" width="136" height="66" rx="3" fill="#0f172a"/><path d="M142 96 l20 -14 l16 8 l22 -22 l18 10 l22 -18" fill="none" style="stroke:var(--teal,#0E86C9)" stroke-width="3"/><rect x="20" y="40" width="70" height="110" fill="#e5e7eb" stroke="#d5dbe2" stroke-width="1.5"/><path d="M55 40 V150" stroke="#d5dbe2" stroke-width="1"/><g transform="translate(330 70)"><path d="M10 80 h30 l-5 30 h-20 z" fill="#b45309" stroke="#d5dbe2" stroke-width="1.2"/><path d="M25 80 C10 60 0 40 8 20 M25 80 C30 50 40 30 50 22 M25 80 C24 56 26 36 28 10" fill="none" stroke="#15803d" stroke-width="7" stroke-linecap="round"/></g>`,
    board: `<rect width="400" height="260" style="fill:var(--paper,#F6F7F5)"/><rect x="30" y="18" width="340" height="150" rx="4" fill="#fff" stroke="#d5dbe2" stroke-width="1.5"/><rect x="30" y="162" width="340" height="8" fill="#9ca3af" stroke="#d5dbe2" stroke-width="1"/><g fill="none" stroke-width="2" stroke-linecap="round" opacity=".45"><rect x="56" y="44" width="56" height="34" rx="6" style="stroke:var(--teal,#0E86C9)"/><path d="M114 61 h40" style="stroke:var(--teal,#0E86C9)"/><ellipse cx="184" cy="52" rx="26" ry="8" style="stroke:var(--blue,#2856A3)"/><path d="M158 52 v24 a26 8 0 0 0 52 0 v-24" style="stroke:var(--blue,#2856A3)"/><path d="M212 64 h40" style="stroke:var(--amber,#A15C07)"/><path d="M262 44 l44 0 l-16 20 l0 18 l-12 6 l0 -24 z" style="stroke:var(--amber,#A15C07)"/><path d="M70 120 q40 -20 80 0 t80 0 t80 0" style="stroke:var(--teal,#0E86C9)" opacity=".5"/></g>`,
    corridor: `<rect width="400" height="260" style="fill:var(--paper,#F6F7F5)"/><rect y="200" width="400" height="60" fill="#ebe8e4" stroke="#d5dbe2" stroke-width="1.5"/><g stroke="#d5dbe2" stroke-width="1.5"><rect x="20" y="20" width="110" height="180" style="fill:var(--teal-tint,#E6F3FA)"/><rect x="150" y="20" width="110" height="180" style="fill:var(--teal-tint,#E6F3FA)"/><rect x="290" y="40" width="80" height="160" fill="#c9a77c"/></g><circle cx="356" cy="122" r="4" fill="#fde68a" stroke="#d5dbe2" stroke-width="1"/><path d="M40 40 l30 60 M170 40 l30 60" stroke="#fff" stroke-width="6" opacity=".7"/>`,
    night: `<rect width="400" height="260" fill="#1e293b"/><rect x="240" y="20" width="140" height="110" rx="4" fill="#0f172a" stroke="#0b1220" stroke-width="1"/><circle cx="340" cy="52" r="14" fill="#fef3c7"/><g fill="#fde68a" opacity=".6"><rect x="252" y="96" width="6" height="8"/><rect x="270" y="86" width="6" height="8"/><rect x="300" y="100" width="6" height="8"/></g><path d="M40 0 L90 0 L120 200 L10 200 Z" fill="#fde68a" opacity=".08"/><rect y="200" width="400" height="60" fill="#334155" stroke="#0b1220" stroke-width="1"/>`,
    burst: `<rect width="400" height="260" style="fill:var(--amber-tint,#FBF0DD)"/><g style="fill:var(--amber,#A15C07)" opacity=".08">${Array.from({ length: 18 }, (_, i) => { const a = i / 18 * Math.PI * 2, b = a + Math.PI / 18; return `<path d="M200 130 L${(200 + 400 * Math.cos(a)).toFixed(1)} ${(130 + 400 * Math.sin(a)).toFixed(1)} L${(200 + 400 * Math.cos(b)).toFixed(1)} ${(130 + 400 * Math.sin(b)).toFixed(1)} Z"/>`; }).join("")}</g>`,
    plain: `<rect width="400" height="260" fill="#fff"/>`,
    desk: `<rect width="400" height="260" style="fill:var(--blue-tint,#E9F0FA)"/><rect x="40" y="40" width="120" height="80" rx="4" fill="#fff" stroke="#d5dbe2" stroke-width="1.5"/><path d="M52 104 v-30 M72 104 v-44 M92 104 v-22 M112 104 v-36 M132 104 v-50" style="stroke:var(--teal,#0E86C9)" stroke-width="9"/><rect x="250" y="34" width="110" height="74" rx="3" fill="#fde68a" stroke="#d5dbe2" stroke-width="1.5" transform="rotate(4 305 70)"/><rect y="200" width="400" height="60" fill="#e8dccb" stroke="#d5dbe2" stroke-width="1.5"/>`
  };
  const TABLE = `<svg class="kp-front" viewBox="0 0 400 42" preserveAspectRatio="none" aria-hidden="true"><path d="M-10 42 L-10 14 Q200 -6 410 14 L410 42 Z" fill="#d8c3a5" stroke="#d5dbe2" stroke-width="1.5"/><path d="M-10 18 Q200 0 410 18" fill="none" stroke="#e9dac4" stroke-width="5"/><rect x="60" y="12" width="26" height="14" rx="2" fill="#fff" stroke="#d5dbe2" stroke-width="1"/><rect x="300" y="10" width="34" height="18" rx="2" fill="#cbd5e1" stroke="#d5dbe2" stroke-width="1"/><circle cx="200" cy="18" r="7" fill="#fff" stroke="#d5dbe2" stroke-width="1"/></svg>`;

  /* ===================================================== architecture ===================================================== */
  const ST = { src: ["--s-src", "--t-src"], ing: ["--s-ing", "--t-ing"], stg: ["--s-stg", "--t-stg"], trf: ["--s-trf", "--t-trf"], mart: ["--s-mart", "--t-mart"] };
  const BRAND = { xl: ["#16a34a", "#dcfce7"], tb: ["#e8762c", "#fde8d8"], pbi: ["#c99a06", "#fef3c7"], ai: ["#7c3aed", "#ede9fe"] };
  const sty = (k) => ST[k] ? `--c:var(${ST[k][0]});--t:var(${ST[k][1]})` : `--c:${BRAND[k][0]};--t:${BRAND[k][1]}`;
  const IC = {
    app: `<rect x="1" y="3" width="22" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M1 8h22" stroke="currentColor" stroke-width="2"/><circle cx="4.5" cy="5.5" r=".9" fill="currentColor"/><circle cx="7.5" cy="5.5" r=".9" fill="currentColor"/>`,
    gear: `<g fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3.6"/><path d="M12 2v3.5M12 18.5V22M2 12h3.5M18.5 12H22M4.9 4.9l2.5 2.5M16.6 16.6l2.5 2.5M4.9 19.1l2.5-2.5M16.6 7.4l2.5-2.5"/></g>`,
    db: `<g fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3.4"/><path d="M3 5v14c0 1.9 4 3.4 9 3.4s9-1.5 9-3.4V5"/><path d="M3 12c0 1.9 4 3.4 9 3.4s9-1.5 9-3.4"/></g>`,
    funnel: `<path d="M3 4h18l-7 8.5V19l-4 2v-8.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>`,
    star: `<g fill="none" stroke="currentColor" stroke-width="2"><rect x="8.5" y="8.5" width="7" height="7" rx="1.5"/><rect x="1" y="1" width="5.5" height="5.5" rx="1"/><rect x="17.5" y="1" width="5.5" height="5.5" rx="1"/><rect x="1" y="17.5" width="5.5" height="5.5" rx="1"/><rect x="17.5" y="17.5" width="5.5" height="5.5" rx="1"/><path d="M6.5 6.5l2 2M17.5 6.5l-2 2M6.5 17.5l2-2M17.5 17.5l-2-2"/></g>`,
    xl: `<rect x="1" y="1" width="22" height="22" rx="5" fill="currentColor"/><path d="M7 7l10 10M17 7L7 17" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>`,
    tb: `<g stroke-linecap="round" stroke-width="2.3"><path d="M12 3v18M3 12h18" stroke="#e8762c"/><path d="M5.5 6v4M3.5 8h4M18.5 6v4M16.5 8h4M5.5 14v4M3.5 16h4M18.5 14v4M16.5 16h4" stroke="#1f6feb"/></g>`,
    pbi: `<rect x="2" y="11" width="5" height="11" rx="1.5" fill="#f2c811"/><rect x="9.5" y="6" width="5" height="16" rx="1.5" fill="#e3ad0c"/><rect x="17" y="1" width="5" height="21" rx="1.5" fill="#c99a06"/>`,
    ai: `<g fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="7" width="18" height="14" rx="4"/><path d="M12 7V3.5"/></g><circle cx="12" cy="3" r="1.7" fill="currentColor"/><circle cx="9" cy="14" r="1.8" fill="currentColor"/><circle cx="15" cy="14" r="1.8" fill="currentColor"/>`
  };
  function wrapTxt(t, max) { const w = String(t).split(" "); const out = []; let cur = ""; w.forEach(x => { if ((cur + " " + x).trim().length > max) { if (cur) out.push(cur); cur = x; } else cur = (cur + " " + x).trim(); }); if (cur) out.push(cur); return out; }
  function archLayout(A, vertical) {
    const N = [], lanes = [];
    const outs = [["xl", "Excel", "week-1 analysis"], ["tb", "Tableau", "interactive dashboards"], ["pbi", "Power BI", "data model + DAX report"], ["ai", "AI / Insights", "Dexa · questions & answers"]];
    if (!vertical) {
      const W = 1280, H = 452, top = 34, cw = 176, xs = [12, 224, 436, 648, 860, 1080];
      ["SOURCES", "INGEST", "STORE", "TRANSFORM", "MODEL", "CONSUME"].forEach((t, i) => lanes.push({ x: xs[i] - 6, y: 0, w: i === 5 ? 196 : cw + 12, h: H, t }));
      A.sources.forEach((s, i) => { const n = A.sources.length, h = 92, gap = (H - top - 10 - n * h) / (n + 1); N.push({ id: "s" + i, x: xs[0], y: top + gap + i * (h + gap), w: cw, h, st: sty("src"), kind: "SOURCE", t: s[0], s: s[1], ic: "app" }); });
      const mid = top + (H - top) / 2;
      N.push({ id: "ing", x: xs[1], y: mid - 60, w: cw, h: 120, st: sty("ing"), kind: "EXTRACT", t: A.ingest[0], s: A.ingest[1], ic: "gear" });
      N.push({ id: "stg", x: xs[2], y: mid - 60, w: cw, h: 120, st: sty("stg"), kind: "LOAD", t: A.staging[0], s: A.staging[1], ic: "db" });
      N.push({ id: "trf", x: xs[3], y: mid - 60, w: cw, h: 120, st: sty("trf"), kind: "TRANSFORM", t: A.transform[0], s: A.transform[1], ic: "funnel" });
      N.push({ id: "mart", x: xs[4], y: mid - 76, w: cw, h: 152, st: sty("mart"), kind: "MODEL", t: A.mart[0], s: A.mart[1], ic: "star" });
      outs.forEach((o, i) => N.push({ id: o[0], x: xs[5], y: top + 6 + i * 102, w: 184, h: 88, st: sty(o[0]), kind: "SERVE", t: o[1], s: o[2], ic: o[0] }));
      return { W, H, N, lanes };
    }
    const W = 420, x0 = 14, cw = 392; let y = 10; const ns = A.sources.length, sw = (cw - (ns - 1) * 8) / ns;
    A.sources.forEach((s, i) => N.push({ id: "s" + i, x: x0 + i * (sw + 8), y, w: sw, h: 96, st: sty("src"), kind: "SOURCE", t: s[0], s: s[1], ic: "app", small: true }));
    y += 96 + 40;
    [["ing", "EXTRACT", A.ingest, "gear"], ["stg", "LOAD", A.staging, "db"], ["trf", "TRANSFORM", A.transform, "funnel"], ["mart", "MODEL", A.mart, "star"]].forEach(r => { N.push({ id: r[0], x: x0 + 30, y, w: cw - 60, h: 82, st: sty(r[0]), kind: r[1], t: r[2][0], s: r[2][1], ic: r[3], row: true }); y += 82 + 38; });
    const ow = (cw - 8) / 2;
    outs.forEach((o, i) => N.push({ id: o[0], x: x0 + (i % 2) * (ow + 8), y: y + Math.floor(i / 2) * 80, w: ow, h: 72, st: sty(o[0]), kind: "SERVE", t: o[1], s: o[2], ic: o[0], row: true }));
    return { W, H: y + 160 + 8, N, lanes };
  }
  function archSvg(A, vertical) {
    const { W, H, N, lanes } = archLayout(A, vertical); const by = Object.fromEntries(N.map(n => [n.id, n]));
    const R = (n) => [n.x + n.w, n.y + n.h / 2], Lf = (n) => [n.x, n.y + n.h / 2], B = (n) => [n.x + n.w / 2, n.y + n.h], T = (n) => [n.x + n.w / 2, n.y];
    const curve = (a, b) => vertical ? `M${a[0]},${a[1]} C${a[0]},${(a[1] + b[1]) / 2} ${b[0]},${(a[1] + b[1]) / 2} ${b[0]},${b[1]}` : `M${a[0]},${a[1]} C${(a[0] + b[0]) / 2},${a[1]} ${(a[0] + b[0]) / 2},${b[1]} ${b[0]},${b[1]}`;
    const P = [];
    const link = (f, t) => { const a = vertical ? B(by[f]) : R(by[f]), b = vertical ? T(by[t]) : Lf(by[t]); P.push({ id: f + "-" + t, d: curve(a, b), st: ["xl", "tb", "pbi", "ai"].includes(t) ? by[t].st : by[f].st }); };
    A.sources.forEach((s, i) => link("s" + i, "ing"));
    link("ing", "stg"); link("stg", "trf"); link("trf", "mart");
    ["xl", "tb", "pbi", "ai"].forEach(o => link("mart", o));
    const node = (n) => {
      const pad = n.small ? 9 : 13, tile = n.small ? 26 : 32;
      const row = n.row;   // vertical layout: icon left, text right
      const tx = row ? n.x + pad + tile + 10 : n.x + pad, avail = row ? n.w - pad * 2 - tile - 10 : n.w - pad * 2;
      const tl = wrapTxt(n.t, Math.max(8, Math.floor(avail / 7.4))).slice(0, 2);
      const sub = wrapTxt(n.s, Math.max(10, Math.floor(avail / 6.1))).slice(0, row ? 2 : (n.small ? (tl.length > 1 ? 1 : 2) : (n.h > 100 ? 3 : 2)));
      const ty = row ? n.y + pad + 26 : n.y + pad + tile + 18;
      return `<g class="nd" id="nd-${n.id}" style="${n.st}"><rect class="bg" x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="12"/>
        <rect class="tile" x="${n.x + pad}" y="${n.y + pad}" width="${tile}" height="${tile}" rx="8"/>
        <g class="ic" transform="translate(${n.x + pad + (tile - 24) / 2},${n.y + pad + (tile - 24) / 2})">${IC[n.ic] || ""}</g>
        <text class="k" x="${row ? tx : n.x + pad + tile + 8}" y="${row ? n.y + pad + 10 : n.y + pad + tile / 2 + 3}">${esc(n.kind)}</text>
        <circle class="dot" cx="${n.x + n.w - 12}" cy="${n.y + 12}" r="4"/>
        ${tl.map((t, i) => `<text class="t" x="${tx}" y="${ty + i * 14}">${esc(t)}</text>`).join("")}
        ${sub.map((l, i) => `<text class="s" x="${tx}" y="${ty + tl.length * 14 + 1 + i * 13}">${esc(l)}</text>`).join("")}</g>`;
    };
    const lanesSvg = vertical ? "" : lanes.map(l => `<rect class="lane" x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" rx="12"/><text class="lane-h" x="${l.x + 12}" y="${l.y + 21}">${l.t}</text>`).join("");
    return { svg: `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Animated data architecture: ${esc(A.sources.map(s => s[0]).join(", "))} → ${esc(A.ingest[0])} → ${esc(A.staging[0])} → ${esc(A.transform[0])} → ${esc(A.mart[0])} → Excel, Tableau, Power BI and AI insights">
      ${lanesSvg}${P.map(p => `<path class="pth" id="ap-${p.id}" d="${p.d}"/><path class="pth2" style="${p.st}" d="${p.d}"/>`).join("")}
      ${N.map(node).join("")}<g id="pk-layer"></g></svg>`, P };
  }
  function renderArch(host, A, opts) {
    opts = opts || {}; if (!host || !A) return;
    if (host._archStop) host._archStop();
    host.innerHTML = `<div class="arch2"><div class="arch2-top"><div class="arch2-title"><span class="lg">⚡</span><div><b>${esc(A.title || "Data architecture")}</b><small>How data travels from the source systems to your dashboards</small></div></div>
      <div class="arch2-steps">${["Extract", "Load", "Transform", "Model", "Serve"].map((s, i) => `<span data-st="${i}"><i>${i + 1}</i>${s}</span>`).join("")}</div>
      <span class="arch2-live"><i></i>Live pipeline</span></div><div class="arch2-svg"></div>
      <div class="arch2-feed" aria-live="off"></div>
      ${opts.caption === false ? "" : `<p class="arch2-cap">${A.caption || ""}</p>`}</div>`;
    const box = host.querySelector(".arch2-svg"), feed = host.querySelector(".arch2-feed"), steps = host.querySelectorAll(".arch2-steps span");
    let vertical = null, paths = {}, raf = 0, visible = true, packets = [], last = 0, spawnT = 0, logT = 0, li = 0;
    const draw = () => {
      const v = host.clientWidth < 660; if (v === vertical) return; vertical = v;
      const r = archSvg(A, v); box.innerHTML = r.svg; paths = {};
      r.P.forEach(p => { const el = box.querySelector("#ap-" + window.CSS.escape(p.id)); if (el) paths[p.id] = { el, len: el.getTotalLength(), st: p.st }; });
      packets = [];
    };
    draw();
    const logs = A.logs || [];
    const SC = { EXTRACT: "ing", LOAD: "stg", TRANSFORM: "trf", CHECK: "trf", MODEL: "mart", SERVE: "pbi" };
    const stamp = () => { const d = new Date(); return [d.getHours(), d.getMinutes(), d.getSeconds()].map(x => String(x).padStart(2, "0")).join(":"); };
    const pushLog = () => {
      if (!logs.length) return; const [stg, msg] = logs[li++ % logs.length];
      const div = document.createElement("div"); div.innerHTML = `<span class="tm">${stamp()}</span><span class="bd" style="${sty(SC[stg] || "ing")}">${esc(stg)}</span><span class="mg">${esc(msg)}</span>`;
      feed.appendChild(div); while (feed.children.length > 4) feed.removeChild(feed.firstChild);
      const si = { EXTRACT: 0, LOAD: 1, TRANSFORM: 2, CHECK: 2, MODEL: 3, SERVE: 4 }[stg]; steps.forEach((s, i) => s.classList.toggle("on", i === si));
    };
    for (let i = 0; i < 4; i++) pushLog();
    const chain = () => { const s = "s" + Math.floor(Math.random() * A.sources.length), o = ["xl", "tb", "pbi", "ai"][Math.floor(Math.random() * 4)]; return [s + "-ing", "ing-stg", "stg-trf", "trf-mart", "mart-" + o]; };
    const LBL = A.packet || ["row", "row", "clean", "fact", "KPI"];
    function setPk(p) {
      const Pp = paths[p.chain[p.seg]]; if (!Pp) return false;
      const lbl = [LBL[0], LBL[1] || LBL[0], LBL[2] || "clean", LBL[3] || "fact", LBL[4] || "KPI"][p.seg];
      const w = Math.max(30, lbl.length * 6.3 + 14);
      p.g.setAttribute("style", Pp.st);
      p.g.innerHTML = `<rect x="${-w / 2}" y="-8.5" width="${w}" height="17" rx="8.5"/><text x="0" y="3.6" text-anchor="middle">${esc(lbl)}</text>`;
      p.P = Pp; return true;
    }
    function hit(id) { const n = box.querySelector("#nd-" + id); if (!n) return; n.classList.add("hit"); clearTimeout(n._t); n._t = setTimeout(() => n.classList.remove("hit"), 480); }
    function frame(ts) {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden) { last = ts; return; }
      const dt = Math.min(0.05, (ts - (last || ts)) / 1000); last = ts;
      spawnT -= dt; logT -= dt;
      if (spawnT <= 0 && packets.length < (vertical ? 4 : 7)) { const layer = box.querySelector("#pk-layer"); if (layer) { const g = document.createElementNS("http://www.w3.org/2000/svg", "g"); g.setAttribute("class", "pk"); layer.appendChild(g); packets.push({ g, chain: chain(), seg: 0, t: 0, speed: 0.55 + Math.random() * 0.25 }); } spawnT = 0.75 + Math.random() * 0.6; }
      if (logT <= 0) { pushLog(); logT = 2; }
      packets = packets.filter(p => {
        if (!p.P && !setPk(p)) { p.g.remove(); return false; }
        p.t += dt * p.speed * (vertical ? 250 : 320) / p.P.len;
        if (p.t >= 1) { hit(p.chain[p.seg].split("-")[1]); p.seg++; p.t = 0; p.P = null; if (p.seg >= p.chain.length || !setPk(p)) { p.g.remove(); return false; } }
        const pt = p.P.el.getPointAtLength(p.t * p.P.len); p.g.setAttribute("transform", `translate(${pt.x.toFixed(1)},${pt.y.toFixed(1)})`);
        return true;
      });
    }
    let io = null;
    if (!RM()) { raf = requestAnimationFrame(frame); if ("IntersectionObserver" in window) { io = new IntersectionObserver(es => es.forEach(e => { visible = e.isIntersecting; }), { threshold: 0.05 }); io.observe(host); } }
    const onR = () => { clearTimeout(host._rt); host._rt = setTimeout(draw, 150); }; window.addEventListener("resize", onR);
    host._archStop = () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onR); if (io) io.disconnect(); };
  }

  /* ===================================================== comic engine ===================================================== */
  // panel: {w (2|3|4|6 of 6), bg, cap, sfx, note, table, cast:[[who, x%, mood, pose, flip]], say:[[who|'narr', html, kind]]}  ·  info panel: {w, info: html, cap, note}
  function panelHtml(pn, P, i) {
    const cls = `kp ${pn.w && pn.w < 6 ? "w" + pn.w : ""}`;
    if (pn.info != null) return `<div class="${cls}" data-p="${i}" style="background:${pn.bgc || "#fff"}">${pn.cap ? `<div class="kp-cap">${pn.cap}</div>` : ""}<div class="kp-info">${pn.info}</div>${pn.note ? `<div class="kp-note">${pn.note}</div>` : ""}</div>`;
    const xs = {}; (pn.cast || []).forEach(c => { xs[c[0]] = c[1]; });
    const talk = (pn.say || []).map((s, k) => {
      const who = s[0], x = xs[who], kind = s[2] || "";
      const al = who === "narr" ? "ac" : x == null ? "al" : x < 38 ? "al" : x > 62 ? "ar" : "ac";
      const nm = who === "narr" ? "" : (P[who] ? P[who].short : who);
      const tx = who !== "narr" && x != null && al === "al" ? `--tx2:${Math.max(16, Math.min(80, x * 2.4))}px;` : "";
      return `<div class="kb ${al} ${who === "narr" ? "narr" : kind}" data-who="${esc(who)}" style="${tx}">${nm ? `<span class="who">${esc(nm)}</span>` : ""}${s[1]}</div>`;
    }).join("");
    const cast = (pn.cast || []).map((c, k) => { const p = P[c[0]]; if (!p) return ""; return `<div class="ch ${c[4] ? "flip" : ""}" data-who="${esc(c[0])}" style="left:${c[1]}%;--ed:${(k * 0.12).toFixed(2)}s">${figure(p.look, c[2], c[3])}<span class="tag">${esc(p.short)}</span></div>`; }).join("");
    return `<div class="${cls}" data-p="${i}"><svg class="kp-bg" viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${BG[pn.bg || "plain"] || BG.plain}</svg>
      ${pn.cap ? `<div class="kp-cap">${pn.cap}</div>` : ""}${pn.sfx ? `<div class="kp-sfx">${esc(pn.sfx)}</div>` : ""}
      <div class="kp-talk">${talk}</div><div class="kp-cast ${pn.table ? "tbl" : ""}">${cast}${pn.table ? TABLE : ""}</div>${pn.note ? `<div class="kp-note">${pn.note}</div>` : ""}</div>`;
  }
  function people(D) {
    const yn = (() => { try { const p = window.VK_AUTH && window.VK_AUTH.profile && window.VK_AUTH.profile(); if (p && p.name) return String(p.name).split(" ")[0]; } catch (e) {} return ""; })();
    const mk = (o) => Object.assign({ side: "Client" }, o, { short: o.name.replace(/^Dr\.\s*/, "Dr. ").split(" ").slice(0, o.name.startsWith("Dr.") ? 2 : 1).join(" ") });
    return {
      sp: mk(D.sponsor), us: mk(D.user), ow: mk(D.owner),
      lead: { g: "m", name: "Mahendra Singh", short: "Mahendra", role: "BI Lead · your trainer", side: "BI team", cares: "Solving the right problem, quality, weekly demos.", look: { skin: "#D29A72", hair: "#17110d", hs: "side", top: "#1e3a8a", wear: "blazer", inner: "#e0f2fe", glasses: true, beard: true } },
      pm: { g: "f", name: "Riya Kapoor", short: "Riya", role: "Project Manager", side: "BI team", cares: "Timeline, owners, risks and status updates.", look: { skin: "#E8B58F", hair: "#2b1810", hs: "bun", top: "#9f1239", wear: "blazer", inner: "#fff", earrings: true, lanyard: "#0E86C9" } },
      ba: { g: "m", name: "Arjun Mehta", short: "Arjun", role: "Business Analyst", side: "BI team", cares: "Requirements, user stories, KPI definitions.", look: { skin: "#C98B62", hair: "#1a1a1a", hs: "short", top: "#f1f5f9", wear: "shirt", inner: "#fff", tie: "#1d4ed8", stubble: true } },
      de: { g: "f", name: "Neha Iyer", short: "Neha", role: "Data Engineer", side: "BI team", cares: "Pipelines, data quality, refresh on time.", look: { skin: "#DFA67F", hair: "#2a1a10", hs: "long", top: "#6d28d9", wear: "hoodie", earrings: true } },
      qa: { g: "m", name: "Kabir Sheikh", short: "Kabir", role: "QA / Test Analyst", side: "BI team", cares: "Every number on a dashboard must match SQL.", look: { skin: "#B97B54", hair: "#121212", hs: "spiky", top: "#15803d", wear: "tee", glasses: true } },
      you: { name: yn ? yn + " (you)" : "You", short: yn || "You", role: "Data Analyst / BI Developer", side: "BI team", cares: "SQL, KPIs, Excel, Tableau, Power BI, the story.", look: { skin: "#C68A63", hair: "#1c120c", hs: "curly", top: "#0f766e", wear: "hoodie" } }
    };
  }
  function pages(D) {
    const P = people(D), sp = P.sp.short, out = [];
    const card = (cls, tag, h, p, extra) => `<div class="kc ${cls}"><span class="tg">${tag}</span><h5>${esc(h)}</h5>${p ? `<p>${esc(p)}</p>` : ""}${extra || ""}</div>`;
    const firstLine = D.painIntro.replace(/<[^>]+>/g, "").split(/(?<=[.!?])\s/)[0];
    const qWho = (q) => q[3] === "ow" ? "ow" : q[3] === "us" ? "us" : "sp";
    // 1 — cold open
    out.push({ t: "The problem lands", panels: [
      { w: 3, bg: "cabin", cap: esc(D.when.split("·")[0].trim()) + " · " + esc(D.sponsor.role), sfx: "New email", cast: [["sp", 34, "worry", "facepalm"]], say: [["sp", D.incident, "shout"]] },
      { w: 3, bg: "burst", cap: "Two minutes later", sfx: "Phone call", cast: [["sp", 26, "angry", "phone"], ["lead", 76, "smile", "phone", true]], say: [["sp", `Mahendra, I need your team. ${esc(firstLine)}`], ["lead", `Understood. Before anyone builds anything, let's run a proper <b>kick-off</b>. Tomorrow, 10 AM?`]] },
      { w: 6, bg: "desk", cap: "BI team office · that evening", cast: [["lead", 14, "smile", "present"], ["pm", 38, "smile", "note"], ["ba", 60, "smile", "idle"], ["you", 86, "wow", "idle", true]], say: [["lead", `New client: <b>${esc(D.company)}</b>. Riya, book the room. Arjun, prepare discovery questions.`], ["pm", "Agenda and invite are going out now. 📅"], ["you", "Wait… I'm joining a REAL client kick-off? 😮"]] }] });
    // 2 — what is a kick-off
    out.push({ t: "What is a kick-off?", panels: [
      { w: 6, bg: "corridor", cap: "Next morning · 9:50 AM · outside the meeting room", cast: [["you", 22, "think", "chin"], ["lead", 74, "smile", "present", true]], say: [["you", `Sir, honestly… what <i>is</i> a kick-off? Just introductions?`], ["lead", `It's the <b>first official meeting</b> of a project. Client and BI team agree the <b>goal, scope, KPIs, data, timeline and owners</b> before anyone writes SQL or drags a chart.`], ["lead", `Get this wrong and you build a beautiful dashboard <b>nobody uses</b>.`, "shout"]] },
      { w: 6, info: `<div class="kg kg3">${[["1. Introductions", "Who's who, who decides, who owns the data", "#fff59d", -2], ["2. Business goal", "The pain, and the decision the dashboard must support", "#bae6fd", 2], ["3. Scope & users", "What's in, what's out, who uses it and how often", "#fbcfe8", -1], ["4. KPI definitions", "Exact formula for every number, in writing", "#bbf7d0", 2], ["5. Data & access", "Source systems, quality, refresh, privacy", "#fed7aa", -2], ["6. Plan & next steps", "Milestones, owners, risks, action items", "#ddd6fe", 1]].map(n => `<div class="kn" style="--r:${n[3]}deg;background:${n[2]}"><b>${n[0]}</b>${n[1]}</div>`).join("")}</div>`, cap: "Riya's agenda, stuck on the meeting-room door", note: "💡 Your job today: listen for pain, ask sharp questions, write the minutes." }] });
    // 3 — the room
    const roster = ["sp", "us", "ow", "lead", "pm", "ba", "de", "qa", "you"].map(k => { const p = P[k]; return `<div class="kc">${figure(p.look, k === "sp" ? "worry" : "smile", "idle")}<span class="sd ${p.side === "Client" ? "cl" : ""}">${p.side === "Client" ? "CLIENT · " + esc(D.company) : "BI TEAM"}</span><div class="nm">${esc(p.name)}</div><div class="rl">${esc(p.role)}</div><p>${esc(p.cares)}</p></div>`; }).join("");
    out.push({ t: "Who's in the room", panels: [
      { w: 6, bg: "meeting", table: true, cap: "10:00 AM · " + esc(D.company) + " · meeting room", cast: [["sp", 9, "worry", "cross"], ["us", 25, "smile", "idle"], ["ow", 41, "think", "laptop"], ["lead", 59, "smile", "present", true], ["ba", 75, "smile", "note", true], ["you", 91, "wow", "idle", true]], say: [["lead", `Thanks for having us. Quick introductions, then <b>${esc(sp)}</b> tells us what hurts.`], ["sp", "Let's do it. I want this sorted this quarter."]] },
      { w: 6, info: `<div class="kroster">${roster}</div>`, cap: "The cast · client side + BI team", note: "💡 In every real project, write down who SIGNS OFF (the sponsor) and who OWNS THE DATA." }] });
    // 4 — the pain
    out.push({ t: "Here's what's hurting us", panels: [
      { w: 4, bg: "meeting", table: true, cap: "10:05 AM · the sponsor opens", cast: [["sp", 22, "angry", "point"], ["us", 76, "worry", "cross", true]], say: [["sp", D.painIntro, "shout"], ["us", D.userPain]] },
      { w: 2, bg: "corridor", cap: "In your head", cast: [["you", 50, "think", "chin"]], say: [["you", `So the real problem isn't "we need a dashboard"… it's <b>${esc(D.realProblem)}</b>.`, "think"]] },
      { w: 6, info: `<div class="kg kg3">${D.pains.map((p, i) => card("pain", "Pain " + (i + 1), p[0], p[1])).join("")}</div>`, cap: "Arjun writes the pain points on the board" }] });
    // 5 — discovery
    out.push({ t: "Ask before you build", panels: [
      { w: 6, bg: "meeting", table: true, cap: "10:20 AM · discovery questions", cast: [["ba", 14, "smile", "note"], ["you", 38, "smile", "point"], [qWho(D.qa[0]), 80, "think", "idle", true]], say: [["ba", "Let's turn the pain into requirements. Go ahead, ask."], ["you", `${esc(D.qa[0][0])}<span class="why">Why ask: ${esc(D.qa[0][2])}</span>`], [qWho(D.qa[0]), esc(D.qa[0][1])]] },
      ...D.qa.slice(1).map(q => ({ w: 3, bg: "meeting", table: true, cast: [["you", 26, "think", "idle"], [qWho(q), 74, qWho(q) === "ow" ? "think" : "smile", qWho(q) === "ow" ? "laptop" : "present", true]], say: [["you", `${esc(q[0])}<span class="why">Why ask: ${esc(q[2])}</span>`], [qWho(q), esc(q[1])]] }))] });
    // 6 — conflict
    const C = D.conflict;
    out.push({ t: "Wait… whose number is right?", panels: [
      { w: 6, bg: "burst", table: true, cap: "10:35 AM · the argument", sfx: "Disagreement", cast: [["us", 18, "angry", "point"], ["sp", 50, "angry", "cross"], ["ow", 82, "worry", "shrug", true]], say: [["us", `For <b>${esc(C.kpi)}</b>, we always ${esc(C.a)}.`, "shout"], ["sp", `No! ${esc(C.b)}.`, "shout"], ["ow", "…and the source system can give you both. "]] },
      { w: 3, bg: "meeting", table: true, cap: "The BI team steps in", cast: [["ba", 26, "smile", "present"], ["you", 76, "smile", "note", true]], say: [["ba", "Both are valid questions. They just need <b>different names</b>."], ["you", "Can we write both definitions down and agree which one is the <b>official</b> KPI?"]] },
      { w: 3, info: `${card("ok", "Decision · logged in the KPI document", C.kpi, C.fix)}<div class="kc"><span class="tg">Lesson</span><p>Most dashboard fights are really <b>definition</b> fights. Settle them at kick-off, in writing, approved by the sponsor.</p></div>`, cap: "Conflict resolved" }] });
    // 7 — data reality
    out.push({ t: "Where does the data live?", panels: [
      { w: 3, bg: "meeting", table: true, cap: "10:45 AM · data reality check", cast: [["ow", 28, "think", "laptop"], ["de", 76, "worry", "laptop", true]], say: [["ow", D.dataIntro], ["de", "I profiled a sample export last night. You need to see this before we promise any numbers."]] },
      { w: 3, info: `<div class="kg kg1">${D.arch.sources.map(s => card("", "Source system", s[0], s[1])).join("")}</div>`, cap: "Source systems" },
      { w: 4, info: `<div class="kg kg3">${D.issues.map(x => card("warn", "⚠ Data issue", x[0], x[1])).join("")}</div>`, cap: "What Neha found" },
      { w: 2, bg: "desk", cast: [["qa", 50, "smile", "note"]], say: [["qa", "I'll write <b>test cases</b>: every dashboard number must match SQL. ✔"]] }] });
    // 8 — architecture
    out.push({ t: "How the data will flow", arch: true, panels: [
      { w: 6, bg: "board", cap: "11:00 AM · Neha grabs the marker", cast: [["de", 16, "happy", "marker"], ["you", 84, "wow", "idle", true]], say: [["de", D.archTalk], ["you", "So the dashboards never touch the raw systems directly?"], ["de", "Never. <b>One governed model</b>, and every tool reads from it."]] },
      { w: 6, info: `<div class="ko-arch"></div>`, cap: "The architecture (live)" }] });
    // 9 — KPIs
    out.push({ t: "Agree the KPIs, in writing", panels: [
      { w: 6, info: `<div class="kg kg${Math.min(4, D.kpis.length)}">${D.kpis.map((k, i) => card("ok", "KPI " + (i + 1), k[0], k[2], `<code>${esc(k[1])}</code>`)).join("")}</div>`, cap: "11:20 AM · the KPI board" },
      { w: 6, bg: "meeting", table: true, cast: [["sp", 18, "think", "chin"], ["qa", 50, "smile", "note"], ["lead", 82, "happy", "present", true]], say: [["sp", `So Excel, Tableau and Power BI will all show the <b>same</b> ${esc(D.kpiPain)}?`], ["lead", "Yes. These definitions go into the <b>KPI document</b>, and Kabir checks every number against SQL."], ["qa", "If a number doesn't match SQL, it doesn't ship. 🔒"]] }] });
    // 10 — plan
    const STG = [["Kick-off", "Week 0", "🚀"], ["Excel", "Week 1", "🧮"], ["Tableau", "Week 2", "📊"], ["Power BI", "Week 3", "📈"], ["Final", "Week 4", "🏆"]];
    out.push({ t: "The plan", panels: [
      { w: 6, bg: "board", cap: "11:40 AM · Riya takes the stage", cast: [["pm", 16, "smile", "marker"], ["sp", 84, "smile", "idle", true]], say: [["pm", `We demo <b>every week</b>, so ${esc(sp)} can steer early instead of being surprised at the end.`], ["sp", "Good. No big-bang reveal on the last day."]] },
      { w: 6, info: `<div class="ktime">${STG.map((s, i) => `<div><span class="dt">${s[2]}</span><h6>${s[0]}</h6><div class="wk">${s[1]}</div><p>${esc(D.plan[i])}</p></div>`).join("")}</div>`, cap: "Milestones", note: "🎯 This is your capstone: these are the group presentations on the Project Schedule." },
      { w: 3, info: card("", "Owners", "Who does what", "", `<p>✅ <b>${esc(D.sponsor.name)}</b>: approves scope, signs off each milestone<br>✅ <b>${esc(D.owner.name)}</b>: data access within 1 day<br>✅ <b>${esc(D.user.name)}</b>: tests the dashboard as a real user<br>✅ <b>Riya</b>: plan & status · <b>Arjun</b>: requirements<br>✅ <b>Neha</b>: pipeline · <b>Kabir</b>: QA against SQL<br>✅ <b>${esc(P.you.short)}</b>: KPIs, Excel, Tableau, Power BI, the story</p>`), cap: "Who does what" },
      { w: 3, info: card("warn", "Risks → what we do", "Risk register", "", D.risks.map(r => `<p style="margin-top:5px">⚠ <b>${esc(r[0])}</b> → ${esc(r[1])}</p>`).join("")), cap: "Risks" }] });
    // 11 — wrap
    out.push({ t: "Minutes of meeting", panels: [
      { w: 4, info: `<div class="kmom"><h5>📝 MoM · ${esc(D.project)} kick-off</h5><p style="margin:0 0 8px"><b>Goal:</b> ${esc(D.goal)}</p><table><thead><tr><th>Action item</th><th>Owner</th><th>Due</th></tr></thead><tbody>${D.actions.map(a => `<tr><td>${esc(a[0])}</td><td>${esc(a[1] === "YOU" ? P.you.short : a[1])}</td><td>${esc(a[2])}</td></tr>`).join("")}</tbody></table></div>`, cap: "12:05 PM · you send the minutes", bgc: "#fffdf5" },
      { w: 2, bg: "meeting", table: true, sfx: "Agreed", cast: [["sp", 30, "happy", "present"], ["lead", 72, "happy", "present", true]], say: [["sp", esc(D.quote)]] },
      { w: 6, bg: "desk", cap: "Back at the BI office", cast: [["pm", 12, "happy", "cheer"], ["you", 36, "happy", "cheer"], ["de", 60, "happy", "laptop"], ["lead", 86, "smile", "wave", true]], say: [["you", "That was way more useful than I expected! 🙌"], ["lead", "A good kick-off saves weeks of rework. Now the real work starts."]] }] });
    // 12 — teaser + quiz
    const Q = [["What is the main goal of a kick-off meeting?", ["Show the client a finished dashboard", "Agree goal, scope, KPIs, data, timeline and owners before building", "Load the data into the database"], 1, "A kick-off aligns everyone BEFORE building. Dashboards come later."], ["Two stakeholders define the same KPI differently. Best move?", ["Pick the one you like", "Show both without labels", "Write both definitions, name them clearly and get the sponsor to approve the official one"], 2, "Name both, document them, and let the sponsor approve the official KPI."]].concat(D.quiz || []);
    out.push({ t: "To be continued…", quiz: Q, panels: [
      { w: 6, bg: "night", cap: "That night · 11:48 PM", sfx: "Late night", cast: [["de", 28, "wow", "laptop"], ["you", 72, "worry", "facepalm", true]], say: [["de", D.ep2], ["you", "Next episode: <b>The Data Arrives</b>. Bring coffee. ☕"]] },
      { w: 6, info: `<div>${Q.map((q, i) => `<div class="kq" data-q="${i}"><p>${i + 1}. ${esc(q[0])}</p>${q[1].map((o, j) => `<button type="button" data-o="${j}">${esc(o)}</button>`).join("")}<div class="fb"></div></div>`).join("")}<div class="kcta"><button type="button" data-go="problem">🎯 Open the business problem</button><button type="button" data-go="kpis">📊 See all KPIs</button><button type="button" data-go="schedule">📅 My presentation schedule</button><button type="button" data-replay>🔁 Read again</button></div></div>`, cap: "Your turn · quick check 🧠", bgc: "#fffdf5" }] });
    return out;
  }
  /* ---- voices: every character speaks with a male/female voice that suits them (browser speech, free, no key) ---- */
  const FEMALE = new Set(["kavya", "priya", "ankita", "sana", "meera", "farah", "lakshmi", "ayesha", "ananya", "ishita", "fatima", "sneha", "pooja", "ritu", "dr. ritu", "anjali", "nisha", "tanvi", "riya", "neha", "zoya"]);
  const LSK = "ko_voice_v1";
  const prefs = (() => { try { return Object.assign({ on: true, you: "m", rate: 1 }, JSON.parse(localStorage.getItem(LSK) || "{}")); } catch (e) { return { on: true, you: "m", rate: 1 }; } })();
  const savePrefs = () => { try { localStorage.setItem(LSK, JSON.stringify(prefs)); } catch (e) {} };
  const SPEECH = typeof window.speechSynthesis !== "undefined" && typeof window.SpeechSynthesisUtterance !== "undefined";
  const FEM_RE = /female|woman|zira|heera|neerja|swara|kalpana|aditi|raveena|veena|lekha|samantha|victoria|karen|moira|tessa|susan|hazel|catherine|sonia|libby|aria|jenny|michelle|emma|ava|allison|serena|fiona|kate|salli|joanna|kendra|kimberly|ivy|amy|google uk english female|google us english|ananya|isha|priya|anjali|kajal|nicky|shelley|sandy|flo|grandma/i;
  const MAL_RE = /\bmale\b|\bman\b|david|mark|ravi|prabhat|hemant|madhur|daniel|alex|fred|rishi|george|guy|ryan|thomas|oliver|arthur|aaron|tom\b|christopher|eric|james|brian|matthew|joey|justin|russell|google uk english male|kunal|aarav|rocko|reed|eddy|grandpa/i;
  let VOICES = null;
  const QUAL = (v) => /natural|neural/i.test(v.name) ? 3 : /online|premium|enhanced|wavenet/i.test(v.name) ? 2 : /google/i.test(v.name) ? 1 : 0;
  function voices() {
    if (!SPEECH) return [];
    const all = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang));
    if (!all.length) return [];
    const score = (v) => QUAL(v) * 30 + (/en-IN/i.test(v.lang) ? 20 : /en-GB/i.test(v.lang) ? 8 : /en-US/i.test(v.lang) ? 6 : 0) + (v.localService === false ? 3 : 0);
    const sorted = all.slice().sort((a, b) => score(b) - score(a));
    // keep only the best quality tier available for each gender, so nobody gets a robotic voice when a human-like one exists
    const best = (arr) => { if (!arr.length) return arr; const top = QUAL(arr[0]); return arr.filter(v => QUAL(v) >= Math.min(top, 2) || QUAL(v) === top); };
    const f = sorted.filter(v => FEM_RE.test(v.name) && !MAL_RE.test(v.name)), m = sorted.filter(v => MAL_RE.test(v.name));
    const other = sorted.filter(v => !f.includes(v) && !m.includes(v));
    return (VOICES = { f: best(f.length ? f : other), m: best(m.length ? m : other), any: sorted });
  }
  if (SPEECH) { voices(); try { speechSynthesis.addEventListener("voiceschanged", voices); } catch (e) { speechSynthesis.onvoiceschanged = voices; } }
  // each character keeps ONE steady voice for the whole story. Pitch changes are kept tiny: big pitch shifts are what make browser voices sound robotic.
  function voiceFor(key, P) {
    const V = VOICES || voices(); const p = P[key] || {};
    const g = key === "narr" ? "f" : key === "you" ? prefs.you : p.g || (FEMALE.has(String(p.short || "").toLowerCase()) ? "f" : "m");
    const order = { f: ["narr", "sp", "us", "pm", "ow", "de", "you"], m: ["lead", "sp", "us", "ow", "ba", "qa", "you"] }[g];
    const list = (V && V[g]) || [];
    const idx = Math.max(0, order.indexOf(key));
    const v = list.length ? list[idx % list.length] : null;
    // when two people must share one voice, a gentle pitch offset (±4–6%) keeps them apart without sounding artificial
    const share = list.length ? Math.floor(idx / list.length) : idx;
    const off = [0, -0.05, 0.05, -0.08, 0.08][share % 5] || 0;
    const wrongGender = v && (g === "f" ? !FEM_RE.test(v.name) || MAL_RE.test(v.name) : !MAL_RE.test(v.name));
    const gfix = wrongGender ? (g === "f" ? 0.12 : -0.12) : 0;
    return { voice: v, pitch: 1 + off + gfix, rate: 0.96 * prefs.rate };
  }
  const NATURAL = (v) => !!v && QUAL(v) >= 2;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  function hushAll() { if (SPEECH) try { speechSynthesis.cancel(); } catch (e) {} }
  // split into natural phrases: real sentence ends only (not "4.2" or "Dr."), and join short sentences so the voice flows instead of stopping and starting
  function phrases(t) {
    const raw = t.replace(/\b(Dr|Mr|Mrs|Ms|vs|etc|e\.g|i\.e)\./gi, "$1․").split(/(?<=[.!?])\s+(?=["'(A-Z0-9])/);
    const out = [];
    raw.forEach(x => { x = x.replace(/․/g, ".").trim(); if (!x) return; if (x.length > 220) x.split(/(?<=[,;:])\s+/).forEach(y => out.push(y)); else if (out.length && out[out.length - 1].length + x.length < 140 && !/[?!]$/.test(out[out.length - 1])) out[out.length - 1] += " " + x; else out.push(x); });
    return out;
  }
  // speak(text, characterKey, people, kind, alive) → Promise<boolean>; alive() returning false stops it at once
  async function speak(text, key, P, kind, alive) {
    alive = alive || (() => true);
    if (!SPEECH || !prefs.on || RM() || !speechSynthesis.getVoices().length) return true;
    const t = speechText(text); if (!t) return true;
    const vf = voiceFor(key, P), nat = NATURAL(vf.voice);
    // calm, clear delivery: emotion is only a light touch on speed (never on pitch for human-like voices)
    const mood = { shout: [1.03, 1.02], think: [0.94, 1], whisper: [0.95, 1], narr: [0.96, 1] }[kind] || [1, 1];
    const pitch = nat ? 1 + (vf.pitch - 1) * 0.5 : Math.max(0.85, Math.min(1.2, vf.pitch * mood[1]));
    const parts = phrases(t);
    for (let i = 0; i < parts.length; i++) {
      if (!alive()) return false;
      const ok = await new Promise(res => {
        const u = new SpeechSynthesisUtterance(parts[i]);
        try { if (vf.voice) { u.voice = vf.voice; u.lang = vf.voice.lang; } else u.lang = "en-IN"; } catch (e) { u.lang = "en-IN"; }
        try { u.pitch = pitch; u.rate = Math.max(0.7, Math.min(1.4, vf.rate * mood[0])); u.volume = 1; } catch (e) {}
        let done = false, started = false; const fin = (v) => { if (done) return; done = true; clearInterval(iv); clearTimeout(lim); res(v); };
        u.onstart = () => { started = true; }; u.onend = () => fin(true); u.onerror = () => fin(true);
        const lim = setTimeout(() => fin(true), 3000 + parts[i].length * 100 / vf.rate);
        setTimeout(() => { if (!started && !speechSynthesis.speaking) fin(true); }, 1600);   // no audio on this device: don't hold anything up
        const iv = setInterval(() => { if (!alive()) { hushAll(); fin(false); } }, 120);
        try { speechSynthesis.speak(u); } catch (e) { fin(true); }
      });
      if (!ok) return false;
      if (i < parts.length - 1) await sleep(/[,;:]$/.test(parts[i]) ? 140 : /\?$/.test(parts[i]) ? 380 : 300);   // a natural breath between sentences
    }
    return alive();
  }
  const ACR = { KPI: "K P I", KPIs: "K P Is", BI: "B I", QA: "Q A", HR: "H R", CRM: "C R M", EMR: "E M R", ETL: "E T L", SQL: "S Q L", CSV: "C S V", SLA: "S L A", SLAs: "S L As", ERP: "E R P", API: "A P I", UAT: "U A T", ROI: "R O I", AOV: "A O V", CTR: "C T R", CAC: "C A C", LTV: "L T V", NPS: "N P S", YoY: "year on year", MoM: "minutes of meeting", QoQ: "quarter on quarter", FY: "financial year", PM: "P M", AM: "A M", OTIF: "O T I F", SKU: "S K U", SKUs: "S K Us", ICU: "I C U", OPD: "O P D", ALOS: "A L O S", BRD: "B R D", DAX: "dax", POS: "P O S", UPI: "U P I", EOD: "end of day", ASAP: "as soon as possible", FAQ: "F A Q", OEE: "O E E", MTTR: "M T T R", NAV: "N A V", P2P: "peer to peer", CEO: "C E O", CFO: "C F O", COO: "C O O", CXO: "C X O", VP: "V P" };
  const ACR_RE = new RegExp("\\b(" + Object.keys(ACR).sort((a, b) => b.length - a.length).join("|") + ")\\b", "g");
  function speechText(t) {
    return String(t).replace(/\p{Extended_Pictographic}|️|‍/gu, "")
      .replace(/₹\s?([\d.,]+)\s?(Cr|cr|crore)\b/g, "$1 crore rupees").replace(/₹\s?([\d.,]+)\s?(L|lakh|Lakh)\b/g, "$1 lakh rupees").replace(/₹\s?([\d.,]+)\s?(K|k)\b/g, "$1 thousand rupees").replace(/₹\s?([\d.,]+)/g, "$1 rupees").replace(/₹/g, " rupees ")
      .replace(/(\d)\s?%/g, "$1 percent").replace(/(\d)\s?(K|k)\b/g, "$1 thousand").replace(/(\d)\s?Cr\b/g, "$1 crore").replace(/(\d)\s?(hrs?)\b/g, (m, a, h) => a + (h === "hr" ? " hour" : " hours")).replace(/(\d)\s?mins?\b/g, "$1 minutes")
      .replace(/(\d),(\d{3})/g, "$1$2").replace(/(\d)\s?[-–]\s?(\d)/g, "$1 to $2")
      .replace(/÷/g, " divided by ").replace(/×/g, " times ").replace(/→|->|⇒/g, " to ").replace(/\s&\s/g, " and ").replace(/\s\+\s/g, " plus ").replace(/\s=\s/g, " equals ").replace(/\s\/\s/g, " or ").replace(/(\w)\/(\w)/g, "$1 or $2")
      .replace(/\bvs\.?\b/gi, "versus").replace(/\be\.g\./gi, "for example").replace(/\bi\.e\./gi, "that is").replace(/\betc\./gi, "etcetera").replace(/\bw\/o\b/gi, "without")
      .replace(ACR_RE, (m) => ACR[m])
      .replace(/[“”"]/g, "").replace(/[·•|]/g, ", ").replace(/…|\.\.\./g, ", ").replace(/\s*—\s*|\s–\s/g, ", ").replace(/[()\[\]]/g, ", ")
      .replace(/\s+,/g, ",").replace(/,\s*,+/g, ",").replace(/,\s*([.!?])/g, "$1").replace(/^\s*,\s*/, "").replace(/\s+/g, " ").trim();
  }

  /* ---- player: reveals panels one by one, characters talk while their line types out; Play = runs on its own like a GIF ---- */
  function renderDeck(host, D) {
    const S = pages(D), P = people(D); let si = 0, beat = 0, playing = false, gen = 0, busy = false, timer = 0;
    host.innerHTML = `<div class="ko"><div class="ko-head"><div><span class="ko-ep">🎬 Animated story · Episode 1 · ${S.length} pages · about 8 minutes</span><h2>The Kick-off: ${esc(D.project)}</h2><p>Watch a real Data Analyst kick-off meeting play out: the client, the BI team and you. Press <b>Play</b> to watch it like a video, or <b>Next</b> to go at your own pace.</p></div></div>
      <div class="ko-play"><button type="button" class="big">▶ Play the story</button>
        ${SPEECH ? `<button type="button" class="ko-vbtn" data-v="on" aria-pressed="${prefs.on}">${prefs.on ? "🔊 Voices on" : "🔇 Voices off"}</button>
        <label class="ko-vsel">Your voice <select data-v="you"><option value="m" ${prefs.you === "m" ? "selected" : ""}>👨 Male</option><option value="f" ${prefs.you === "f" ? "selected" : ""}>👩 Female</option></select></label>
        <label class="ko-vsel">Speed <select data-v="rate">${[[0.85, "Slow"], [1, "Normal"], [1.15, "Fast"]].map(r => `<option value="${r[0]}" ${+prefs.rate === r[0] ? "selected" : ""}>${r[1]}</option>`).join("")}</select></label>` : ""}
        <span class="ko-vinfo">${SPEECH ? "Every character speaks in their own voice. " : ""}Lines type out and pages turn by themselves. Pause any time.</span></div>
      <div class="ko-book" tabindex="0" aria-roledescription="comic book"><div class="ko-slot"></div>
      <div class="ko-nav"><button type="button" class="pv" aria-label="Previous page">←</button><button type="button" class="pl">▶ Play</button>${SPEECH ? `<button type="button" class="vo" aria-label="Voices on or off">${prefs.on ? "🔊" : "🔇"}</button>` : ""}<button type="button" class="go">Next →</button><span class="ko-scene"></span><div class="ko-prog" aria-hidden="true"><i></i></div></div></div></div>`;
    const slot = host.querySelector(".ko-slot"), book = host.querySelector(".ko-book"), go = host.querySelector(".go"), pv = host.querySelector(".pv"), pl = host.querySelector(".pl"), big = host.querySelector(".ko-play .big"), sc = host.querySelector(".ko-scene"), pr = host.querySelector(".ko-prog i");
    const wait = (ms, g) => new Promise(res => { clearTimeout(timer); timer = setTimeout(() => res(g === gen), ms); });
    const hush = () => { if (SPEECH) try { speechSynthesis.cancel(); } catch (e) {} };
    // speak one line; resolves when the voice finishes (or is stopped). Chrome sometimes never fires "end", so there is a time limit.
    function say(text, key, g, kind) { return speak(text, key, P, kind || (key === "narr" ? "narr" : ""), () => g === gen); }
    function sayOld(text, key, g) {
      if (!SPEECH || !prefs.on || RM() || !speechSynthesis.getVoices().length) return Promise.resolve(true);
      const t = speechText(text); if (!t) return Promise.resolve(true);
      return new Promise(res => {
        const u = new SpeechSynthesisUtterance(t), vf = voiceFor(key, P);
        try { if (vf.voice) { u.voice = vf.voice; u.lang = vf.voice.lang; } else u.lang = "en-IN"; } catch (e) { u.lang = "en-IN"; }
        try { u.pitch = vf.pitch; u.rate = vf.rate; } catch (e) {}
        let done = false; const fin = () => { if (done) return; done = true; clearInterval(iv); clearTimeout(lim); res(g === gen); };
        let started = false; u.onstart = () => { started = true; };
        u.onend = fin; u.onerror = fin;
        const lim = setTimeout(fin, 2500 + t.length * 95 / vf.rate);
        setTimeout(() => { if (!started && !speechSynthesis.speaking) fin(); }, 1600);   // no audio on this device: don't hold the story
        const iv = setInterval(() => { if (g !== gen) { hush(); fin(); } }, 150);
        try { speechSynthesis.speak(u); } catch (e) { fin(); }
      });
    }
    const estMs = (text) => Math.min(9500, Math.max(800, speechText(text).length * 64 / prefs.rate + (speechText(text).match(/[.!?]/g) || []).length * 200));
    const vb = host.querySelector(".ko-vbtn"), vo = host.querySelector(".ko-nav .vo"), vinfo = host.querySelector(".ko-vinfo");
    const showVoiceInfo = () => { if (!vinfo || !SPEECH) return; const V = voices(); const all = V && V.any ? V.any : []; const nat = all.filter(NATURAL);
      vinfo.innerHTML = !all.length ? "Your browser has no voices, so the story plays as text." : nat.length ? `🎙️ Natural voices found (${esc(nat[0].name.replace(/ - .*$/, ""))}${nat.length > 1 ? " and " + (nat.length - 1) + " more" : ""}). Every character speaks in their own voice.` : `🎙️ Using your browser's basic voices. For the most natural, human-like voices open this page in <b>Microsoft Edge</b> (free "Natural" Indian voices).`; };
    showVoiceInfo(); if (SPEECH) try { speechSynthesis.addEventListener("voiceschanged", showVoiceInfo); } catch (e) {}
    const setVoice = (on) => { prefs.on = on; savePrefs(); if (!on) hush(); if (vb) { vb.textContent = on ? "🔊 Voices on" : "🔇 Voices off"; vb.setAttribute("aria-pressed", on); } if (vo) vo.textContent = on ? "🔊" : "🔇"; };
    if (vb) vb.addEventListener("click", () => setVoice(!prefs.on)); if (vo) vo.addEventListener("click", () => setVoice(!prefs.on));
    host.querySelectorAll("select[data-v]").forEach(sel => sel.addEventListener("change", () => { prefs[sel.dataset.v] = sel.dataset.v === "rate" ? +sel.value : sel.value; savePrefs(); }));
    const plain = (el) => (el.textContent || "").replace(/\s+/g, " ").trim();
    function setPlay(on) {
      playing = on; pl.textContent = on ? "⏸ Pause" : "▶ Play"; big.textContent = on ? "⏸ Pause the story" : "▶ Play the story";
      if (!on) { hush(); if (busy) { gen++; busy = false; finishPanel(slot.querySelector(`.kp[data-p="${beat - 1}"]`)); label(); } }
      if (on && !busy) advance();
    }
    // type the bubble's text nodes out (keeps bold/links); resolves false if interrupted
    function typeOut(el, g, msWanted) {
      const nodes = []; const walk = (n) => n.childNodes.forEach(c => { if (c.nodeType === 3) nodes.push(c); else if (!(c.classList && c.classList.contains("who"))) walk(c); }); walk(el);
      const full = nodes.map(n => n.nodeValue); const total = full.reduce((a, t) => a + t.length, 0);
      if (RM() || !total) return Promise.resolve(true);
      nodes.forEach(n => { n.nodeValue = ""; });
      const caret = document.createElement("span"); caret.className = "caret"; el.appendChild(caret);
      const ms = msWanted || Math.min(3600, Math.max(700, total * 26)); const t0 = performance.now();
      return new Promise(res => {
        const tick = (now) => {
          if (g !== gen) { nodes.forEach((n, i) => { n.nodeValue = full[i]; }); caret.remove(); return res(false); }
          let left = Math.round(Math.min(1, (now - t0) / ms) * total);
          nodes.forEach((n, i) => { const k = Math.min(full[i].length, left); n.nodeValue = full[i].slice(0, k); left -= k; });
          if (now - t0 >= ms) { caret.remove(); return res(true); }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    }
    async function playPanel(el, g) {
      el.classList.add("in");
      if (!RM()) { const r = el.getBoundingClientRect(); if (r.bottom > innerHeight - 80 || r.top < 0) el.scrollIntoView({ block: r.height > innerHeight - 160 ? "start" : "center", behavior: "smooth" }); }
      const bubbles = [...el.querySelectorAll(".kb")];
      if (!bubbles.length) {
        const cap = el.querySelector(".kp-cap"), note = el.querySelector(".kp-note"), words = plain(el).split(" ").length;
        const spoken = prefs.on && SPEECH && (playing || cap) ? say([cap ? plain(cap) : "", note ? plain(note) : ""].filter(Boolean).join(". "), "narr", g) : null;
        const ok = await wait(playing ? Math.min(11000, Math.max(3000, words * 230)) : 250, g);
        if (spoken) await spoken;
        return ok && g === gen;
      }
      if (!(await wait(RM() ? 0 : 450, g))) return false;
      for (const b of bubbles) {
        const who = el.querySelector(`.ch[data-who="${b.dataset.who}"]`);
        b.classList.add("show");
        if (who) who.classList.add("talk");
        const line = [...b.childNodes].filter(n => !(n.classList && (n.classList.contains("who") || n.classList.contains("why") || n.classList.contains("caret")))).map(n => n.textContent).join(" ");
        const voiceOn = SPEECH && prefs.on && !RM() && speechSynthesis.getVoices().length > 0;
        const spoken = voiceOn ? say(line, b.dataset.who, g, b.classList.contains("shout") ? "shout" : b.classList.contains("think") ? "think" : "") : null;
        let ok = await typeOut(b, g, voiceOn ? estMs(line) * 0.85 : 0);
        if (spoken) ok = (await spoken) && ok;
        if (who) who.classList.remove("talk");
        b.classList.add("done");
        if (!ok) return false;
        const words = plain(b).split(" ").length;
        if (!(await wait(playing ? (SPEECH && prefs.on ? 350 : Math.min(2600, 500 + words * 70)) : 220, g))) return false;
      }
      return true;
    }
    function finishPanel(el) { if (!el) return; el.classList.add("in"); el.querySelectorAll(".kb").forEach(b => b.classList.add("show", "done")); el.querySelectorAll(".ch.talk").forEach(c => c.classList.remove("talk")); }
    function show(i, all) {
      gen++; clearTimeout(timer); busy = false; hush();
      si = Math.max(0, Math.min(S.length - 1, i)); const s = S[si];
      slot.innerHTML = `<div class="ko-page"><div class="ko-ptitle"><span class="no">PAGE ${si + 1}</span><h3>${esc(s.t)}</h3></div><div class="ko-grid">${s.panels.map((p, k) => panelHtml(p, P, k)).join("")}</div></div>`;
      beat = 0;
      if (s.arch) renderArch(slot.querySelector(".ko-arch"), D.arch, { caption: false });
      if (s.quiz) wireQuiz(s.quiz);
      slot.querySelectorAll("[data-go]").forEach(bt => bt.addEventListener("click", () => { setPlay(false); if (typeof window.switchView === "function") window.switchView(bt.dataset.go); }));
      const rp = slot.querySelector("[data-replay]"); if (rp) rp.addEventListener("click", () => { show(0); book.scrollIntoView({ block: "start" }); setPlay(true); });
      sc.textContent = `Page ${si + 1}/${S.length} · ${s.t}`; pr.style.width = ((si + 1) / S.length * 100) + "%";
      pv.disabled = si === 0;
      if (all) { s.panels.forEach((_, k) => finishPanel(slot.querySelector(`.kp[data-p="${k}"]`))); beat = s.panels.length; label(); return; }
      label(); step();
    }
    function label() { const s = S[si]; go.textContent = busy ? "Next →" : beat >= s.panels.length ? (si === S.length - 1 ? "🔁 Start again" : "Next page →") : "Next →"; }
    async function step() {
      const s = S[si]; if (beat >= s.panels.length) return;
      const el = slot.querySelector(`.kp[data-p="${beat}"]`); beat++; label();
      const g = gen; busy = true; label(); const ok = await playPanel(el, g); if (g !== gen) return; busy = false; label();
      if (ok && playing) advance();
    }
    function advance() {
      const s = S[si];
      if (beat < s.panels.length) return step();
      if (si < S.length - 1) { show(si + 1); book.scrollIntoView({ block: "start", behavior: RM() ? "auto" : "smooth" }); }
      else setPlay(false);   // last page: stop on the quiz
    }
    function next() {
      const s = S[si];
      if (busy) { gen++; busy = false; hush(); finishPanel(slot.querySelector(`.kp[data-p="${beat - 1}"]`)); label(); if (beat < s.panels.length) step(); return; }   // first click finishes the current panel
      if (beat < s.panels.length) step();
      else { show(si < S.length - 1 ? si + 1 : 0); book.scrollIntoView({ block: "start", behavior: RM() ? "auto" : "smooth" }); }
    }
    function prev() { if (si > 0) { setPlay(false); show(si - 1, true); book.scrollIntoView({ block: "start" }); } }
    function wireQuiz(Q) {
      slot.querySelectorAll(".kq").forEach(qe => { const q = Q[+qe.dataset.q]; qe.querySelectorAll("button").forEach(bt => bt.addEventListener("click", () => {
        if (qe.dataset.done) return; qe.dataset.done = "1"; const ok = +bt.dataset.o === q[2];
        bt.classList.add(ok ? "ok" : "no"); if (!ok) qe.querySelector(`[data-o="${q[2]}"]`).classList.add("ok");
        qe.querySelector(".fb").innerHTML = (ok ? "✅ <b>Correct!</b> " : "❌ <b>Not quite.</b> ") + esc(q[3]); })); });
    }
    go.addEventListener("click", () => { setPlay(false); next(); }); pv.addEventListener("click", prev);
    const toggle = () => { if (!playing && si === S.length - 1 && beat >= S[si].panels.length) { show(0); } setPlay(!playing); if (playing) book.scrollIntoView({ block: "start", behavior: "smooth" }); };
    pl.addEventListener("click", toggle); big.addEventListener("click", toggle);
    book.addEventListener("keydown", e => { if (e.target.tagName === "BUTTON" && e.key !== "ArrowRight" && e.key !== "ArrowLeft") return; if (e.key === "ArrowRight") { e.preventDefault(); setPlay(false); next(); } else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); } else if (e.key === " ") { e.preventDefault(); toggle(); } });
    let sx = null; book.addEventListener("touchstart", e => { sx = e.touches[0].clientX; }, { passive: true });
    book.addEventListener("touchend", e => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 70) { setPlay(false); dx < 0 ? next() : prev(); } });
    // pause when the student leaves the Kick-off page or the tab
    const sec = document.getElementById("view-kickoff");
    if (sec) new MutationObserver(() => { if (!sec.classList.contains("active")) setPlay(false); }).observe(sec, { attributes: true, attributeFilter: ["class"] });
    document.addEventListener("visibilitychange", () => { if (document.hidden) setPlay(false); });
    host.addEventListener("ko:stop", () => setPlay(false));   // e.g. the student switched to the Playbook tab
    show(0);
  }

  /* ===================================================== mount ===================================================== */
  function mount() {
    const D = window.KICKOFF_DATA && window.KICKOFF_DATA[SITE]; if (!D) return;
    addCss();
    const a = document.getElementById("arch-flow"); if (a) renderArch(a, D.arch);
    if (a && !document.getElementById("ko-teaser")) {
      const t = document.createElement("div"); t.id = "ko-teaser"; t.className = "ko-teaser";
      t.innerHTML = `<span class="em">🎬</span><div><h4>New: read the kick-off meeting as a comic</h4><p>${esc(D.company)}'s sponsor explains the pain, the BI team asks the right questions, two people fight over a KPI, and the project gets planned. It's your project, as a story.</p></div><button type="button">Read the comic →</button>`;
      t.querySelector("button").addEventListener("click", () => { if (typeof window.switchView === "function") window.switchView("kickoff"); });
      a.parentNode.insertBefore(t, a.nextSibling);
    }
    const v = document.getElementById("ko-deck"); let built = false;
    const build = () => { if (built || !v) return; built = true; renderDeck(v, D); };
    const sec = document.getElementById("view-kickoff");
    if (sec) { if (sec.classList.contains("active")) build(); new MutationObserver(() => { if (sec.classList.contains("active")) build(); }).observe(sec, { attributes: true, attributeFilter: ["class"] }); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
  // for checking which voice each character gets on this device: KICKOFF_KIT.voicePlan()
  window.KICKOFF_KIT = { renderArch, renderDeck, figure, people, speak, hush: hushAll, prefs, speechReady: () => SPEECH && speechSynthesis.getVoices().length > 0, voicePlan: () => { const D = window.KICKOFF_DATA && window.KICKOFF_DATA[SITE]; if (!D) return {}; const P = people(D); voices(); return Object.fromEntries(["sp", "us", "ow", "lead", "pm", "ba", "de", "qa", "you", "narr"].map(k => { const v = voiceFor(k, P); return [k + (P[k] ? " · " + P[k].short : ""), (v.voice ? v.voice.name : "default") + " · pitch " + v.pitch.toFixed(2)]; })); } };
})();

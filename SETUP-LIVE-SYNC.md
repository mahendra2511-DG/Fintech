# Project Schedule — Live Sync setup (Vercel + Upstash Redis, free)

Ek baar setup karo. Uske baad: **PIN se login → details bharo → apne aap save → sab students ko dikhe.**
Koi Google Sheet / script nahi. Sab kuch aapke Vercel account me hi.

> Setup se pehle bhi site normal chalti hai (project-schedule.js file se). Database judte hi apne aap Live mode on ho jata hai.

## Step 1 — Naye files GitHub par daalo
Is zip ke saare files apne GitHub repo me upload/replace karo (khas karke naya folder **`api/`** aur `schedule-config.js`, `app.js`, `index.html`, `vercel.json`).
Vercel apne aap deploy kar dega.

## Step 2 — Free database jodo (2–3 min)
1. vercel.com → apna project kholo → upar **Storage** tab.
2. **Create Database** → **Upstash** (Redis) chuno → Continue.
3. Plan: **Free** · Region: **Mumbai (ap-south-1)** ya jo paas ho · koi bhi naam → **Create**.
4. "Connect to project" me apna project chuno (Production + Preview dono tick) → **Connect**.
   (Ye apne aap `KV_REST_API_URL` aur `KV_REST_API_TOKEN` settings me daal deta hai — aapko kuch copy nahi karna.)

## Step 3 — Redeploy
Project → **Deployments** → sabse upar wale ke **⋯** → **Redeploy**.

## Step 4 — Check
1. Site kholo → **Project Schedule & Status** → **Trainer login** → username + password (trainer login).
2. Upar **"☁ Live sync ON"** dikhe to setup ho gaya.
3. Aapne jo details pehle isi browser me bhari thi, wo pehli login par apne aap server par chali jayengi.
4. **Turant "Change PIN" dabake apna naya PIN rakho.** (Naya PIN server par safe rehta hai; website code me kahin nahi hota.)

## Rozana use
- Login → status badlo (Done / Pending / Nobody presented) → "✅ Saved" dikhega → students page refresh karein to turant dikhega (khula page bhi har 1 min me khud update hota hai).
- Kaam ke baad **Lock** daba do.

## Security
- PIN server par check hota hai. Students ke paas na PIN hai na database key, isliye wo kuch badal/reset nahi kar sakte.
- 8 galat PIN 15 minute me → 15 minute ke liye login band (guessing se bachav).
- PIN bhool gaye? Vercel → Settings → Environment Variables me `ADMIN_PIN` = naya PIN daalo, phir Storage → Upstash → Data Browser me key `axon:mkt:pinhash` delete karo → Redeploy.

## Optional
- Shuruaati PIN alag chahiye to Vercel → Settings → Environment Variables → `ADMIN_PIN` add karo .

## Real visitor counter + student check-in (same database, nothing extra to set up)
- Students open the site → enter their **name and group once** (saved on their device).
- Hero shows the real count: "👥 X students visited · Y today" (only when the database is connected; otherwise hidden).
- **Trainer login** on Project Schedule → a "👥 Student visits" panel appears below the schedule:
  who visited, first/last visit, visited today ✓, active days, page views, most opened pages, a 30-day chart, search, group filter and **Download CSV**.
- Same student on phone + laptop shows as one row (merged by name + group).


## Ek saath kai batches (project codes, jaise P1426 aur P1427)
- Trainer login → **+ New project** → code daalo (P1426). Har code ka apna kick-off, presentation din, **time** aur groups hota hai.
- Students site kholte hi **Project code + naam + group** chunte hain. Code list me time bhi dikhta hai (P1426 · Sat 7:00 PM), taaki sahi batch chunein.
- Schedule page par sabse upar **Batch dashboard**: har code ka time, agla presentation, aur Excel / Tableau / Power BI / SQL QA / Final me kitne groups ho gaye. Ye students ko bhi dikhta hai.
- Student ko apna card dikhta hai: uske group ka har presentation ka status (✅ / ⏳ / ❌), kya pending hai, agla presentation kab hai.
- Trainer ki **Student visits** report me project code ke hisaab se filter, har code ke tiles, aur CSV me Project code column.
- Purane students (jinhone pehle sirf naam daala tha) ko ek baar code chunne ko kaha jayega, jab ek se zyada code chal rahe hon.


## Update (14 Oct): kai projects ek saath, trainer panel aur zaroori login
- **Trainer:** Project Schedule → Trainer login (ya check-in box me "I'm the trainer →"). Upar **Projects** tabs dikhte hain: har code (P1227, P1428 …) ka tab, aur **＋ New project**. New project me code, kick-off date, presentation day, start time, end time aur groups ki ginti bharo → Create.
- Kisi bhi tab par click → us project ki date/time, groups aur har meeting ka status (✅ / ⏳ / ❌) bharo. Sab apne aap save hota hai.
- **Batch dashboard** (sirf trainer): har code ka time, agla presentation, kitne students check-in hue, aaj kitne aaye, aur har presentation me kitne groups ho gaye.
- **Time:** start/end time list se chuno (jaise 12:00 PM – 1:00 PM). Agla meeting apne aap us din ke us time ka banta hai, aur meeting khatam hote hi agla hafta "Up next" ho jaata hai.
- **Students:** login me **Project code + naam + group** teeno zaroori. Login ke baad student ko sirf apne project ka schedule, agla meeting (date + time) aur apne group ka status dikhta hai.
- Trainer reload kare to login bana rehta hai (same browser tab).


## Trainer login (15 Oct) aur students ka ek-baar login
- **Trainer login ab Username + Password se hota hai** (PIN wala popup hata diya). Password code me plain text me nahi hai, sirf uska coded (hash) roop hai. Login ke baad **Change password** se badal sakte ho.
- Password bhool gaye? Vercel → Settings → Environment Variables me `ADMIN_PASSWORD` = naya password (aur chaho to `ADMIN_USER` = naya username) → Upstash Data Browser me is site ki `passhash` key delete karo → Redeploy.
- **Students:** pehli baar sirf **mobile number** → naam, project code, group. Uske baad us device par kabhi nahi poocha jayega. Naye phone/laptop par sirf mobile number daalte hi details wapas aa jaati hain. Pura number save nahi hota: sirf coded id aur aakhri 4 digit.
- Project code wahi chalega jo trainer ne banaya hai (server bhi check karta hai). Agar ek hi project chal raha hai aur student ka purana code band ho gaya, to use apne aap naye code me daal diya jaata hai; kai project hon to sirf code dobara poocha jaata hai.
- Check-in box me "I'm the trainer →" dabane par seedha trainer login khulta hai, group nahi poocha jaata.

## Ask Mahendra (AI chat) — 15 Oct 2026

1. Get a free key at console.groq.com → API Keys → Create API Key (shown only once).
2. Vercel → this project → Settings → Environment Variables → add `GROQ_API_KEY` = the key → Save → Redeploy.
3. Open the site → chat button → type a question. The panel subtitle changes to "AI assistant · answers from this project's content" when the key is working.

- Without the key (or if the free limit is used up), the chat answers from the site's built-in search exactly as before.
- One key works on all sites; the free limit is shared across them.
- Never put the key in code or GitHub. If it leaks, delete it in console.groq.com and create a new one.
- Optional: `GROQ_MODEL` picks a specific model; otherwise the API tries a few current Groq models in order.

## Mahendra Dashboard Evaluation Feedback (18 Oct 2026)

Sidebar → Dashboards → "Mahendra Dashboard Evaluation Feedback". Students upload .twbx/.twb, .pbix/.pbit, .xlsx/.xlsm or a screenshot and get a 100-point scorecard.

- Uses the same `GROQ_API_KEY` as Ask Mahendra (no new setup). Without the key, students still get the automatic checks.
- The file is opened only in the student's browser; only a text summary of its structure (no data rows) and the screenshot go to Groq. Nothing is stored on the server; reviews are kept in the student's browser.
- Change scoring weights or add review rules for this project in `review-config.js`.
- Limits: 6 reviews per student every 30 minutes; files up to 80 MB. A .pbix can't expose DAX in the browser: ask students to upload a .pbit (File → Export → Power BI template) for a full review.
- Optional env: `GROQ_VISION_MODEL` (screenshot model), `GROQ_MODEL` (text model).

Fix (18 Oct): trainer changes made in two tabs or two devices no longer overwrite each other (changes are merged before saving).

- Review also marks where each problem is (on the screenshot, or on the layout read from a Tableau / Power BI file) and suggests a full wireframe that students can download (SVG/PNG) or edit for free in Excalidraw (excalidraw.com).

## Upstash request limit (22 Oct 2026)

The free Upstash plan allows a fixed number of database requests per month (500,000). When it is used up, the site shows a red "Live sync is not working right now" notice on Project Schedule, and student login, new projects and status changes stop saving until the limit resets or the plan is upgraded.

- Give every site its **own** Upstash database (Vercel → Storage → Create → Upstash Redis → connect only to this project). Each free database has its own monthly limit.
- Usage was reduced on 22 Oct: students' open tabs check the schedule every 5 minutes and only while the tab is visible; visits are recorded once per page per 10 minutes; the trainer report is cached for 5 minutes (the ⟳ Refresh button always gets fresh data); the ProjectVault Trainer Dashboard refreshes every 10 minutes.
- Check usage any time in the Upstash console → your database → Usage.

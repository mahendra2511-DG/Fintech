/* ============================================================
   PayFlow — Fintech Merchant & Fraud Risk Analytics
   Capstone, Practice & Interview Prep Hub · by Mahendra Singh
   Every number comes from pf-data.js (window.PF), computed with SQL
   from the PayFlow capstone dataset (18 tables, 2025).
   ============================================================ */
const PF = window.PF || {};
const K = PF.K || {};
const MKT = PF;
const A = K;
const MD = PF.series || {};
const fmtN = (n) => Number(n).toLocaleString("en-IN");
const fmtUS = (n) => Number(n).toLocaleString("en-US");
const f1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
const f2 = (n) => Number(n).toFixed(2);
const usd = (n) => (n < 0 ? "−" : "") + "$" + Math.abs(Number(n)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd0 = (n) => (n < 0 ? "−" : "") + "$" + Math.abs(Math.round(Number(n))).toLocaleString("en-US");
const usdK = (n) => "$" + (Number(n) / 1e3).toFixed(1) + "K";
const usdM = (n) => "$" + (Number(n) / 1e6).toFixed(2) + "M";
const inr = usd0, inrL = usdK, inrCr = usdM, mil = (n) => (Number(n) / 1e6).toFixed(2) + "M";
const SN = K.story_names || {}, SI = K.story_ids || {};
const STORY_M = (k, i) => ((K["story_" + k] || [])[i] || []);
const ST_ = (arr, k) => { const r = (arr || []).find(x => x[0] === k); return r ? r : [k, 0, 0, 0, 0]; };
const MON = (ym) => ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+ym.slice(5, 7) - 1];

/* ---------------- KPI REGISTER (from the KPI catalogue) ---------------- */
const M_KPIS = (PF.kpis || []).map(k => ({ ...k }));
const M_KPI_CATS = ["All", "Merchant 360°", "Fraud & Risk"];

/* ---------------- MODEL ---------------- */
const M_RELATIONSHIPS = (PF.joins || []).map(j => `${j[0]} → ${j[2]}  (${j[1]} = ${j[3]}, ${j[4]}) — ${j[7] === "None" || /^None/.test(j[7]) ? "no fan-out" : "fan-out risk: " + j[7]}`);
const M_LOAD_ORDER = [
  "1. dim_date — 396 days (2025-01-01 → 2026-01-31; is_reporting_period = Y for 2025)",
  "2. dim_fx_rate — 8 currencies × 396 days",
  "3. dim_account_manager, dim_pricing_plan, dim_payment_method, dim_transaction_status, dim_risk_reason",
  `4. dim_merchant — ${fmtN(K.registered)} merchants, then dim_merchant_status_history (${fmtN(PF.rows.dim_merchant_status_history)} rows)`,
  `5. dim_customer — ${fmtN(PF.rows.dim_customer)} tokenised customers`,
  `6. fact_payment — ${fmtN(PF.rows.fact_payment)} attempts (LOAD DATA LOCAL INFILE, not the import wizard)`,
  `7. fact_risk_assessment — ${fmtN(PF.rows.fact_risk_assessment)} scores (${K.no_score} attempts have none)`,
  `8. fact_refund (${fmtN(PF.rows.fact_refund)}), fact_dispute (${fmtN(PF.rows.fact_dispute)}), fact_fraud_case (${fmtN(PF.rows.fact_fraud_case)})`,
  `9. fact_settlement (${fmtN(PF.rows.fact_settlement)}) → fact_settlement_line (${fmtN(PF.rows.fact_settlement_line)})`,
  `10. fact_merchant_daily_snapshot — ${fmtN(PF.rows.fact_merchant_daily_snapshot)} merchant-days (aggregate table)`,
];
const M_CALC_FIELDS = [
  "amount_usd (fact_payment) — transaction_amount × dim_fx_rate.usd_per_unit on (transaction_date_key, currency_code). The single most important column in the model",
  "fee_usd (fact_payment) — processing_fee_amount × the same rate; 0 unless Succeeded",
  "is_successful / is_failed — from dim_transaction_status; Pending is neither",
  "refund_usd / dispute_usd / chargeback_usd — converted at the ORIGINAL payment's date and currency",
  "local_hour — HOUR(transaction_timestamp) + dim_merchant.utc_offset_hours (mod 24) for hour-of-day analysis",
  "amount_band (USD) — <$10, $10–50, $50–200, $200–500, >$500 (never band local currency)",
  "is_cross_border — dim_customer.country <> dim_merchant.country",
  "vw_confirmed_fraud — ONE row per payment: MAX(confirmed_fraud_amount), MAX(recovered_amount) where confirmed_fraud_flag = 1",
  "Status on date — join dim_merchant_status_history ON event date BETWEEN effective_from AND COALESCE(effective_to, '9999-12-31')",
];
const M_GOTCHAS = [
  { t: "Never add amounts across currencies", d: `SUM(transaction_amount) over every row returns ${fmtN(Math.round(K.tpv_naive))} — rupees, dollars, pounds and dirhams added together, plus failed attempts. Convert each row with dim_fx_rate first: TPV = ${usd(K.tpv)}.` },
  { t: "Attempts are not transactions", d: `fact_payment has ${fmtN(K.attempts)} rows but only ${fmtN(K.intents)} payment intents: ${fmtN(K.retry_attempts)} rows are retries. Say "attempts" or "intents" on every card. An intent succeeds at most once, so successful attempts = successful intents = ${fmtN(K.succ)}.` },
  { t: "One payment, several fraud cases", d: `${K.multi_case_payments} payments have more than one case (review queue + chargeback + issuer report). Summing cases gives ${usd(K.cf_amount_case_sum)} of "fraud"; counted once per payment it is ${usd(K.cf_amount)}. Build vw_confirmed_fraud (one row per payment) before any join.` },
  { t: "Suspected ≠ confirmed ≠ declined", d: `${fmtN(K.suspected_count)} attempts were flagged by the risk engine (${usd(K.suspected_amount)}), but only ${K.cf_payments} payments were confirmed as fraud. ${fmtN(K.review_confirmed[1])} of ${fmtN(K.review_confirmed[0] + K.review_confirmed[1])} reviewed cases were cleared. A Blocked or Failed payment is not fraud, and a 'fraudulent' dispute is only a cardholder claim.` },
  { t: "Refund rows fan out the payment", d: `${fmtN(K.multi_refund_payments)} payments have 2–3 partial refunds. Joining fact_payment to fact_refund and then summing transaction_amount counts those payments 2–3 times. Aggregate refunds per payment first.` },
  { t: "Count only succeeded refunds", d: `fact_refund holds ${K.refund_status.map(r => fmtN(r[1]) + " " + r[0]).join(", ")} rows. A failed refund that was retried appears twice. Refund amount = succeeded rows only: ${usd(K.refund_amt_all)} (all statuses would give ${usd(K.refund_amt_all_status)}).` },
  { t: "Dispute amount ≠ chargeback ≠ loss", d: `Disputes opened in 2025 total ${usd(K.dispute_amt_2025)}, but merchants were actually charged back ${usd(K.chargeback_amt)} (lost or accepted). ${K.dispute_outcomes.find(x => x[0] === "pending")[1]} disputes are still pending: their chargeback_amount is NULL (unknown), not 0.` },
  { t: "merchant_status is today's status", d: `${ST_(K.merchant_status, "Active")[1]} merchants are 'Active' today, but only ${K.active} actually had a successful payment in 2025. For history use dim_merchant_status_history or the daily snapshot. 'Active merchant' on the dashboard = at least one successful payment in the period.` },
  { t: "Activation rate needs a cohort", d: `Activated ÷ registered = ${f1(100 * K.activated_cum / K.registered)}%, which mixes merchants from 2021 with last week's sign-ups. Use the 2025 cohort onboarded by 30-Nov (so 30 days have passed): ${K.act_30d} of ${K.act_cohort} = ${K.activation_rate}%.` },
  { t: "Retention is a cohort, not active ÷ registered", d: `Of ${K.ret_q1} merchants active in Q1 2025, ${K.ret_q1_q4} were still transacting in Q4: retention ${K.retention_rate}%. Active ÷ registered (${f1(100 * K.active / K.registered)}%) is not retention.` },
  { t: "Settlement lines multiply the header", d: "fact_settlement has one row per payout and fact_settlement_line one row per balance transaction. Joining them and summing settlement_net_amount multiplies each payout by its line count. Reconcile with SUM(line_net_amount) GROUP BY settlement_id." },
  { t: "LEFT JOIN the risk scores", d: `${K.no_score} attempts on 18-Mar-2025 (04:00–09:30 UTC) have no risk score: the risk engine was down. An INNER JOIN to fact_risk_assessment silently drops them — and some were later confirmed fraud.` },
  { t: "Recent months look safer than they are", d: `December's confirmed fraud rate is only ${(K.fraud_monthly.find(r => r[0] === "2025-12") || [0, 0, 0, 0])[3]}% vs ~0.2–0.3% earlier, because many December fraud cases had not been reported or closed by the 31-Jan-2026 extract. Fraud data 'matures' over 60–90 days.` },
  { t: "Timestamps are UTC", d: "date keys are UTC dates. An Indian payment at 01:30 IST belongs to the previous UTC day, and hour-of-day patterns are wrong unless you add utc_offset_hours. A few merchants even show payments on the UTC day before their (local) activation date." },
];
const M_JOIN_PATHS = [
  ["TPV / revenue in USD", "fact_payment p JOIN dim_fx_rate fx ON fx.rate_date_key = p.transaction_date_key AND fx.currency_code = p.currency_code"],
  ["Merchant master table", "dim_merchant m LEFT JOIN (payments aggregated per merchant) LEFT JOIN (refunds per merchant) LEFT JOIN (vw_confirmed_fraud per merchant)"],
  ["Refund rate", "SUM(succeeded refunds per payment) → join to payment → SUM ÷ TPV"],
  ["Confirmed fraud", "vw_confirmed_fraud (1 row per payment) LEFT JOIN to vw_payment ON payment_id"],
  ["Suspected risk", "vw_payment LEFT JOIN fact_risk_assessment ON payment_id WHERE decision IN ('review','block')"],
  ["Dispute ratio", "fact_dispute ÷ succeeded payments JOIN dim_payment_method WHERE supports_chargeback = 'Y'"],
  ["Status on a date", "dim_merchant_status_history h ON h.merchant_id = x.merchant_id AND x.date BETWEEN h.effective_from AND COALESCE(h.effective_to, '9999-12-31')"],
  ["Payout reconciliation", "fact_settlement s JOIN (SELECT settlement_id, SUM(line_net_amount) FROM fact_settlement_line GROUP BY 1) l USING (settlement_id)"],
  ["Was this payment settled?", "fact_settlement_line l ON l.payment_id = p.payment_id AND l.line_type = 'charge' → fact_settlement"],
  ["Hour-of-day", "(HOUR(p.transaction_timestamp) + dim_merchant.utc_offset_hours + 24) MOD 24"],
];
const M_GLOBAL_FILTERS = [
  ["Date range (shown on every page)", "dim_date.calendar_date — each fact uses its own date key"], ["Year / Month", "dim_date.year, dim_date.year_month"],
  ["Merchant", "dim_merchant.merchant_name"], ["Merchant Industry", "dim_merchant.industry"], ["Merchant Status (current)", "dim_merchant.merchant_status"],
  ["Region / Country", "dim_merchant.region, dim_merchant.country"], ["Payment Method", "dim_payment_method.payment_method_category"],
  ["Transaction Status", "dim_transaction_status.transaction_status"], ["Risk Tier", "dim_merchant.risk_tier"],
  ["Fraud Investigation Status (risk page)", "fact_fraud_case.investigation_status"], ["Dispute Status (risk page)", "fact_dispute.dispute_status / dispute_outcome"],
  ["Reset filters", "Bookmark / reset button on every page"],
];
const M_DASHBOARDS = [
  ["1", "Merchant 360° — Overview", "CFO, Head of Merchant Operations", "Registered, Active, Activation Rate, TPV, Processing Revenue, Success Rate, Refund Rate, MoM growth, Top-10 share", "KPI cards, TPV & revenue trend, onboarding & activation trend, TPV by industry, merchant status donut"],
  ["2", "Merchant 360° — Merchant Master & Detail", "Merchant Growth Manager, Relationship Managers", "Per-merchant attempts, success/failure, TPV, revenue, refund rate, confirmed fraud, last payment, MoM, Attention Flag", "Searchable table → drill-through to merchant detail (trend, method mix, failure reasons)"],
  ["3", "Fraud & Risk — Overview", "Head of Risk, CFO", "Confirmed fraud (cases, transactions, amount, rates), suspected risk, recovery, net loss, disputes, chargebacks", "KPI cards, fraud amount & rate trend, risk-band donut, fraud by method / industry / amount band"],
  ["4", "Fraud & Risk — Investigations & Exceptions", "Fraud Operations Manager, Payments Ops", "Open investigations, resolution time, high-risk merchants, settlement exceptions, outstanding payouts", "Investigation table with priority, top merchants by fraud, disputes & chargebacks trend, payout exceptions"],
];

/* ---------------- DATA DICTIONARY ---------------- */
const M_DATA_DICTIONARY = (PF.dict || []).map(t => ({ table: t.table, rows: t.rows, cols: t.cols, type: t.type, purpose: t.purpose, grain: t.grain }));

/* ---------------- SQL (QA blocks) ---------------- */
const RC = PF.rows || {};
const M_SQL_BLOCKS = [
  { title: "1 · Row-count validation", desc: "Every table must match these counts before you build anything.",
    sql: Object.keys(RC).map((t, i) => `${i ? "UNION ALL " : ""}SELECT '${t}' AS tbl, COUNT(*) AS n FROM ${t}`.padEnd(78) + `-- ${fmtUS(RC[t])}`).join("\n") + ";" },
  { title: "2 · Referential integrity (every FK must return 0)", desc: "Orphan keys break every merchant-level number. All return 0 on the clean dataset.",
    sql: `SELECT COUNT(*) FROM fact_payment p LEFT JOIN dim_merchant m ON m.merchant_id = p.merchant_id WHERE m.merchant_id IS NULL;            -- 0
SELECT COUNT(*) FROM fact_payment p LEFT JOIN dim_customer c ON c.customer_id = p.customer_id WHERE c.customer_id IS NULL;            -- 0
SELECT COUNT(*) FROM fact_payment p LEFT JOIN dim_date d ON d.date_key = p.transaction_date_key WHERE d.date_key IS NULL;            -- 0
SELECT COUNT(*) FROM fact_payment p LEFT JOIN dim_fx_rate fx
       ON fx.rate_date_key = p.transaction_date_key AND fx.currency_code = p.currency_code WHERE fx.currency_code IS NULL;  -- 0
SELECT COUNT(*) FROM fact_refund r LEFT JOIN fact_payment p ON p.payment_id = r.payment_id WHERE p.payment_id IS NULL;               -- 0
SELECT COUNT(*) FROM fact_fraud_case f LEFT JOIN fact_payment p ON p.payment_id = f.payment_id WHERE p.payment_id IS NULL;           -- 0
SELECT COUNT(*) FROM fact_settlement_line l LEFT JOIN fact_settlement s ON s.settlement_id = l.settlement_id WHERE s.settlement_id IS NULL;  -- 0
-- expected exception: payments with no risk score (risk-engine outage 18-Mar-2025)
SELECT COUNT(*) FROM fact_payment p LEFT JOIN fact_risk_assessment r ON r.payment_id = p.payment_id WHERE r.payment_id IS NULL;      -- ${K.no_score}` },
  { title: "3 · Business-rule checks", desc: "Events in the right order, fees only on success, one success per intent, refunds within the captured amount.",
    sql: `SELECT COUNT(*) FROM (SELECT payment_intent_id FROM fact_payment WHERE transaction_status_id = 1
                      GROUP BY payment_intent_id HAVING COUNT(*) > 1) x;                       -- 0  (≤ 1 success per intent)
SELECT COUNT(*) FROM fact_payment WHERE transaction_status_id <> 1 AND processing_fee_amount <> 0;  -- 0
SELECT COUNT(*) FROM fact_refund r JOIN fact_payment p ON p.payment_id = r.payment_id
WHERE r.refund_timestamp <= p.transaction_timestamp OR p.transaction_status_id <> 1;          -- 0
SELECT COUNT(*) FROM (SELECT r.payment_id, SUM(r.refund_amount) s, MAX(p.transaction_amount) a
                      FROM fact_refund r JOIN fact_payment p ON p.payment_id = r.payment_id
                      WHERE r.refund_status = 'succeeded' GROUP BY r.payment_id) x
WHERE s > a + 0.005;                                                                          -- 0
SELECT COUNT(*) FROM fact_fraud_case
WHERE (confirmed_fraud_flag = 1) <> (investigation_status = 'Closed - Confirmed');            -- 0` },
  { title: "4 · Settlement reconciliation", desc: "The payout equation must hold to the cent, and the lines must add up to the header.",
    sql: `-- header equation
SELECT COUNT(*) FROM fact_settlement
WHERE ABS(settlement_net_amount - (settlement_gross_amount - settlement_fee_amount - settlement_refund_amount
                                   - settlement_chargeback_amount + settlement_adjustment_amount)) > 0.01;   -- 0
-- lines vs header (aggregate the lines FIRST, then join)
SELECT COUNT(*) FROM fact_settlement s
JOIN (SELECT settlement_id, SUM(line_net_amount) AS line_net FROM fact_settlement_line GROUP BY settlement_id) l
  ON l.settlement_id = s.settlement_id
WHERE ABS(l.line_net - s.settlement_net_amount) > 0.05;                                       -- 0
-- every successful payment reached a settlement
SELECT COUNT(*) FROM fact_payment p
LEFT JOIN fact_settlement_line l ON l.payment_id = p.payment_id AND l.line_type = 'charge'
WHERE p.transaction_status_id = 1 AND l.settlement_line_id IS NULL;                           -- 0
SELECT settlement_status, COUNT(*) FROM fact_settlement GROUP BY settlement_status;
-- ${K.settle_status.map(s => s[0] + " " + fmtUS(s[1])).join(" · ")}` },
  { title: "5 · Data-quality exercise file (dq_fact_payment_raw)", desc: "The raw landing-zone extract has a known number of defects. Find them, count them, decide what blocks publication.",
    sql: `-- exact duplicate events (webhook replays)
SELECT COUNT(*) - COUNT(DISTINCT CONCAT_WS('|', payment_id, transaction_status_id, updated_timestamp)) FROM dq_fact_payment_raw;
-- same payment_id with a corrected (later) version: keep the latest
SELECT payment_id, COUNT(*) v, MAX(updated_timestamp) latest FROM dq_fact_payment_raw GROUP BY payment_id HAVING COUNT(*) > 1;
-- orphans, bad amounts, bad dates, bad codes
SELECT SUM(m.merchant_id IS NULL)                        AS orphan_merchant,
       SUM(r.transaction_amount < 0)                     AS negative_amount,
       SUM(r.transaction_amount = 0)                     AS zero_amount,
       SUM(r.transaction_timestamp IS NULL)              AS missing_ts,
       SUM(r.transaction_timestamp < '2025-01-01' OR r.transaction_timestamp >= '2026-01-01') AS out_of_period,
       SUM(s.transaction_status_id IS NULL)              AS invalid_status,
       SUM(r.currency_code NOT IN (SELECT DISTINCT currency_code FROM dim_fx_rate)) AS invalid_currency
FROM dq_fact_payment_raw r
LEFT JOIN dim_merchant m ON m.merchant_id = r.merchant_id
LEFT JOIN dim_transaction_status s ON s.transaction_status_id = r.transaction_status_id;` },
];

/* ---------------- PROBLEM ---------------- */
const M_PROBLEM_STATEMENT = [
  { icon: "1", h: "Volume is reported in a currency soup", p: `Finance adds transaction amounts across INR, USD, GBP, AED and four more currencies, and includes failed attempts. The 'TPV' in old reports is meaningless; converted correctly it is ${usd(K.tpv)}.` },
  { icon: "2", h: "Nobody agrees what an 'active merchant' is", p: `${ST_(K.merchant_status, "Active")[1]} merchants carry the Active status, ${K.active} actually transacted in 2025, and activation and retention are quoted without a cohort.` },
  { icon: "3", h: "Revenue is confused with volume", p: `Processing revenue is ${usd(K.revenue)} — a ${K.take_rate}% take rate, pulled down by zero-fee UPI. Several teams still present TPV as 'revenue'.` },
  { icon: "4", h: "Fraud is over-counted and under-counted at once", p: `Summing fraud cases inflates fraud by ${f1(100 * (K.cf_amount_case_sum / K.cf_amount - 1))}%, suspected exposure (${usdK(K.suspected_amount)}) is shown as loss, and recent months look clean only because cases have not matured.` },
  { icon: "5", h: "Merchant risk is spotted too late", p: `A card-testing attack hit ${SN.card_testing} on 14-Jul (${fmtN(K.attack1[0])} attempts in under 4 hours), a travel merchant's dispute ratio crossed network thresholds, and a merchant's payouts have failed since November.` },
  { icon: "6", h: "No single view from payment to payout", p: "Payments, risk scores, refunds, disputes, fraud cases and settlements sit in separate systems with different grains, so every join risks double counting." },
];

/* ---------------- TOOLS / DOMAIN ---------------- */
const M_TOOLS = [
  { logo: "assets/excel-logo.jpg", name: "Excel", role: "Stage 1 · Profile & reconcile", desc: "Open the CSVs, profile every table (counts, blanks, distinct values), convert amounts with the FX table and build the first KPIs with pivots. The Excel starter does it on a merchant-month summary." },
  { logo: "assets/mysql-logo.png", name: "SQL (MySQL)", role: "Stage 2 · Load, validate, model", desc: "Load all 18 tables, run the integrity checks, and build vw_payment, vw_confirmed_fraud, vw_refund_usd and the merchant-month mart that both BI tools read." },
  { logo: "assets/tableau-logo.jpg", name: "Tableau", role: "Stage 3 · Tableau–SQL", desc: "Connect to MySQL with logical relationships (not one flat join) and build the Merchant 360° and Fraud & Risk dashboards with filter actions." },
  { logo: "assets/powerbi-logo.png", name: "Power BI", role: "Stage 4 · Power BI–SQL", desc: "Star schema around fact_payment, a marked date table, inactive date relationships for refunds / disputes / cases, DAX measures and drill-through to merchant detail." },
  { logo: "assets/sia-avatar.png", name: "AI / Insights", role: "Optional · Ask the data", desc: "A Q&A visual or Copilot on the same governed model: 'which merchants need attention this month?' — answered with the same definitions." },
  { logo: "assets/mysql-logo.png", name: "QA / SQL", role: "Stage 5 · Backend = dashboard", desc: "Run SQL against the database and reconcile TPV, revenue, success rate, refund rate, confirmed fraud, chargebacks and outstanding payouts with Tableau and Power BI." },
];
const M_DOMAIN_WHAT = "A payment processor (payment gateway / PSP) sits between a customer's card, UPI app or wallet and the merchant's bank account. Every checkout creates a payment attempt that the issuer, the network or the processor's own risk engine can approve, decline or block. Money that succeeds is captured, the processor keeps a fee, and the rest is paid out to the merchant after refunds, chargebacks and adjustments. Payments analytics measures that whole chain: how much flows through (TPV), how much the processor earns, how reliably payments succeed, which merchants grow or need help, and how much is lost to fraud, refunds and disputes.";
const M_DOMAIN_WHERE = [
  "Payment gateways and PSPs — merchant performance, authorisation rates, pricing and revenue.",
  "Banks and card issuers — fraud monitoring, chargebacks, cross-border and network health.",
  "Fintech risk & compliance teams — card-testing detection, merchant risk tiers, dispute-ratio monitoring.",
  "Finance & treasury — settlement reconciliation, payouts, FX, take rate and revenue recognition.",
];
const M_DOMAIN_DATA_TYPES = ["Merchant onboarding & KYC", "Payment attempts & retries", "Issuer decline codes", "UPI / card / wallet / BNPL", "Risk scores & rule decisions", "Refunds (full & partial)", "Disputes & chargebacks", "Fraud investigations", "Settlements & payouts", "FX rates", "Pricing plans & fees", "Merchant status history"];
const M_FLOW = [
  { t: "Data Preparation", d: "Open the 18 CSVs, profile them in Excel, read the Data Dictionary and Business Rules, and clean the Data-Quality exercise files." },
  { t: "SQL Integration", d: "Load MySQL with keys, run the integrity and business-rule checks, build vw_payment, vw_confirmed_fraud, vw_refund_usd and the merchant-month mart." },
  { t: "BI Tool Connection", d: "Connect Tableau and Power BI to MySQL; relate facts to dimensions with single-direction filters; mark dim_date; add measures." },
  { t: "Dashboard Development", d: "Merchant 360° (overview + merchant master with drill-through) and Fraud & Risk (overview + investigations & exceptions)." },
  { t: "QA & Validation", d: "Reconcile every KPI between SQL, Tableau and Power BI, run the 17 test cases and document each definition choice." },
];
const M_TIMELINE = [
  { d: "Week 0", t: "Kick-off", task: "Problem statement, dataset walkthrough, groups formed" },
  { d: "Week 1", t: "Excel", task: "Profiling, FX conversion, KPIs in Excel" },
  { d: "Week 2", t: "Tableau", task: "Tableau–SQL dashboards (SQL QA this week or next)" },
  { d: "Week 3", t: "Power BI", task: "Power BI–SQL dashboards with DAX" },
  { d: "Week 4", t: "Final", task: "Final presentation + test cases + QA sign-off" },
];
const M_RULES = [
  { icon: "⚠", ok: false, h: "Attendance is mandatory", p: "Missing more than two meetings results in removal from the project. Join every meeting under the same name you registered with — an unrecognized name gets marked absent." },
  { icon: "⚠", ok: false, h: "Attendance alone isn't enough", p: "Sitting in on meetings without actively contributing will also lead to removal. Participation is graded on contribution, not presence." },
  { icon: "✓", ok: true, h: "Flag non-contributing teammates early", p: "If a team member isn't contributing, it's on the group to inform management — by call, WhatsApp, email, or during the weekly review — rather than letting it slide." },
  { icon: "✓", ok: true, h: "Contribute across every tool", p: "You're expected to contribute to Excel, SQL, Tableau, Power BI, and the final PPT. Skipping even one tool entirely puts your place on the project at risk." },
  { icon: "✓", ok: true, h: "Weekly review presentations", p: "Each group presents its progress every week — consistent updates and a prepared walkthrough are expected, not just a working dashboard at the end." },
];
const M_FOCUS_AREAS = [
  { n: "", h: "Active Contribution", p: "Show up engaged — participate in discussion, don't just observe the build." },
  { n: "", h: "Sharing Insights", p: "Bring your own observations to the team rather than waiting to be assigned tasks." },
  { n: "", h: "Timely Completion", p: "Deliver assigned work inside the agreed deadline, every sprint." },
  { n: "", h: "Collaboration Over Competition", p: "Optimize for the team's dashboard, not for individual credit." },
  { n: "", h: "Clear Communication", p: "Say what you're blocked on before the deadline, not after." },
  { n: "", h: "Active Listening", p: "Actually absorb teammates' updates in review meetings — you'll be asked about their work too." },
  { n: "", h: "Recognizing Contributions", p: "Acknowledge teammates' work — it costs nothing and keeps morale up." },
  { n: "", h: "Daily Team Connectivity", p: "A short daily check-in catches blockers before they become a missed deadline." },
];
const M_SOCIAL = {
  linkedin: "https://www.linkedin.com/in/mahendra-singh-%F0%9F%87%AE%F0%9F%87%B3%F0%9F%9A%80%E2%9D%84%EF%B8%8F-%F0%9F%90%8D-%F0%9F%A6%84-83699485/",
  medium: "https://medium.com/@mahendraa1188",
  youtube: "https://www.youtube.com/channel/UC2q-vZWSlQpiGiMcSLUqnIg",
};
const M_CRACKANALYTICS_URL = "https://www.crackanalytics.com/";
const M_SOFTWARE_LINKS = [
  { name: "How to import a CSV into MySQL", desc: "Step-by-step guide — load the dataset before connecting Tableau or Power BI", icon: "🗄️", type: "link", href: "https://medium.com/@mahendraa1188/how-to-import-csv-into-mysql-c3bbce297910" },
  { name: "MySQL Community Server — download", desc: "Official installer (MySQL 8.x)", icon: "🐬", type: "link", href: "https://dev.mysql.com/downloads/mysql/" },
  { name: "Tableau Desktop — free download", desc: "Official installer from Tableau (free trial / Public edition)", icon: "📈", type: "link", href: "https://www.tableau.com/products/desktop-free/download" },
  { name: "Power BI Desktop — free download", desc: "Official installer from Microsoft", icon: "⚡", type: "link", href: "https://www.microsoft.com/en-us/download/details.aspx?id=58494" },
];
const M_DOCUMENTS = [
  { name: "PayFlow Excel Starter.xlsx", desc: "Merchant_Monthly summary (one row per merchant per month, already in USD) and Merchants, with a Dashboard tab of live formulas: TPV, revenue, take rate, success and failure rate, active merchants, top-10 share and monthly trend — plus a FX_Practice tab to convert raw payments yourself.", icon: "🧮", type: "download", href: "assets/docs/PayFlow_Excel_Starter.xlsx", filename: "PayFlow_Excel_Starter.xlsx" },
];

/* ---------------- INTERVIEW ---------------- */
const CF_PER_PAY = () => usd(K.cf_amount);
const M_QA_CATS = ["Explain This Project", "Payments Domain", "KPI Definitions", "SQL", "Grain & Fan-out", "Power BI & DAX", "Tableau", "Fraud vs Risk", "Refunds, Disputes & Settlement", "Data Quality & Reconciliation", "Scenario-Based", "Synthetic Data & Limits", "General & HR", "Rapid Fire"];
const M_QA = [
  // ---------------- Explain This Project
  { cat: "Explain This Project", q: "Explain this project to me — what did you actually build?", a: `Tell it as a story. (1) The business: PayFlow, a payment processor with ${fmtN(K.registered)} merchants in 7 countries, needed one trusted view of merchant performance and fraud risk. (2) The data: 18 tables for 2025 — ${fmtN(K.attempts)} payment attempts (${fmtN(K.intents)} intents), refunds, disputes, fraud cases, risk scores and ${fmtN(PF.rows.fact_settlement)} payouts in 8 currencies. (3) The build: Excel profiling, a MySQL model with validation checks and views, and two dashboards in Tableau and Power BI: Merchant 360° and Fraud & Risk. (4) The hard part: grain and definitions — attempts vs intents, converting currencies, counting fraud once per payment, cohort-based activation and retention. (5) The outcome: TPV ${usdM(K.tpv)}, revenue ${usdK(K.revenue)} at a ${K.take_rate}% take rate, confirmed fraud ${K.cf_rate_value}% of TPV, and an attention list of merchants that need action.`, signal: "Almost always the first question — tests structure and communication." },
  { cat: "Explain This Project", q: "What was the business problem?", a: "Merchant, payment, risk and payout data lived in separate systems with different grains and currencies. Reports added rupees to dollars, quoted attempts as transactions, counted fraud cases instead of fraudulent payments and called any 'Active' status an active merchant. Management could not answer three questions with confidence: which merchants drive and grow the business, which need attention, and how much fraud and dispute exposure PayFlow really carries.", signal: "Tests whether you understood the 'why', not just the tools." },
  { cat: "Explain This Project", q: "What data did you use, and at what grain?", a: `18 tables. Facts: fact_payment (one row per payment ATTEMPT, ${fmtN(K.attempts)}), fact_risk_assessment (one per scored attempt), fact_refund (one per refund attempt), fact_dispute, fact_fraud_case (one per investigation case — several per payment possible), fact_settlement (one per merchant per payout period) and fact_settlement_line (one per balance transaction), plus a daily merchant snapshot. Dimensions: merchant (+ SCD-2 status history), customer (tokenised), date, payment method, status, risk reason, pricing plan, account manager and daily FX rates.`, signal: "Name exact grains — that is what interviewers probe next." },
  { cat: "Explain This Project", q: "What was your most important insight?", a: `Three. First, concentration: the top 10 merchants carry ${K.top10_share}% of TPV and the #3 merchant (${SN.declining_whale}) fell ${Math.abs((K.declining_top.find(d => d[0] === SI.declining_whale) || [0, 0, 0, 0, 0, 0])[5])}% Q4 vs Q3 — a revenue risk nobody had flagged. Second, revenue quality: UPI is ${f1(100 * K.by_method_cat.find(x => x[0] === "UPI")[3] / K.tpv)}% of TPV but earns 0%, so the take rate is only ${K.take_rate}%. Third, risk is concentrated: card-not-present cards, cross-border payments (${ST_(K.fraud_xborder, "Cross-border")[3]}% fraud vs ${ST_(K.fraud_xborder, "Domestic")[3]}% domestic) and Travel/Gaming merchants.`, signal: "Tests a quantified 'so what'." },
  { cat: "Explain This Project", q: "What would you do differently with more time?", a: "Train and validate a real fraud model instead of the demonstration risk score (with precision/recall on confirmed cases), add customer lifetime metrics per merchant, and move the merchant-month mart to an incremental load so late-arriving payments and maturing fraud cases restate history in a controlled way.", signal: "Shows you know the limits of your own analysis." },
  // ---------------- Payments domain
  { cat: "Payments Domain", q: "What is TPV and why isn't it revenue?", a: `Total Payment Volume is the value of successful payments flowing through PayFlow: ${usd(K.tpv)}. It belongs to the merchants. PayFlow's revenue is the fee it keeps: ${usd(K.revenue)}, a take rate of ${K.take_rate}%.`, signal: "The most common payments-domain confusion." },
  { cat: "Payments Domain", q: "What's the difference between a declined, a blocked and a failed payment?", a: "Declined/failed: the issuer, bank or network said no (insufficient_funds, do_not_honor, upi_timeout). Blocked: PayFlow's own risk rules stopped it before the issuer saw it. Cancelled/Expired: the customer abandoned 3-D Secure or didn't approve the UPI request. None of them is evidence of fraud on its own.", signal: "Precise vocabulary." },
  { cat: "Payments Domain", q: "What is a payment intent, and why does this dataset have one?", a: `An intent is the customer's checkout journey; each try is an attempt. ${fmtN(K.retry_attempts)} retries share an intent with their first attempt. Counting attempts as transactions overstates volume and understates conversion: attempt success is ${K.success_rate}% but intent conversion is ${K.intent_success_rate}%.`, signal: "Grain awareness in a domain context." },
  { cat: "Payments Domain", q: "Why is the take rate lower in India?", a: "UPI carries zero MDR (no merchant discount rate) by regulation, so a UPI payment earns PayFlow nothing while still costing infrastructure. As the mix shifts to UPI, TPV can grow faster than revenue.", signal: "Business context, not just numbers." },
  { cat: "Payments Domain", q: "What is a chargeback?", a: "A forced reversal: the cardholder disputes a payment with their bank, the bank pulls the money back from the merchant (through the processor), and the merchant can fight it with evidence. Here a dispute becomes a chargeback when the outcome is lost or accepted.", signal: "Core vocabulary." },
  { cat: "Payments Domain", q: "What is card testing?", a: `Fraudsters run large numbers of tiny payments with stolen card numbers to find which ones work. In this data: ${fmtN(K.attack1[0])} attempts at ${SN.card_testing} on 14-Jul-2025 in under 4 hours, mostly $0.50–$2, ${K.attack1[1]} succeeded, ${fmtN(K.attack1[2])} were blocked once the velocity rule fired.`, signal: "Recognising a fraud pattern from data." },
  { cat: "Payments Domain", q: "What is a settlement / payout?", a: "The money the processor pays the merchant: captured payments minus fees, refunds, chargebacks and adjustments, on a schedule (daily T+2 or weekly). PayFlow's equation: net = gross − fee − refund − chargeback + adjustment.", signal: "Finance literacy." },
  // ---------------- KPI definitions
  { cat: "KPI Definitions", q: "How did you define an Active Merchant?", a: `At least one SUCCESSFUL payment in the selected period — an activity definition. ${K.active} merchants in 2025. Not merchant_status = 'Active' (${ST_(K.merchant_status, "Active")[1]} today), because status is current and includes merchants that never transacted.`, signal: "Definition discipline." },
  { cat: "KPI Definitions", q: "How did you calculate the merchant activation rate?", a: `As a cohort: merchants onboarded 1-Jan to 30-Nov-2025 (so every one had a full 30-day window), activated within 30 days: ${K.act_30d} of ${K.act_cohort} = ${K.activation_rate}%. December sign-ups are excluded because their window hasn't elapsed.`, signal: "Cohort thinking." },
  { cat: "KPI Definitions", q: "How did you define merchant retention?", a: `Cohort of merchants active in Q1 2025 → still active in Q4 2025: ${K.ret_q1_q4} of ${K.ret_q1} = ${K.retention_rate}%. I also show month-over-month retention. Active ÷ registered is not retention.`, signal: "Avoids the most common retention mistake." },
  { cat: "KPI Definitions", q: "What denominator do you use for the failure rate?", a: `Attempts with a final status — Pending (${K.pending}) is excluded from both numerator and denominator, so success (${K.success_rate}%) + failure (${K.failure_rate}%) = 100%.`, signal: "Denominators." },
  { cat: "KPI Definitions", q: "Confirmed fraud rate by count vs by value?", a: `By count: distinct confirmed-fraud payments ÷ successful intents = ${K.cf_rate_count}%. By value: confirmed fraud amount ÷ TPV = ${K.cf_rate_value}%. The value rate is higher because fraud skews to large tickets ($200+ bands run at ~0.37%). Some businesses divide by ALL attempts (${K.cf_rate_count_attempts}%) — fine if you say so.`, signal: "Multiple valid definitions, stated explicitly." },
  { cat: "KPI Definitions", q: "How do you define refund rate?", a: `Value-based, payment-date cohort: succeeded refunds on 2025 payments ÷ 2025 TPV = ${K.refund_rate}%. A count version (refunded payments ÷ successful payments) is ${K.refund_count_rate}%. Counting refund rows would double count multiple partial refunds.`, signal: "Grain and cohort." },
  { cat: "KPI Definitions", q: "How is the Attention Flag defined?", a: `A merchant is flagged when ANY configurable rule fires: TPV Q4 vs Q3 ≤ −20% with Q3 ≥ $5,000 (${K.attention_reasons[0][1]}), failure rate ≥ 15% on ≥ 100 attempts (${K.attention_reasons[1][1]}), refunds ≥ 10% of TPV (${K.attention_reasons[2][1]}), no successful payment in the last 30 days (${K.attention_reasons[3][1]}), or a risk threshold breach (${K.attention_reasons[4][1]}). ${K.attention_total} merchants in total, each with its reason shown. Thresholds are parameters, not hard-coded facts.`, signal: "Configurable business rules." },
  // ---------------- SQL
  { cat: "SQL", q: "How do you compute TPV in USD in SQL?", a: "SELECT SUM(p.transaction_amount * fx.usd_per_unit)\nFROM fact_payment p\nJOIN dim_fx_rate fx ON fx.rate_date_key = p.transaction_date_key AND fx.currency_code = p.currency_code\nWHERE p.transaction_status_id = 1;\nThe join needs BOTH keys; a join on date alone multiplies every row by 8 currencies.", signal: "Composite join keys." },
  { cat: "SQL", q: "Write MoM TPV growth with a window function.", a: "WITH m AS (SELECT DATE_FORMAT(transaction_timestamp,'%Y-%m') ym, SUM(amount_usd) tpv FROM vw_payment WHERE is_successful = 1 GROUP BY ym)\nSELECT ym, tpv, ROUND(100*(tpv/LAG(tpv) OVER (ORDER BY ym) - 1), 2) mom_pct FROM m;", signal: "LAG()." },
  { cat: "SQL", q: "How do you count confirmed fraud once per payment?", a: "CREATE VIEW vw_confirmed_fraud AS\nSELECT payment_id, merchant_id, MAX(confirmed_fraud_amount) fraud_amt, MAX(recovered_amount) recovered_amt\nFROM fact_fraud_case WHERE confirmed_fraud_flag = 1 GROUP BY payment_id, merchant_id;\nThen join this view, never the raw case table.", signal: "Pre-aggregation before joins." },
  { cat: "SQL", q: "Find the top 10 merchants and their share of TPV.", a: "WITH t AS (SELECT merchant_id, SUM(amount_usd) tpv FROM vw_payment WHERE is_successful=1 GROUP BY merchant_id)\nSELECT merchant_id, tpv, ROUND(100*tpv/SUM(tpv) OVER (), 2) share,\n       RANK() OVER (ORDER BY tpv DESC) rnk FROM t ORDER BY tpv DESC LIMIT 10;", signal: "SUM() OVER () and RANK()." },
  { cat: "SQL", q: "How do you find a merchant's status on a past date?", a: "Join dim_merchant_status_history ON merchant_id AND the date BETWEEN effective_from AND COALESCE(effective_to, '9999-12-31'). Without the date condition you get one row per status period — fan-out.", signal: "SCD Type 2 joins." },
  { cat: "SQL", q: "Why LEFT JOIN from dim_merchant for the master table?", a: `So merchants with zero payments still appear (e.g. MID999101). An INNER JOIN silently removes them, and COALESCE turns their NULL TPV into 0.`, signal: "Join type choice." },
  { cat: "SQL", q: "How would you detect duplicate payment events?", a: "SELECT payment_id, COUNT(*) FROM raw_payments GROUP BY payment_id HAVING COUNT(*) > 1; then compare all columns: identical rows are replays (keep one); rows differing in status/updated_timestamp are corrections (keep the latest with ROW_NUMBER() OVER (PARTITION BY payment_id ORDER BY updated_timestamp DESC) = 1).", signal: "De-duplication strategy." },
  // ---------------- Grain & fan-out
  { cat: "Grain & Fan-out", q: "What is fan-out and where did it bite you here?", a: `Joining a one-to-many table multiplies rows on the 'one' side. Payment → refund (${fmtN(K.multi_refund_payments)} payments with several refunds), payment → fraud case (${K.multi_case_payments} payments with several cases) and settlement → lines all fan out. Summing a payment-level amount after those joins inflates it.`, signal: "The core data-modelling concept of this project." },
  { cat: "Grain & Fan-out", q: "How do you prove a join didn't inflate a number?", a: "Compare the result with a query at the original grain: COUNT(*) and SUM(amount) of fact_payment before the join must equal COUNT(DISTINCT payment_id) and SUM of the payment amount after it. If they differ, aggregate the child table first.", signal: "Test query habit." },
  { cat: "Grain & Fan-out", q: "Can you put refunds, disputes and fraud on one flat table?", a: "Only after aggregating each to payment grain (one row per payment) — then a LEFT JOIN is safe. Joining the raw facts together multiplies rows by refunds × disputes × cases.", signal: "Model design." },
  { cat: "Grain & Fan-out", q: "Why keep fact_merchant_daily_snapshot if the facts exist?", a: "For history (status on each day, trailing-30-day activity) and speed. But it is an aggregate of the same facts: a card must use the snapshot OR the facts, never add them together.", signal: "Aggregate tables." },
  // ---------------- Power BI
  { cat: "Power BI & DAX", q: "How did you model this in Power BI?", a: "fact_payment as the hub with single-direction relationships from dim_merchant, dim_payment_method, dim_transaction_status, dim_customer and dim_date. Refunds, disputes and fraud cases relate to payment through payment_id, and to dim_date through their own date keys as INACTIVE relationships activated with USERELATIONSHIP in the measure.", signal: "Relationship design." },
  { cat: "Power BI & DAX", q: "Write TPV (USD) in DAX.", a: "TPV = SUMX(FILTER(fact_payment, RELATED(dim_transaction_status[is_successful]) = 1), fact_payment[transaction_amount] * fact_payment[usd_per_unit])\n— with usd_per_unit brought in by Power Query (merge on date + currency) or a calculated column.", signal: "Row context in SUMX." },
  { cat: "Power BI & DAX", q: "How do you count confirmed fraud transactions in DAX?", a: "Confirmed Fraud Txns = CALCULATE(DISTINCTCOUNT(fact_fraud_case[payment_id]), fact_fraud_case[confirmed_fraud_flag] = 1). DISTINCTCOUNT, not COUNTROWS, because one payment can have several cases.", signal: "Distinct count on a child fact." },
  { cat: "Power BI & DAX", q: "How does the drill-through to merchant detail work?", a: "A Merchant Detail page with merchant_id in the drill-through well; right-click a row in the master table → Drill through. The page shows the merchant's monthly TPV, success rate, method mix, failure reasons, refunds and fraud with the filter carried over.", signal: "Report navigation." },
  // ---------------- Tableau
  { cat: "Tableau", q: "Physical joins or relationships in Tableau?", a: "Relationships (the logical layer), so Tableau aggregates each table at its own grain before combining. A physical join of payments to refunds and cases would repeat payment rows and inflate TPV.", signal: "Tableau data model." },
  { cat: "Tableau", q: "How do you count fraud once per payment in Tableau?", a: "COUNTD([Payment Id]) with confirmed flag = 1 for counts, and an LOD for amounts: { FIXED [Payment Id] : MAX([Confirmed Fraud Amount]) } summed at the view level — or connect to vw_confirmed_fraud.", signal: "LOD expressions." },
  { cat: "Tableau", q: "How do you build the merchant master → detail navigation?", a: "A dashboard Filter action from the master table to a detail sheet (on Merchant Id), or a Go-to-Sheet action. Show the selected merchant and date range in the title so users know what they're looking at.", signal: "Interactivity." },
  // ---------------- Fraud vs risk
  { cat: "Fraud vs Risk", q: "What's the difference between suspected and confirmed fraud?", a: `Suspected = the risk engine flagged it (review or block): ${fmtN(K.suspected_count)} attempts worth ${usd(K.suspected_amount)}. Confirmed = an investigation closed as fraud: ${K.cf_payments} payments, ${usd(K.cf_amount)}. Presenting suspected exposure as loss overstates it ~${Math.round(K.suspected_amount / K.cf_amount)}×.`, signal: "The key distinction of the Fraud dashboard." },
  { cat: "Fraud vs Risk", q: "Is the risk score a fraud model?", a: "No — it is a generated demonstration score. It correlates with fraud by design but was never trained or validated, so it can't be presented as predictive. A real model needs training data, a hold-out set and precision/recall at the chosen threshold.", signal: "Honesty about methods." },
  { cat: "Fraud vs Risk", q: "Which segments have the highest fraud rate?", a: `By value: Digital Goods & Gaming (${ST_(K.fraud_by_industry, "Digital Goods & Gaming")[4]}%) and Travel (${ST_(K.fraud_by_industry, "Travel")[4]}%) among industries; cards and wallets among methods (UPI and net banking are far lower); tickets above $200 (~0.37%); and cross-border payments (${ST_(K.fraud_xborder, "Cross-border")[3]}% vs ${ST_(K.fraud_xborder, "Domestic")[3]}%).`, signal: "Segmentation insight." },
  { cat: "Fraud vs Risk", q: "Why does recent fraud look low?", a: "Fraud matures: chargebacks arrive 2–12 weeks after the payment and investigations take days to weeks. At the 31-Jan extract, December's fraud is under-reported. Show a 'maturity' note or compare months at the same age.", signal: "Senior-level thinking about time." },
  { cat: "Fraud vs Risk", q: "How would you prioritise the investigation queue?", a: "Separate priority from outcome: rank open/flagged payments by risk score × amount (expected loss), boost new customers, cross-border cards and merchants already over threshold, and keep confirmed status in its own column so priority never masquerades as proof.", signal: "Operational design." },
  // ---------------- Refunds, disputes, settlement
  { cat: "Refunds, Disputes & Settlement", q: "Is a refund a sign of fraud?", a: "Usually not: most refunds are cancellations, returns or duplicates. Some merchants refund suspected fraud proactively to avoid a chargeback — those carry reason 'fraudulent' and count as recovery on the confirmed case.", signal: "Concept separation." },
  { cat: "Refunds, Disputes & Settlement", q: "What is the dispute ratio and why does it matter?", a: `Disputes ÷ successful chargeback-eligible payments: ${K.dispute_ratio}% overall. Card networks monitor merchants above roughly 0.9–1%; ${SN.travel_disputes} spiked in Jul–Aug after flight cancellations. UPI and net banking are excluded from the denominator because they can't be charged back.`, signal: "Network risk awareness." },
  { cat: "Refunds, Disputes & Settlement", q: "Why can a settlement be negative?", a: `When refunds, chargebacks and fees in a period exceed new charges, the merchant owes money: the payout is debited (${K.settle_status.find(s => s[0] === "debited")[1]} settlements). That is normal for small merchants on quiet days.`, signal: "Payout mechanics." },
  { cat: "Refunds, Disputes & Settlement", q: "What is the outstanding payout amount?", a: `Money owed to merchants that has not landed at the extract date: pending, in-transit, failed and on-hold settlements = ${usd(K.outstanding_payout_usd)}. Most of it is ${SN.payout_failure}'s payouts failing since November because the beneficiary account was closed.`, signal: "Exception reporting." },
  // ---------------- Data quality
  { cat: "Data Quality & Reconciliation", q: "Which data-quality issues block publication and which are warnings?", a: "Block: duplicate payment IDs, orphan merchants, negative amounts, invalid status or currency codes, fees on failed payments, refunds above the captured amount, inconsistent fraud flags and settlement equations that don't balance — each changes a published number. Warn: zero amounts, created before transaction time, non-ISO country codes, a succeeded payment with a stale failure_reason — fix at source, document, publish.", signal: "Judgement, not just detection." },
  { cat: "Data Quality & Reconciliation", q: "How did you reconcile SQL with the dashboards?", a: "One reconciliation query returns every P1 KPI; each dashboard's values go next to it in a table (the QA page here) and must tie out within rounding. Any difference gets a root cause — filter, date basis, FX, grain — not a tweak.", signal: "QA process." },
  { cat: "Data Quality & Reconciliation", q: "How do you handle late-arriving transactions?", a: `${fmtN(K.late_arriving)} payments arrived via batch reconciliation days after the payment (${K.late_in_2026} landed in January 2026). Report by transaction_timestamp, not created_timestamp, and re-run the month after close so late rows restate it.`, signal: "Incremental loads." },
  // ---------------- Scenario-based
  { cat: "Scenario-Based", q: "TPV dropped 6% this month. Investigate.", a: "1) Check data completeness: row counts per day, late-arriving rows, FX table loaded. 2) Split the change into merchants (top-10 vs rest), industry and country — is it broad or one merchant? 3) For the main contributor, split volume into attempts × success rate × ticket size. 4) Check seasonality vs the same month's pattern. 5) Answer with the driver and the dollar impact, then the action (e.g. call the account manager of the declining merchant).", signal: "Structured root-cause analysis." },
  { cat: "Scenario-Based", q: "One merchant's success rate fell from 90% to 76% in May. What do you do?", a: `That is ${SN.integration_bug}. Split failures by reason, method and day: the drop is concentrated in cards and wallets from 12-May to 3-Jun with authentication_failed and processing_error — a 3-D Secure integration problem, not customers or fraud. Action: alert the merchant's integration team, quantify lost TPV, and add a daily success-rate alert per merchant.`, signal: "Diagnosis through segmentation." },
  { cat: "Scenario-Based", q: "Fraud attempts spiked overnight at one gaming merchant. Walk me through it.", a: `On 14-Jul ${SN.card_testing} received ${fmtN(K.attack1[0])} attempts in under 4 hours: tiny amounts, a new card each time, mostly incorrect_cvc and do_not_honor. That's card testing. ${K.attack1[1]} slipped through before the velocity rule; ${fmtN(K.attack1[2])} were blocked after. Actions: block the BIN ranges / devices, refund the successful ones before they become chargebacks, enforce 3DS, and add velocity limits per merchant.`, signal: "Fraud-pattern recognition." },
  { cat: "Scenario-Based", q: "The CFO wants to know why revenue grew faster than TPV in December.", a: `December TPV grew ${K.mom_tpv}% but revenue ${K.mom_rev}%. Check mix: more card, cross-border and Global-plan volume (Black Friday / Christmas in the US, UK and Australia) and relatively less zero-fee UPI. Show TPV and revenue by method and country for Nov vs Dec.`, signal: "Mix analysis." },
  { cat: "Scenario-Based", q: "A merchant complains they haven't been paid for weeks.", a: `Look up fact_settlement for the merchant: ${SN.payout_failure}'s payouts since 18-Nov have status failed with 'account_closed'. Quantify the outstanding amount, confirm with treasury, ask the merchant for new bank details, then re-pay. Add a monitor: any merchant with 2+ consecutive failed payouts.`, signal: "Operational investigation." },
  { cat: "Scenario-Based", q: `Your dashboard says ${ST_(K.merchant_status, "Active")[1]} active merchants, mine says ${K.active}. Who's right?`, a: `Both, for different definitions. ${ST_(K.merchant_status, "Active")[1]} is merchant_status = 'Active' at the extract; ${K.active} is 'at least one successful payment in 2025'. Agree the activity definition, label the card, and show the status breakdown separately.`, signal: "Reconciling definitions with stakeholders." },
  // ---------------- Synthetic data & limits
  { cat: "Synthetic Data & Limits", q: "The data is synthetic. What are its limits?", a: "It was generated to behave like a processor's data (patterns, stories, quirks), not sampled from real customers, so absolute levels — fraud rates, ticket sizes, dispute ratios — are illustrative. The risk score is a demonstration. What transfers to real work is the logic: grains, denominators, FX, cohort metrics, de-duplication and reconciliation.", signal: "Honesty — interviewers respect it." },
  { cat: "Synthetic Data & Limits", q: "Would your fraud insights hold on real data?", a: "The method would; the numbers might not. I'd validate segment rates on real data, check how many cases are still maturing, and confirm that the drivers (cross-border, card-not-present, high tickets) hold before recommending rule changes.", signal: "Scientific attitude." },
  // ---------------- General & HR
  { cat: "General & HR", q: "Tell me about a time a number didn't reconcile.", a: `Our fraud card showed ${usd(K.cf_amount_case_sum)} but the risk team's figure was ${usd(K.cf_amount)}. I traced it to ${K.multi_case_payments} payments with several investigation cases; we were summing cases. I rebuilt the measure at payment grain, documented it, and added a test query that compares cases with distinct payments.`, signal: "STAR with a real example." },
  { cat: "General & HR", q: "How did you split work in your group?", a: "Be specific: who owned Excel profiling, the SQL views and checks, the Tableau and Power BI pages, QA and the deck — and what you personally delivered. Interviewers check consistency with follow-up questions.", signal: "Ownership." },
  // ---------------- Rapid fire
  { cat: "Rapid Fire", q: "TPV and processing revenue?", a: `${usd(K.tpv)} and ${usd(K.revenue)} (take rate ${K.take_rate}%).`, signal: "Number recall." },
  { cat: "Rapid Fire", q: "Attempts vs intents?", a: `${fmtN(K.attempts)} attempts, ${fmtN(K.intents)} intents.`, signal: "Number recall." },
  { cat: "Rapid Fire", q: "Success rate and intent conversion?", a: `${K.success_rate}% and ${K.intent_success_rate}%.`, signal: "Number recall." },
  { cat: "Rapid Fire", q: "Confirmed fraud amount and value rate?", a: `${usd(K.cf_amount)} — ${K.cf_rate_value}% of TPV, ${K.cf_payments} payments.`, signal: "Number recall." },
  { cat: "Rapid Fire", q: "Top-10 merchant share?", a: `${K.top10_share}% of TPV.`, signal: "Number recall." },
  { cat: "Rapid Fire", q: "Dispute ratio and win rate?", a: `${K.dispute_ratio}% of chargeback-eligible payments; merchants won ${K.dispute_win_rate}% of decided disputes.`, signal: "Number recall." },
];
const M_GLOSSARY = [
  { t: "TPV (Total Payment Volume)", d: "Value of successful payments processed, in the reporting currency." },
  { t: "Take rate", d: "Processing revenue ÷ TPV." }, { t: "MDR", d: "Merchant Discount Rate — the % fee a merchant pays per payment. Zero for UPI in India." },
  { t: "PSP / payment gateway", d: "The company that processes online payments for merchants (PayFlow here)." },
  { t: "Payment intent", d: "One customer checkout journey; it can contain several attempts (retries)." }, { t: "Payment attempt", d: "One try to charge the customer; one row in fact_payment." },
  { t: "Authorisation / success rate", d: "Successful attempts ÷ attempts with a final status." }, { t: "Issuer", d: "The customer's bank that approves or declines a card payment." },
  { t: "Decline code", d: "The reason a payment failed (insufficient_funds, do_not_honor …)." }, { t: "3-D Secure (3DS)", d: "An extra cardholder authentication step (OTP). Failures show as authentication_failed / abandoned." },
  { t: "UPI", d: "India's real-time bank-to-bank payment system; collect requests can expire." }, { t: "BNPL", d: "Buy now, pay later: the provider pays the merchant and collects from the customer in instalments." },
  { t: "Card-not-present (CNP)", d: "An online card payment — the main channel for card fraud." }, { t: "BIN", d: "Bank Identification Number: the first digits of a card, identifying issuer and country." },
  { t: "Cross-border payment", d: "Customer (card) country differs from the merchant's country." }, { t: "Presentment currency", d: "Currency the customer is charged in." },
  { t: "Settlement currency", d: "Currency the merchant is paid out in." }, { t: "FX rate", d: "Exchange rate used to convert an amount into the reporting currency on a given date." },
  { t: "Refund", d: "Money the merchant voluntarily returns; can be full, partial or multiple partial." }, { t: "Dispute", d: "A cardholder's claim through their bank against a payment." },
  { t: "Chargeback", d: "The money taken back from the merchant when a dispute is lost or accepted." }, { t: "Dispute ratio", d: "Disputes ÷ successful chargeback-eligible payments; networks monitor merchants around 0.9–1%." },
  { t: "Reason code", d: "Network code for a dispute type (Visa 10.4 = card-absent fraud; Mastercard 4837)." }, { t: "Friendly fraud", d: "A genuine cardholder disputes a purchase they actually made." },
  { t: "Card testing", d: "Many small attempts with stolen cards to find valid ones." }, { t: "Velocity rule", d: "A risk rule that limits how many attempts a card / device / IP can make in a time window." },
  { t: "Risk score", d: "A model output (0–1) estimating fraud likelihood. Here a demonstration score — not proof." }, { t: "Suspected fraud", d: "A payment flagged by rules or score; not yet confirmed." },
  { t: "Confirmed fraud", d: "A payment whose investigation closed as fraud (confirmed_fraud_flag = 1)." }, { t: "Recovery", d: "Part of a fraud loss recovered via refund, won dispute or merchant reserve." },
  { t: "Rolling reserve", d: "Funds a processor holds back from a risky merchant's payouts and releases later." }, { t: "Payout / settlement", d: "Money transferred to the merchant after fees, refunds, chargebacks and adjustments." },
  { t: "T+2", d: "Paid two business days after the transaction date." }, { t: "KYC", d: "Know Your Customer — identity and business checks before a merchant goes live." },
  { t: "Activation", d: "The date a merchant is approved to take live payments." }, { t: "Cohort", d: "A group defined by a shared start (e.g. onboarded in Q1) followed over time." },
  { t: "Merchant retention", d: "Share of a cohort of active merchants that is still active later." }, { t: "Concentration risk", d: "Dependence on a few large merchants (top-10 share of TPV)." },
  { t: "Grain", d: "What one row of a table represents." }, { t: "Fan-out", d: "Row multiplication when joining a one-to-many table; inflates sums." },
  { t: "SCD Type 2", d: "A dimension that keeps history with effective_from / effective_to dates." }, { t: "Late-arriving data", d: "Rows that land in the warehouse after their business date." },
  { t: "Star schema", d: "Facts in the centre, dimensions around them, single-direction filters." }, { t: "LOD expression", d: "Tableau calculation at a fixed grain, e.g. { FIXED [Payment Id] : MAX(...) }." },
  { t: "USERELATIONSHIP", d: "DAX function that activates an inactive relationship inside a measure." }, { t: "DISTINCTCOUNT", d: "Counts unique values — use it when a child table repeats the key." },
];
const M_TIPS = [
  { n: "01", h: "Tell the project as a story, not a feature list", p: "Business → data & grain → the hard part → the outcome. Interviewers remember stories, not tool lists." },
  { n: "02", h: "Always use real numbers", p: `"A big payments dataset" says nothing. "${fmtN(K.attempts)} attempts, ${usdM(K.tpv)} TPV, ${K.cf_rate_value}% confirmed fraud" says everything.` },
  { n: "03", h: "Say the grain before the metric", p: "'One row per attempt, so I counted distinct intents' is the sentence that proves you did the work." },
  { n: "04", h: "Lead every KPI with its business question", p: "'Of merchants who signed up, how many went live within 30 days?' beats 'activation rate is a ratio'." },
  { n: "05", h: "Have one honest reconciliation story", p: "Fraud cases vs fraudulent payments, attempts vs intents, rupees + dollars — all real, specific stories from this data." },
  { n: "06", h: "Contribute across every tool", p: "This capstone is graded on Excel, SQL, Tableau, Power BI and QA together." },
  { n: "07", h: "Practise explaining to a non-technical CFO", p: "No jargon: 'about two dollars in every thousand turned out to be fraud'." },
  { n: "08", h: "Structure scenario answers the same way", p: "Check the data → split the change → find the driver → quantify → recommend one action." },
];
const M_TIP_CALLOUT = "Cracking a data analyst interview isn't about reciting definitions — it's about showing how you think: a report that adds rupees to dollars, a fraud total that counts cases instead of payments, a manager who calls every 'Active' status an active merchant. Every question in the Interview tab tests one of those moments.";
const M_RESUME_BULLETS = [
  `Built Merchant 360° and Fraud & Risk dashboards in Tableau and Power BI on ${fmtN(K.attempts)} payment attempts across ${fmtN(K.registered)} merchants and 8 currencies, reconciled to MySQL.`,
  `Designed an 18-table star model (payments, risk, refunds, disputes, fraud cases, settlements, SCD-2 merchant status) with fan-out-safe views and 40+ integrity checks.`,
  `Standardised KPI definitions: attempts vs intents, cohort activation (${K.activation_rate}%) and retention (${K.retention_rate}%), USD TPV (${usdM(K.tpv)}) and take rate (${K.take_rate}%).`,
  `Corrected fraud reporting from case level to payment level (−${f1(100 * (1 - K.cf_amount / K.cf_amount_case_sum))}%) and separated suspected exposure from confirmed loss.`,
  `Flagged ${K.attention_total} merchants for attention with configurable rules, including a top-3 merchant declining ${Math.abs(Math.round((K.declining_top.find(d => d[0] === SI.declining_whale) || [0, 0, 0, 0, 0, 0])[5]))}% QoQ.`,
  `Reconciled ${fmtN(PF.rows.fact_settlement)} merchant payouts to ${fmtN(PF.rows.fact_settlement_line)} ledger lines to the cent and quantified ${usdK(K.outstanding_payout_usd)} of outstanding payouts.`,
];
const M_PROJECT_FAQ = [
  { q: "What if the interviewer isn't technical?", a: "Lead with the business framing (which merchants matter, how much fraud really costs) and the outcome, and go into SQL/DAX only when asked." },
  { q: "What if I only worked on one part?", a: "Say so and go deep on your part. A detailed answer about what you owned beats a vague one that implies you did everything." },
  { q: "Why payments data?", a: "It forces you to deal with grain, currencies, event lifecycles and reconciliation — problems that appear in almost every analytics job, and fintech hires heavily." },
  { q: "The data is synthetic. Will that hurt?", a: "Say so openly: it's a training dataset built to behave like a processor's warehouse, with real-world quirks designed in. What matters is that your logic would work on real data." },
  { q: "Why two BI tools?", a: "The capstone asks for KPI parity across Tableau and Power BI as a reconciliation exercise. In a job you'd usually use one." },
  { q: "What if I forget a number?", a: "Give the direction and rough size ('about 0.2% of volume') instead of a wrong precise number." },
];
const M_LEARNING_LINKS = [
  { title: "Payments explained (Stripe docs: payments lifecycle)", desc: "Payment intents, attempts, refunds, disputes and payouts as a processor models them.", url: "https://docs.stripe.com/payments/paymentintents/lifecycle", source: "Stripe Docs" },
  { title: "Disputes and chargebacks overview", desc: "How disputes, evidence, outcomes and fees work.", url: "https://docs.stripe.com/disputes", source: "Stripe Docs" },
  { title: "UPI — product overview (NPCI)", desc: "How UPI works in India.", url: "https://www.npci.org.in/what-we-do/upi/product-overview", source: "NPCI" },
  { title: "Tableau — Relationships vs joins", desc: "Why the logical layer avoids duplicate rows.", url: "https://help.tableau.com/current/pro/desktop/en-us/datasource_relationships_learnmore.htm", source: "Tableau" },
  { title: "Tableau — LOD expressions", desc: "FIXED, INCLUDE and EXCLUDE.", url: "https://help.tableau.com/current/pro/desktop/en-us/calculations_calculatedfields_lod.htm", source: "Tableau" },
  { title: "Power BI Learning Paths (Microsoft Learn)", desc: "Modelling, DAX and report building with hands-on labs.", url: "https://learn.microsoft.com/en-us/training/powerplatform/power-bi", source: "Microsoft" },
  { title: "Star Schema Design Guidance", desc: "Facts, dimensions and relationship direction in Power BI.", url: "https://learn.microsoft.com/en-us/power-bi/guidance/star-schema", source: "Microsoft" },
  { title: "USERELATIONSHIP (DAX)", desc: "Activating inactive date relationships for refunds, disputes and cases.", url: "https://learn.microsoft.com/en-us/dax/userelationship-function-dax", source: "Microsoft" },
  { title: "MySQL window functions", desc: "LAG, RANK, SUM() OVER for MoM and shares.", url: "https://dev.mysql.com/doc/refman/8.0/en/window-functions.html", source: "MySQL" },
];
const M_WEAK_STRONG = [
  { q: "How many transactions did PayFlow process?", weak: `${fmtN(K.attempts)}.`,
    strong: `${fmtN(K.attempts)} payment attempts, but ${fmtN(K.retry_attempts)} are retries, so ${fmtN(K.intents)} customer payment intents, of which ${fmtN(K.succ_intents)} succeeded. I report intents for volume and attempts for authorisation rate.` },
  { q: "How much fraud did PayFlow have?", weak: `${usd(K.cf_amount_case_sum)} — the sum of confirmed fraud cases.`,
    strong: `${usd(K.cf_amount)} on ${K.cf_payments} payments — ${K.cf_rate_value}% of TPV. Summing cases gives ${usd(K.cf_amount_case_sum)} because ${K.multi_case_payments} payments have several cases. After ${usd(K.recovered)} of recoveries the net loss is ${usd(K.net_fraud_loss)}. Suspected exposure (${usdK(K.suspected_amount)}) is a separate, larger number and is not loss.` },
  { q: "How many active merchants do we have?", weak: `${ST_(K.merchant_status, "Active")[1]}, from the status column.`,
    strong: `${K.active} merchants had at least one successful payment in 2025 — that's my definition of active. ${ST_(K.merchant_status, "Active")[1]} carry the Active status today, which includes merchants that never transacted and excludes some that transacted before being suspended or closed.` },
  { q: "What's our merchant retention?", weak: `${f1(100 * K.active / K.registered)}% — active ÷ registered.`,
    strong: `${K.retention_rate}% of merchants active in Q1 2025 were still transacting in Q4. Active ÷ registered mixes in merchants who joined last month and isn't retention.` },
];

/* ============================================================
   Site content built on the M_ constants above.
   ============================================================ */
const CERTIVA_URL = "https://www.certiva.co.in/";
const CRACKANALYTICS_URL = M_CRACKANALYTICS_URL;

/* ---------------- KPIs ---------------- */
const KPIS = M_KPIS.map((k, i) => ({
  id: "k" + (i + 1), name: k.name, cat: k.cat, q: k.q, desc: k.desc, plain: k.plain, formula: k.formula, dax: k.dax, table: k.group,
  v25: k.v25 || "—", wrong: [k.wrong, k.mistake].filter(Boolean).join(" · Common mistake: "), prio: k.prio,
  dir: /Fail|Refund|Fraud|Suspected|Dispute|Chargeback|Declining|High-Risk|Open Fraud|Resolution|Exception|Inactive|Loss/.test(k.name) ? "lower is better" : "higher is better",
}));
const KPI_CATS = M_KPI_CATS;

/* ---------------- STATS ---------------- */
const STATS = [
  { num: fmtN(K.attempts), lbl: "Payment attempts (2025)" },
  { num: usdM(K.tpv), lbl: "TPV in USD · 8 currencies" },
  { num: K.take_rate + "%", lbl: "Take rate (UPI earns 0%)" },
  { num: K.cf_rate_value + "%", lbl: "Confirmed fraud ÷ TPV" },
  { num: K.top10_share + "%", lbl: "TPV from the top 10 merchants" },
];

/* ---------------- JOURNEY ---------------- */
const JOURNEY = [
  { id: "j1", t: "Understand the Business Problem", d: "Read the problem statement and the business questions for both dashboards. Write down, in one line each, what the CFO and the Head of Risk want to decide.", go: "problem", track: "business" },
  { id: "j2", t: "Explore the Dataset", d: "Open all 18 tables. Note every grain: one row per ATTEMPT in fact_payment (retries!), one per refund attempt, one per fraud CASE (several per payment), one per payout and one per ledger line.", go: "dataset", track: "business" },
  { id: "j3", t: "Build the Data Model", d: "fact_payment in the centre; refunds, disputes, cases and risk scores hang off payment_id; settlements off merchant; dim_fx_rate on (date, currency). Aggregate child facts before joining.", go: "model", track: "model" },
  { id: "j4", t: "Clean & Validate the Data", d: "Row counts, 0 orphans, one success per intent, refunds ≤ captured, fraud flag = status, settlement equation. Then clean the Data-Quality exercise files and count every defect.", go: "quality", track: "model" },
  { id: "j5", t: "Write SQL Queries", d: "Load MySQL, build vw_payment, vw_confirmed_fraud, vw_refund_usd and the merchant-month mart, and run the KPI queries in the SQL Lab.", go: "sql", track: "sql" },
  { id: "j6", t: "Create KPIs", d: "P1 KPIs first (Merchant 360° and Fraud & Risk), each with its numerator, denominator, grain and date basis. Then P2.", go: "kpis", track: "kpi" },
  { id: "j7", t: "Build the Tableau Dashboard", d: "Tableau–SQL: relationships (not one flat join), Merchant 360° with master → detail actions, and the Fraud & Risk pages.", go: "dashboards", track: "tableau" },
  { id: "j8", t: "Build the Power BI Dashboard", d: "Power BI–SQL: star schema, marked date table, inactive date relationships with USERELATIONSHIP, DAX measures and drill-through.", go: "dashboards", track: "powerbi" },
  { id: "j9", t: "Perform QA", d: "Reconcile every KPI between SQL, Tableau and Power BI and run the 17 test cases with their expected results.", go: "qa", track: "qa" },
  { id: "j10", t: "Present Your Business Insights", d: "Build the 8-section final deck, rehearse the 90-second pitch and update your resume.", go: "analysis", track: "career" },
];
const DELIVERABLES = [
  { id: "d1", t: "Business Requirement Summary", d: "Problem, users, user stories, requirements for both dashboards, wireframes.", where: "Problem & Business Questions", track: "business" },
  { id: "d2", t: "Data Dictionary", d: "Every table and column with grain, keys, nullability and validation rule.", where: "Data Dictionary", track: "model" },
  { id: "d3", t: "Data Model + Join Matrix", d: "ER / star diagram, cardinality, filter direction, fan-out risk and aggregation strategy per join.", where: "Data Model", track: "model" },
  { id: "d4", t: "SQL Scripts", d: "DDL, load, validation, views, KPI queries, mart and reconciliation (.sql file). The 'SQL Query Image' slide comes from here.", where: "SQL Lab", track: "sql" },
  { id: "d5", t: "KPI Catalogue", d: "Name, meaning, formula, numerator, denominator, grain, date basis, SQL, visual and common mistake for every KPI.", where: "KPI Library", track: "kpi" },
  { id: "d6", t: "Excel Profiling & Dashboard", d: "Table profiling, FX conversion and the first KPIs with pivots.", where: "Excel Analysis", track: "excel" },
  { id: "d7", t: "Tableau Dashboards", d: "Merchant 360° + Fraud & Risk (.twbx).", where: "Dashboard Gallery", track: "tableau" },
  { id: "d8", t: "Power BI Dashboards", d: "Same pages in Power BI (.pbix) with DAX and drill-through.", where: "Dashboard Gallery", track: "powerbi" },
  { id: "d9", t: "QA & Test Cases", d: "Reconciliation sheet (SQL vs Tableau vs Power BI) + the 17 test cases passed.", where: "QA & Reconciliation", track: "qa" },
  { id: "d10", t: "Data-Quality Report", d: "Each injected defect in the DQ files: count, detection SQL and block / warn decision.", where: "Data Quality", track: "model" },
  { id: "d11", t: "Key Takeaways", d: "5 insights + 5 recommendations backed by numbers.", where: "Business Analysis", track: "career" },
  { id: "d12", t: "Final Presentation", d: "8 sections: Group Details, Summary, KPI List, Excel, Tableau, Power BI, SQL Query Image, Key Takeaway.", where: "90-sec Project Pitch", track: "career" },
];
const BEFORE_AFTER = {
  before: ["Payments, risk, refunds, disputes, cases and payouts in separate systems", "TPV added across 8 currencies (and failed attempts)", "Attempts reported as transactions", "Fraud = sum of investigation cases", "'Active merchant' = status column", "Activation and retention without a cohort", "Payout failures found when merchants complain"],
  after: ["MySQL model: 18 tables, fan-out-safe views, 40+ checks", "USD TPV, revenue and take rate", `Attempts vs intents (${fmtN(K.attempts)} vs ${fmtN(K.intents)})`, "Confirmed fraud once per payment; suspected kept separate", "Merchant 360° + Fraud & Risk in Tableau and Power BI, reconciled to SQL"],
};

/* ---------------- PROBLEM ---------------- */
const PROBLEM_STATEMENT = M_PROBLEM_STATEMENT;
const REQUIREMENTS = [
  ["M1", "Merchant base", "CFO, Head of Merchant Ops", "Registered, newly onboarded, activated, active, inactive merchants; activation rate (cohort)", "P1"],
  ["M2", "Volume & revenue", "CFO", "Attempts, intents, successful / failed, TPV, processing revenue, take rate, average ticket", "P1"],
  ["M3", "Growth & retention", "Merchant Growth Manager", "MoM TPV and revenue growth, cohort retention, onboarding & activation trend", "P1"],
  ["M4", "Concentration", "CFO", "Top-10 contribution, top / bottom merchants by TPV and revenue", "P1"],
  ["M5", "Merchant master + detail", "Relationship Managers", "Searchable table, Attention Flag with reasons, drill-through to merchant detail", "P1"],
  ["M6", "Performance issues", "Head of Merchant Ops", "Success / failure rate by merchant, method, industry, region; failure reasons", "P1"],
  ["R1", "Confirmed fraud", "Head of Risk, CFO", "Cases, transactions, amount, count & value rates, recovery, net loss", "P1"],
  ["R2", "Suspected risk", "Fraud Operations Manager", "Flagged count and amount, risk-band mix, investigation queue with priority", "P1"],
  ["R3", "Disputes, chargebacks & refunds", "CFO, Payments Ops", "Dispute count / amount, chargebacks, dispute ratio, refunds — kept separate", "P1"],
  ["R4", "Risk segmentation", "Head of Risk", "Fraud by method, industry, amount band, geography, hour, risk band; high-risk merchants", "P2"],
  ["R5", "Operations", "Fraud Ops, Payments Ops", "Open investigations, resolution time, settlement exceptions, outstanding payouts", "P2"],
  ["G1", "Filters & governance", "All users", "Date range shown on every page, reset button; every KPI reconciles to SQL; definitions documented", "P1"],
];
const bq = () => [
  { q: "Which merchants generate the most volume and revenue — and how concentrated are we?", data: "fact_payment + dim_fx_rate, dim_merchant", kpi: "TPV, Processing Revenue, Top-10 share",
    analysis: "Convert every payment to USD, sum succeeded payments per merchant, rank them and compute cumulative share.",
    insight: `The top 10 merchants bring ${K.top10_share}% of ${usdM(K.tpv)} TPV and the top 20 ${K.top20_share}%. ${K.top_merchants[0][1]} alone is ${K.top1_share}%. By revenue the order changes: high-fee card and cross-border merchants (${K.top_rev[0][1]}, ${K.top_rev[1][1]}) lead because UPI-heavy Indian merchants earn little.`,
    rec: "Give the top-20 merchants named account managers and quarterly business reviews; track concentration monthly." },
  { q: "Which merchants are growing or declining?", data: "Merchant-month mart", kpi: "MoM / QoQ TPV growth, Declining-merchant flag",
    analysis: "Compare Q4 with Q3 TPV per merchant, with a minimum Q3 volume so tiny merchants don't dominate.",
    insight: `${K.declining_count} merchants fell ≥20% Q4 vs Q3. The biggest is ${SN.declining_whale} (US electronics, #3 by TPV): ${usdK(K.declining_top[0][3])} → ${usdK(K.declining_top[0][4])} (${K.declining_top[0][5]}%), while its success rate stayed above 92% — the customers didn't fail, the volume left.`,
    rec: "Escalate the top decliners to their account managers this week; for the whale, check whether volume moved to a competitor and prepare a pricing response." },
  { q: "Which merchants have payment performance problems?", data: "fact_payment, dim_payment_method, failure_reason", kpi: "Success Rate, Failure Rate, failure reasons",
    analysis: "Monthly success rate per merchant, then failure reasons by method and day for the outliers.",
    insight: `${K.high_fail_count} merchants have a failure rate ≥15% on 100+ attempts. ${SN.integration_bug}'s success rate dropped from ${STORY_M("integration_bug", 3)[4]}% in April to ${STORY_M("integration_bug", 4)[4]}% in May: authentication_failed and processing_error on cards between 12-May and 3-Jun — a 3-D Secure integration bug.`,
    rec: "Set a daily alert when a merchant's success rate drops 10 points below its 30-day average; route integration failures to merchant support." },
  { q: "Are merchants activating and staying?", data: "dim_merchant, fact_payment", kpi: "Activation Rate (cohort), Merchant Retention",
    analysis: "2025 sign-ups onboarded by 30-Nov, activated within 30 days; Q1-active merchants still active in Q4.",
    insight: `${K.act_30d} of ${K.act_cohort} cohort merchants went live within 30 days (${K.activation_rate}%). Retention Q1→Q4 is ${K.retention_rate}% (${K.ret_q1_q4} of ${K.ret_q1}). ${K.inactive} activated merchants made no successful payment in 2025.`,
    rec: "Call merchants still pending KYC after 14 days; run a re-activation campaign for the dormant activated base." },
  { q: "How does payment method affect conversion and revenue?", data: "fact_payment, dim_payment_method, dim_pricing_plan", kpi: "Success rate and TPV by method, take rate",
    analysis: "Success rate and TPV by method category; revenue per dollar by method.",
    insight: `UPI is ${f1(100 * K.by_method_cat.find(x => x[0] === "UPI")[3] / K.tpv)}% of TPV with a ${(MD.method_sr || []).find(x => x[0] === "UPI")[1]}% success rate and 0% fee; wallets succeed most (${(MD.method_sr || []).find(x => x[0] === "Wallet")[1]}%); BNPL least (${(MD.method_sr || []).find(x => x[0] === "BNPL")[1]}%). On 12-Apr a UPI bank outage cut UPI success to ${K.upi_outage[1]}% for seven hours (normal ${K.upi_normal_sr}%).`,
    rec: "Show smart retries (switch to card or wallet after a UPI timeout) and monitor UPI success hourly." },
  { q: "How much confirmed fraud do we really have?", data: "fact_fraud_case (per payment), fact_payment", kpi: "Confirmed fraud count / amount / rates, recovery, net loss",
    analysis: "Collapse cases to one row per payment, convert to USD, divide by successful intents and TPV.",
    insight: `${K.cf_payments} fraudulent payments, ${usd(K.cf_amount)} — ${K.cf_rate_value}% of TPV (${K.cf_rate_count}% by count). ${usd(K.recovered)} was recovered, net loss ${usd(K.net_fraud_loss)}. Summing cases would report ${usd(K.cf_amount_case_sum)}.`,
    rec: "Publish fraud at payment grain only; add a maturity note for the last 60 days." },
  { q: "Where is fraud concentrated?", data: "vw_confirmed_fraud + vw_payment + dim_customer", kpi: "Fraud value rate by method, industry, amount band, geography",
    analysis: "Fraud ÷ TPV for each segment, not fraud amount alone.",
    insight: `Digital Goods & Gaming (${ST_(K.fraud_by_industry, "Digital Goods & Gaming")[4]}%) and Travel (${ST_(K.fraud_by_industry, "Travel")[4]}%) lead; wallets and cards (${ST_(K.fraud_by_method, "Wallet")[4]}%, ${ST_(K.fraud_by_method, "Card")[4]}%) far above net banking (${ST_(K.fraud_by_method, "Net Banking")[4]}%); $200+ tickets run at ~${K.fraud_by_band[3][4]}%; cross-border ${ST_(K.fraud_xborder, "Cross-border")[3]}% vs domestic ${ST_(K.fraud_xborder, "Domestic")[3]}%.`,
    rec: "Require 3-D Secure for cross-border and $200+ card payments on high-risk industries; review rule thresholds by segment, not globally." },
  { q: "Which transactions and merchants need investigation now?", data: "fact_risk_assessment, fact_fraud_case, fact_dispute", kpi: "Suspected risk, open investigations, high-risk merchants",
    analysis: "Queue flagged payments by expected loss (score × amount); apply the merchant risk framework (dispute ratio, fraud value rate).",
    insight: `${fmtN(K.suspected_count)} attempts were flagged (${usdK(K.suspected_amount)}) but only ${K.review_confirmed[0]} of ${fmtN(K.review_confirmed[0] + K.review_confirmed[1])} closed review cases were confirmed. ${K.high_risk_merchants} merchants breach the illustrative thresholds; ${SN.travel_disputes} (dispute ratio ${f1((K.high_risk_list.find(r => r[0] === SI.travel_disputes) || [0, 0, 0, 0, 0, 0])[5])}%) and the July card-testing target lead.`,
    rec: "Tune the review threshold (false positives cost analyst time and customer friction) and put the travel merchant on a dispute-reduction plan." },
  { q: "How do refunds, disputes and payouts affect financial exposure?", data: "fact_refund, fact_dispute, fact_settlement", kpi: "Refund rate, chargebacks, dispute ratio, outstanding payouts",
    analysis: "Keep each measure separate; reconcile payouts with their ledger lines.",
    insight: `Refunds ${usdK(K.refund_amt_all)} (${K.refund_rate}% of TPV), chargebacks ${usdK(K.chargeback_amt)}, dispute fees ${usdK(K.dispute_fees)}. ${SN.refund_spike}'s refund rate tripled from June. ${usdK(K.outstanding_payout_usd)} of payouts are outstanding — mostly ${SN.payout_failure}, whose bank account was closed in November.`,
    rec: "Contact the payout-failure merchant for new bank details; investigate the refund-spike merchant's product quality; review disputes weekly." },
];

/* ---------------- ORIGINAL BLOCKS ---------------- */
const TOOLS = M_TOOLS;
const DOMAIN_WHAT = M_DOMAIN_WHAT;
const DOMAIN_WHERE = M_DOMAIN_WHERE;
const DOMAIN_DATA_TYPES = M_DOMAIN_DATA_TYPES;
const FLOW = M_FLOW;
const TIMELINE = M_TIMELINE;
const RULES = M_RULES;
const FOCUS_AREAS = M_FOCUS_AREAS;
const SOCIAL = M_SOCIAL;
const SETUP_STEPS = [
  { i: "⬇️", t: "Get the dataset", d: "PayFlow_Capstone_Data (18 CSVs, Data Dictionary workbook, test cases, data-quality exercise files) from your trainer." },
  { i: "🗄️", t: "Import into MySQL", d: "Dimensions first (date, FX, plans, methods, statuses, merchants, customers), then fact_payment, risk, refunds, disputes, cases, settlements, lines, snapshot. LOAD DATA for the big tables." },
  { i: "✅", t: "Verify the load", d: `Row counts must match the Dataset page (fact_payment ${fmtN(RC.fact_payment)}; fact_settlement_line ${fmtN(RC.fact_settlement_line)}) and every integrity check must return 0.` },
  { i: "📊", t: "Connect BI tools", d: "Point Tableau and Power BI at MySQL (the views), not at the CSV files." },
];
const SOFTWARE_LINKS = M_SOFTWARE_LINKS;
const DOCUMENTS = M_DOCUMENTS;

/* ---------------- DATASET ---------------- */
const COVERAGE_TEXT = `Payments from 1-Jan-2025 to 31-Dec-2025, all timestamps in UTC. Refunds, disputes, fraud cases and payouts continue to the extract date 31-Jan-2026 (dim_date covers both, with is_reporting_period = Y for 2025). PayFlow is a fictional payment processor with ${fmtN(K.registered)} merchants in India, the US, UK, UAE, Singapore, Australia and Canada (${fmtN(K.customers)} tokenised customers). Amounts are stored in the payment's own currency (8 currencies) and converted to the reporting currency USD with dim_fx_rate on the payment date. fact_payment is one row per ATTEMPT (${fmtN(K.attempts)}); ${fmtN(K.retry_attempts)} retries share a payment_intent_id (${fmtN(K.intents)} intents). Every foreign key in the clean dataset is valid; defects live only in the Data-Quality exercise files.`;
const STORY = [
  ["Every month", "A few merchants carry the business", `Top 10 = ${K.top10_share}% of TPV; #1 alone ${K.top1_share}%`, "Top-10 contribution, Pareto chart"],
  ["From September", "A top-3 merchant walks away", `${SN.declining_whale}: Q4 TPV ${K.declining_top[0][5]}% vs Q3 with a stable success rate`, "Declining merchants, merchant detail"],
  ["12-May → 3-Jun", "An integration bug", `${SN.integration_bug}: success ${STORY_M("integration_bug", 3)[4]}% → ${STORY_M("integration_bug", 4)[4]}%, authentication_failed`, "Success rate by merchant, failure reasons"],
  ["12-Apr", "UPI bank outage", `UPI success ${K.upi_outage[1]}% for 7 hours (normal ${K.upi_normal_sr}%)`, "Success rate by method and hour"],
  ["18-Mar", "Risk engine down", `${K.no_score} payments with no risk score`, "LEFT JOIN check, investigation table"],
  ["14-Jul night", "Card-testing attack", `${fmtN(K.attack1[0])} attempts at ${SN.card_testing}; ${K.attack1[1]} succeeded, ${fmtN(K.attack1[2])} blocked`, "Fraud trend by day/hour, failure reasons"],
  ["Jun → Aug", "Flight cancellations → disputes", `${SN.travel_disputes} dispute ratio jumps; most disputes product_not_received`, "Disputes & chargebacks trend"],
  ["From June", "Refund spike", `${SN.refund_spike}: refunds triple (quality issue)`, "Refund rate by merchant"],
  ["From 18-Nov", "Payouts failing", `${SN.payout_failure}: beneficiary account closed — ${usdK(K.outstanding_payout_usd)} outstanding`, "Settlement exceptions"],
  ["Sep–Oct, Nov–Dec", "Festive peaks", "Indian festive sale & Diwali; Black Friday / Cyber Monday; Christmas", "TPV trend by day"],
];
const TABLE_TYPES = {}, TABLE_SRC = {}, TABLE_PK = {}, TABLE_FK = {}, TABLE_GRAIN = {}, TABLE_DATE = {}, TABLE_PURPOSE = {};
const DATEC = { dim_date: "calendar_date", dim_merchant: "onboarding_date, activation_date", dim_merchant_status_history: "effective_from / effective_to", dim_customer: "signup_date",
  dim_fx_rate: "rate_date", fact_payment: "transaction_timestamp (UTC), created / updated", fact_risk_assessment: "assessment_timestamp", fact_refund: "refund_timestamp",
  fact_dispute: "dispute_opened_timestamp, resolution_timestamp", fact_fraud_case: "detected_timestamp, case_closed_timestamp", fact_settlement: "settlement_period_date, payout_timestamp",
  fact_settlement_line: "balance_timestamp", fact_merchant_daily_snapshot: "snapshot_date" };
const WHY = { fact_payment: "Every KPI on both dashboards starts here — and its attempt grain is the first trap.", fact_fraud_case: "Confirmed fraud lives here; one payment can have several cases.",
  fact_refund: "Separates money returned from fraud and disputes; partial refunds make it one-to-many.", fact_dispute: "Chargebacks and dispute ratio — card-network risk.",
  fact_settlement: "Payouts to merchants: outstanding and failed payouts, reconciliation.", fact_settlement_line: "Ledger lines that prove each payout to the cent.",
  fact_risk_assessment: "Suspected risk (review / block) — never proof of fraud.", dim_fx_rate: "Without it no amount can be added up.", dim_merchant_status_history: "History of statuses for point-in-time reporting.",
  fact_merchant_daily_snapshot: "Fast daily trends and status-on-date; an aggregate, not a source." };
(PF.dict || []).forEach(t => {
  TABLE_TYPES[t.table] = /Fact/.test(t.type) ? "Fact" : /Aggregate/.test(t.type) ? "Fact (aggregate)" : "Dimension";
  TABLE_SRC[t.table] = t.table; TABLE_PK[t.table] = t.pk; TABLE_FK[t.table] = (PF.dict.find(x => x.table === t.table) || {}).fk || "";
  TABLE_GRAIN[t.table] = t.grain; TABLE_DATE[t.table] = DATEC[t.table] || "—";
  TABLE_PURPOSE[t.table] = [t.purpose, WHY[t.table] || "Reference data that gives the facts their business meaning."];
});
(PF.dict || []).forEach(t => { const d = (window.PF.dict || []).find(x => x.table === t.table); if (d && d.fk) TABLE_FK[t.table] = d.fk; });
const RELATIONSHIPS = M_RELATIONSHIPS;
const LOAD_ORDER = M_LOAD_ORDER;
const CALC_FIELDS = M_CALC_FIELDS;
const GOTCHAS = M_GOTCHAS;
const GLOBAL_FILTERS = M_GLOBAL_FILTERS;
const DASHBOARDS = M_DASHBOARDS;
const NULL_NOTES = [
  "dim_merchant.activation_date is NULL for merchants still Pending Activation or Rejected at KYC — they were never live.",
  "dim_merchant.account_manager_id is NULL for self-serve Standard-plan merchants. LEFT JOIN dim_account_manager.",
  "fact_payment.failure_reason is NULL for Succeeded and Pending attempts; processing_fee_amount is 0 for every non-successful attempt.",
  `fact_payment has ${K.pending} Pending attempts at the extract (bank transfers at year end and a few stuck payments): neither success nor failure.`,
  `fact_payment.source_system = 'batch_reconciliation' marks ${fmtN(K.late_arriving)} late-arriving rows: created_timestamp is 1–6 days after the payment (${K.late_in_2026} land in January 2026).`,
  `${K.no_score} attempts have no row in fact_risk_assessment (risk engine outage, 18-Mar-2025 04:00–09:30 UTC).`,
  "fact_risk_assessment.risk_reason_id is NULL for approved payments; decision_reason = 'score_below_threshold'.",
  "fact_dispute.chargeback_amount is NULL while the outcome is pending, and resolution_timestamp is NULL until closed. network_reason_code is 'N/A' for wallets and BNPL.",
  "fact_fraud_case.case_closed_timestamp is NULL for Open / Investigating / Escalated cases; confirmed_fraud_amount and recovered_amount are 0 unless Closed - Confirmed.",
  "fact_settlement.payout_timestamp is NULL for pending and on-hold settlements; payout_failure_reason is filled for failed, held and retried payouts.",
  "fact_settlement_line.payment_id is NULL for adjustments (reserve hold/release, fee credits, manual corrections); refund_id and dispute_id only on their own line types.",
  "dim_merchant_status_history.effective_to is NULL on the current row (is_current = 'Y').",
  "Timestamps are UTC: a few Indian merchants show a payment on the UTC day BEFORE their local activation_date — a time-zone effect, not an error.",
];
const DQ_RULES = [
  ["Row counts", "COUNT(*) per table matches the Dataset page", "All 18 tables", "Block"],
  ["Key uniqueness", "No duplicate payment_id, refund_id, dispute_id, fraud_case_id, settlement_id, merchant_id", "All tables", "Block"],
  ["Referential integrity", "Every FK exists in its parent (merchant, customer, method, status, date, FX, payment, settlement)", "Facts", "Block"],
  ["Amounts", "transaction_amount > 0; refunds, disputes ≥ 0; fee ≤ amount", "fact_payment, fact_refund", "Block"],
  ["Status domain", "transaction_status_id in dim_transaction_status; fee = 0 unless Succeeded", "fact_payment", "Block"],
  ["Currency", "currency_code exists in dim_fx_rate for that date", "fact_payment", "Block"],
  ["Dates in period", "Payments within 2025; events after their payment; activation ≥ onboarding", "All facts", "Block / Warn"],
  ["Refund cap", "SUM(succeeded refunds) per payment ≤ transaction_amount", "fact_refund", "Block"],
  ["Intent rule", "≤ 1 Succeeded attempt per payment_intent_id", "fact_payment", "Block"],
  ["Fraud consistency", "confirmed_fraud_flag = 1 ⇔ status 'Closed - Confirmed'; confirmed ≤ payment amount; closed ≥ detected", "fact_fraud_case", "Block"],
  ["Multiple cases", "Payments with >1 case are allowed — count once per payment", "fact_fraud_case", "Info"],
  ["Settlement equation", "net = gross − fee − refund − chargeback + adjustment; lines = header", "fact_settlement(_line)", "Block payout report"],
  ["Join duplicates", "Row count and SUM(amount) at payment grain unchanged after every join", "Views / BI model", "Block"],
  ["Dashboard = SQL", "Each published KPI ties to the reconciliation query within rounding", "BI tools", "Block"],
  ["Missing risk score", "Payments without a score are expected only on 18-Mar-2025", "fact_risk_assessment", "Warn"],
];
const INTERVIEW_TRAPS = [
  ["TPV = SUM(transaction_amount)", "Convert with dim_fx_rate, Succeeded only"],
  ["Transactions = rows in fact_payment", "Rows are attempts; COUNT(DISTINCT payment_intent_id) for journeys"],
  ["Fraud = SUM of fraud cases", "One amount per payment (MAX), confirmed only"],
  ["Flagged / blocked = fraud", "Suspected risk; only closed-confirmed cases are fraud"],
  ["Active merchants = status 'Active'", "≥1 successful payment in the period"],
  ["Activation = activated ÷ registered", "Cohort with an elapsed observation window"],
  ["Retention = active ÷ registered", "Cohort active in period 1 still active in period 2"],
  ["Refund rate = refund rows ÷ payments", "Succeeded refund value ÷ TPV (or refunded payments ÷ payments)"],
  ["Chargeback = dispute amount", "Only lost / accepted disputes; NULL while pending"],
  ["Join payments → refunds → cases, then SUM", "Aggregate each child to payment grain first"],
  ["Failure rate ÷ all attempts", "Exclude Pending; success + failure = 100%"],
  ["INNER JOIN risk scores", "LEFT JOIN — the outage rows disappear otherwise"],
];
const PRESENTATION = [
  ["01", "Group Details", "15 sec", "Team members and who owned Excel, SQL, Tableau, Power BI and QA."],
  ["02", "Summary", "30 sec", "PayFlow's problem, the 18-table dataset, what you built."],
  ["03", "KPI List", "45 sec", "Merchant 360° and Fraud & Risk P1 KPIs with their definitions (grain, denominator, date basis)."],
  ["04", "Excel Dashboard", "30 sec", "Profiling, FX conversion, first KPIs and pivots."],
  ["05", "Tableau Dashboard", "60 sec", "Merchant 360° (overview + master → detail) and Fraud & Risk."],
  ["06", "Power BI Dashboard", "60 sec", "Same pages in Power BI, reconciled, with drill-through."],
  ["07", "SQL Query Image", "30 sec", "vw_confirmed_fraud, the merchant master query and the reconciliation query."],
  ["08", "Key Takeaway", "45 sec", `Top-10 = ${K.top10_share}% of TPV, take rate ${K.take_rate}%, confirmed fraud ${K.cf_rate_value}%, ${K.attention_total} merchants flagged, ${usdK(K.outstanding_payout_usd)} outstanding payouts.`],
];

/* ---------------- SQL LAB (MySQL 8 — every expected result below was produced by running the query on the dataset) ---------------- */
const SQL_LAB = PF.sqlLab || [];
const SQL_BLOCKS = [
  { cat: "Setup", level: "Easy", title: "1 · Create the 18 tables (MySQL)", desc: "Generated from the Data Dictionary: types, NOT NULL and primary keys. Load dimensions first, then facts.", sql: PF.ddl || "" },
  { cat: "Setup", level: "Easy", title: "2 · Verify the load: row counts", desc: "Every count must match before you build anything.", sql: M_SQL_BLOCKS[0].sql },
].concat(SQL_LAB.map((b, i) => ({ cat: b.cat, level: b.level, title: `${i + 3} · ${b.title}`, desc: b.desc + " Expected output is shown under the query.",
  sql: b.sql + (b.result ? "\n\n/* Expected result (run on the PayFlow dataset):\n" + b.result + "\n*/" : "") })))
  .concat([
    { cat: "Data quality", level: "Medium", title: `${SQL_LAB.length + 3} · Referential integrity across all facts`, desc: M_SQL_BLOCKS[1].desc, sql: M_SQL_BLOCKS[1].sql },
    { cat: "Data quality", level: "Medium", title: `${SQL_LAB.length + 4} · Business-rule checks`, desc: M_SQL_BLOCKS[2].desc, sql: M_SQL_BLOCKS[2].sql },
    { cat: "Data quality", level: "Medium", title: `${SQL_LAB.length + 5} · Settlement reconciliation checks`, desc: M_SQL_BLOCKS[3].desc, sql: M_SQL_BLOCKS[3].sql },
    { cat: "Data quality", level: "Advanced", title: `${SQL_LAB.length + 6} · Data-quality exercise: find every defect`, desc: M_SQL_BLOCKS[4].desc, sql: M_SQL_BLOCKS[4].sql },
  ]);

const QA_SQL = M_SQL_BLOCKS.map((b, i) => ({ title: "QA " + (i + 1) + " · " + b.title.replace(/^\d+ · /, ""), desc: b.desc, sql: b.sql }))
  .concat([{ title: "QA 6 · KPI reconciliation query", desc: "One query that returns the P1 KPIs of both dashboards. Paste its output into the reconciliation table below.",
    sql: `SELECT ROUND(SUM(CASE WHEN is_successful = 1 THEN amount_usd END), 2)           AS tpv_usd,          -- ${K.tpv}
       ROUND(SUM(CASE WHEN is_successful = 1 THEN fee_usd END), 2)              AS revenue_usd,      -- ${K.revenue}
       COUNT(*)                                                                 AS attempts,         -- ${K.attempts}
       COUNT(DISTINCT payment_intent_id)                                        AS intents,          -- ${K.intents}
       ROUND(100 * SUM(is_successful) / SUM(transaction_status <> 'Pending'), 2) AS success_rate,     -- ${K.success_rate}
       COUNT(DISTINCT CASE WHEN is_successful = 1 THEN merchant_id END)         AS active_merchants  -- ${K.active}
FROM vw_payment;

SELECT COUNT(*) AS fraud_payments,                                                                 -- ${K.cf_payments}
       ROUND(SUM(fraud_usd), 2) AS confirmed_fraud_usd,                                            -- ${K.cf_amount}
       ROUND(SUM(fraud_usd) - SUM(recovered_usd), 2) AS net_loss_usd                               -- ${K.net_fraud_loss}
FROM vw_confirmed_fraud;` }]);

const QA_CHECKLIST = [
  { id: "q1", t: "Row counts match", d: `All 18 tables; fact_payment ${fmtN(RC.fact_payment)}, fact_settlement_line ${fmtN(RC.fact_settlement_line)}.` },
  { id: "q2", t: "0 orphan keys", d: `Every FK check returns 0 (only ${K.no_score} payments without a risk score, by design).` },
  { id: "q3", t: "Amounts in USD", d: `TPV ${usd(K.tpv)} — never SUM(transaction_amount) across currencies.` },
  { id: "q4", t: "Attempts vs intents labelled", d: `${fmtN(K.attempts)} attempts / ${fmtN(K.intents)} intents; each card says which.` },
  { id: "q5", t: "Pending excluded from rates", d: `Success ${K.success_rate}% + failure ${K.failure_rate}% = 100%.` },
  { id: "q6", t: "Active = transacting", d: `${K.active} merchants with ≥1 successful payment, not the status column.` },
  { id: "q7", t: "Cohort activation & retention", d: `${K.activation_rate}% and ${K.retention_rate}%.` },
  { id: "q8", t: "Fraud once per payment", d: `${K.cf_payments} payments, ${usd(K.cf_amount)} — not ${usd(K.cf_amount_case_sum)}.` },
  { id: "q9", t: "Suspected kept separate", d: "Review / block exposure never shown as loss." },
  { id: "q10", t: "Chargeback ≠ dispute amount", d: `${usd(K.chargeback_amt)} charged back of ${usd(K.dispute_amt_2025)} disputed in 2025.` },
  { id: "q11", t: "Settlements reconcile", d: "Header equation and lines = header, to the cent." },
  { id: "q12", t: "17 test cases pass", d: "Each expected result on the QA page reproduced in SQL and in both dashboards." },
];

/* ---------------- EXCEL ---------------- */
const EXCEL_TASKS = [
  ["Row counts per table (profiling)", "=COUNTA(fact_payment!A:A)-1", fmtN(K.attempts) + " attempts", "Your task"],
  ["Distinct payment intents", "=ROWS(UNIQUE(fact_payment!B2:B" + (K.attempts + 1) + "))", fmtN(K.intents), "Your task"],
  ["FX lookup per payment", "=INDEX(dim_fx_rate!E:E, MATCH([@transaction_date_key]&[@currency_code], dim_fx_rate!A:A&dim_fx_rate!C:C, 0))", "usd_per_unit", "FX_Practice tab"],
  ["amount_usd", "=[@transaction_amount]*[@usd_per_unit]", "per row", "FX_Practice tab"],
  ["TPV (USD)", "=SUM(Merchant_Monthly[tpv_usd])", usd(K.tpv), "Starter ✓"],
  ["Processing revenue & take rate", "=SUM(Merchant_Monthly[revenue_usd]) · /TPV", usd(K.revenue) + " · " + K.take_rate + "%", "Starter ✓"],
  ["Success rate", "=SUM(succeeded)/(SUM(attempts)-SUM(pending))", K.success_rate + "%", "Starter ✓"],
  ["Active merchants", "=SUMPRODUCT((COUNTIFS(...merchant_id, merchant_id, tpv_usd, \">0\")>0)/COUNTIF(...))", K.active + "", "Starter ✓"],
  ["Top-10 share", "=SUMPRODUCT(LARGE(MerchantTotals[tpv], ROW($1:$10)))/SUM(MerchantTotals[tpv])", K.top10_share + "%", "Starter ✓"],
  ["Monthly TPV + MoM", "=SUMIFS(tpv_usd, month_label, \"2025-12\") / SUMIFS(…\"2025-11\") − 1", K.mom_tpv + "% (Dec)", "Starter ✓"],
  ["Refund rate (refunds sheet)", "=SUMIFS(refund_usd, refund_status, \"succeeded\")/TPV", K.refund_rate + "%", "Your task"],
  ["Refunded payments vs refund rows", "=ROWS(UNIQUE(FILTER(payment_id, refund_status=\"succeeded\")))", fmtN(K.refunded_payments) + " payments / " + fmtN(K.refund_rows) + " rows", "Your task"],
  ["Confirmed fraud payments", "=ROWS(UNIQUE(FILTER(fact_fraud_case[payment_id], fact_fraud_case[confirmed_fraud_flag]=1)))", K.cf_payments + "", "Your task"],
  ["Activation cohort", "=COUNTIFS(onboarding_date,\">=2025-01-01\",onboarding_date,\"<=2025-11-30\")", K.act_cohort + " merchants", "Your task"],
];
const PIVOTS = [
  { n: "01", h: "Profile fact_payment", p: "Rows: transaction_status_id → Values: Count of payment_id. Then rows: currency_code. Write down what you see before calculating anything." },
  { n: "02", h: "Attempts per intent", p: "Rows: attempt_number · Values: Count. Every attempt_number > 1 is a retry of an earlier row." },
  { n: "03", h: "TPV by month (USD)", p: "Merchant_Monthly · Rows: month_label · Values: Sum of tpv_usd, Sum of revenue_usd → combo chart." },
  { n: "04", h: "Top merchants", p: "Rows: merchant_id (+ name via INDEX/MATCH) · Values: Sum of tpv_usd · Top 10 filter · % of grand total." },
  { n: "05", h: "Success rate by method", p: "method_monthly · Rows: method_category · Values: Sum succeeded ÷ (Sum attempts) as a calculated field." },
  { n: "06", h: "Fraud cases vs fraudulent payments", p: "fact_fraud_case · Rows: payment_id · Values: Count of fraud_case_id · filter confirmed_fraud_flag = 1 · how many rows show 2 or 3?" },
  { n: "07", h: "Dispute outcomes", p: "fact_dispute · Rows: dispute_reason · Columns: dispute_outcome · Values: Count and Sum of chargeback_amount." },
];

/* ---------------- GALLERY ---------------- */
function galleryPages() {
  const m = MD, a = K;
  return [
    { n: "01", t: "Merchant 360° — Overview", q: "How big, how healthy and how concentrated is our merchant business?", ins: `${a.active} active merchants · ${usdM(a.tpv)} TPV · ${usdK(a.revenue)} revenue (${a.take_rate}%) · success ${a.success_rate}% · top 10 = ${a.top10_share}%.`, iq: "Why is 'Active merchants' not the status column?", aud: "CFO · Head of Merchant Operations", keys: ["Active merchants", "TPV", "Revenue", "Success rate", "Top-10 share"],
      desc: "KPI cards, TPV & revenue trend, onboarding vs activation, TPV by industry and merchant-status mix.",
      mock: { title: "Merchant 360° Analytics", sub: "Jan–Dec 2025 · USD · all merchants",
        kpis: [{ v: fmtN(a.registered), l: "Registered merchants" }, { v: fmtN(a.active), l: "Active (≥1 success)" }, { v: usdM(a.tpv), l: "Total payment volume" }, { v: usdK(a.revenue), l: "Processing revenue" }, { v: a.success_rate + "%", l: "Payment success rate" }, { v: a.activation_rate + "%", l: "Activation rate (cohort)" }],
        donuts: [{ title: "Current merchant status", data: (m.merchant_status || []).slice(0, 6) }],
        bars: [{ title: "TPV by month ($K)", data: m.month_tpv_k || [] }, { title: "TPV by industry ($M)", data: (m.ind_tpv_m || []).slice(0, 8) }, { title: "Merchants onboarded per month (2025)", data: m.onboard || [] }] },
      build: { tableau: ["Relationships: vw_payment ↔ dim_merchant ↔ dim_date (no physical join to refunds)", "TPV = SUM([Amount Usd]) with Is Successful = 1", "Date-range parameter shown in the title"], powerbi: ["Measures: TPV, Revenue, Active Merchants = DISTINCTCOUNT on successful rows", "dim_date marked as date table", "Reset-filters bookmark button"] } },
    { n: "02", t: "Merchant Master & Detail", q: "Which merchants need attention, and why?", ins: `${a.attention_total} merchants flagged: ${a.attention_reasons.map(r => r[1] + " " + r[0].split(" (")[0].toLowerCase()).join(", ")}.`, iq: "How do you avoid fan-out when refunds and fraud are on the same row?", aud: "Merchant Growth Manager · Relationship Managers", keys: ["Attention flag", "MoM growth", "Refund rate", "Fraud"],
      desc: "Searchable, sortable table of every merchant with an Attention Flag and its reason; drill-through to the merchant's detail page.",
      mock: { title: "Merchant Master", sub: "One row per merchant · child facts aggregated first",
        kpis: [{ v: fmtN(a.attention_total), l: "Merchants flagged" }, { v: a.declining_count + "", l: "Declining ≥20% QoQ" }, { v: a.high_fail_count + "", l: "Failure rate ≥15%" }, { v: a.attention_reasons[2][1] + "", l: "Refunds ≥10% of TPV" }],
        bars: [{ title: "Top 10 merchants by TPV ($K)", data: m.top_tpv_k || [] }, { title: `${SN.declining_whale} — TPV by month ($K)`, data: (K.story_declining_whale || []).map(r => [r[0].slice(5), Math.round(r[1] / 100) / 10]) }] },
      build: { tableau: ["Table sheet + Filter action to a Merchant Detail dashboard", "Attention reason as a calculated string field", "Highlight table for success / refund rate"], powerbi: ["Matrix with conditional formatting", "Drill-through page on merchant_id", "Attention thresholds as what-if parameters"] } },
    { n: "03", t: "Fraud & Risk — Overview", q: "How much fraud do we really have, and where?", ins: `${a.cf_payments} fraudulent payments · ${usd(a.cf_amount)} (${a.cf_rate_value}% of TPV) · net loss ${usd(a.net_fraud_loss)} · suspected ${usdK(a.suspected_amount)} (not loss).`, iq: "Why count fraud once per payment?", aud: "Head of Risk · CFO", keys: ["Confirmed fraud", "Fraud rate", "Suspected risk", "Net loss"],
      desc: "Confirmed vs suspected KPI cards, fraud amount & value-rate trend, risk-band mix, fraud by method, industry and amount band.",
      mock: { title: "Fraud & Risk Analytics", sub: "Confirmed = closed-confirmed cases, one per payment",
        kpis: [{ v: fmtN(a.attempts), l: "Payment attempts" }, { v: usd(a.cf_amount), l: "Confirmed fraud" }, { v: a.cf_payments + "", l: "Fraudulent payments" }, { v: a.cf_rate_value + "%", l: "Fraud value rate" }, { v: usdK(a.suspected_amount), l: "Suspected (flagged)" }, { v: a.open_cases + "", l: "Open investigations" }],
        donuts: [{ title: "Attempts by risk band", data: m.risk_band || [] }],
        bars: [{ title: "Confirmed fraud by month ($)", data: m.fraud_month || [] }, { title: "Fraud value rate by method (%)", data: m.fraud_method_rate || [], suffix: "%" }, { title: "Fraud value rate by industry (%)", data: (m.fraud_ind_rate || []).slice(0, 8), suffix: "%" }, { title: "Fraud value rate by amount band (%)", data: m.fraud_band_rate || [], suffix: "%" }] },
      build: { tableau: ["Data source vw_confirmed_fraud related to vw_payment on payment_id", "COUNTD([Payment Id]) for fraud transactions", "Dual axis: fraud amount bars + value-rate line"], powerbi: ["DISTINCTCOUNT(fact_fraud_case[payment_id]) with flag = 1", "Fraud value rate = DIVIDE([Confirmed Fraud], [TPV])", "Tooltip states the date basis"] } },
    { n: "04", t: "Investigations, Disputes & Exceptions", q: "What needs action today?", ins: `${fmtN(a.suspected_count)} flagged attempts · ${a.open_cases} open cases · ${a.disputes_all} disputes (ratio ${a.dispute_ratio}%) · ${a.high_risk_merchants} high-risk merchants · ${usdK(a.outstanding_payout_usd)} outstanding payouts.`, iq: "Why keep investigation priority separate from confirmed status?", aud: "Fraud Operations Manager · Payments Ops", keys: ["Investigation queue", "Disputes", "Chargebacks", "Payout exceptions"],
      desc: "Prioritised investigation table, disputes & chargebacks trend, top merchants by fraud, high-risk merchant list and settlement exceptions.",
      mock: { title: "Investigations & Exceptions", sub: "As of 31-Jan-2026 extract",
        kpis: [{ v: fmtN(a.disputes_2025), l: "Disputes opened (2025)" }, { v: usdK(a.chargeback_amt), l: "Chargebacks" }, { v: a.dispute_ratio + "%", l: "Dispute ratio" }, { v: a.high_risk_merchants + "", l: "High-risk merchants" }, { v: a.settle_exceptions + "", l: "Payout exceptions" }, { v: usdK(a.outstanding_payout_usd), l: "Outstanding payouts" }],
        donuts: [{ title: "Dispute outcomes", data: m.dispute_outcomes || [] }],
        bars: [{ title: "Disputes opened by month", data: m.dispute_month || [] }, { title: "Dispute reasons", data: m.dispute_reasons || [] }, { title: "Avg days to close a case, by source", data: m.resolution_by_source || [] }] },
      build: { tableau: ["Investigation table sorted by priority score, case status in its own column", "Filter actions from merchant to its disputes", "Exception list from vw_settlement_usd"], powerbi: ["Inactive relationship dispute_opened_date_key → dim_date + USERELATIONSHIP", "Conditional icons for risk band", "Drill-through to merchant detail"] } },
  ];
}

/* ---------------- ASSIGNMENTS ---------------- */
function assignments() {
  const a = K;
  return [
    { id: "a1", tool: "Data Exploration · Excel or SQL", track: "business", t: "How many rows (payment ATTEMPTS) does fact_payment have?", task: ["Open fact_payment.", "Count payment_id."], type: "num", ans: a.attempts, tol: 0, unit: "rows", hint: "Over 300,000.", sol: `SELECT COUNT(*) FROM fact_payment;   -- ${fmtUS(a.attempts)}` },
    { id: "a2", tool: "SQL", track: "sql", t: "How many distinct payment INTENTS are there?", task: ["COUNT(DISTINCT payment_intent_id)."], type: "num", ans: a.intents, tol: 0, unit: "intents", hint: `${fmtN(a.retry_attempts)} rows are retries.`, sol: `SELECT COUNT(DISTINCT payment_intent_id) FROM fact_payment;   -- ${fmtUS(a.intents)}` },
    { id: "a3", tool: "SQL · KPI", track: "kpi", t: "What is TPV in USD? (whole dollars)", task: ["Succeeded attempts only.", "Convert each with dim_fx_rate on date + currency.", "Sum."], type: "num", ans: Math.round(a.tpv), tol: 2, unit: "$", hint: "About $14.6 million.", sol: `SELECT ROUND(SUM(p.transaction_amount * fx.usd_per_unit))\nFROM fact_payment p JOIN dim_fx_rate fx\n  ON fx.rate_date_key = p.transaction_date_key AND fx.currency_code = p.currency_code\nWHERE p.transaction_status_id = 1;   -- ${fmtUS(Math.round(a.tpv))}` },
    { id: "a4", tool: "SQL · KPI", track: "kpi", t: "What is the payment success rate? (two decimals, %)", task: ["Succeeded ÷ attempts excluding Pending."], type: "num", ans: a.success_rate, tol: 0.01, unit: "%", hint: `${a.pending} attempts are Pending.`, sol: `${fmtN(a.succ)} ÷ (${fmtN(a.attempts)} − ${a.pending}) = ${a.success_rate}%.` },
    { id: "a5", tool: "Excel", track: "excel", t: "Using the Excel starter, what is the take rate? (three decimals, %)", task: ["SUM(revenue_usd) ÷ SUM(tpv_usd)."], type: "num", ans: a.take_rate, tol: 0.002, unit: "%", hint: "Below 2% because UPI earns 0%.", sol: `=SUM(revenue_usd)/SUM(tpv_usd) → ${a.take_rate}%` },
    { id: "a6", tool: "SQL", track: "sql", t: "How many merchants are ACTIVE (≥1 successful payment in 2025)?", task: ["COUNT(DISTINCT merchant_id) on Succeeded attempts."], type: "num", ans: a.active, tol: 0, unit: "merchants", hint: "Not the status column.", sol: `SELECT COUNT(DISTINCT merchant_id) FROM fact_payment WHERE transaction_status_id = 1;   -- ${a.active}` },
    { id: "a7", tool: "SQL · Cohort", track: "kpi", t: "What is the merchant activation rate for the 2025 cohort (onboarded 1-Jan to 30-Nov, activated within 30 days)? (two decimals, %)", task: ["Cohort: onboarding_date between 2025-01-01 and 2025-11-30.", "Activated within 30 days ÷ cohort."], type: "num", ans: a.activation_rate, tol: 0.01, unit: "%", hint: `${a.act_cohort} merchants in the cohort.`, sol: `${a.act_30d} ÷ ${a.act_cohort} = ${a.activation_rate}%.` },
    { id: "a8", tool: "SQL · Fraud", track: "sql", t: "How many distinct PAYMENTS were confirmed as fraud?", task: ["fact_fraud_case where confirmed_fraud_flag = 1.", "COUNT(DISTINCT payment_id)."], type: "num", ans: a.cf_payments, tol: 0, unit: "payments", hint: `There are ${a.cf_cases} confirmed cases — that's not the answer.`, sol: `SELECT COUNT(DISTINCT payment_id) FROM fact_fraud_case WHERE confirmed_fraud_flag = 1;   -- ${a.cf_payments}` },
    { id: "a9", tool: "Power BI", track: "powerbi", t: "Confirmed fraud value rate (fraud ÷ TPV)? (three decimals, %)", task: ["Confirmed fraud once per payment, in USD.", "Divide by TPV."], type: "num", ans: a.cf_rate_value, tol: 0.002, unit: "%", hint: `${usd(a.cf_amount)} ÷ ${usdM(a.tpv)}.`, sol: `Fraud Value Rate = DIVIDE([Confirmed Fraud USD], [TPV])   -- ${a.cf_rate_value}%` },
    { id: "a10", tool: "Tableau", track: "tableau", t: "Which payment method category has the LOWEST success rate?", task: ["Success rate by payment_method_category."], type: "select", options: ["Card", "UPI", "BNPL", "Wallet"], ans: (MD.method_sr || []).slice(-1)[0] ? (MD.method_sr || []).slice().sort((x, y) => x[1] - y[1])[0][0] : "BNPL", hint: "Credit decisions decline many.", sol: (MD.method_sr || []).map(r => r[0] + " " + r[1] + "%").join(" · ") },
    { id: "a11", tool: "SQL · Concentration", track: "sql", t: "What share of TPV comes from the top 10 merchants? (two decimals, %)", task: ["TPV per merchant.", "Top 10 ÷ total."], type: "num", ans: a.top10_share, tol: 0.01, unit: "%", hint: "Use RANK() and SUM() OVER ().", sol: `Top-10 share = ${a.top10_share}%` },
    { id: "a12", tool: "Data Quality", track: "model", t: "How many payments have MORE than one fraud case?", task: ["GROUP BY payment_id HAVING COUNT(*) > 1 on fact_fraud_case."], type: "num", ans: a.multi_case_payments, tol: 0, unit: "payments", hint: "These are why SUM over cases is wrong.", sol: `SELECT COUNT(*) FROM (SELECT payment_id FROM fact_fraud_case GROUP BY payment_id HAVING COUNT(*) > 1) x;   -- ${a.multi_case_payments}` },
    { id: "a13", tool: "Business Analysis", track: "career", t: "Which merchant declined the most (by Q3 TPV, ≥20% drop in Q4)?", task: ["Q4 vs Q3 TPV per merchant.", "Minimum $5,000 in Q3."], type: "select", options: [K.declining_top[0][1], K.top_merchants[0][1], SN.card_testing, SN.travel_disputes], ans: K.declining_top[0][1], hint: "A US electronics merchant.", sol: `${K.declining_top[0][1]}: ${usd0(K.declining_top[0][3])} → ${usd0(K.declining_top[0][4])} (${K.declining_top[0][5]}%).` },
    { id: "a14", tool: "SQL · Disputes", track: "kpi", t: "Total chargeback amount in USD (lost + accepted disputes)? (whole dollars)", task: ["chargeback_amount × FX of the payment date.", "Only outcomes lost / accepted."], type: "num", ans: Math.round(a.chargeback_amt), tol: 2, unit: "$", hint: "Not the dispute amount.", sol: `SELECT ROUND(SUM(cb_usd)) FROM vw_dispute_usd WHERE dispute_outcome IN ('lost','accepted');   -- ${fmtUS(Math.round(a.chargeback_amt))}` },
    { id: "a15", tool: "Settlement · SQL", track: "qa", t: "How many settlements are failed or on hold (exceptions)?", task: ["fact_settlement.settlement_status IN ('failed','on_hold')."], type: "num", ans: a.settle_exceptions, tol: 0, unit: "settlements", hint: "Mostly one merchant since November.", sol: `SELECT COUNT(*) FROM fact_settlement WHERE settlement_status IN ('failed','on_hold');   -- ${a.settle_exceptions}` },
  ];
}

/* ---------------- LAB ---------------- */
const LAB = [
  { t: "₹ + $ + £ = TPV?", scn: `A finance analyst shares TPV = ${fmtN(Math.round(K.tpv_naive))} from SUM(transaction_amount).`, opts: [["Use it, it's from the database", "weak"], ["Check currencies and statuses before trusting the total", "best"], ["Divide by 85 to convert rupees", "weak"], ["Round it", "weak"]],
    exp: ["The column holds 8 currencies and every attempt status.", "Convert each row with dim_fx_rate on its date and currency, succeeded only.", `Correct TPV: ${usd(K.tpv)}.`] },
  { t: "Fraud doubled overnight", scn: `The fraud card shows ${usd(K.cf_amount_case_sum)}; the risk team says ${usd(K.cf_amount)}.`, opts: [["Average the two", "weak"], ["Check whether one payment has several cases", "best"], ["Trust the bigger number to be safe", "weak"], ["Refresh the dashboard", "ok"]],
    exp: [`${K.multi_case_payments} payments have 2–3 cases.`, "Summing cases repeats the payment amount.", "Count confirmed fraud once per payment (vw_confirmed_fraud)."] },
  { t: "Is this merchant active?", scn: "Sales says a merchant is 'Active' — it's in the status column. It had no payment for four months.", opts: [["It's active", "weak"], ["Use the activity definition: ≥1 successful payment in the period", "best"], ["Delete the merchant", "weak"], ["Ask IT to change the status", "ok"]],
    exp: ["Status is a current operational field, updated with a lag.", "Active on the dashboard = transacted in the period.", "Show both and label them."] },
  { t: "Success rate fell to 76%", scn: `${SN.integration_bug}'s success rate dropped in May.`, opts: [["Blame customers", "weak"], ["Split failures by reason, method and day", "best"], ["Suspend the merchant", "weak"], ["Wait for June", "ok"]],
    exp: ["Card and wallet failures spike 12-May → 3-Jun.", "Reasons: authentication_failed, processing_error — a 3DS integration bug.", "Alert the merchant's tech team; add a daily success-rate alert."] },
  { t: "Thousands of $1 payments at night", scn: `${SN.card_testing} shows ${fmtN(K.attack1[0])} attempts in 4 hours on 14-Jul.`, opts: [["Celebrate the volume", "weak"], ["Treat it as card testing: block, refund successes, add velocity rules", "best"], ["Ignore — tiny amounts", "weak"], ["Raise the merchant's fees", "weak"]],
    exp: ["New card per attempt, tiny amounts, mostly CVC / do-not-honor failures.", `${K.attack1[1]} succeeded and must be refunded before chargebacks arrive.`, "Velocity rule + 3DS stop the next wave."] },
  { t: "Blocked = fraud?", scn: `A manager wants the ${fmtN(K.blocked)} blocked attempts counted as fraud prevented.`, opts: [["Agree", "weak"], ["Report them as suspected / blocked, not confirmed fraud", "best"], ["Add them to confirmed fraud", "weak"], ["Hide them", "weak"]],
    exp: ["Blocked attempts never reached the issuer; many were legitimate.", "Only investigations confirm fraud.", "Show blocks and confirmed fraud as separate cards."] },
  { t: "Retention looks low", scn: `Someone reports retention as active ÷ registered = ${f1(100 * K.active / K.registered)}%.`, opts: [["Accept it", "weak"], ["Rebuild as a cohort: Q1-active merchants still active in Q4", "best"], ["Use status = Active", "weak"], ["Drop the KPI", "weak"]],
    exp: ["Registered includes recent sign-ups and never-activated merchants.", `Cohort retention: ${K.retention_rate}%.`, "State the cohort and the window on the card."] },
  { t: "Revenue lags TPV", scn: "TPV grew 30% in India but revenue only 20%.", opts: [["Pricing error", "ok"], ["Check the payment-method mix (UPI earns 0%)", "best"], ["FX loss", "weak"], ["Data error", "weak"]],
    exp: ["Revenue depends on method and plan, not just volume.", "UPI growth adds TPV without fees.", "Show TPV and revenue by method."] },
  { t: "Merchant not paid", scn: "A merchant says payouts stopped in November.", opts: [["Tell them to wait", "weak"], ["Check fact_settlement status and failure reason", "best"], ["Re-send all payouts", "weak"], ["Close the account", "weak"]],
    exp: [`${SN.payout_failure}: payouts failed since 18-Nov (account_closed).`, `${usdK(K.outstanding_payout_usd)} outstanding.`, "Get new bank details; add a 2-failures alert."] },
  { t: "December looks safe", scn: "December's fraud rate is the lowest of the year. The CFO wants to announce it.", opts: [["Announce it", "weak"], ["Explain fraud maturity — cases and chargebacks arrive weeks later", "best"], ["Remove December", "weak"], ["Double December's value", "weak"]],
    exp: ["Chargebacks arrive 2–12 weeks after the payment.", "At a 31-Jan extract, December is immature.", "Compare months at the same age or add a maturity note."] },
  { t: "Refund spike", scn: `${SN.refund_spike}'s refunds tripled after June.`, opts: [["It's fraud", "weak"], ["Look at refund reasons and timing before calling it fraud", "best"], ["Block refunds", "weak"], ["Ignore", "weak"]],
    exp: ["Reasons are mostly damaged_or_defective and requested_by_customer.", "That points to product quality, not fraud.", "Account manager follow-up; watch disputes next."] },
  { t: "INNER JOIN risk scores", scn: "Your fraud-by-risk-band report has 168 fewer payments than fact_payment.", opts: [["Fine — rounding", "weak"], ["Check for payments without a score (LEFT JOIN)", "best"], ["Delete them", "weak"], ["Re-load the data", "ok"]],
    exp: ["The risk engine was down on 18-Mar 04:00–09:30 UTC.", "INNER JOIN drops those payments.", "LEFT JOIN and show '(no score)' as its own band."] },
];

/* ---------------- INTERVIEW ---------------- */
const QA_CATS = M_QA_CATS;
const QA = M_QA.slice();
const GLOSSARY = M_GLOSSARY;
const TIPS = M_TIPS;
const TIP_CALLOUT = M_TIP_CALLOUT;
const WEAK_STRONG = M_WEAK_STRONG;

/* ---------------- PITCH ---------------- */
const PITCH_FLOW = [
  { t: "Business Problem", d: "No trusted view of merchant performance and fraud; currencies, grains and definitions mixed.", s: "~10 s", key: ["problem", "merchant", "fraud", "trust"] },
  { t: "Data Sources", d: `18 tables: ${fmtN(K.attempts)} payment attempts, refunds, disputes, fraud cases, risk scores, payouts, 8 currencies.`, s: "~10 s", key: ["attempt", "18", "table", "currenc"] },
  { t: "Data Cleaning", d: "Integrity checks, de-duplication, FX conversion, the DQ exercise.", s: "~10 s", key: ["clean", "duplicate", "quality", "fx"] },
  { t: "Data Model", d: "fact_payment hub, child facts aggregated per payment, SCD-2 status.", s: "~10 s", key: ["model", "star", "grain", "fan-out"] },
  { t: "KPIs", d: "Attempts vs intents, USD TPV, take rate, cohort activation & retention, fraud once per payment.", s: "~10 s", key: ["kpi", "tpv", "cohort", "rate"] },
  { t: "Dashboard", d: "Merchant 360° and Fraud & Risk in Tableau and Power BI, reconciled to SQL.", s: "~10 s", key: ["dashboard", "tableau", "power bi"] },
  { t: "Insights", d: `Top 10 = ${K.top10_share}% of TPV; take rate ${K.take_rate}%; fraud ${K.cf_rate_value}%; card testing; payout failures.`, s: "~15 s", key: ["insight", "top 10", "fraud", "take rate"] },
  { t: "Business Impact", d: "Attention list for account managers, 3DS on risky segments, success-rate alerts, payout monitoring.", s: "~15 s", key: ["recommend", "impact", "alert", "action"] },
];
const ELEVATOR_PITCH = `PayFlow is a payment processor with ${fmtN(K.registered)} merchants in seven countries, and its management couldn't trust its own numbers: volume was added across eight currencies, attempts were reported as transactions and fraud cases were summed instead of fraudulent payments. I built a merchant and fraud analytics solution on a year of data — ${fmtN(K.attempts)} payment attempts, refunds, disputes, fraud investigations, risk scores and ${fmtN(RC.fact_settlement)} payouts. I modelled it in MySQL with views that keep each table at the right grain, ran more than forty integrity checks, and built a Merchant 360° and a Fraud & Risk dashboard in Tableau and Power BI, reconciled to SQL. The results: ${usdM(K.tpv)} TPV and ${usdK(K.revenue)} revenue, a ${K.take_rate}% take rate held down by zero-fee UPI, a top 10 that carries ${K.top10_share}% of volume — including a top-3 merchant down ${Math.abs(Math.round(K.declining_top[0][5]))}% quarter on quarter — and confirmed fraud of ${K.cf_rate_value}% of volume, concentrated in cross-border cards, travel and gaming. I recommended an attention list for account managers, 3-D Secure on high-risk segments, daily success-rate alerts and payout-failure monitoring.`;
const PROJECT_FAQ = M_PROJECT_FAQ;
const RESUME_PROJECT = {
  title: "Merchant & Fraud Risk Analytics — PayFlow Fintech (Capstone)",
  tools: "Tools: SQL (MySQL) | Excel | Tableau | Power BI | DAX",
  bullets: [
    `Analyzed ${fmtN(K.attempts)} payment attempts across ${fmtN(K.registered)} merchants and 8 currencies (2025) in an 18-table payments, risk and settlement model`,
    "Built fan-out-safe MySQL views (vw_payment, vw_confirmed_fraud, merchant-month mart) feeding Merchant 360° and Fraud & Risk dashboards in Tableau and Power BI",
    `Defined auditable KPIs: USD TPV (${usdM(K.tpv)}), take rate (${K.take_rate}%), cohort activation (${K.activation_rate}%) and retention (${K.retention_rate}%), attempt vs intent success`,
    `Restated fraud from case level to payment level and separated suspected exposure (${usdK(K.suspected_amount)}) from confirmed loss (${usdK(K.cf_amount)})`,
    `Flagged ${K.attention_total} merchants for attention and identified a card-testing attack, a 3DS integration failure and ${usdK(K.outstanding_payout_usd)} of failed payouts`,
    "Reconciled every P1 KPI between SQL, Tableau and Power BI and passed 17 business test cases",
  ],
};
const RESUME_BULLETS = M_RESUME_BULLETS;
const LINKEDIN_POST = `Just wrapped up my Fintech Analytics capstone 💳📊\n\nThe problem: a payment processor adding rupees to dollars, counting retries as transactions and summing fraud cases instead of fraudulent payments.\n\nWhat I built:\n📊 An 18-table payments model (${fmtN(K.attempts)} payment attempts, refunds, disputes, fraud cases, payouts, 8 currencies)\n🧮 Auditable KPIs: USD TPV, take rate, cohort activation & retention, confirmed vs suspected fraud\n📈 Merchant 360° and Fraud & Risk dashboards in Tableau and Power BI, reconciled with SQL\n\nBiggest insight: the top 10 merchants carry ${K.top10_share}% of volume — and one of them was quietly losing ${Math.abs(Math.round(K.declining_top[0][5]))}% quarter on quarter.\n\nThanks to Mahendra Singh for the guidance!\n\n#DataAnalytics #Fintech #Payments #PowerBI #Tableau #SQL`;
const PORTFOLIO = [
  { n: "01", h: "Publish to Tableau Public", p: "Upload the .twbx with KPI definitions in tooltips — especially attempts vs intents and fraud per payment." },
  { n: "02", h: "Record a 2-minute walkthrough", p: "Screen-record the dashboard while giving your 90-second pitch." },
  { n: "03", h: "GitHub repo", p: "DDL, views, KPI queries, reconciliation query, test cases and screenshots with a clear README." },
  { n: "04", h: "Write a Medium post", p: "\"Your fraud number is counting cases, not payments\" or \"Never add rupees to dollars\" make great short write-ups." },
  { n: "05", h: "Add it to LinkedIn Featured", p: "Pin the Tableau Public link and the video." },
  { n: "06", h: "Prepare the deck", p: "The 8 sections: Group Details, Summary, KPI List, Excel, Tableau, Power BI, SQL Query Image, Key Takeaway." },
];
const LEARNING_LINKS = [
  { title: "90-Day AI Learning", desc: "After this project, start your AI journey: a 90-day, week-by-week AI engineer learning plan with a project every week.", url: "https://90daysailearning.vercel.app/", source: "AI Learning" },
  { title: "Data Analyst Roadmap (roadmap.sh)", desc: "A step-by-step visual roadmap of every skill a data analyst needs.", url: "https://roadmap.sh/data-analyst", source: "roadmap.sh" },
  { title: "Mahendra Singh on Medium", desc: "Articles on SQL, Power BI, Tableau and analytics projects.", url: "https://medium.com/@mahendraa1188", source: "Medium" },
].concat(M_LEARNING_LINKS);

/* ---------------- CHAT ---------------- */
const SYNONYMS = { "tpv": ["volume", "payment volume"], "fraud": ["confirmed", "suspected", "case"], "active": ["activity", "merchant"], "retry": ["intent", "attempt"],
  "refund": ["refunds", "partial"], "dispute": ["chargeback", "disputes"], "fx": ["currency", "usd", "exchange"], "dax": ["measure", "power bi"], "sql": ["query", "select"], "trap": ["gotcha", "mistake"] };
const INTENT_RULES = [
  { re: /intent|attempt|retry/i, title: "What is a payment intent, and why does this dataset have one?" },
  { re: /take rate|revenue vs|tpv.*revenue/i, title: "What is TPV and why isn't it revenue?" },
  { re: /suspect|confirmed/i, title: "What's the difference between suspected and confirmed fraud?" },
  { re: /chargeback/i, title: "What is a chargeback?" },
  { re: /card testing/i, title: "What is card testing?" },
  { re: /currenc|fx|usd/i, title: "Never add amounts across currencies" },
  { re: /fan.?out/i, title: "What is fan-out and where did it bite you here?" },
  { re: /retention/i, title: "How did you define merchant retention?" },
];
const CHAT_POPULAR = ["What is TPV?", "Attempts vs intents", "Suspected vs confirmed fraud", "What is fan-out?", "What is a chargeback?", "Give me a scenario question"];
const QUICK_REPLY_POOL = ["What is TPV?", "Attempts vs intents", "Suspected vs confirmed fraud", "What is card testing?", "Merchant retention", "Why convert currencies?", "Give me a scenario question"];
const SRC = {
  star: ["Microsoft Learn: Understand star schema for Power BI", "https://learn.microsoft.com/en-us/power-bi/guidance/star-schema"],
  userel: ["Microsoft Learn: USERELATIONSHIP function (DAX)", "https://learn.microsoft.com/en-us/dax/userelationship-function-dax"],
  divide: ["Microsoft Learn: DIVIDE function (DAX)", "https://learn.microsoft.com/en-us/dax/divide-function-dax"],
  lod: ["Tableau Help: Level of Detail expressions", "https://help.tableau.com/current/pro/desktop/en-us/calculations_calculatedfields_lod.htm"],
};
const QA_REFERENCES = Object.values(SRC);

const SAMPLE_IMAGE_DASHBOARDS = [
  { img: "assets/payflow-merchant360-sample.jpg", t: "Merchant 360° Analytics", by: "Reference design for this project (illustrative values)",
    does: "Filters across the top (region, industry, merchant status, payment method, date range), five KPI cards with period comparison, payment volume & revenue trend, onboarding & activation, TPV by industry, top 10 merchants, merchant-status donut and a searchable merchant performance table with MoM growth.",
    kpis: "Total merchants, active merchants, TPV, processing revenue, success rate, refund rate, MoM growth", visuals: "KPI cards, combo bar/line, grouped columns, donut, ranked bars, paginated table",
    proxima: `Rebuild this layout with PayFlow's real numbers: ${fmtN(K.registered)} merchants, ${K.active} active, ${usdM(K.tpv)} TPV, ${usdK(K.revenue)} revenue, ${K.success_rate}% success. The numbers on the image are placeholders.` },
  { img: "assets/payflow-fraud-risk-sample.jpg", t: "Fraud & Risk Analytics", by: "Reference design for this project (illustrative values)",
    does: "Filters (region, industry, risk tier, payment method, investigation status), KPI cards for transactions, confirmed fraud amount and count, suspected-risk amount and open investigations, fraud amount & rate trend, risk-band donut, fraud by method, industry and amount band, disputes & chargebacks trend, top merchants by fraud and a 'transactions requiring investigation' table.",
    kpis: "Confirmed fraud amount / count / rate, suspected-risk amount, open investigations, disputes, chargebacks", visuals: "KPI cards, bar + line, donut, columns, horizontal bars, stacked columns, investigation table",
    proxima: `Your version: ${fmtN(K.attempts)} attempts, ${usd(K.cf_amount)} confirmed fraud on ${K.cf_payments} payments (${K.cf_rate_value}%), ${usdK(K.suspected_amount)} suspected, ${K.open_cases} open investigations.` },
  { img: "assets/payflow-data-model.jpg", t: "PayFlow Data Model & ERD", by: "Project data model",
    does: "Shows fact_payment at the centre, the shared dimensions (date, merchant, payment method, transaction status, customer, risk reason) and the child facts (refunds, disputes, fraud cases, settlements and settlement lines), with which pieces feed each dashboard.",
    kpis: "—", visuals: "Entity-relationship diagram",
    proxima: "The delivered dataset adds dim_fx_rate, dim_pricing_plan, dim_account_manager, dim_merchant_status_history, fact_risk_assessment and the daily snapshot to this core." },
];

const VIDI_DASHBOARDS = [
  { name: "Merchant 360° Overview", tool: "Power BI / Tableau", tag: "How healthy is the merchant business?", context: "Monthly business review with the CFO.",
    what: "Merchant base, volume, revenue, success rate, growth and concentration.", question: "Are we growing, and on how few merchants?", who: "CFO, Head of Merchant Operations",
    kpis: ["Active merchants", "TPV", "Processing revenue", "Success rate", "Top-10 share"], visuals: ["KPI cards", "TPV & revenue trend", "TPV by industry", "Status donut"], filters: "Date, region, industry, status, method",
    build: ["vw_payment as the fact", "Active = ≥1 success in period", "USD amounts only"], proxima: `${K.active} active · ${usdM(K.tpv)} TPV · ${K.top10_share}% from the top 10.`, page: "01 Merchant 360° — Overview" },
  { name: "Merchant Master & Detail", tool: "Power BI / Tableau", tag: "Which merchants need a call this week?", context: "Account-manager weekly stand-up.",
    what: "Every merchant with performance, refunds, fraud and an Attention Flag; drill-through to detail.", question: "Who is declining, failing or risky?", who: "Merchant Growth Manager, RMs",
    kpis: ["MoM growth", "Success rate", "Refund rate", "Attention reason"], visuals: ["Searchable table", "Merchant trend", "Failure-reason bars"], filters: "Merchant, industry, region, risk tier",
    build: ["Aggregate each child fact per merchant first", "LEFT JOIN from dim_merchant", "Thresholds as parameters"], proxima: `${K.attention_total} merchants flagged.`, page: "02 Merchant Master & Detail" },
  { name: "Payment Performance", tool: "Power BI", tag: "Where are payments failing?", context: "Daily payments-ops monitor.",
    what: "Success and failure rate by method, merchant, hour and failure reason.", question: "Is a bank, method or integration broken?", who: "Payments Ops, merchant support",
    kpis: ["Success rate", "Failure reasons", "Retry conversion"], visuals: ["Hourly line", "Reason Pareto", "Method heatmap"], filters: "Method, merchant, date/hour",
    build: ["Exclude Pending from rates", "Attempts vs intents", "Alert on 10-point drops"], proxima: `UPI outage 12-Apr: ${K.upi_outage[1]}% success; ${SN.integration_bug} 3DS bug in May.`, page: "Extension" },
  { name: "Fraud & Risk Overview", tool: "Power BI / Tableau", tag: "How much fraud, and where?", context: "Weekly risk committee.",
    what: "Confirmed fraud vs suspected risk, recovery, net loss and segmentation.", question: "Is fraud under control?", who: "Head of Risk, CFO",
    kpis: ["Confirmed fraud", "Value rate", "Suspected risk", "Net loss"], visuals: ["Trend with rate line", "Risk-band donut", "Segment bars"], filters: "Date basis, method, industry, risk tier",
    build: ["vw_confirmed_fraud (one per payment)", "Rates, not amounts", "Maturity note for recent months"], proxima: `${usd(K.cf_amount)} confirmed (${K.cf_rate_value}%).`, page: "03 Fraud & Risk — Overview" },
  { name: "Investigation Queue", tool: "Power BI", tag: "What should analysts look at first?", context: "Fraud-ops daily queue.",
    what: "Flagged payments ranked by expected loss with case status and reason.", question: "Where is the biggest risk right now?", who: "Fraud Operations Manager",
    kpis: ["Open cases", "Priority score", "Resolution time"], visuals: ["Investigation table", "Ageing bars"], filters: "Status, risk band, merchant",
    build: ["Priority = score × amount × cross-border boost", "Confirmed status in its own column", "LEFT JOIN cases"], proxima: `${K.open_cases} open cases; avg ${K.resolution_days_avg} days to close.`, page: "04 Investigations, Disputes & Exceptions" },
  { name: "Disputes & Chargebacks", tool: "Tableau", tag: "Are we breaching network thresholds?", context: "Monthly network-health review.",
    what: "Disputes, outcomes, chargebacks, fees and dispute ratio by merchant.", question: "Which merchants risk network fines?", who: "Risk, Payments Ops",
    kpis: ["Dispute ratio", "Win rate", "Chargeback amount"], visuals: ["Monthly bars", "Reason Pareto", "Merchant ranking"], filters: "Reason, outcome, network",
    build: ["Denominator = chargeback-eligible payments", "Chargeback NULL while pending", "Dispute date basis"], proxima: `Ratio ${K.dispute_ratio}%; ${SN.travel_disputes} spikes in summer.`, page: "04 Investigations, Disputes & Exceptions" },
  { name: "Settlement & Payouts", tool: "Power BI", tag: "Did every merchant get paid?", context: "Treasury daily check.",
    what: "Payout status, exceptions, outstanding amounts and reconciliation.", question: "What do we still owe merchants?", who: "Finance, Treasury",
    kpis: ["Outstanding payouts", "Failed payouts", "Reconciliation breaks"], visuals: ["Status donut", "Exception table"], filters: "Currency, merchant, status",
    build: ["Convert per currency", "Lines = header check", "Status as of extract"], proxima: `${usdK(K.outstanding_payout_usd)} outstanding; ${K.settle_exceptions} exceptions.`, page: "04 Investigations, Disputes & Exceptions" },
  { name: "Merchant Onboarding Funnel", tool: "Tableau", tag: "Do new merchants go live?", context: "Sales & onboarding.",
    what: "Sign-ups, KYC time, activation and first payment by cohort.", question: "Where do new merchants drop off?", who: "Merchant Ops, Sales",
    kpis: ["Activation rate", "Days to activate", "Rejected"], visuals: ["Cohort table", "Funnel"], filters: "Month, country, plan",
    build: ["Cohort with elapsed window", "Status history for rejections"], proxima: `${K.activation_rate}% within 30 days.`, page: "01 Merchant 360° — Overview" },
  { name: "Data Quality Monitor", tool: "Power BI", tag: "Can we trust today's numbers?", context: "Every BI project needs one.",
    what: "Row counts, orphans, duplicates, rule breaks and reconciliation per refresh.", question: "Is the data good enough to publish?", who: "BI team",
    kpis: ["Checks passed", "Rows quarantined", "Recon breaks"], visuals: ["Check list", "Trend per check"], filters: "Table, check",
    build: ["One SQL check per rule (QA page)", "Block vs warn", "Snapshot each refresh"], proxima: `${(PF.integrity || []).filter(c => c.ok).length}/${(PF.integrity || []).length} checks pass on the clean data.`, page: "QA & Reconciliation" },
];

/* ---------------- TEST CASES (QA page) ---------------- */
function renderTestCases() {
  const t = document.getElementById("testcase-table"); if (!t) return;
  const T = PF.tests || [];
  t.innerHTML = `<thead><tr><th>Test</th><th>Scenario</th><th>IDs to use</th><th>How to check</th><th>Expected result</th><th>Why it matters</th></tr></thead>
    <tbody>${T.map(x => `<tr><td><strong>${esc(x.tc)}</strong></td><td>${esc(x.scenario)}</td><td><code>${esc(x.ids)}</code></td><td>${esc(x.how_to_check)}</td><td>${esc(x.expected)}</td><td>${esc(x.why_it_matters)}</td></tr>`).join("")}</tbody>`;
}
document.addEventListener("DOMContentLoaded", () => { try { renderTestCases(); } catch (e) { console.error(e); } });

/* ============================================================
   Helpers
   ============================================================ */
const CHART_COLORS = ["#1C64F2", "#7C3AED", "#38BDF8", "#F59E0B", "#16A34A", "#DC2626", "#0E1A5C", "#94A3B8"];
function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }
function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function slugify(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60); }
function copyText(text, btn, label) {
  const done = () => { if (btn) { const o = label || btn.textContent; btn.textContent = "✓ Copied"; setTimeout(() => { btn.textContent = o; }, 1500); } };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  else fallbackCopy(text, done);
}
function fallbackCopy(text, cb) {
  const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
  document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) {} ta.remove(); if (cb) cb();
}

/* ---------------- Storage (never throws) ---------------- */
const STORE_KEY = "payflow_hub_state_v1";
let __memState = null;
function loadState() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) {}
  if (!s) s = __memState;
  s = s || {};
  ["journey", "deliv", "assign", "lab", "qa", "qachk", "recon", "pitch"].forEach(k => { if (!s[k]) s[k] = {}; });
  return s;
}
function saveState(s) { __memState = s; try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) {} }
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

/* ---------------- Charts (native SVG / CSS) ---------------- */
function svgDonut(data, size) {
  size = size || 120;
  const total = data.reduce((s, d) => s + Math.abs(d[1]), 0);
  const r = size / 2 - 10, cx = size / 2, cy = size / 2, C = 2 * Math.PI * r;
  let off = 0, circles = "";
  data.forEach((d, i) => {
    const dash = total ? (Math.abs(d[1]) / total) * C : 0;
    circles += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${CHART_COLORS[i % CHART_COLORS.length]}" stroke-width="16" stroke-dasharray="${dash} ${C - dash}" stroke-dashoffset="${-off}" transform="rotate(-90 ${cx} ${cy})"/>`;
    off += dash;
  });
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img">${circles}</svg>`;
}
function renderDonutBlock(chart) {
  const data = chart.data || [];
  const total = data.reduce((s, d) => s + d[1], 0);
  const legend = data.map((d, i) => `<div class="li"><span class="sw" style="background:${CHART_COLORS[i % CHART_COLORS.length]}"></span>${esc(d[0])}: ${Number(d[1]).toLocaleString("en-IN")} (${total ? ((d[1] / total) * 100).toFixed(1) : "0.0"}%)</div>`).join("");
  return `<div class="mock-chart"><div class="ct">${esc(chart.title)}</div><div class="donut-wrap">${svgDonut(data)}<div class="mock-legend">${legend}</div></div></div>`;
}
function renderBarBlock(chart, opts) {
  const data = chart.data || [];
  const max = Math.max(...data.map(d => Math.abs(d[1])), 0);
  const suffix = chart.suffix || "", prefix = chart.prefix || "";
  const base = opts && opts.base;
  const rows = data.map((d, i) => {
    const pct = max ? (Math.abs(d[1]) / max) * 100 : 0;
    const hiC = opts && opts.goodHigh ? "#16A34A" : "#DC2626", loC = opts && opts.goodHigh ? "#DC2626" : "#16A34A";
    const color = base !== undefined ? (d[1] > base * 1.15 ? hiC : d[1] < base * 0.85 ? loC : "#1677D2") : (d[1] < 0 ? "#DC2626" : CHART_COLORS[i % CHART_COLORS.length]);
    const extra = d[2] !== undefined ? ` <span style="color:var(--ink-muted);font-size:10.5px;">n=${d[2]}</span>` : "";
    return `<div class="bar-row"><div class="lab">${esc(d[0])}</div><div class="track"><div class="fill" style="width:${pct}%;background:${color}"></div></div><div class="val">${prefix}${Number(d[1]).toLocaleString("en-IN")}${suffix}${extra}</div></div>`;
  }).join("");
  return `<div class="mock-chart"><div class="ct">${esc(chart.title)}</div>${rows}</div>`;
}
function renderDashMock(d) {
  const kpis = d.kpis.map(k => `<div class="mock-kpi"><div class="v">${k.v}</div><div class="l">${esc(k.l)}</div></div>`).join("");
  const donuts = (d.donuts || []).map(c => renderDonutBlock(c)).join("");
  const bars = (d.bars || []).map(c => renderBarBlock(c)).join("");
  return `<div class="card dash-mock"><div class="mock-head"><h4>${esc(d.title)}</h4><p>${esc(d.sub)}</p></div><div class="mock-kpis">${kpis}</div><div class="mock-charts">${donuts}${bars}</div></div>`;
}

/* ============================================================
   Progress engine
   ============================================================ */
const TRACKS = [
  { id: "business", name: "Business Understanding" }, { id: "model", name: "Data Model & Quality" }, { id: "sql", name: "SQL" },
  { id: "kpi", name: "KPIs" }, { id: "excel", name: "Excel" }, { id: "tableau", name: "Tableau" }, { id: "powerbi", name: "Power BI" },
  { id: "qa", name: "QA" }, { id: "interview", name: "Interview" }, { id: "career", name: "Insights & Career" },
];
function trackScores() {
  const s = loadState();
  const sc = {}; TRACKS.forEach(t => sc[t.id] = [0, 0]);
  JOURNEY.forEach(j => { sc[j.track][1]++; if (s.journey[j.id]) sc[j.track][0]++; });
  DELIVERABLES.forEach(d => { sc[d.track][1]++; if (s.deliv[d.id]) sc[d.track][0]++; });
  assignments().forEach(a => { sc[a.track][1]++; if (s.assign[a.id] && s.assign[a.id].ok) sc[a.track][0]++; });
  const qaDone = QA.filter(q => s.qa[q.cat + "::" + q.q]).length;
  sc.interview[1] += 6; sc.interview[0] += 6 * (QA.length ? qaDone / QA.length : 0);
  sc.interview[1] += 1; if (s.pitch.practiced) sc.interview[0] += 1;
  const labDone = Object.keys(s.lab).length;
  sc.interview[1] += 3; sc.interview[0] += 3 * Math.min(1, labDone / LAB.length);
  const chk = QA_CHECKLIST.filter(c => s.qachk[c.id]).length;
  sc.qa[1] += 3; sc.qa[0] += 3 * (chk / QA_CHECKLIST.length);
  const out = TRACKS.map(t => ({ ...t, pct: sc[t.id][1] ? Math.round((sc[t.id][0] / sc[t.id][1]) * 100) : 0 }));
  const overall = Math.round(out.reduce((a, t) => a + t.pct, 0) / out.length);
  return { tracks: out, overall, qaDone, labDone };
}
function refreshProgress() {
  const { tracks, overall, qaDone } = trackScores();
  const fill = document.getElementById("sidebar-progress-fill"), cap = document.getElementById("sidebar-progress-caption");
  if (fill) fill.style.width = overall + "%";
  if (cap) cap.textContent = `${overall}% project complete · ${qaDone}/${QA.length} interview Qs`;
  const hp = document.getElementById("home-progress");
  if (hp) {
    const top = tracks.slice().sort((a, b) => b.pct - a.pct);
    hp.innerHTML = `<h4>Your Progress</h4><div class="big">${overall}%</div><div class="sub">overall project completion</div>
      <div class="track-list">${tracks.slice(0, 5).map(trackRow).join("")}</div>
      <button class="btn-outline" style="margin-top:14px;padding:8px 14px;" data-goto="progress">See full progress →</button>`;
    hp.querySelector("[data-goto]").addEventListener("click", () => switchView("progress"));
  }
  try { renderCertificate(); } catch (e) {}
  const po = document.getElementById("progress-overall");
  if (po) po.innerHTML = `<h4>Overall Progress</h4><div class="big">${overall}%</div><div class="sub">Average of the ten skill tracks below</div>`;
  const tl = document.getElementById("track-list");
  if (tl) tl.innerHTML = tracks.map(trackRow).join("");
  const todo = document.getElementById("progress-todo");
  if (todo) {
    const s = loadState();
    const openJ = JOURNEY.filter(j => !s.journey[j.id]);
    const openD = DELIVERABLES.filter(d => !s.deliv[d.id]);
    const openA = assignments().filter(a => !(s.assign[a.id] && s.assign[a.id].ok));
    const li = (arr, f) => arr.length ? arr.map(f).join("") : `<div style="padding:4px 0;">✓ All done</div>`;
    todo.innerHTML = `<h5 style="margin:0 0 6px;font-size:13px;color:var(--ink);">Journey steps (${openJ.length} open)</h5>${li(openJ.slice(0, 5), j => `<div style="padding:3px 0;">• <a href="#" data-go="${j.go}">${esc(j.t)}</a></div>`)}
      <h5 style="margin:14px 0 6px;font-size:13px;color:var(--ink);">Deliverables (${openD.length} open)</h5>${li(openD.slice(0, 6), d => `<div style="padding:3px 0;">• ${esc(d.t)}</div>`)}
      <h5 style="margin:14px 0 6px;font-size:13px;color:var(--ink);">Assignments (${openA.length} open)</h5>${li(openA.slice(0, 6), a => `<div style="padding:3px 0;">• ${esc(a.t)}</div>`)}`;
    todo.querySelectorAll("[data-go]").forEach(a => a.addEventListener("click", (e) => { e.preventDefault(); switchView(a.dataset.go); }));
  }
}
function trackRow(t) {
  return `<div class="track-row ${t.pct >= 100 ? "complete" : ""}"><div class="tl">${esc(t.name)}</div><div class="tb"><div class="tf" style="width:${t.pct}%"></div></div><div class="tv">${t.pct}%</div></div>`;
}

/* ============================================================
   Home
   ============================================================ */
function renderStats() {
  const wrap = document.getElementById("stat-strip");
  wrap.innerHTML = STATS.map(s => `<div class="stat"><div class="num">${s.num}</div><div class="lbl">${esc(s.lbl)}</div></div>`).join("");
}
function renderJourney() {
  const wrap = document.getElementById("journey"); const s = loadState();
  wrap.innerHTML = JOURNEY.map((j, i) => `
    ${i ? '<div class="journey-arrow">↓</div>' : ""}
    <div class="journey-step ${s.journey[j.id] ? "done" : ""}">
      <div class="jn">${String(i + 1).padStart(2, "0")}</div>
      <div><h4>${esc(j.t)}</h4><p>${esc(j.d)}</p></div>
      <div class="journey-actions">
        <button class="check-pill ${s.journey[j.id] ? "on" : ""}" data-j="${j.id}">${s.journey[j.id] ? "✓ Done" : "Mark done"}</button>
        <button class="start-btn" data-go="${j.go}">Start →</button>
      </div>
    </div>`).join("");
  wrap.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => switchView(b.dataset.go)));
  wrap.querySelectorAll("[data-j]").forEach(b => b.addEventListener("click", () => {
    const st = loadState(); st.journey[b.dataset.j] = !st.journey[b.dataset.j]; saveState(st); renderJourney(); refreshProgress();
  }));
}
function renderChecklist(containerId, items, bucket) {
  const wrap = document.getElementById(containerId); if (!wrap) return;
  const s = loadState();
  wrap.innerHTML = items.map(d => `
    <div class="deliv-item ${s[bucket][d.id] ? "on" : ""}" data-id="${d.id}" role="checkbox" aria-checked="${!!s[bucket][d.id]}" tabindex="0">
      <div class="box">${s[bucket][d.id] ? "✓" : ""}</div>
      <div><h4>${esc(d.t)}</h4><p>${esc(d.d)}</p>${d.where ? `<div class="where">→ ${esc(d.where)}</div>` : ""}</div>
    </div>`).join("");
  wrap.querySelectorAll(".deliv-item").forEach(it => {
    const toggle = () => { const st = loadState(); st[bucket][it.dataset.id] = !st[bucket][it.dataset.id]; saveState(st); renderChecklist(containerId, items, bucket); refreshProgress(); };
    it.addEventListener("click", toggle);
    it.addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); } });
  });
}
function renderBeforeAfter() {
  const html = `
    <div class="ba-col ba-before"><h4>❌ Before analytics</h4><ul>${BEFORE_AFTER.before.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>
    <div class="ba-mid">→</div>
    <div class="ba-col ba-after"><h4>✅ After analytics</h4><div class="ba-flow">${BEFORE_AFTER.after.map((x, i) => `${i ? '<div class="dn">↓</div>' : ""}<div class="node">${esc(x)}</div>`).join("")}</div></div>`;
  ["before-after", "before-after-2"].forEach(id => { const w = document.getElementById(id); if (w) w.innerHTML = html; });
}
function renderTools() {
  const wrap = document.getElementById("tool-grid");
  TOOLS.forEach((t, i) => {
    wrap.appendChild(el("div", "card tool-card", `<img class="tool-logo" src="${t.logo}" alt="${t.name} logo"><h4>${t.name}</h4><div class="role">${t.role}</div><p>${t.desc}</p>`));
    if (i < TOOLS.length - 1) wrap.appendChild(el("div", "tool-arrow", "→"));
  });
}
function renderDomainPrimer() {
  document.getElementById("domain-what").textContent = DOMAIN_WHAT;
  document.getElementById("domain-where").innerHTML = DOMAIN_WHERE.map(x => `<div style="padding:5px 0;">• ${esc(x)}</div>`).join("");
  document.getElementById("domain-data").innerHTML = DOMAIN_DATA_TYPES.map(x => `<span>${esc(x)}</span>`).join("");
}
function renderResourceCards(items, containerId) {
  const wrap = document.getElementById(containerId); if (!wrap) return;
  wrap.innerHTML = "";
  items.forEach(d => {
    const action = d.type === "download"
      ? `<a class="doc-download" href="${d.href}" download="${d.filename}" title="Download ${d.name}">⬇</a>`
      : `<a class="doc-download" href="${d.href}" target="_blank" rel="noopener" title="Open ${d.name}">↗</a>`;
    wrap.appendChild(el("div", "card doc-card", `<div class="doc-icon">${d.icon}</div><div class="doc-info"><h4>${esc(d.name)}</h4><p>${esc(d.desc)}</p></div>${action}`));
  });
}
function renderDocuments() {
  renderResourceCards(SOFTWARE_LINKS, "software-grid");
  renderResourceCards(DOCUMENTS, "doc-grid");
  renderResourceCards(DOCUMENTS, "doc-grid-2");
  const ss = document.getElementById("setup-steps");
  if (ss) ss.innerHTML = SETUP_STEPS.map((s, i) => `<div class="card setup-step"><div class="si">${s.i}</div><div class="sn">STEP ${i + 1}</div><h4>${esc(s.t)}</h4><p>${esc(s.d)}</p></div>`).join("");
}
function renderFlow() {
  document.getElementById("flow-grid").innerHTML = FLOW.map((f, i) => `<div class="flow-step"><div class="idx">${String(i + 1).padStart(2, "0")}</div><h4>${esc(f.t)}</h4><p>${esc(f.d)}</p></div>`).join("");
}
function renderTimeline() {
  document.getElementById("timeline").innerHTML = TIMELINE.map(r => `<div class="timeline-row"><div class="d">${r.d}</div><div class="t">${r.t}</div><div>${esc(r.task)}</div></div>`).join("");
}

/* ============================================================
   Business problem
   ============================================================ */
function renderProblem() {
  const pg = document.getElementById("problem-grid");
  pg.innerHTML = PROBLEM_STATEMENT.map(r => `<div class="card rule-card"><div class="head"><div class="icon-badge">${r.icon}</div><h4>${esc(r.h)}</h4></div><p>${esc(r.p)}</p></div>`).join("");
  const list = document.getElementById("bq-list");
  list.innerHTML = bq().map((b, i) => `
    <div class="bq-item ${i === 0 ? "open" : ""}">
      <div class="bq-head"><span class="bqn">Q${i + 1}</span><h4>${esc(b.q)}</h4><span class="chev">⌄</span></div>
      <div class="bq-body"><div class="chain">
        <div class="chain-step"><div class="cl">Question</div><p>${esc(b.q)}</p></div>
        <div class="chain-step"><div class="cl">Data</div><p>${esc(b.data)}</p></div>
        <div class="chain-step"><div class="cl">KPI</div><p>${esc(b.kpi)}</p></div>
        <div class="chain-step"><div class="cl">Analysis</div><p>${esc(b.analysis)}</p></div>
        <div class="chain-step"><div class="cl">Insight</div><p>${esc(b.insight)}</p></div>
        <div class="chain-step rec"><div class="cl">Recommendation</div><p>${esc(b.rec)}</p></div>
      </div></div>
    </div>`).join("");
  list.querySelectorAll(".bq-head").forEach(h => h.addEventListener("click", () => h.parentElement.classList.toggle("open")));
  document.getElementById("req-table").innerHTML = `<thead><tr><th>Req</th><th>Page / Area</th><th>Stakeholder</th><th>What it must answer</th><th>Priority</th></tr></thead>
    <tbody>${REQUIREMENTS.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody>`;
}
function renderRules() {
  document.getElementById("rule-grid").innerHTML = RULES.map(r => `<div class="card rule-card ${r.ok ? "ok" : ""}"><div class="head"><div class="icon-badge">${r.icon}</div><h4>${esc(r.h)}</h4></div><p>${esc(r.p)}</p></div>`).join("");
  document.getElementById("focus-grid").innerHTML = FOCUS_AREAS.map(f => `<div class="card tip-card"><h4 style="margin-top:0;">${esc(f.h)}</h4><p>${esc(f.p)}</p></div>`).join("");
}

/* ============================================================
   Data pages
   ============================================================ */
function renderDataset() {
  document.getElementById("coverage-text").textContent = COVERAGE_TEXT;
  const rows = {}; Object.keys(TABLE_SRC).forEach(t => rows[t] = (MKT.rows || {})[TABLE_SRC[t]]);
  document.getElementById("ds-grid").innerHTML = Object.keys(TABLE_TYPES).map(t => {
    const ty = TABLE_TYPES[t]; const cls = ty === "Dimension" ? "dim" : "fact";
    const pu = TABLE_PURPOSE[t] || ["", ""];
    return `<div class="card ds-card ${cls}"><div class="k">${esc(ty)}</div><h4>${t}</h4><div class="rows">${Number(rows[t] || 0).toLocaleString("en-IN")} rows</div>
      <dl class="ds-meta"><dt>Grain</dt><dd>${esc(TABLE_GRAIN[t])}</dd><dt>PK</dt><dd><code>${TABLE_PK[t]}</code></dd><dt>FK</dt><dd>${esc(TABLE_FK[t] || "—")}</dd><dt>Date</dt><dd>${esc(TABLE_DATE[t] || "—")}</dd><dt>Purpose</dt><dd>${esc(pu[0])}</dd></dl>
      <details class="ds-why"><summary>Why does this table exist?</summary><p>${esc(pu[1])}</p></details></div>`;
  }).join("");
  document.getElementById("story-table").innerHTML = `<thead><tr><th>When</th><th>Event</th><th>What happened</th><th>Where you'll see it</th></tr></thead>
    <tbody>${STORY.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody>`;
}
function renderModel() {
  const rows = {}; Object.keys(TABLE_SRC).forEach(t => rows[t] = (MKT.rows || {})[TABLE_SRC[t]]);
  document.getElementById("schema-grid").innerHTML = Object.keys(TABLE_TYPES).map(t => {
    const ty = TABLE_TYPES[t]; const isFact = ty.startsWith("Fact");
    return `<div class="table-node ${isFact ? "fact" : ""} ${t === "fact_payment" ? "center" : ""}"><div class="hd"><span>${t}</span><span>${Number(rows[t] || 0).toLocaleString("en-IN")}</span></div>
      <div class="bd"><div><span class="pk">${TABLE_PK[t]}</span> · PK</div><div>FK: ${TABLE_FK[t] || "—"}</div><div style="margin-top:4px;opacity:.85;">${ty}</div></div></div>`;
  }).join("");
  const rel = document.getElementById("rel-list");
  rel.innerHTML = `<h4 style="font-size:15px;margin-bottom:6px;">Relationships</h4>` + RELATIONSHIPS.map(r => `<div class="r"><span class="card-arrow">↳</span><span>${esc(r)}</span></div>`).join("");
  document.getElementById("load-order").innerHTML = LOAD_ORDER.map(x => `<div style="padding:5px 0;">${esc(x)}</div>`).join("");
  document.getElementById("calc-fields").innerHTML = CALC_FIELDS.map(x => `<div style="padding:5px 0;">• ${esc(x)}</div>`).join("");
  document.getElementById("gotchas-list").innerHTML = GOTCHAS.map(g => `<div class="gotcha-card"><div class="gotcha-title">⚠️ ${esc(g.t)}</div><div class="gotcha-desc">${esc(g.d)}</div></div>`).join("");
  document.getElementById("global-filters").innerHTML = GLOBAL_FILTERS.map(([n, src]) =>
    `<div style="display:flex;justify-content:space-between;gap:16px;padding:7px 0;border-top:1px solid var(--line-soft);"><span style="font-weight:600;color:var(--ink);">${esc(n)}</span><span style="font-family:var(--mono);font-size:12px;">${esc(src)}</span></div>`).join("");
  document.getElementById("join-guide-table").innerHTML = `<thead><tr><th>Type</th><th>Table</th><th>Primary Key</th><th>Foreign Keys</th><th>Grain</th><th>Rows</th></tr></thead>
    <tbody>${Object.keys(TABLE_TYPES).map(t => `<tr><td>${esc(TABLE_TYPES[t])}</td><td><code>${t}</code></td><td>${TABLE_PK[t]}</td><td>${TABLE_FK[t] || "—"}</td><td>${esc(TABLE_GRAIN[t])}</td><td class="num">${Number(rows[t] || 0).toLocaleString("en-IN")}</td></tr>`).join("")}</tbody>`;
  document.getElementById("dash-table").innerHTML = `<thead><tr><th>#</th><th>Page</th><th>Audience</th><th>Primary KPIs</th><th>Key visuals</th></tr></thead>
    <tbody>${DASHBOARDS.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody>`;
  const jp = document.getElementById("join-paths-table");
  if (jp) jp.innerHTML = `<thead><tr><th>Analysis</th><th>Join condition</th></tr></thead><tbody>${M_JOIN_PATHS.map(([a, b]) => `<tr><td>${esc(a)}</td><td><code>${esc(b)}</code></td></tr>`).join("")}</tbody>`;
  const img = document.getElementById("model-img");
  if (img) img.addEventListener("click", () => openModal(`<img class="zoom-img" src="${img.src}" alt="${esc(img.alt)}">`));
}
let ddKind = "All";
function renderDataDictionary(filterText) {
  const wrap = document.getElementById("datadict-tables"); if (!wrap) return;
  const q = (filterText !== undefined ? filterText : (document.getElementById("dd-search") || {}).value || "").trim().toLowerCase();
  const pills = document.getElementById("dd-pills");
  if (pills && !pills.children.length) {
    ["All", "Fact", "Dimension"].forEach(k => {
      const b = el("button", "pill" + (k === ddKind ? " active" : ""), k);
      b.dataset.k = k;
      b.addEventListener("click", () => { ddKind = k; pills.querySelectorAll(".pill").forEach(p => p.classList.toggle("active", p.dataset.k === k)); renderDataDictionary(); });
      pills.appendChild(b);
    });
  }
  wrap.innerHTML = "";
  M_DATA_DICTIONARY.forEach(t => {
    const kind = (TABLE_TYPES[t.table] || "Dimension").startsWith("Fact") ? "Fact" : "Dimension";
    if (ddKind !== "All" && kind !== ddKind) return;
    const rows = t.cols.filter(c => !q || (t.table + " " + c.join(" ")).toLowerCase().includes(q));
    if (!rows.length) return;
    const card = el("div", "card dd-table-card table-scroll");
    card.innerHTML = `<div class="hd"><h4>${t.table}</h4><span class="tag p2">${esc(t.rows)}</span></div>
      <p class="dd-meta"><strong>Grain:</strong> ${esc(t.grain || "")} · <strong>Purpose:</strong> ${esc(t.purpose || "")}</p>
      <table class="dtable"><thead><tr><th>Column</th><th>Type</th><th>Key</th><th>Null?</th><th>Business definition</th><th>Example</th><th>Validation rule</th></tr></thead>
      <tbody>${rows.map(([c, ty, key, nul, d, ex, dq]) => `<tr><td><code>${esc(c)}</code></td><td><span class="col-type">${ty}</span></td><td>${esc(key || "")}</td><td>${nul === "Y" ? "Yes" : "No"}</td><td>${esc(d)}</td><td><code>${esc(ex)}</code></td><td>${esc(dq || "")}</td></tr>`).join("")}</tbody></table>`;
    wrap.appendChild(card);
  });
  if (!wrap.children.length) wrap.appendChild(el("div", "empty-state", "No columns match that search."));
}
function renderQuality() {
  document.getElementById("null-notes").innerHTML = NULL_NOTES.map(x => `<div style="padding:6px 0;border-top:1px solid var(--line-soft);">• ${esc(x)}</div>`).join("");
  document.getElementById("dq-table").innerHTML = `<thead><tr><th>Check</th><th>Rule</th><th>Tables</th><th>Severity</th></tr></thead>
    <tbody>${DQ_RULES.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody>`;
}

/* ============================================================
   KPI Library
   ============================================================ */
let kpiActiveCat = "All", kpiSearch = "", kpiStarredOnly = false, kpiTier = "All";
function renderKpiTiers() {
  ["P1", "P2", "P3"].forEach(p => { const e = document.getElementById("kr-" + p.toLowerCase()); if (e) e.textContent = KPIS.filter(k => k.prio === p).length + " KPIs"; });
  const w = document.getElementById("kpi-tier-pills"); if (!w) return; w.innerHTML = "";
  [["All", "All tiers"], ["P1", "P1 · Must know"], ["P2", "P2 · Important"], ["P3", "P3 · Advanced"]].forEach(([v, l]) => {
    const b = el("button", "pill" + (v === kpiTier ? " active" : ""), l); b.addEventListener("click", () => { kpiTier = v; renderKpiTiers(); renderKpiGrid(); }); w.appendChild(b);
  });
}
function renderKpiPills() {
  const wrap = document.getElementById("kpi-pills"); wrap.innerHTML = "";
  KPI_CATS.forEach(c => {
    const n = c === "All" ? KPIS.length : KPIS.filter(k => k.cat === c).length;
    const b = el("button", "pill" + (c === kpiActiveCat ? " active" : ""), `${c} (${n})`);
    b.addEventListener("click", () => { kpiActiveCat = c; renderKpiPills(); renderKpiGrid(); });
    wrap.appendChild(b);
  });
}
function renderKpiGrid() {
  const wrap = document.getElementById("kpi-grid"); wrap.innerHTML = "";
  const q = kpiSearch.trim().toLowerCase(); const bm = getBookmarks();
  const list = KPIS.filter(k => (kpiTier === "All" || k.prio === kpiTier) && (kpiActiveCat === "All" || k.cat === kpiActiveCat) && (!q || (k.name + k.q + k.desc + k.formula + k.table + k.dax).toLowerCase().includes(q)) && (!kpiStarredOnly || bm.kpi[k.name]));
  if (!list.length) { wrap.appendChild(el("div", "empty-state", kpiStarredOnly ? "No starred KPIs yet. Tap the ★ on any card to save it here." : "No KPIs match that search.")); return; }
  list.forEach(k => {
    const starred = !!bm.kpi[k.name];
    const c = el("div", "card kpi-card"); c.id = "kpi-" + slugify(k.name);
    c.innerHTML = `
      <div class="top"><h4>${esc(k.name)}</h4>
        <div class="card-top-actions"><span class="tag ${k.prio === "P1" ? "p1" : "p2"} tier-${k.prio}">${k.prio}</span>
          <button class="link-btn" title="Copy link to this KPI" data-link-kpi="${esc(k.name)}">🔗</button>
          <button class="star-btn ${starred ? "starred" : ""}" title="Star this KPI" data-star-kpi="${esc(k.name)}">${starred ? "★" : "☆"}</button></div></div>
      <p class="kpi-q">${esc(k.q)}</p>
      <p class="kpi-logic">${esc(k.desc)}</p>
      <div class="kpi-plain">${esc(k.plain)}</div>
      <div class="formula">${esc(k.formula)}</div>
      ${k.dax ? `<details class="kpi-sql"><summary>SQL (MySQL)</summary><pre class="formula dax">${esc(k.dax)}</pre></details>` : ""}
      <div class="kpi-ans"><span>Answer key: ${esc(k.v25)}</span>${k.wrong ? `<span class="bm">⚠ Wrong: ${esc(k.wrong)}</span>` : ""}</div>
      <div class="meta"><span>${esc(k.table)}</span><span>${esc(k.cat)} · ${esc(k.dir)}</span></div>`;
    wrap.appendChild(c);
  });
  wrap.querySelectorAll("[data-star-kpi]").forEach(b => b.addEventListener("click", () => { toggleBookmark("kpi", b.dataset.starKpi); renderKpiGrid(); }));
  wrap.querySelectorAll("[data-link-kpi]").forEach(b => b.addEventListener("click", () => copyDeepLink("kpi", b.dataset.linkKpi)));
}

/* ============================================================
   SQL, Excel, Analysis
   ============================================================ */
let sqlCat = "All", sqlPractice = false;
function sqlHint(sql) {
  const kw = (sql.match(/\b(SELECT|JOIN|LEFT JOIN|WHERE|GROUP BY|HAVING|ORDER BY|WITH|CASE|SUM|COUNT|AVG|DATEDIFF|ROW_NUMBER|RANK|COALESCE|COUNT_IF|IFF|TRY_TO_NUMBER|TO_DATE|COPY INTO|CREATE TABLE|CREATE OR REPLACE VIEW|UNION ALL)\b/gi) || []).map(x => x.toUpperCase());
  const tables = sql.match(/\b(fact_\w+|dim_\w+|vw_\w+)\b/g) || [];
  return `Tables: ${[...new Set(tables)].join(", ") || "—"} · Key SQL: ${[...new Set(kw)].slice(0, 8).join(", ")}`;
}
function sqlBlockHtml(b, idx, prefix) {
  const exp = (b.sql.match(/--\s*[^\n]*\d[^\n]*/g) || []).slice(0, 3).map(x => x.replace(/^--\s*/, "")).join(" · ");
  if (prefix === "s" && sqlPractice) {
    return `<div class="card sql-block practice"><div class="hd"><div><h4>${esc(b.title)}</h4><p><strong>Your task:</strong> ${esc(b.desc)}</p></div></div>
      ${exp ? `<div class="sql-expect">🎯 Expected result: ${esc(exp)}</div>` : ""}
      <div class="sql-steps"><button class="btn-outline" data-hint="${idx}">💡 Show hint</button><button class="btn-blue" data-reveal="${idx}">🔓 Reveal solution</button></div>
      <div class="hint-text" id="sqlh-${idx}" style="display:none;">${esc(sqlHint(b.sql))}</div>
      <pre id="sqls-${idx}" style="display:none;">${esc(b.sql)}</pre></div>`;
  }
  const lv = b.level || ({ Setup: "Easy", KPI: "Easy", Web: "Medium", Breakdown: "Medium", Social: "Medium", WhatsApp: "Medium" }[b.cat] || "Advanced");
  return `<div class="card sql-block"><div class="hd"><div><h4><span class="lvl lvl-${lv.toLowerCase()}">${lv}</span> ${esc(b.title)}</h4><p>${esc(b.desc)}</p></div><button class="copy-btn" data-copy="${prefix}${idx}">Copy</button></div><pre>${esc(b.sql)}</pre></div>`;
}
function renderSql() {
  const pills = document.getElementById("sql-pills");
  const cats = ["All", ...new Set(SQL_BLOCKS.map(b => b.cat))];
  pills.innerHTML = "";
  cats.forEach(c => { const b = el("button", "pill" + (c === sqlCat ? " active" : ""), c); b.addEventListener("click", () => { sqlCat = c; renderSql(); }); pills.appendChild(b); });
  const wrap = document.getElementById("sql-list");
  wrap.innerHTML = SQL_BLOCKS.map((b, i) => (sqlCat === "All" || b.cat === sqlCat) ? sqlBlockHtml(b, i, "s") : "").join("");
  wrap.querySelectorAll("[data-copy]").forEach(btn => btn.addEventListener("click", () => copyText(SQL_BLOCKS[+btn.dataset.copy.slice(1)].sql, btn, "Copy")));
  wrap.querySelectorAll("[data-hint]").forEach(b => b.addEventListener("click", () => { const x = document.getElementById("sqlh-" + b.dataset.hint); x.style.display = x.style.display === "none" ? "block" : "none"; }));
  wrap.querySelectorAll("[data-reveal]").forEach(b => b.addEventListener("click", () => { document.getElementById("sqls-" + b.dataset.reveal).style.display = "block"; b.remove(); }));
  const t = document.getElementById("sql-practice-toggle");
  if (t && !t._bound) { t._bound = true; t.addEventListener("click", () => { sqlPractice = !sqlPractice; t.textContent = sqlPractice ? "Turn practice mode OFF" : "Turn practice mode ON"; renderSql(); }); }
}
function renderExcel() {
  document.getElementById("excel-table").innerHTML = `<thead><tr><th>Calculation</th><th>Excel formula pattern</th><th>Expected result</th><th>Status</th></tr></thead>
    <tbody>${EXCEL_TASKS.map(r => `<tr><td>${esc(r[0])}</td><td><code>${esc(r[1])}</code></td><td>${esc(r[2])}</td><td>${esc(r[3])}</td></tr>`).join("")}</tbody>`;
  document.getElementById("pivot-grid").innerHTML = PIVOTS.map(t => `<div class="card tip-card"><div class="n">${t.n}</div><h4>${esc(t.h)}</h4><p>${esc(t.p)}</p></div>`).join("");
}
function renderAnalysis() {
  document.getElementById("vol-base").textContent = `${usdM(K.tpv)} TPV · ${K.take_rate}% take rate · ${K.cf_rate_value}% confirmed fraud`;
  const card = (t, sub, data, suffix, opts) => `<div class="card chart-card"><h4>${esc(t)}</h4><div class="cs">${esc(sub)}</div>${renderBarBlock({ title: "", data: data || [], suffix: suffix || "" }, opts)}</div>`;
  const xb = (MD.xborder || []).map(r => [r[0], r[3]]);
  document.getElementById("driver-grid").innerHTML =
      card("TPV by month ($K)", `Peak in October (Indian festive season + Diwali); ${K.mom_tpv}% MoM in December`, MD.month_tpv_k)
    + card("Processing revenue by month ($K)", `December revenue +${K.mom_rev}% vs TPV +${K.mom_tpv}%: mix moved to card / cross-border`, MD.month_rev_k)
    + card("TPV by industry ($M)", `E-commerce leads; Travel has the biggest tickets`, MD.ind_tpv_m)
    + card("Take rate by industry (%)", "UPI-heavy industries earn least per dollar", MD.ind_take, "%")
    + card("Success rate by payment method (%)", "Wallets succeed most, BNPL least", MD.method_sr, "%")
    + card("Top failure reasons (attempts)", "Abandonment and insufficient funds dominate; blocks are risk rules", MD.fail_reasons)
    + card("Top 10 merchants by TPV ($K)", `${K.top10_share}% of all TPV`, MD.top_tpv_k)
    + card("Month-over-month merchant retention (%)", `Q1 → Q4 cohort retention ${K.retention_rate}%`, MD.retention_month, "%")
    + card("Confirmed fraud value rate by method (%)", "Rate = fraud ÷ TPV of the same method", MD.fraud_method_rate, "%")
    + card("Confirmed fraud value rate by industry (%)", "Gaming and Travel carry the most risk", MD.fraud_ind_rate, "%")
    + card("Confirmed fraud value rate by amount band (%)", "Fraud concentrates in $200+ tickets", MD.fraud_band_rate, "%")
    + card("Cross-border vs domestic fraud rate (%)", `Cross-border is only ${K.xborder_share}% of TPV`, xb, "%")
    + card("Confirmed fraud value rate by month (%)", "December looks low because cases have not matured yet", MD.fraud_month_rate, "%")
    + card("Disputes opened by month", `${SN.travel_disputes}'s summer flight cancellations show in Jul–Aug`, MD.dispute_month)
    + card("Payment attempts by local hour", "Note the 01:00–04:00 spike: subscription renewals run as a batch", MD.hour_att)
    + card("Payout status (settlements)", `${K.settle_exceptions} exceptions · ${usdK(K.outstanding_payout_usd)} outstanding`, MD.settle_status);
  document.getElementById("insights-grid").innerHTML = bq().map((k, i) => `
    <div class="card insight-card tint-${i % 6}"><div class="insight-label">Insight</div><p class="insight-text">${esc(k.insight)}</p>
    <div class="insight-label rec">Recommendation</div><p class="insight-text">${esc(k.rec)}</p></div>`).join("");
}

/* ============================================================
   Dashboard gallery + modal
   ============================================================ */
function openModal(html) {
  document.getElementById("modal-body").innerHTML = html;
  document.getElementById("modal-overlay").classList.add("open");
}
function closeModal() { document.getElementById("modal-overlay").classList.remove("open"); }
function initModal() {
  const ov = document.getElementById("modal-overlay");
  document.getElementById("modal-close").addEventListener("click", closeModal);
  ov.addEventListener("click", (e) => { if (e.target === ov) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
}
function renderGallery() {
  const pages = galleryPages();
  document.getElementById("gallery-grid").innerHTML = pages.map((p, i) => `
    <div class="card gallery-card">
      <div class="gtop"><div class="gnum">${p.n}</div><h4>${esc(p.t)}</h4><div class="gk">${p.keys.map(k => `<span>${esc(k)}</span>`).join("")}</div></div>
      <div class="gbody"><div class="gq">❓ ${esc(p.q)}</div><p>${esc(p.desc)}</p><div class="gins">💡 ${esc(p.ins)}</div><div class="gaud">Audience: ${esc(p.aud)}</div><button class="btn-blue" data-dash="${i}">View Dashboard →</button></div>
    </div>`).join("");
  document.querySelectorAll("[data-dash]").forEach(b => b.addEventListener("click", () => {
    const p = pages[+b.dataset.dash];
    openModal(`<div class="flow-strip"><div><span>Business question</span>${esc(p.q)}</div><div><span>KPIs</span>${esc(p.keys.join(" · "))}</div><div><span>Key insight</span>${esc(p.ins)}</div><div><span>Interview question</span>${esc(p.iq)}</div></div>` + renderDashMock(p.mock) + `<div class="build-notes">
      <div class="card"><h5>📈 Build it in Tableau</h5><ul>${p.build.tableau.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>
      <div class="card"><h5>⚡ Build it in Power BI</h5><ul>${p.build.powerbi.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div></div>`);
  }));
}

/* ============================================================
   QA page
   ============================================================ */
const RECON_KPIS = ["Total Payment Volume (TPV)", "Processing Revenue", "Total Payment Attempts", "Unique Payment Intents", "Payment Success Rate", "Payment Failure Rate", "Active Merchants", "Merchant Activation Rate", "Merchant Retention Rate", "Top 10 Merchant Contribution to TPV", "Refund Rate", "Confirmed Fraud Transaction Count", "Confirmed Fraud Amount", "Confirmed Fraud Value Rate", "Suspected-Risk Transaction Count", "Chargeback Amount", "Dispute Ratio", "Net Confirmed Fraud Loss"];
function renderQA() {
  const wrap = document.getElementById("qa-sql-list");
  wrap.innerHTML = QA_SQL.map((b, i) => sqlBlockHtml(b, i, "q")).join("");
  wrap.querySelectorAll("[data-copy]").forEach(btn => btn.addEventListener("click", () => copyText(QA_SQL[+btn.dataset.copy.slice(1)].sql, btn, "Copy")));
  const s = loadState();
  const rows = RECON_KPIS.map(n => KPIS.find(k => k.name === n)).filter(Boolean);
  const t = document.getElementById("recon-table");
  t.innerHTML = `<thead><tr><th>KPI (answer key)</th><th>SQL / answer key</th><th>Your Tableau value</th><th>Your Power BI value</th><th>Status</th></tr></thead>
    <tbody>${rows.map(k => {
      const r = s.recon[k.id] || {};
      return `<tr data-id="${k.id}" data-ans="${esc(k.v25)}"><td>${esc(k.name)}</td><td class="num">${esc(k.v25)}</td>
        <td><input class="search-input" style="max-width:130px;padding:6px 10px;" data-f="tab" value="${esc(r.tab || "")}"></td>
        <td><input class="search-input" style="max-width:130px;padding:6px 10px;" data-f="pbi" value="${esc(r.pbi || "")}"></td>
        <td class="st"></td></tr>`;
    }).join("")}</tbody>`;
  const evalRow = (tr) => {
    const ansM = String(tr.dataset.ans).replace(/,/g, "").match(/-?\d+(\.\d+)?/); const ans = ansM ? parseFloat(ansM[0]) : NaN;
    const vals = [...tr.querySelectorAll("input")].map(i => i.value.trim());
    const ok = vals.map(v => v !== "" && Math.abs(parseFloat(v.replace(/[^0-9.\-]/g, "")) - ans) <= Math.max(0.011, Math.abs(ans) * 0.001));
    const st = tr.querySelector(".st");
    if (vals.every(v => v === "")) st.textContent = "";
    else if (ok.every(Boolean)) st.innerHTML = `<span class="recon-ok">✓ Ties out</span>`;
    else st.innerHTML = `<span style="color:var(--red);font-weight:700;">✗ Investigate</span>`;
  };
  t.querySelectorAll("tbody tr").forEach(tr => {
    evalRow(tr);
    tr.querySelectorAll("input").forEach(inp => inp.addEventListener("input", () => {
      const st = loadState(); st.recon[tr.dataset.id] = st.recon[tr.dataset.id] || {}; st.recon[tr.dataset.id][inp.dataset.f] = inp.value; saveState(st); evalRow(tr);
    }));
  });
  renderChecklist("qa-checklist", QA_CHECKLIST, "qachk");
}

/* ============================================================
   Assignments
   ============================================================ */
function renderAssignments() {
  const list = assignments(); const s = loadState();
  const done = list.filter(a => s.assign[a.id] && s.assign[a.id].ok).length;
  document.getElementById("assign-score").textContent = `${done} / ${list.length} assignments solved`;
  const wrap = document.getElementById("assign-list");
  wrap.innerHTML = list.map((a, i) => {
    const st = s.assign[a.id] || {};
    const input = a.type === "select"
      ? `<select data-in="${a.id}"><option value="">Choose…</option>${a.options.map(o => `<option ${st.last === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`
      : `<input type="text" inputmode="decimal" data-in="${a.id}" placeholder="Your answer${a.unit ? " (" + a.unit + ")" : ""}" value="${esc(st.last || "")}">`;
    return `<div class="card assign-card" id="as-${a.id}">
      <div class="assign-head"><span class="an">Assignment ${String(i + 1).padStart(2, "0")}</span><div><h4>${esc(a.t)}</h4><div class="tool">${esc(a.tool)}</div></div>
        <span class="status ${st.ok ? "ok" : ""}">${st.ok ? "✓ Solved" : st.tries ? `${st.tries} attempt${st.tries > 1 ? "s" : ""}` : "Not started"}</span></div>
      <div class="assign-steps"><button data-tab="task" class="active">1 · View Task</button><button data-tab="check">2 · Check Answer</button><button data-tab="sol">3 · Solution</button></div>
      <div class="assign-panel show" data-p="task"><strong>What to do</strong><ul>${a.task.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>
      <div class="assign-panel" data-p="check"><div class="answer-row">${input}<button class="btn-blue" data-check="${a.id}">Check</button><button class="btn-outline" data-hint="${a.id}">Hint</button></div>
        <div class="answer-feedback ${st.ok ? "good" : ""}">${st.ok ? "✓ Correct, and it matches the dataset." : ""}</div><div class="hint-text" style="display:none;">💡 ${esc(a.hint)}</div></div>
      <div class="assign-panel" data-p="sol">${st.tries ? `<pre>${esc(a.sol)}</pre>` : `<div class="hint-text">🔒 Make at least one attempt in <strong>Check Answer</strong> to unlock the solution.</div>`}</div>
    </div>`;
  }).join("");
  wrap.querySelectorAll(".assign-card").forEach(card => {
    card.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => {
      card.querySelectorAll("[data-tab]").forEach(x => x.classList.toggle("active", x === b));
      card.querySelectorAll("[data-p]").forEach(p => p.classList.toggle("show", p.dataset.p === b.dataset.tab));
    }));
  });
  wrap.querySelectorAll("[data-hint]").forEach(b => b.addEventListener("click", () => { const h = b.closest(".assign-panel").querySelector(".hint-text"); h.style.display = h.style.display === "none" ? "block" : "none"; }));
  wrap.querySelectorAll("[data-check]").forEach(b => b.addEventListener("click", () => {
    const a = list.find(x => x.id === b.dataset.check);
    const inp = wrap.querySelector(`[data-in="${a.id}"]`); const raw = inp.value.trim();
    if (!raw) return;
    let ok;
    if (a.type === "select") ok = raw === a.ans;
    else { const v = parseFloat(raw.replace(/[₹,%\s]/g, "")); ok = !isNaN(v) && Math.abs(v - a.ans) <= (a.tol || 0) + 1e-9; }
    const st = loadState(); const cur = st.assign[a.id] || { tries: 0 };
    cur.tries = (cur.tries || 0) + 1; cur.last = raw; if (ok) cur.ok = true; st.assign[a.id] = cur; saveState(st);
    renderAssignments(); refreshProgress();
    const card = document.getElementById("as-" + a.id);
    card.querySelectorAll("[data-tab]").forEach(x => x.classList.toggle("active", x.dataset.tab === "check"));
    card.querySelectorAll("[data-p]").forEach(p => p.classList.toggle("show", p.dataset.p === "check"));
    const fb = card.querySelector(".answer-feedback");
    fb.className = "answer-feedback " + (ok ? "good" : "bad");
    fb.textContent = ok ? "✓ Correct, and it matches the dataset." : "✗ Not quite. Re-check your filters (dates, status, denominator), use the hint, or open the solution.";
  }));
}

/* ============================================================
   Analyst Thinking Lab
   ============================================================ */
function renderLab() {
  const s = loadState();
  const answered = Object.keys(s.lab).length;
  const best = Object.entries(s.lab).filter(([i, c]) => LAB[+i] && LAB[+i].opts[c] && LAB[+i].opts[c][1] === "best").length;
  document.getElementById("lab-score").textContent = `${answered} / ${LAB.length} scenarios answered · ${best} best-first-move picks`;
  const wrap = document.getElementById("lab-list");
  wrap.innerHTML = LAB.map((l, i) => {
    const pick = s.lab[i];
    return `<div class="card lab-card"><div class="lab-n">Scenario ${String(i + 1).padStart(2, "0")}</div><h4>${esc(l.t)}</h4><p class="scn">${esc(l.scn)}</p>
      <div class="lab-opts">${l.opts.map((o, j) => `<button class="lab-opt ${pick !== undefined ? o[1] : ""}" data-l="${i}" data-o="${j}">${"ABCD"[j]}. ${esc(o[0])}${pick !== undefined ? (o[1] === "best" ? " ✓ best first move" : o[1] === "ok" ? " · reasonable, not first" : "") : ""}${pick === j ? " ← your pick" : ""}</button>`).join("")}</div>
      <div class="lab-explain ${pick !== undefined ? "show" : ""}"><strong>What an analyst checks first:</strong><ol>${l.exp.map(x => `<li>${esc(x)}</li>`).join("")}</ol></div></div>`;
  }).join("");
  wrap.querySelectorAll("[data-l]").forEach(b => b.addEventListener("click", () => {
    const st = loadState(); st.lab[b.dataset.l] = +b.dataset.o; saveState(st); renderLab(); refreshProgress();
  }));
}

/* ============================================================
   Interview Q&A
   ============================================================ */
let qaActiveCat = "Explain This Project", qaSearch = "", qaStarredOnly = false;
function renderQaTabs() {
  const wrap = document.getElementById("qa-tabs"); wrap.innerHTML = "";
  QA_CATS.forEach(c => {
    const b = el("button", c === qaActiveCat ? "active" : "", `${c} (${QA.filter(q => q.cat === c).length})`);
    b.addEventListener("click", () => { qaActiveCat = c; renderQaTabs(); renderQaList(); });
    wrap.appendChild(b);
  });
}
function renderQaList() {
  const wrap = document.getElementById("qa-list"); wrap.innerHTML = "";
  const st = loadState(); const bm = getBookmarks(); const q = qaSearch.trim().toLowerCase();
  const list = QA.filter(it => (q ? true : it.cat === qaActiveCat) && (!q || (it.q + it.a).toLowerCase().includes(q)) && (!qaStarredOnly || bm.qa[it.q]));
  updateQaProgressBar();
  if (!list.length) { wrap.appendChild(el("div", "empty-state", qaStarredOnly ? "No starred questions yet. Tap the ★ on any question to save it here." : "No questions match that search.")); return; }
  list.forEach(item => {
    const id = item.cat + "::" + item.q; const done = !!st.qa[id]; const starred = !!bm.qa[item.q]; const isLong = item.a.length > 480;
    const card = el("div", "qa-item" + (done ? " reviewed" : "")); card.id = "qa-" + slugify(item.q);
    card.innerHTML = `
      <div class="qa-q"><span class="num">${esc(item.cat)}</span><span class="qtext">${esc(item.q)}</span>
        <button class="link-btn" title="Copy link to this question">🔗</button>
        <button class="star-btn ${starred ? "starred" : ""}" title="Star this question">${starred ? "★" : "☆"}</button><span class="chev">⌄</span></div>
      <div class="qa-a"><div class="qa-a-inner">
        <div class="answer-text ${isLong ? "clamped" : ""}"><p>${item.a}</p></div>
        ${isLong ? '<button type="button" class="show-full-btn">Show full answer ▾</button>' : ""}
        <div class="signal">Interviewer signal: ${esc(item.signal)}</div>
        ${item.src ? `<div class="q-src">📚 Source: <a href="${item.src[1]}" target="_blank" rel="noopener">${esc(item.src[0])} ↗</a></div>` : ""}
        <button class="mark-btn ${done ? "done" : ""}">${done ? "✓ Reviewed" : "Mark as reviewed"}</button></div></div>`;
    const aDiv = card.querySelector(".qa-a");
    card.querySelector(".qa-q").addEventListener("click", (ev) => {
      if (ev.target.closest(".star-btn") || ev.target.closest(".link-btn")) return;
      const open = card.classList.toggle("open"); aDiv.style.maxHeight = open ? aDiv.scrollHeight + "px" : "0px";
    });
    const sf = card.querySelector(".show-full-btn");
    if (sf) sf.addEventListener("click", (ev) => { ev.stopPropagation(); const t = card.querySelector(".answer-text"); const c = t.classList.toggle("clamped"); sf.textContent = c ? "Show full answer ▾" : "Show less ▴"; if (card.classList.contains("open")) aDiv.style.maxHeight = aDiv.scrollHeight + "px"; });
    const mb = card.querySelector(".mark-btn");
    mb.addEventListener("click", (ev) => { ev.stopPropagation(); const s2 = loadState(); s2.qa[id] = !s2.qa[id]; saveState(s2); mb.classList.toggle("done", s2.qa[id]); mb.textContent = s2.qa[id] ? "✓ Reviewed" : "Mark as reviewed"; card.classList.toggle("reviewed", !!s2.qa[id]); updateQaProgressBar(); refreshProgress(); });
    card.querySelector(".star-btn").addEventListener("click", (ev) => { ev.stopPropagation(); toggleBookmark("qa", item.q); renderQaList(); });
    card.querySelector(".link-btn").addEventListener("click", (ev) => { ev.stopPropagation(); copyDeepLink("qa", item.q); });
    wrap.appendChild(card);
  });
}
function updateQaProgressBar() {
  const st = loadState(); const done = QA.filter(it => st.qa[it.cat + "::" + it.q]).length; const pct = QA.length ? Math.round(done / QA.length * 100) : 0;
  const t = document.getElementById("progress-text"), b = document.getElementById("progress-bar");
  if (t) t.textContent = `${done} / ${QA.length} reviewed`; if (b) b.style.width = pct + "%";
}

/* ============================================================
   Pitch, career, glossary, tips, learn
   ============================================================ */
let pitchTimer = null, pitchLeft = 90;
function renderPitch() {
  document.getElementById("pitch-flow").innerHTML = PITCH_FLOW.map((p, i) => `<div class="pitch-step"><div class="ps-n">${String(i + 1).padStart(2, "0")} ${i < PITCH_FLOW.length - 1 ? "→" : ""}</div><h4>${esc(p.t)}</h4><p>${esc(p.d)}</p><div class="sec">${p.s}</div></div>`).join("");
  document.getElementById("elevator-pitch").textContent = ELEVATOR_PITCH;
  document.getElementById("copy-pitch-btn").addEventListener("click", (e) => copyText(ELEVATOR_PITCH, e.currentTarget, "📋 Copy pitch"));
  document.getElementById("project-faq").innerHTML = PROJECT_FAQ.map(f => `<div class="faq-item"><h4>${esc(f.q)}</h4><p>${esc(f.a)}</p></div>`).join("");
  const ta = document.getElementById("pitch-text"), timer = document.getElementById("pitch-timer");
  const st = loadState(); if (st.pitch.text) ta.value = st.pitch.text;
  const draw = () => { const m = Math.floor(Math.abs(pitchLeft) / 60), s = Math.abs(pitchLeft) % 60; timer.textContent = (pitchLeft < 0 ? "+" : "") + m + ":" + String(s).padStart(2, "0"); timer.className = "timer" + (pitchLeft < 0 ? " over" : pitchLeft <= 15 ? " warn" : ""); };
  const analyse = () => {
    const txt = ta.value.toLowerCase(); const words = (ta.value.trim().match(/\S+/g) || []).length;
    document.getElementById("pitch-meta").textContent = `${words} words · about ${Math.round(words / 2.5)} seconds spoken (target 200–230 words for 90 s)`;
    document.getElementById("pitch-checks").innerHTML = PITCH_FLOW.map(p => { const hit = p.key.some(k => txt.includes(k)); return `<span class="check-pill ${hit ? "on" : ""}">${hit ? "✓" : "○"} ${esc(p.t)}</span>`; }).join("");
  };
  ta.addEventListener("input", analyse); analyse(); draw();
  document.getElementById("pitch-start").addEventListener("click", (e) => {
    if (pitchTimer) { clearInterval(pitchTimer); pitchTimer = null; e.currentTarget.textContent = "▶ Resume"; return; }
    e.currentTarget.textContent = "⏸ Pause"; ta.focus();
    pitchTimer = setInterval(() => { pitchLeft--; draw(); }, 1000);
  });
  document.getElementById("pitch-reset").addEventListener("click", () => { clearInterval(pitchTimer); pitchTimer = null; pitchLeft = 90; draw(); document.getElementById("pitch-start").textContent = "▶ Start 90-sec timer"; });
  document.getElementById("pitch-save").addEventListener("click", (e) => {
    const s2 = loadState(); s2.pitch.text = ta.value; if (ta.value.trim().length > 40) s2.pitch.practiced = true; saveState(s2); refreshProgress();
    e.currentTarget.textContent = ta.value.trim().length > 40 ? "✓ Saved & marked practiced" : "Write a little more first";
    setTimeout(() => { e.currentTarget.textContent = "✓ Save & mark practiced"; }, 1800);
  });
}
function renderCareer() {
  const rb = document.getElementById("resume-block");
  const text = `${RESUME_PROJECT.title}\n${RESUME_PROJECT.tools}\nKey Contributions\n${RESUME_PROJECT.bullets.map(b => "- " + b).join("\n")}`;
  rb.innerHTML = `<h3>${esc(RESUME_PROJECT.title)}</h3><div class="tools-line">${esc(RESUME_PROJECT.tools)}</div><strong style="font-size:13.5px;">Key Contributions</strong>
    <ul>${RESUME_PROJECT.bullets.map(b => `<li>${esc(b)}</li>`).join("")}</ul><div class="copy-row"><button class="btn-dark" id="copy-resume">📋 Copy Resume Description</button></div>`;
  document.getElementById("copy-resume").addEventListener("click", (e) => copyText(text, e.currentTarget, "📋 Copy Resume Description"));
  const bw = document.getElementById("resume-bullets");
  bw.innerHTML = RESUME_BULLETS.map((b, i) => `<div class="resume-bullet"><p>${esc(b)}</p><button type="button" class="copy-btn" data-i="${i}">📋 Copy</button></div>`).join("");
  bw.querySelectorAll("[data-i]").forEach(b => b.addEventListener("click", () => copyText(RESUME_BULLETS[+b.dataset.i], b, "📋 Copy")));
  document.getElementById("linkedin-post").textContent = LINKEDIN_POST;
  document.getElementById("copy-linkedin-btn").addEventListener("click", (e) => copyText(LINKEDIN_POST, e.currentTarget, "📋 Copy post"));
  document.getElementById("portfolio-grid").innerHTML = PORTFOLIO.map(t => `<div class="card tip-card"><div class="n">${t.n}</div><h4>${esc(t.h)}</h4><p>${esc(t.p)}</p></div>`).join("");
}
function renderGlossary(filterText) {
  const wrap = document.getElementById("gloss-grid"); const q = (filterText || "").trim().toLowerCase();
  const list = GLOSSARY.filter(g => !q || (g.t + g.d).toLowerCase().includes(q));
  wrap.innerHTML = list.length ? list.map(g => `<div class="card gloss-card" id="gl-${slugify(g.t)}"><h4>${esc(g.t)}</h4><p>${esc(g.d)}</p></div>`).join("") : `<div class="empty-state">No terms match that search.</div>`;
}
function renderTips() {
  document.getElementById("tip-grid").innerHTML = TIPS.map(t => `<div class="card tip-card"><div class="n">${t.n}</div><h4>${esc(t.h)}</h4><p>${esc(t.p)}</p></div>`).join("");
  document.getElementById("tip-callout").textContent = TIP_CALLOUT;
  document.getElementById("weak-strong-list").innerHTML = WEAK_STRONG.map(ws => `<div class="ws-card"><div class="ws-q">${esc(ws.q)}</div><div class="ws-grid">
    <div class="ws-col ws-weak"><div class="ws-label">✗ Weak answer</div><p>${esc(ws.weak)}</p></div>
    <div class="ws-col ws-strong"><div class="ws-label">✓ Strong answer</div><p>${esc(ws.strong)}</p></div></div></div>`).join("");
}
function renderLearningLinks() {
  document.getElementById("learn-grid").innerHTML = LEARNING_LINKS.map((l, i) => `<a class="learn-card tint-${i % 6}" href="${l.url}" target="_blank" rel="noopener"><span class="learn-source">${esc(l.source)}</span><h4>${esc(l.title)}</h4><p>${esc(l.desc)}</p><span class="learn-cta">Open resource ↗</span></a>`).join("");
}
function renderProgressPage() {
  const r = document.getElementById("reset-progress");
  if (r) r.addEventListener("click", () => {
    if (!confirm("Reset all journey steps, deliverables, assignments, lab answers and interview progress on this device?")) return;
    saveState({}); try { localStorage.removeItem(STORE_KEY); } catch (e) {}
    renderJourney(); renderChecklist("deliv-grid", DELIVERABLES, "deliv"); renderAssignments(); renderLab(); renderQaList(); renderQA(); refreshProgress();
  });
}

function renderSamples() {
  const g = document.getElementById("sample-grid");
  if (g) {
    g.innerHTML = SAMPLE_IMAGE_DASHBOARDS.map((d, i) => `
      <div class="card sample-card">
        <img src="${d.img}" alt="${esc(d.t)} by ${esc(d.by)}" data-zoom="${i}" loading="lazy">
        <div class="sample-body"><div class="sample-by">${esc(d.by)}</div><h4>${esc(d.t)}</h4>
          <p><strong>What it does:</strong> ${esc(d.does)}</p><p><strong>KPIs:</strong> ${esc(d.kpis)}</p>
          <p><strong>Visuals:</strong> ${esc(d.visuals)}</p><div class="sample-px">➜ ${esc(d.proxima)}</div></div>
      </div>`).join("");
    g.querySelectorAll("[data-zoom]").forEach(im => im.addEventListener("click", () => openModal(`<img class="zoom-img" src="${im.src}" alt="${esc(im.alt)}"><p style="font-size:12px;color:var(--ink-muted);margin-top:8px;">Sample design: ${esc(im.alt)}. Wireframe / concept for layout; use the KPI Library numbers in your build.</p>`)));
  }
  const w = document.getElementById("vidi-cards");
  if (w) {
    const li = (arr) => `<ul>${arr.map(x => `<li>${esc(x)}</li>`).join("")}</ul>`;
    w.innerHTML = VIDI_DASHBOARDS.map((d, i) => `
      <div class="dacc" id="dacc-${i}">
        <button class="dacc-head" aria-expanded="false">
          <span class="dacc-n">${String(i + 1).padStart(2, "0")}</span>
          <span class="dacc-t"><strong>${esc(d.name)}</strong><span>${esc(d.tag)}</span></span>
          <span class="dacc-tool">${esc(d.tool)}</span><span class="dacc-chev">⌄</span>
        </button>
        <div class="dacc-body">
          <p class="dacc-ctx">${esc(d.context)}</p>
          <div class="dacc-grid">
            <div><h5>📋 What it shows</h5><p>${esc(d.what)}</p></div>
            <div><h5>❓ Business question it answers</h5><p>${esc(d.question)}</p></div>
            <div><h5>👥 Who uses it</h5><p>${esc(d.who)}</p></div>
            <div><h5>🎛️ Filters / slicers</h5><p>${esc(d.filters)}</p></div>
            <div><h5>📊 Key KPIs</h5>${li(d.kpis)}</div>
            <div><h5>📈 Visuals</h5>${li(d.visuals)}</div>
          </div>
          <div class="dacc-build"><h5>🛠️ Build it with the PayFlow data</h5>${li(d.build)}</div>
          <div class="dacc-foot"><span class="dacc-insight">💡 PayFlow example: ${esc(d.proxima)}</span><span class="dacc-page">Gallery page: ${esc(d.page)}</span></div>
        </div>
      </div>`).join("");
    const setOpen = (card, open) => { card.classList.toggle("open", open); card.querySelector(".dacc-head").setAttribute("aria-expanded", open); };
    w.querySelectorAll(".dacc").forEach(c => c.querySelector(".dacc-head").addEventListener("click", () => setOpen(c, !c.classList.contains("open"))));
    const oa = document.getElementById("acc-open-all"), ca = document.getElementById("acc-close-all");
    if (oa) oa.addEventListener("click", () => w.querySelectorAll(".dacc").forEach(c => setOpen(c, true)));
    if (ca) ca.addEventListener("click", () => w.querySelectorAll(".dacc").forEach(c => setOpen(c, false)));
  }
}
function renderQaRefs() {
  const w = document.getElementById("qa-refs"); if (!w) return;
  w.innerHTML = QA_REFERENCES.map((s, i) => `<a class="learn-card tint-${i % 6}" href="${s[1]}" target="_blank" rel="noopener"><span class="learn-source">${esc(s[0].split(":")[0])}</span><h4>${esc(s[0].split(": ").slice(1).join(": ") || s[0])}</h4><span class="learn-cta">Open source ↗</span></a>`).join("");
}
function initBrandHome() {
  document.querySelectorAll("#brand-home, .brand-home-link").forEach(a => a.addEventListener("click", (e) => {
    e.preventDefault(); if (location.hash) history.replaceState(null, "", location.pathname); switchView("overview");
  }));
}

function renderTraps() {
  const g = document.getElementById("trap-grid"); if (g) g.innerHTML = INTERVIEW_TRAPS.map(([bad, good]) => `<div class="trap"><div class="tbad">❌ ${esc(bad)}</div><div class="tgood">✅ ${esc(good)}</div></div>`).join("");
  const p = document.getElementById("pres-list"); if (p) p.innerHTML = PRESENTATION.map(([n, t, s, d]) => `<div class="pres-row"><span class="pn">${n}</span><div><h4>${esc(t)} <em>${s}</em></h4><p>${esc(d)}</p></div></div>`).join("");
}
function renderCertificate() {
  const box = document.getElementById("cert-box"); if (!box) return;
  const { tracks, overall } = trackScores();
  const done = overall >= 100;
  box.innerHTML = `<h4>${done ? "🎉 PayFlow Fintech Analytics Capstone Completed" : "🏅 Completion certificate"}</h4>
    <div class="cert-ticks">${tracks.map(t => `<span class="${t.pct >= 100 ? "on" : ""}">${t.pct >= 100 ? "✓" : "○"} ${esc(t.name)}</span>`).join("")}</div>
    ${done ? `<div class="answer-row"><input type="text" id="cert-name" placeholder="Your full name"><button class="btn-blue" id="cert-print">Download certificate</button></div>`
           : `<p>Unlocks at 100%. You're at <strong>${overall}%</strong>: finish the journey, deliverables, assignments and interview practice.</p>`}`;
  const b = document.getElementById("cert-print");
  if (b) b.addEventListener("click", () => {
    const nm = (document.getElementById("cert-name").value || "").trim(); if (!nm) { chatToastMini("Type your name first."); return; }
    document.getElementById("print-sheet").innerHTML = `<div class="cert-print"><img src="assets/payflow-logo.png" alt="" style="width:220px;"><h1>Certificate of Completion</h1><p>This certifies that</p><h2>${esc(nm)}</h2>
      <p>has completed the <strong>PayFlow Fintech Merchant &amp; Fraud Risk Analytics Capstone</strong>: data model, SQL, Excel, Tableau, Power BI, KPI implementation, QA reconciliation, business analysis and interview preparation.</p>
      <p style="margin-top:30px;">Mahendra Singh · Data Analyst Trainer, ExcelR &nbsp;|&nbsp; ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p>
      <p style="font-size:10px;color:#777;margin-top:20px;">Self-tracked completion on the PayFlow Fintech Analytics learning hub.</p></div>`;
    setTimeout(() => window.print(), 80);
  });
}
/* ============================================================
   Navigation
   ============================================================ */
const LAST_VIEW_KEY = "payflow_hub_last_view_v1";
const VIEW_LABELS = {
  schedule: "Project Schedule & Status", progress: "My Progress", problem: "Problem & Business Questions", rules: "Rules & Regulations", dataset: "Dataset", model: "Data Model",
  datadict: "Data Dictionary", quality: "Data Quality", kpis: "KPI Library", sql: "SQL Lab", editor: "SQL Practice Editor", excel: "Excel Analysis", analysis: "Business Analysis",
  dashboards: "Dashboard Gallery", qa: "QA & Reconciliation", assignments: "Assignments", lab: "Analyst Thinking Lab", interview: "Interview Questions",
  pitch: "90-sec Project Pitch", career: "Resume, LinkedIn & Portfolio", glossary: "Glossary", tips: "Student Tips", learnmore: "Learn More",
};
function switchView(viewName) {
  if (viewName === "journey-anchor") {
    switchView("overview");
    setTimeout(() => { const j = document.getElementById("journey-anchor"); if (j) j.scrollIntoView({ behavior: "smooth", block: "start" }); }, 60);
    return;
  }
  document.querySelectorAll("#nav button").forEach(x => x.classList.toggle("active", x.dataset.view === viewName));
  document.querySelectorAll("section.view").forEach(v => v.classList.remove("active"));
  const section = document.getElementById("view-" + viewName);
  if (section) section.classList.add("active");
  window.scrollTo({ top: 0, behavior: "auto" });
  closeMobileSidebar();
  if (viewName !== "overview" && VIEW_LABELS[viewName]) lsSet(LAST_VIEW_KEY, JSON.stringify({ view: viewName, ts: Date.now() }));
  if (viewName === "overview") renderContinueBanner();
  if (viewName === "progress") refreshProgress();
  if (viewName === "editor" && typeof initEditor === "function") initEditor();
}
function renderContinueBanner() {
  const wrap = document.getElementById("continue-banner"); if (!wrap) return;
  let saved = null; try { saved = JSON.parse(lsGet(LAST_VIEW_KEY)); } catch (e) {}
  if (!saved || !saved.view || !VIEW_LABELS[saved.view]) { wrap.style.display = "none"; return; }
  wrap.style.display = "flex";
  wrap.innerHTML = `<span class="continue-text">↩️ Continue where you left off: <strong>${VIEW_LABELS[saved.view]}</strong></span>
    <div class="continue-actions"><button type="button" class="continue-go">Continue →</button><button type="button" class="continue-dismiss" title="Dismiss">✕</button></div>`;
  wrap.querySelector(".continue-go").addEventListener("click", () => switchView(saved.view));
  wrap.querySelector(".continue-dismiss").addEventListener("click", () => { wrap.style.display = "none"; });
}
function initNav() {
  document.querySelectorAll("#nav button").forEach(b => b.addEventListener("click", () => switchView(b.dataset.view)));
  document.querySelectorAll("[data-goto]").forEach(b => b.addEventListener("click", () => switchView(b.dataset.goto)));
}
function closeMobileSidebar() {
  const sb = document.getElementById("sidebar"), sc = document.getElementById("scrim");
  if (sb) sb.classList.remove("open"); if (sc) sc.classList.remove("show");
}
function initMobileToggle() {
  const t = document.getElementById("mobile-toggle"), sb = document.getElementById("sidebar"), sc = document.getElementById("scrim");
  if (!t || !sb || !sc) return;
  t.addEventListener("click", () => { sb.classList.toggle("open"); sc.classList.toggle("show"); });
  sc.addEventListener("click", closeMobileSidebar);
}
function initSocial() {
  [["side-youtube", SOCIAL.youtube], ["side-medium", SOCIAL.medium], ["side-linkedin", SOCIAL.linkedin], ["social-youtube", SOCIAL.youtube],
   ["social-medium", SOCIAL.medium], ["social-linkedin", SOCIAL.linkedin], ["youtube-link", SOCIAL.youtube]].forEach(([id, url]) => { const e = document.getElementById(id); if (e && url) e.href = url; });
  const fl = document.querySelectorAll(".footer-links a"); if (fl[0]) fl[0].href = SOCIAL.linkedin; if (fl[1]) fl[1].href = SOCIAL.medium;
}

/* ---- Visitor counter (no external service) ---- */
let __visitorMemory = null;
function initVisitorCounter() {
  const e = document.getElementById("visitor-count"); if (!e) return;
  const SEED = "payflow_hub_visits_seed_v1", CNT = "payflow_hub_visits_count_v1";
  function tryStore(store) {
    let seed = parseInt(store.getItem(SEED) || "0", 10);
    if (!seed) { seed = 180 + Math.floor(Math.random() * 220); store.setItem(SEED, String(seed)); }
    let c = parseInt(store.getItem(CNT) || "0", 10) + 1; store.setItem(CNT, String(c)); return seed + c;
  }
  let total = null;
  try { total = tryStore(window.localStorage); } catch (er) {}
  if (total === null) { try { total = tryStore(window.sessionStorage); } catch (er) {} }
  if (total === null) { if (__visitorMemory === null) __visitorMemory = 180 + Math.floor(Math.random() * 220); total = ++__visitorMemory; }
  e.textContent = total.toLocaleString("en-IN");
}

function initSearch() {
  document.getElementById("kpi-search").addEventListener("input", (e) => { kpiSearch = e.target.value; renderKpiGrid(); });
  document.getElementById("qa-search").addEventListener("input", (e) => { qaSearch = e.target.value; renderQaList(); });
  document.getElementById("gl-search").addEventListener("input", (e) => renderGlossary(e.target.value));
  document.getElementById("dd-search").addEventListener("input", (e) => renderDataDictionary(e.target.value));
}

/* ============================================================
   Ask Mahendra — client-side search over the site's own content
   ============================================================ */
function buildChatIndex() {
  const idx = [];
  KPIS.forEach(k => idx.push({ type: "KPI", tab: "kpis", title: k.name, text: `${k.name} ${k.q} ${k.desc} ${k.plain} ${k.cat}`,
    answer: `<strong>${esc(k.name)}</strong> (${esc(k.cat)}): ${esc(k.q)}<br>${esc(k.desc)}<br><span class="src-tag">${esc(k.formula)}</span><br><em>Answer key: ${esc(k.v25)}</em>`,
    followups: ["Show the related SQL", "What's a common mistake here?"] }));
  QA.forEach(it => idx.push({ type: "Interview Q&A", tab: "interview", title: it.q, text: `${it.q} ${it.a} ${it.cat}`,
    answer: `<strong>${esc(it.q)}</strong><br>${it.a}<div class="chat-signal">Interviewer signal: ${esc(it.signal)}</div>`,
    followups: it.cat === "Scenario-Based" ? ["Give me another scenario question", "What's a common gotcha here?"] : ["Give me a scenario question", "What's a common mistake here?"] }));
  GLOSSARY.forEach(g => idx.push({ type: "Glossary", tab: "glossary", title: g.t, text: `${g.t} ${g.d}`, answer: `<strong>${esc(g.t)}</strong>: ${esc(g.d)}`, followups: ["Show the related KPI", "Any gotchas here?"] }));
  NULL_NOTES.forEach((n, i) => idx.push({ type: "Data Quality", tab: "quality", title: `Data quality note ${i + 1}`, text: `null blank quality quirk ${n}`, answer: `<strong>Data quality, expected blank / quirk</strong><br>${esc(n)}`, followups: ["What are the data model gotchas?"] }));
  GOTCHAS.forEach(g => idx.push({ type: "Gotcha", tab: "model", title: g.t, text: `gotcha trap mistake ${g.t} ${g.d}`, answer: `<strong>⚠️ Gotcha: ${esc(g.t)}</strong><br>${esc(g.d)}`, followups: ["What's another gotcha?", "Give me an interview question on this"] }));
  TIPS.forEach(t => idx.push({ type: "Student Tip", tab: "tips", title: t.h, text: `tip advice ${t.h} ${t.p}`, answer: `<strong>Tip: ${esc(t.h)}</strong><br>${esc(t.p)}`, followups: ["Give me another tip"] }));
  SQL_BLOCKS.forEach(b => idx.push({ type: "SQL", tab: "sql", title: b.title, text: `sql query ${b.title} ${b.desc}`, answer: `<strong>${esc(b.title)}</strong><br>${esc(b.desc)}<pre style="white-space:pre-wrap;font-size:11px;">${esc(b.sql.slice(0, 600))}${b.sql.length > 600 ? "…" : ""}</pre>`, followups: ["Open the SQL Lab"] }));
  return idx;
}
const STOPWORDS = new Set(["what","is","the","a","an","of","for","how","why","does","do","in","on","to","and","or","this","that","are","was","were","be","it","its","with","vs","versus","between","me","tell","explain","about","show","give"]);
function expandTokens(t) { const x = []; t.forEach(w => { if (SYNONYMS[w]) x.push(...SYNONYMS[w]); }); return t.concat(x.map(s => s.toLowerCase())); }
function tokenize(s) { return s.toLowerCase().replace(/[^a-z0-9%\s]/g, " ").split(/\s+/).filter(w => w && !STOPWORDS.has(w)); }
function findByExactTitle(title, index) { return index.find(e => e.title === title); }
function searchChatIndex(query, index) {
  const raw = tokenize(query); if (!raw.length) return [];
  const toks = expandTokens(raw); const ql = query.toLowerCase();
  return index.map(e => {
    const tl = e.title.toLowerCase(), xl = e.text.toLowerCase(); let s = 0;
    toks.forEach(t => { if (tl.includes(t)) s += 3; else if (xl.includes(t)) s += 1; });
    if (ql.length > 3 && tl.includes(ql)) s += 5; return { e, s };
  }).filter(r => r.s > 0).sort((a, b) => b.s - a.s).slice(0, 3).map(r => r.e);
}
let chatIndexCache = null, chatLastResults = [];
function chatAppendMessage(html, who) {
  const body = document.getElementById("chat-panel-body"); const row = el("div", "chat-msg " + who);
  row.innerHTML = `<div class="chat-bubble">${html}</div>`; body.appendChild(row); body.scrollTop = body.scrollHeight; return row;
}
function chatAppendFollowups(fu) {
  if (!fu || !fu.length) return; const body = document.getElementById("chat-panel-body"); const w = el("div", "chat-followups");
  fu.slice(0, 3).forEach(f => { const c = el("button", "chat-followup-chip", esc(f)); c.type = "button"; c.addEventListener("click", () => { chatAppendMessage(esc(f), "user"); setTimeout(() => chatAnswer(f), 150); }); w.appendChild(c); });
  body.appendChild(w); body.scrollTop = body.scrollHeight;
}
function chatTypingIndicator(show) {
  const body = document.getElementById("chat-panel-body"); let i = document.getElementById("chat-typing-indicator");
  if (show) { if (i) return; i = el("div", "chat-msg bot"); i.id = "chat-typing-indicator"; i.innerHTML = `<div class="chat-bubble chat-typing"><span></span><span></span><span></span></div>`; body.appendChild(i); body.scrollTop = body.scrollHeight; }
  else if (i) i.remove();
}
function chatFallback() {
  chatAppendMessage("I couldn't find a close match for that in the KPIs, interview prep, data model or glossary. Try a specific term, a KPI name or a table name, or one of these:", "bot");
  chatAppendFollowups(CHAT_POPULAR);
}
function chatAnswer(query) {
  if (!chatIndexCache) chatIndexCache = buildChatIndex();
  const bare = query.trim().toLowerCase().replace(/[?!.]/g, "");
  if (["why", "example", "give an example", "more"].includes(bare) && chatLastResults.length) query = chatLastResults[0].title;
  if (/open the sql lab/i.test(query)) { switchView("sql"); return; }
  if (/scenario question/i.test(query)) { const sc = QA.filter(q => q.cat === "Scenario-Based"); const p = sc[Math.floor(Math.random() * sc.length)]; query = p.q; }
  let forced = null;
  for (const r of INTENT_RULES) { if (r.re.test(query)) { forced = findByExactTitle(r.title, chatIndexCache); if (forced) break; } }
  const results = forced ? [forced] : searchChatIndex(query, chatIndexCache);
  if (!results.length) { chatFallback(); return; }
  chatLastResults = results;
  results.forEach(r => {
    const bid = "chat-a-" + Math.random().toString(36).slice(2, 9);
    const row = chatAppendMessage(`<div id="${bid}">${r.answer}</div><br><button type="button" class="chat-link-btn" data-tab="${r.tab}">Open ${VIEW_LABELS[r.tab] || r.tab} →</button><button type="button" class="chat-copy-btn">Copy</button>`, "bot");
    row.querySelector(".chat-link-btn").addEventListener("click", () => switchView(r.tab));
    const cb = row.querySelector(".chat-copy-btn"); cb.addEventListener("click", () => copyText(document.getElementById(bid).innerText, cb, "Copy"));
    chatAppendFollowups(r.followups);
  });
}
function initChatWidget() {
  const fab = document.getElementById("chat-fab"), panel = document.getElementById("chat-panel"), close = document.getElementById("chat-panel-close");
  const form = document.getElementById("chat-panel-form"), input = document.getElementById("chat-input"), label = document.getElementById("chat-fab-label");
  if (!fab || !panel || !form) return;
  fab.addEventListener("click", () => { panel.classList.toggle("open"); if (panel.classList.contains("open")) { input.focus(); if (label) label.classList.add("hide"); renderQuickReplies(); } });
  close.addEventListener("click", () => { panel.classList.remove("open"); if (label) label.classList.remove("hide"); });
  form.addEventListener("submit", (e) => { e.preventDefault(); const q = input.value.trim(); if (!q) return; chatAppendMessage(esc(q), "user"); input.value = ""; chatTypingIndicator(true); setTimeout(() => { chatTypingIndicator(false); chatAnswer(q); }, 450); });
}
function renderQuickReplies() {
  const w = document.getElementById("chat-quick-replies"); if (!w) return;
  const pick = [...QUICK_REPLY_POOL].sort(() => Math.random() - 0.5).slice(0, 5);
  w.innerHTML = pick.map(q => `<button type="button" data-quick="${esc(q)}">${esc(q)}</button>`).join("");
  w.querySelectorAll("button").forEach(b => b.addEventListener("click", () => { chatAppendMessage(esc(b.dataset.quick), "user"); setTimeout(() => chatAnswer(b.dataset.quick), 150); }));
}

/* ============================================================
   Bookmarks + deep links
   ============================================================ */
const BOOKMARK_KEY = "payflow_hub_bookmarks_v1";
function getBookmarks() { try { const r = JSON.parse(lsGet(BOOKMARK_KEY)); return r && r.kpi && r.qa ? r : { kpi: {}, qa: {} }; } catch (e) { return { kpi: {}, qa: {} }; } }
function toggleBookmark(type, key) { const b = getBookmarks(); b[type][key] = !b[type][key]; if (!b[type][key]) delete b[type][key]; lsSet(BOOKMARK_KEY, JSON.stringify(b)); }
function copyDeepLink(type, key) {
  const url = `${location.origin}${location.pathname}#${type}=${encodeURIComponent(key)}`;
  copyText(url); chatToastMini(`Link to this ${type === "kpi" ? "KPI" : "question"} copied. Paste it anywhere to jump straight here.`);
}
function chatToastMini(msg) {
  let t = document.getElementById("mini-toast");
  if (!t) { t = el("div"); t.id = "mini-toast"; t.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--ink);color:var(--paper);padding:10px 18px;border-radius:8px;font-size:12.5px;z-index:1000;box-shadow:0 8px 24px rgba(0,0,0,0.3);opacity:0;transition:opacity 0.25s;"; document.body.appendChild(t); }
  t.textContent = msg; t.style.opacity = "1"; clearTimeout(t._t); t._t = setTimeout(() => { t.style.opacity = "0"; }, 2400);
}
function handleDeepLink() {
  const hash = location.hash.slice(1); if (!hash) return;
  const [type, raw] = hash.split("="); if (!type || !raw) return;
  const val = decodeURIComponent(raw); const tab = { kpi: "kpis", qa: "interview", gl: "glossary" }[type]; if (!tab) return;
  switchView(tab);
  if (type === "kpi") { kpiActiveCat = "All"; renderKpiPills(); renderKpiGrid(); }
  if (type === "qa") { const it = QA.find(q => q.q === val); if (it) { qaActiveCat = it.cat; renderQaTabs(); renderQaList(); } }
  setTimeout(() => {
    const target = document.getElementById((type === "kpi" ? "kpi-" : type === "qa" ? "qa-" : "gl-") + slugify(val)); if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" }); target.classList.add("deep-link-flash");
    if (type === "qa") { target.classList.add("open"); const a = target.querySelector(".qa-a"); if (a) a.style.maxHeight = a.scrollHeight + "px"; }
    setTimeout(() => target.classList.remove("deep-link-flash"), 1900);
  }, 120);
}

/* ============================================================
   Dark mode + streak
   ============================================================ */
const THEME_KEY = "payflow_hub_theme_v1";
function initThemeToggle() {
  const btn = document.getElementById("theme-toggle"), icon = document.getElementById("theme-toggle-icon"), label = document.getElementById("theme-toggle-label");
  if (!btn) return;
  const apply = (dark) => { document.body.classList.toggle("dark-mode", dark); if (icon) icon.textContent = dark ? "☀️" : "🌙"; if (label) label.textContent = dark ? "Light mode" : "Dark mode"; };
  const saved = lsGet(THEME_KEY);
  apply(saved === "dark");   // light (DailySQL-style) is the default
  btn.addEventListener("click", () => { const d = !document.body.classList.contains("dark-mode"); apply(d); lsSet(THEME_KEY, d ? "dark" : "light"); });
}
const STREAK_KEY = "payflow_hub_visit_days_v1";
function updateStreak() {
  const badge = document.getElementById("streak-badge"); if (!badge) return;
  let days = []; try { days = JSON.parse(lsGet(STREAK_KEY)) || []; } catch (e) {}
  const today = new Date().toISOString().slice(0, 10);
  if (!days.includes(today)) { days.push(today); lsSet(STREAK_KEY, JSON.stringify(days)); }
  const set = new Set(days); let streak = 0; const cur = new Date();
  while (set.has(cur.toISOString().slice(0, 10))) { streak++; cur.setDate(cur.getDate() - 1); }
  badge.innerHTML = `<span class="flame">🔥</span> <b>${streak}</b>-day study streak · ${days.length} total visit${days.length === 1 ? "" : "s"}`;
}

/* ============================================================
   Flashcard quiz
   ============================================================ */
let quizDeck = [], quizDeckType = "qa", quizIndex = 0, quizScore = { good: 0, again: 0 };
function shuffleArray(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function startQuiz(type) {
  let deck;
  if (type === "kpi") deck = KPIS.map(k => ({ q: k.name, a: `${esc(k.q)}<br>${esc(k.desc)}<code style="display:block;margin-top:8px;font-size:12px;">${esc(k.plain)}</code>`, cat: k.cat }));
  else if (type === "glossary") deck = GLOSSARY.map(g => ({ q: g.t, a: esc(g.d), cat: "Glossary" }));
  else { const bm = getBookmarks(); const st = QA.filter(q => bm.qa[q.q]); deck = st.length >= 5 ? st : QA; }
  quizDeck = shuffleArray(deck); quizDeckType = type || "qa"; quizIndex = 0; quizScore = { good: 0, again: 0 };
  document.getElementById("quiz-overlay").classList.add("open"); renderQuizCard();
}
function renderQuizCard() {
  const body = document.getElementById("quiz-body");
  if (quizIndex >= quizDeck.length) {
    const total = quizScore.good + quizScore.again;
    body.innerHTML = `<div class="quiz-done"><div class="big-score">${quizScore.good} / ${total}</div><p style="color:var(--ink-muted);font-size:13px;margin-bottom:20px;">marked "Got it" this round.</p><button class="btn-dark" id="quiz-restart">Run again</button></div>`;
    document.getElementById("quiz-restart").addEventListener("click", () => startQuiz(quizDeckType)); return;
  }
  const it = quizDeck[quizIndex]; const pct = Math.round(quizIndex / quizDeck.length * 100);
  body.innerHTML = `<div class="quiz-progress-row"><span>Card ${quizIndex + 1} of ${quizDeck.length}</span><span>${esc(it.cat)}</span></div>
    <div class="quiz-bar-outer"><div class="quiz-bar-inner" style="width:${pct}%;"></div></div>
    <div class="quiz-card-flip" id="quiz-flip"><div class="quiz-card-inner"><div class="quiz-face"><span class="tag-mini">${esc(it.cat)}</span><div class="qtxt">${esc(it.q)}</div><div class="hint">Tap the card to reveal the answer</div></div>
    <div class="quiz-face quiz-face-back"><div class="atxt">${it.a}</div></div></div></div>
    <div class="quiz-grade-row" id="quiz-grade-row" style="visibility:hidden;"><button class="grade-again" id="quiz-again">↺ Review again</button><button class="grade-good" id="quiz-good">✓ Got it</button></div>
    <div class="quiz-nav-row"><button id="quiz-skip">Skip →</button><span>${quizScore.good} got it · ${quizScore.again} to review</span></div>`;
  const flip = document.getElementById("quiz-flip"), gr = document.getElementById("quiz-grade-row");
  flip.addEventListener("click", () => { flip.classList.toggle("flipped"); gr.style.visibility = flip.classList.contains("flipped") ? "visible" : "hidden"; });
  document.getElementById("quiz-again").addEventListener("click", (e) => { e.stopPropagation(); quizScore.again++; quizIndex++; renderQuizCard(); });
  document.getElementById("quiz-good").addEventListener("click", (e) => { e.stopPropagation(); quizScore.good++; quizIndex++; renderQuizCard(); });
  document.getElementById("quiz-skip").addEventListener("click", () => { quizIndex++; renderQuizCard(); });
}
function initQuiz() {
  const ov = document.getElementById("quiz-overlay");
  document.getElementById("quiz-launch-btn").addEventListener("click", () => startQuiz("qa"));
  document.getElementById("quiz-close").addEventListener("click", () => ov.classList.remove("open"));
  ov.addEventListener("click", (e) => { if (e.target === ov) ov.classList.remove("open"); });
  document.getElementById("kpi-quiz-launch-btn").addEventListener("click", () => startQuiz("kpi"));
  document.getElementById("gl-quiz-launch-btn").addEventListener("click", () => startQuiz("glossary"));
}
function initStarredToggles() {
  const k = document.getElementById("kpi-starred-toggle"), q = document.getElementById("qa-starred-toggle");
  k.addEventListener("click", () => { kpiStarredOnly = !kpiStarredOnly; k.classList.toggle("active", kpiStarredOnly); renderKpiGrid(); });
  q.addEventListener("click", () => { qaStarredOnly = !qaStarredOnly; q.classList.toggle("active", qaStarredOnly); renderQaList(); });
}

/* ============================================================
   Command palette (Ctrl/Cmd + K)
   ============================================================ */
let cmdkIndex = null, cmdkActive = -1;
function buildCmdkIndex() {
  const idx = [{ type: "Page", label: "Go to Home & Roadmap", tab: "overview", action: "nav" }];
  Object.entries(VIEW_LABELS).forEach(([tab, label]) => idx.push({ type: "Page", label: "Go to " + label, tab, action: "nav" }));
  KPIS.forEach(k => idx.push({ type: "KPI", label: k.name, action: "kpi", key: k.name }));
  QA.forEach(q => idx.push({ type: "Q&A", label: q.q, action: "qa", key: q.q }));
  GLOSSARY.forEach(g => idx.push({ type: "Term", label: g.t, action: "gl", key: g.t }));
  assignments().forEach(a => idx.push({ type: "Assignment", label: a.t, tab: "assignments", action: "nav" }));
  return idx;
}
function openCmdk() { if (!cmdkIndex) cmdkIndex = buildCmdkIndex(); const ov = document.getElementById("cmdk-overlay"), inp = document.getElementById("cmdk-input"); ov.classList.add("open"); inp.value = ""; inp.focus(); renderCmdkResults(""); }
function closeCmdk() { document.getElementById("cmdk-overlay").classList.remove("open"); }
function renderCmdkResults(query) {
  const wrap = document.getElementById("cmdk-results"); const q = query.trim().toLowerCase();
  const results = !q ? cmdkIndex.filter(r => r.type === "Page") : cmdkIndex.filter(r => r.label.toLowerCase().includes(q)).slice(0, 30);
  cmdkActive = results.length ? 0 : -1;
  if (!results.length) { wrap.innerHTML = `<div class="cmdk-empty">No matches. Try a different term.</div>`; wrap._results = []; return; }
  wrap.innerHTML = results.map((r, i) => `<button class="cmdk-item${i === 0 ? " active" : ""}" data-idx="${i}"><span class="cmdk-type">${r.type}</span><span class="cmdk-label">${esc(r.label)}</span></button>`).join("");
  wrap.querySelectorAll(".cmdk-item").forEach(b => {
    b.addEventListener("click", () => selectCmdkResult(results[+b.dataset.idx]));
    b.addEventListener("mouseenter", () => { wrap.querySelectorAll(".cmdk-item").forEach(x => x.classList.remove("active")); b.classList.add("active"); cmdkActive = +b.dataset.idx; });
  });
  wrap._results = results;
}
function selectCmdkResult(r) {
  closeCmdk();
  if (r.action === "nav") { switchView(r.tab); return; }
  location.hash = r.action + "=" + encodeURIComponent(r.key); handleDeepLink();
}
function initCmdk() {
  const hint = document.getElementById("cmdk-fab-hint"), ov = document.getElementById("cmdk-overlay"), inp = document.getElementById("cmdk-input");
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const kl = document.getElementById("cmdk-kbd-label"); if (kl && isMac) kl.textContent = "⌘ K";
  if (hint) hint.addEventListener("click", openCmdk);
  ov.addEventListener("click", (e) => { if (e.target === ov) closeCmdk(); });
  document.addEventListener("keydown", (e) => {
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); ov.classList.contains("open") ? closeCmdk() : openCmdk(); return; }
    if (!ov.classList.contains("open")) return;
    const results = document.getElementById("cmdk-results")._results || [];
    if (e.key === "Escape") closeCmdk();
    else if (e.key === "ArrowDown") { e.preventDefault(); cmdkActive = Math.min(cmdkActive + 1, results.length - 1); hl(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); cmdkActive = Math.max(cmdkActive - 1, 0); hl(); }
    else if (e.key === "Enter") { e.preventDefault(); if (results[cmdkActive]) selectCmdkResult(results[cmdkActive]); }
  });
  inp.addEventListener("input", () => renderCmdkResults(inp.value));
  function hl() { const w = document.getElementById("cmdk-results"); w.querySelectorAll(".cmdk-item").forEach((b, i) => b.classList.toggle("active", i === cmdkActive)); const a = w.querySelector(".cmdk-item.active"); if (a) a.scrollIntoView({ block: "nearest" }); }
}

/* ============================================================
   Printable starred cheat sheet
   ============================================================ */
function initCheatSheet() {
  const btn = document.getElementById("cheatsheet-btn"); if (!btn) return;
  btn.addEventListener("click", () => {
    const bm = getBookmarks(); const ks = KPIS.filter(k => bm.kpi[k.name]); const qs = QA.filter(q => bm.qa[q.q]);
    if (!ks.length && !qs.length) { chatToastMini("Star a few KPIs or questions first (tap ☆ on any card), then print your cheat sheet."); return; }
    document.getElementById("print-sheet").innerHTML = `<h1>PayFlow Fintech Analytics: My Cheat Sheet</h1><p style="color:#666;font-size:11px;margin-bottom:16px;">Generated from starred items · ${new Date().toLocaleDateString()}</p>
      ${ks.length ? `<h3>KPIs (${ks.length})</h3>` + ks.map(k => `<div class="ps-item"><h4>${esc(k.name)}</h4><p>${esc(k.desc)}</p><code>${esc(k.plain)}</code></div>`).join("") : ""}
      ${qs.length ? `<h3 style="margin-top:16px;">Interview Questions (${qs.length})</h3>` + qs.map(q => `<div class="ps-item"><h4>${esc(q.q)}</h4><p>${q.a}</p></div>`).join("") : ""}`;
    setTimeout(() => window.print(), 80);
  });
}

/* ============================================================
   Boot — each step isolated so one failure doesn't stop the page
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  const steps = [
    renderStats, renderJourney, () => renderChecklist("deliv-grid", DELIVERABLES, "deliv"), renderBeforeAfter, renderTools, renderDomainPrimer,
    renderDocuments, renderFlow, renderTimeline, renderProblem, renderRules, renderDataset, renderModel, renderDataDictionary, renderQuality,
    renderKpiPills, renderKpiGrid, renderSql, renderExcel, renderAnalysis, renderGallery, renderQA, renderAssignments, renderLab,
    renderQaTabs, renderQaList, renderPitch, renderCareer, renderGlossary, renderTips, renderLearningLinks, renderProgressPage,
    initNav, initMobileToggle, initSearch, initSocial, initChatWidget, initThemeToggle, updateStreak,
    initQuiz, initStarredToggles, initCmdk, initCheatSheet, initModal, renderSamples, renderQaRefs, initBrandHome, renderKpiTiers, renderTraps, refreshProgress, renderContinueBanner, handleDeepLink,
  ];
  steps.forEach(fn => { try { fn(); } catch (e) { console.error("Boot step failed:", fn.name || "(anonymous)", e); } });
  window.addEventListener("hashchange", handleDeepLink);
});
/* ============================================================
   One-page KPI cheat sheet (hub feature)
   ============================================================ */
function printKpiCheatSheet() {
  const rows = KPI_CATS.filter(c => c !== "All").map(cat => {
    const items = KPIS.filter(k => k.cat === cat).map(k => `
      <div class="cs-item"><div class="cs-name">${esc(k.name)} <span class="cs-tier">${k.prio}</span></div>
        <div class="cs-formula">${esc(k.formula)}</div><div class="cs-def">${esc(k.plain)} · <b>Answer: ${esc(k.v25)}</b></div></div>`).join("");
    return `<h2>${cat}</h2><div class="cs-col">${items}</div>`;
  }).join("");
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>PayFlow Fintech Analytics — KPI Cheat Sheet</title>
  <style>@page { size: A4; margin: 10mm; } * { box-sizing: border-box; } body { font-family: Arial, Helvetica, sans-serif; color: #1A1D21; margin: 0; }
  .cs-header { text-align: center; margin-bottom: 10px; } .cs-header h1 { font-size: 16px; margin: 0 0 2px; } .cs-header p { font-size: 10px; color: #666; margin: 0; }
  .cs-wrap { column-count: 2; column-gap: 18px; } h2 { font-size: 12px; text-transform: uppercase; border-bottom: 1.5px solid #333; padding-bottom: 3px; margin: 10px 0 6px; break-after: avoid; }
  .cs-item { break-inside: avoid; margin-bottom: 6px; padding-bottom: 6px; border-bottom: 1px dotted #ccc; } .cs-name { font-size: 10.5px; font-weight: 700; }
  .cs-tier { font-size: 8px; background: #E6F3FA; color: #0A5A87; padding: 1px 4px; border-radius: 3px; } .cs-formula { font-family: 'Courier New', monospace; font-size: 9px; color: #0E6E9E; margin: 1px 0; }
  .cs-def { font-size: 9px; color: #444; line-height: 1.3; }</style></head><body>
  <div class="cs-header"><h1>PayFlow Fintech Analytics — KPI Cheat Sheet (${KPIS.length} measures)</h1><p>by Mahendra Singh · Data Analyst Trainer, ExcelR · amounts in USD at payment-date FX · attempts ≠ intents · fraud counted once per payment</p></div>
  <div class="cs-wrap">${rows}</div></body></html>`;
  const win = window.open("", "_blank");
  if (!win) { chatToastMini("Please allow pop-ups to print the cheat sheet."); return; }
  win.document.open(); win.document.write(html); win.document.close(); win.focus();
  setTimeout(() => win.print(), 300);
}
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("print-cheatsheet-btn");
  if (btn) btn.addEventListener("click", printKpiCheatSheet);
});
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("img.zoomable").forEach(img => img.addEventListener("click", () => openModal(`<img class="zoom-img" src="${img.src}" alt="${esc(img.alt)}">`)));
});
/* ============================================================
   Live SQL Practice Editor (in-browser SQLite via sql.js) +
   "Today's 3 problems" daily challenge (DailySQL-style).
   ============================================================ */
const PRACTICE_PROBLEMS = [
  // ---------------- Easy ----------------
  { id: "e1", topic: "Aggregations", level: "Easy", mins: 3, t: "Merchants per industry", task: "How many merchants does each industry have? Return industry and n, biggest first (ties by industry).", tables: ["merchants"], hint: "GROUP BY industry, COUNT(*).",
    sol: "SELECT industry, COUNT(*) AS n\nFROM merchants\nGROUP BY industry\nORDER BY n DESC, industry;" },
  { id: "e2", topic: "Aggregations", level: "Easy", mins: 3, t: "Merchants by current status", task: "Count merchants by merchant_status, biggest first.", tables: ["merchants"], hint: "Status is today's status, not activity.",
    sol: "SELECT merchant_status, COUNT(*) AS n\nFROM merchants\nGROUP BY merchant_status\nORDER BY n DESC;" },
  { id: "e3", topic: "Aggregations", level: "Easy", mins: 4, t: "TPV and revenue (USD)", task: "Total TPV and total processing revenue for 2025, both rounded to 2 decimals, plus the take rate % (revenue ÷ TPV × 100, 3 decimals).", tables: ["merchant_monthly"], hint: "Two SUMs and a ratio of sums.",
    sol: "SELECT ROUND(SUM(tpv_usd), 2) AS tpv,\n       ROUND(SUM(revenue_usd), 2) AS revenue,\n       ROUND(100.0 * SUM(revenue_usd) / SUM(tpv_usd), 3) AS take_rate_pct\nFROM merchant_monthly;" },
  { id: "e4", topic: "Aggregations", level: "Easy", mins: 4, t: "Attempts vs intents", task: "Return total attempts, the sum of monthly intents and attempts − intents. (Then think: why is the sum of monthly distinct intents slightly higher than the true distinct count?)", tables: ["merchant_monthly"], hint: "Distinct counts are not additive: a retry can land in the next month.",
    sol: "SELECT SUM(attempts) AS attempts, SUM(intents) AS intents, SUM(attempts) - SUM(intents) AS retries\nFROM merchant_monthly;" },
  { id: "e5", topic: "Aggregations", level: "Easy", mins: 4, t: "Payment success rate", task: "Success rate % = succeeded ÷ (attempts − pending) × 100, 2 decimals.", tables: ["merchant_monthly"], hint: "Pending is neither success nor failure.",
    sol: "SELECT ROUND(100.0 * SUM(succeeded) / (SUM(attempts) - SUM(pending)), 2) AS success_rate_pct\nFROM merchant_monthly;" },
  { id: "e6", topic: "Filtering", level: "Easy", mins: 3, t: "Active merchants in 2025", task: "How many distinct merchants had at least one successful payment?", tables: ["merchant_monthly"], hint: "WHERE succeeded > 0, COUNT(DISTINCT …).",
    sol: "SELECT COUNT(DISTINCT merchant_id) AS active_merchants\nFROM merchant_monthly\nWHERE succeeded > 0;" },
  { id: "e7", topic: "Aggregations", level: "Easy", mins: 3, t: "Dispute outcomes", task: "Count disputes by dispute_outcome, biggest first.", tables: ["disputes"], hint: "GROUP BY dispute_outcome.",
    sol: "SELECT dispute_outcome, COUNT(*) AS n\nFROM disputes\nGROUP BY dispute_outcome\nORDER BY n DESC;" },
  { id: "e8", topic: "Sorting & Limits", level: "Easy", mins: 3, t: "Top 5 merchants by TPV", task: "merchant_id and total tpv_usd (2 dp) of the 5 biggest merchants.", tables: ["merchant_monthly"], hint: "ORDER BY … DESC LIMIT 5.",
    sol: "SELECT merchant_id, ROUND(SUM(tpv_usd), 2) AS tpv\nFROM merchant_monthly\nGROUP BY merchant_id\nORDER BY tpv DESC\nLIMIT 5;" },
  // ---------------- Medium ----------------
  { id: "m1", topic: "Joins", level: "Medium", mins: 7, t: "TPV by industry", task: "industry, TPV (2 dp) and share of total TPV % (1 dp), biggest first.", tables: ["merchant_monthly", "merchants"], hint: "JOIN on merchant_id; SUM(SUM(..)) OVER () for the total.",
    sol: "SELECT m.industry, ROUND(SUM(mm.tpv_usd), 2) AS tpv,\n       ROUND(100.0 * SUM(mm.tpv_usd) / SUM(SUM(mm.tpv_usd)) OVER (), 1) AS share_pct\nFROM merchant_monthly mm JOIN merchants m ON m.merchant_id = mm.merchant_id\nGROUP BY m.industry\nORDER BY tpv DESC;" },
  { id: "m2", topic: "Aggregations", level: "Medium", mins: 6, t: "Success rate by method category", task: "method_category and success rate % (succeeded ÷ (succeeded + failed), 2 dp), best first.", tables: ["method_monthly"], hint: "Pending isn't in this table's failed column.",
    sol: "SELECT method_category,\n       ROUND(100.0 * SUM(succeeded) / (SUM(succeeded) + SUM(failed)), 2) AS success_rate_pct\nFROM method_monthly\nGROUP BY method_category\nORDER BY success_rate_pct DESC;" },
  { id: "m3", topic: "Distinct counting", level: "Medium", mins: 7, t: "Fraud cases vs fraudulent payments", task: "For confirmed cases only: number of cases, number of distinct payments, and confirmed fraud USD counted once per payment (2 dp).", tables: ["fraud_cases"], hint: "MAX per payment in a subquery, then SUM.",
    sol: "SELECT (SELECT COUNT(*) FROM fraud_cases WHERE confirmed_fraud_flag = 1) AS cases,\n       COUNT(*) AS payments,\n       ROUND(SUM(amt), 2) AS fraud_usd\nFROM (SELECT payment_id, MAX(confirmed_fraud_usd) AS amt\n      FROM fraud_cases WHERE confirmed_fraud_flag = 1 GROUP BY payment_id) x;" },
  { id: "m4", topic: "Conditional Logic", level: "Medium", mins: 7, t: "Chargeback vs dispute amount", task: "Total dispute_usd and total chargeback_usd (2 dp each). Pending disputes have a NULL chargeback.", tables: ["disputes"], hint: "SUM ignores NULLs — that's what we want here.",
    sol: "SELECT ROUND(SUM(dispute_usd), 2) AS disputed, ROUND(SUM(chargeback_usd), 2) AS charged_back\nFROM disputes;" },
  { id: "m5", topic: "Joins", level: "Medium", mins: 8, t: "Fraud rate by industry", task: "industry, confirmed fraud USD (once per payment, 2 dp) and fraud value rate % of that industry's TPV (3 dp), highest rate first. Industries without fraud show 0.", tables: ["fraud_cases", "merchants", "merchant_monthly"], hint: "Aggregate fraud per payment, then per industry, and LEFT JOIN to TPV per industry.",
    sol: "WITH f AS (SELECT payment_id, merchant_id, MAX(confirmed_fraud_usd) amt FROM fraud_cases WHERE confirmed_fraud_flag = 1 GROUP BY payment_id, merchant_id),\n     fi AS (SELECT m.industry, SUM(f.amt) fraud FROM f JOIN merchants m ON m.merchant_id = f.merchant_id GROUP BY m.industry),\n     t AS (SELECT m.industry, SUM(mm.tpv_usd) tpv FROM merchant_monthly mm JOIN merchants m ON m.merchant_id = mm.merchant_id GROUP BY m.industry)\nSELECT t.industry, ROUND(COALESCE(fi.fraud, 0), 2) AS fraud_usd, ROUND(100.0 * COALESCE(fi.fraud, 0) / t.tpv, 3) AS fraud_rate_pct\nFROM t LEFT JOIN fi ON fi.industry = t.industry\nORDER BY fraud_rate_pct DESC;" },
  { id: "m6", topic: "Aggregations", level: "Medium", mins: 6, t: "Refunded payments vs refund rows", task: "For the refunds table: total rows, succeeded rows, distinct payments with a succeeded refund, and succeeded refund USD (2 dp).", tables: ["refunds"], hint: "A payment can have several partial refunds; failed refunds don't count.",
    sol: "SELECT COUNT(*) AS rows_total,\n       SUM(refund_status = 'succeeded') AS rows_succeeded,\n       COUNT(DISTINCT CASE WHEN refund_status = 'succeeded' THEN payment_id END) AS refunded_payments,\n       ROUND(SUM(CASE WHEN refund_status = 'succeeded' THEN refund_usd END), 2) AS refund_usd\nFROM refunds;" },
  { id: "m7", topic: "Window Functions", level: "Medium", mins: 8, t: "Monthly TPV and MoM %", task: "month_label, TPV (0 dp) and % change vs previous month (2 dp; NULL for January).", tables: ["merchant_monthly"], hint: "LAG() over a monthly CTE.",
    sol: "WITH m AS (SELECT month_label, SUM(tpv_usd) AS tpv FROM merchant_monthly GROUP BY month_label)\nSELECT month_label, ROUND(tpv) AS tpv,\n       ROUND(100.0 * (tpv - LAG(tpv) OVER (ORDER BY month_label)) / LAG(tpv) OVER (ORDER BY month_label), 2) AS mom_pct\nFROM m ORDER BY month_label;" },
  { id: "m8", topic: "Aggregations", level: "Medium", mins: 7, t: "Merchants with high failure rates", task: "merchant_id, attempts and failure rate % (failed ÷ (attempts − pending), 1 dp) for merchants with ≥ 100 attempts and failure rate ≥ 15%, worst first.", tables: ["merchant_monthly"], hint: "HAVING on both conditions.",
    sol: "SELECT merchant_id, SUM(attempts) AS attempts,\n       ROUND(100.0 * SUM(failed) / (SUM(attempts) - SUM(pending)), 1) AS failure_rate_pct\nFROM merchant_monthly\nGROUP BY merchant_id\nHAVING SUM(attempts) >= 100 AND 1.0 * SUM(failed) / (SUM(attempts) - SUM(pending)) >= 0.15\nORDER BY failure_rate_pct DESC;" },
  // ---------------- Advanced ----------------
  { id: "a1", topic: "Window Functions", level: "Advanced", mins: 10, t: "Top-10 merchant share (Pareto)", task: "For the 10 biggest merchants: rank, merchant_id, TPV (0 dp) and cumulative share of total TPV % (2 dp).", tables: ["merchant_monthly"], hint: "Cumulative SUM() OVER (ORDER BY tpv DESC) ÷ SUM() OVER ().",
    sol: "WITH t AS (SELECT merchant_id, SUM(tpv_usd) tpv FROM merchant_monthly GROUP BY merchant_id),\n     r AS (SELECT merchant_id, tpv, RANK() OVER (ORDER BY tpv DESC) rnk,\n                  100.0 * SUM(tpv) OVER (ORDER BY tpv DESC) / SUM(tpv) OVER () cum FROM t)\nSELECT rnk, merchant_id, ROUND(tpv) AS tpv, ROUND(cum, 2) AS cumulative_pct\nFROM r WHERE rnk <= 10 ORDER BY rnk;" },
  { id: "a2", topic: "CTEs", level: "Advanced", mins: 12, t: "Declining merchants (Q4 vs Q3)", task: "merchant_id, merchant_name, Q3 TPV, Q4 TPV (0 dp) and change % (1 dp) for merchants with Q3 TPV ≥ 5,000 and a drop of 20% or more. Biggest Q3 first.", tables: ["merchant_monthly", "merchants"], hint: "Conditional SUM on month_label ranges ('2025-07'..'2025-09' and '2025-10'..'2025-12').",
    sol: "WITH q AS (\n  SELECT merchant_id,\n         SUM(CASE WHEN month_label BETWEEN '2025-07' AND '2025-09' THEN tpv_usd ELSE 0 END) AS q3,\n         SUM(CASE WHEN month_label BETWEEN '2025-10' AND '2025-12' THEN tpv_usd ELSE 0 END) AS q4\n  FROM merchant_monthly GROUP BY merchant_id)\nSELECT q.merchant_id, m.merchant_name, ROUND(q3) AS q3_tpv, ROUND(q4) AS q4_tpv, ROUND(100.0 * (q4 - q3) / q3, 1) AS change_pct\nFROM q JOIN merchants m ON m.merchant_id = q.merchant_id\nWHERE q3 >= 5000 AND (q4 - q3) / q3 <= -0.20\nORDER BY q3 DESC;" },
  { id: "a3", topic: "CTEs", level: "Advanced", mins: 12, t: "Merchant retention Q1 → Q4", task: "Number of merchants with a successful payment in Q1 2025, how many of them also in Q4, and retention % (2 dp).", tables: ["merchant_monthly"], hint: "Flag Q1 and Q4 activity per merchant, then aggregate.",
    sol: "WITH a AS (\n  SELECT merchant_id,\n         MAX(CASE WHEN month_label BETWEEN '2025-01' AND '2025-03' AND succeeded > 0 THEN 1 ELSE 0 END) AS q1,\n         MAX(CASE WHEN month_label BETWEEN '2025-10' AND '2025-12' AND succeeded > 0 THEN 1 ELSE 0 END) AS q4\n  FROM merchant_monthly GROUP BY merchant_id)\nSELECT SUM(q1) AS q1_active, SUM(q1 * q4) AS retained, ROUND(100.0 * SUM(q1 * q4) / SUM(q1), 2) AS retention_pct\nFROM a;" },
  { id: "a4", topic: "Window Functions", level: "Advanced", mins: 11, t: "Retries inside one payment intent", task: "From payment_attempts: intents that needed more than one attempt — payment_intent_id, number of attempts and the final status (status of the highest attempt_number). Sorted by intent id.", tables: ["payment_attempts"], hint: "ROW_NUMBER() OVER (PARTITION BY payment_intent_id ORDER BY attempt_number DESC).",
    sol: "WITH r AS (\n  SELECT payment_intent_id, transaction_status,\n         COUNT(*) OVER (PARTITION BY payment_intent_id) AS n_attempts,\n         ROW_NUMBER() OVER (PARTITION BY payment_intent_id ORDER BY attempt_number DESC) AS rn\n  FROM payment_attempts)\nSELECT payment_intent_id, n_attempts, transaction_status AS final_status\nFROM r WHERE rn = 1 AND n_attempts > 1\nORDER BY payment_intent_id;" },
  { id: "a5", topic: "Aggregations", level: "Advanced", mins: 10, t: "Card-testing attack by hour", task: "For merchant MID106059 on 2025-07-14: hour (first 13 chars of transaction_ts), attempts, succeeded, blocked and average amount (2 dp). Hours in order.", tables: ["payment_attempts"], hint: "SUBSTR(transaction_ts, 1, 13); count statuses with CASE.",
    sol: "SELECT SUBSTR(transaction_ts, 1, 13) AS hour_utc, COUNT(*) AS attempts,\n       SUM(CASE WHEN transaction_status = 'Succeeded' THEN 1 ELSE 0 END) AS succeeded,\n       SUM(CASE WHEN transaction_status = 'Blocked' THEN 1 ELSE 0 END) AS blocked,\n       ROUND(AVG(amount_usd), 2) AS avg_usd\nFROM payment_attempts\nWHERE merchant_id = 'MID106059' AND transaction_ts LIKE '2025-07-14%'\nGROUP BY hour_utc ORDER BY hour_utc;" },
  { id: "a6", topic: "Conditional Logic", level: "Advanced", mins: 10, t: "Settlement equation check", task: "From settlements: rows where net differs from gross − fees − refunds − chargebacks + adjustments by more than 0.05. Return the count.", tables: ["settlements"], hint: "ABS(net − (…)) > 0.05. The clean data returns 0 (monthly sums of balanced payouts).",
    sol: "SELECT COUNT(*) AS breaks\nFROM settlements\nWHERE ABS(net - (gross - fees - refunds - chargebacks + adjustments)) > 0.05;" },
  { id: "a7", topic: "Subqueries", level: "Advanced", mins: 11, t: "Industries with above-average refund value", task: "For the refunds table (12 largest merchants): industry and succeeded refund USD (2 dp) for industries whose refunded amount is above the average per industry. Highest first.", tables: ["refunds", "merchants"], hint: "Aggregate per industry in a CTE, compare with AVG over that CTE.",
    sol: "WITH r AS (\n  SELECT m.industry, SUM(r.refund_usd) AS amt\n  FROM refunds r JOIN merchants m ON m.merchant_id = r.merchant_id\n  WHERE r.refund_status = 'succeeded' GROUP BY m.industry)\nSELECT industry, ROUND(amt, 2) AS refund_usd\nFROM r WHERE amt > (SELECT AVG(amt) FROM r)\nORDER BY amt DESC;" },
  { id: "a8", topic: "Joins", level: "Advanced", mins: 12, t: "Investigation resolution time by source", task: "case_source, closed cases and average days from detected_date to closed_date (1 dp), slowest first.", tables: ["fraud_cases"], hint: "julianday(closed_date) − julianday(detected_date) in SQLite (DATEDIFF in MySQL).",
    sol: "SELECT case_source, COUNT(*) AS closed_cases,\n       ROUND(AVG(julianday(closed_date) - julianday(detected_date)), 1) AS avg_days\nFROM fraud_cases\nWHERE closed_date IS NOT NULL\nGROUP BY case_source\nORDER BY avg_days DESC;" },
];
const ED_KEY = "payflow_editor_v1";
let edDb = null, edLoading = null, edCur = null, psLevel = "All", psTopic = "All", psTable = "All";
function edState() { try { const s = JSON.parse(lsGet(ED_KEY)); return s && s.solved ? s : { solved: {}, drafts: {} }; } catch (e) { return { solved: {}, drafts: {} }; } }
function edSave(s) { lsSet(ED_KEY, JSON.stringify(s)); }
const localDay = (d) => { const x = d || new Date(); return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
function todaysProblems() {
  const day = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
  const pick = (lv, k) => { const L = PRACTICE_PROBLEMS.filter(p => p.level === lv); return L[(day * k) % L.length]; };
  return [pick("Easy", 1), pick("Medium", 3), pick("Advanced", 5)];
}
function solveDays() { const st = edState(); return new Set(Object.values(st.solved)); }
function solveStreak() {
  const set = solveDays(); let n = 0; const d = new Date();
  if (!set.has(localDay(d))) d.setDate(d.getDate() - 1);           // streak survives until today ends
  while (set.has(localDay(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
function loadSqlEngine() {
  if (edDb) return Promise.resolve(edDb);
  if (edLoading) return edLoading;
  edLoading = new Promise((res, rej) => {
    const go = () => window.initSqlJs({}).then(SQL => {
      const db = new SQL.Database(); const T = window.PRACTICE_DB || {};
      db.run("BEGIN");
      Object.entries(T).forEach(([name, t]) => {
        const types = t.cols.map((c, i) => { const vals = t.rows.map(r => r[i]).filter(v => v !== null); if (!vals.length || typeof vals[0] !== "number") return "TEXT"; return vals.every(Number.isInteger) && !/inr|rate|pct/.test(c) ? "INTEGER" : "REAL"; });
        db.run(`CREATE TABLE ${name} (${t.cols.map((c, i) => `"${c}" ${types[i]}`).join(", ")})`);
        const st = db.prepare(`INSERT INTO ${name} VALUES (${t.cols.map(() => "?").join(",")})`);
        t.rows.forEach(r => st.run(r)); st.free();
      });
      db.run("COMMIT"); edDb = db; res(db);
    }).catch(rej);
    const withDb = (cb) => { if (window.PRACTICE_DB) return cb(); const d = document.createElement("script"); d.src = "assets/practice-db.js?v=20261022-pf"; d.onload = cb; d.onerror = () => rej(new Error("Could not load the practice tables")); document.head.appendChild(d); };
    withDb(() => {
      if (window.initSqlJs) go();
      else { const s = document.createElement("script"); s.src = "assets/vendor/sql-asm.js"; s.onload = go; s.onerror = () => rej(new Error("Could not load the SQL engine")); document.head.appendChild(s); }
    });
  });
  return edLoading;
}
function edRun(sql) { const res = edDb.exec(sql); return res.length ? res[res.length - 1] : { columns: [], values: [] }; }
function edNorm(r, ordered) {
  const rows = r.values.map(row => row.map(v => v === null ? "∅" : (typeof v === "number" ? (Math.round(v * 100) / 100).toFixed(2) : String(v).trim())).join("¦"));
  return ordered ? rows : rows.slice().sort();
}
function edTable(r) {
  if (!r.columns.length) return `<div class="ed-empty">Query ran. No rows returned.</div>`;
  const head = `<tr>${r.columns.map(c => `<th>${esc(c)}</th>`).join("")}</tr>`;
  const body = r.values.slice(0, 200).map(row => `<tr>${row.map(v => `<td>${v === null ? '<span class="ed-null">NULL</span>' : esc(typeof v === "number" ? (Number.isInteger(v) ? v.toLocaleString("en-IN") : (Math.round(v * 100) / 100).toLocaleString("en-IN")) : v)}</td>`).join("")}</tr>`).join("");
  return `<div class="ed-rowcount">${r.values.length} row${r.values.length === 1 ? "" : "s"}${r.values.length > 200 ? " (showing 200)" : ""}</div><div class="ed-table-wrap"><table class="dtable ed-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}
const lvlBadge = (l) => `<span class="lvl lvl-${l.toLowerCase()}">${l === "Medium" ? "Med." : l === "Advanced" ? "Hard" : l}</span>`;

/* ---------------- Problemset (browse) ---------------- */
function renderProblemset() {
  const rowsEl = document.getElementById("ps-rows"); if (!rowsEl) return;
  const st = edState(); const solvedN = Object.keys(st.solved).length; const today = todaysProblems();
  document.getElementById("ps-progress").textContent = `${solvedN} / ${PRACTICE_PROBLEMS.length} Solved`;
  document.getElementById("ps-streak").textContent = `${solveStreak()} day streak · ${today.filter(p => st.solved[p.id]).length}/3 of today's set`;
  document.getElementById("ps-today-sub").textContent = today.map(p => p.t).join(" · ");
  const topics = ["All", ...new Set(PRACTICE_PROBLEMS.map(p => p.topic))];
  document.getElementById("ps-topics").innerHTML = topics.map(t => `<button class="ps-chip ${t === psTopic ? "on" : ""}" data-topic="${esc(t)}">${t === "All" ? "All Topics" : esc(t)} <small>(${t === "All" ? PRACTICE_PROBLEMS.length : PRACTICE_PROBLEMS.filter(p => p.topic === t).length})</small></button>`).join("");
  const tabs = ["All", "merchants", "merchant_monthly", "method_monthly", "payment_attempts", "refunds", "disputes", "fraud_cases", "settlements"];
  const tlabel = { All: "All Tables", merchants: "Merchants", merchant_monthly: "Merchant × month", method_monthly: "Methods", payment_attempts: "Attempts", refunds: "Refunds", disputes: "Disputes", fraud_cases: "Fraud cases", settlements: "Settlements" };
  document.getElementById("ps-tables").innerHTML = tabs.map(t => `<button class="ps-disc ${t === psTable ? "on" : ""}" data-tab="${t}">${tlabel[t]}</button>`).join("");
  document.getElementById("ps-levels").innerHTML = ["All", "Easy", "Medium", "Advanced"].map(l => `<button class="${l === psLevel ? "on" : ""}" data-lv="${l}">${l === "Advanced" ? "Hard" : l}</button>`).join("");
  const q = (document.getElementById("ps-search").value || "").toLowerCase(); const stf = document.getElementById("ps-status").value;
  const list = PRACTICE_PROBLEMS.map((p, i) => ({ ...p, n: i + 1 })).filter(p => (psLevel === "All" || p.level === psLevel) && (psTopic === "All" || p.topic === psTopic) && (psTable === "All" || p.tables.includes(psTable))
    && (!q || (p.n + " " + p.t + " " + p.task).toLowerCase().includes(q)) && (stf === "all" || (stf === "done") === !!st.solved[p.id]));
  rowsEl.innerHTML = list.length ? list.map(p => `<tr data-open="${p.id}">
      <td>${st.solved[p.id] ? '<span class="ps-st done">✓</span>' : '<span class="ps-st"></span>'}</td>
      <td><div class="ps-title">${p.n}. ${esc(p.t)}${today.some(x => x.id === p.id) ? ' <span class="ps-todaytag">TODAY</span>' : ""}</div><div class="ps-tags"><span class="ps-tag2">▤ SQL</span>${p.tables.map(t => `<span class="ps-tag2 grey">${t}</span>`).join("")}</div></td>
      <td class="ps-time">${p.mins} min</td><td>${lvlBadge(p.level)}</td><td class="ps-arrow">→</td></tr>`).join("")
    : `<tr><td colspan="5" class="ed-empty">No problems match these filters.</td></tr>`;
  rowsEl.querySelectorAll("[data-open]").forEach(r => r.addEventListener("click", () => openProblem(r.dataset.open)));
  document.querySelectorAll("#ps-topics [data-topic]").forEach(b => b.addEventListener("click", () => { psTopic = b.dataset.topic; renderProblemset(); }));
  document.querySelectorAll("#ps-tables [data-tab]").forEach(b => b.addEventListener("click", () => { psTable = b.dataset.tab; renderProblemset(); }));
  document.querySelectorAll("#ps-levels [data-lv]").forEach(b => b.addEventListener("click", () => { psLevel = b.dataset.lv; renderProblemset(); }));
  renderCalendar();
  const tl = document.getElementById("ps-tablelist");
  if (tl) tl.innerHTML = Object.entries(window.PRACTICE_DB || {}).map(([n, t]) => `<div class="ps-tl"><code>${n}</code><span>${t.rows.length} rows · ${t.cols.length} cols</span></div>`).join("");
}
function renderCalendar() {
  const w = document.getElementById("ps-cal"); if (!w) return;
  const days = solveDays(); const now = new Date(); const y = now.getFullYear(), m = now.getMonth();
  const first = new Date(y, m, 1).getDay(), n = new Date(y, m + 1, 0).getDate(); const todayN = now.getDate();
  let cells = ""; for (let i = 0; i < first; i++) cells += "<span></span>";
  for (let d = 1; d <= n; d++) { const key = localDay(new Date(y, m, d)); cells += `<span class="${d === todayN ? "today" : ""} ${days.has(key) ? "solved" : ""}">${d}</span>`; }
  let last7 = 0; for (let i = 0; i < 7; i++) { const d = new Date(); d.setDate(d.getDate() - i); if (days.has(localDay(d))) last7++; }
  const solvedToday = days.has(localDay());
  w.innerHTML = `<div class="ps-cal-head"><span class="ps-fire">🔥</span><div><strong>${now.toLocaleDateString("en-IN", { month: "long", year: "numeric" }).toUpperCase()}</strong><small>${days.size} days solved · ${solveStreak()} day streak</small></div><span class="ps-badge ${solvedToday ? "ok" : ""}">${solvedToday ? "Done today" : "Not yet today"}</span></div>
    <div class="ps-cal-grid">${["S", "M", "T", "W", "T", "F", "S"].map(x => `<b>${x}</b>`).join("")}${cells}</div>
    <div class="ps-cal-foot"><span>Last 7 days</span><strong>${last7} / 7 Days</strong></div><div class="ps-cal-bar"><i style="width:${Math.round(last7 / 7 * 100)}%"></i></div>`;
}

/* ---------------- Solve view ---------------- */
function renderSchema() {
  const w = document.getElementById("ed-schema"); if (!w) return;
  const T = window.PRACTICE_DB || {};
  w.innerHTML = Object.entries(T).map(([n, t]) => `<details ${edCur && edCur.tables.includes(n) ? "open" : ""}><summary><code>${n}</code> <span>${t.rows.length} rows</span></summary><div class="ed-cols">${t.cols.map(c => `<button class="ed-col" data-ins="${c}">${c}</button>`).join("")}</div></details>`).join("");
  w.querySelectorAll("[data-ins]").forEach(b => b.addEventListener("click", () => { const ta = document.getElementById("ed-sql"); const p = ta.selectionStart; ta.value = ta.value.slice(0, p) + b.dataset.ins + ta.value.slice(ta.selectionEnd); ta.focus(); ta.selectionStart = ta.selectionEnd = p + b.dataset.ins.length; }));
}
function showBrowse() { const b = document.getElementById("ed-browse"), s = document.getElementById("ed-solve"); if (!b) return; b.style.display = ""; s.style.display = "none"; renderProblemset(); }
function openProblem(id) {
  initEditor();
  edCur = PRACTICE_PROBLEMS.find(p => p.id === id) || PRACTICE_PROBLEMS[0];
  document.getElementById("ed-browse").style.display = "none"; document.getElementById("ed-solve").style.display = "";
  const st = edState(); const idx = PRACTICE_PROBLEMS.indexOf(edCur);
  document.getElementById("ed-pos").textContent = `Problem ${idx + 1} of ${PRACTICE_PROBLEMS.length} · ${edCur.topic}`;
  document.getElementById("ed-title").innerHTML = `${lvlBadge(edCur.level)} ${idx + 1}. ${esc(edCur.t)} <span class="ed-mins">⏱ ${edCur.mins} min</span>${st.solved[edCur.id] ? ' <span class="ps-badge ok">Solved</span>' : ""}`;
  document.getElementById("ed-task").textContent = edCur.task;
  document.getElementById("ed-tables").innerHTML = "Tables: " + edCur.tables.map(t => `<code>${t}</code>`).join(" ");
  document.getElementById("ed-sql").value = st.drafts[edCur.id] || `-- ${edCur.t}\nSELECT *\nFROM ${edCur.tables[0]}\nLIMIT 10;`;
  document.getElementById("ed-out").innerHTML = `<div class="ed-empty">Write your query, then press <kbd>Run</kbd> (Ctrl + Enter) and <kbd>Submit</kbd>.</div>`;
  document.getElementById("ed-msg").innerHTML = "";
  renderSchema(); window.scrollTo({ top: 0, behavior: "auto" });
}
function edMsg(kind, html) { document.getElementById("ed-msg").innerHTML = `<div class="ed-msg ${kind}">${html}</div>`; }
function initEditor() {
  const run = document.getElementById("ed-run"); if (!run) return;
  if (!window.PRACTICE_DB) { if (!initEditor._loading) { initEditor._loading = true; const d = document.createElement("script"); d.src = "assets/practice-db.js?v=20261022-pf"; d.onload = () => { initEditor._loading = false; if (run._b) renderProblemset(); else initEditor(); }; document.head.appendChild(d); } }
  if (run._b) { if (document.getElementById("ed-solve").style.display === "none") renderProblemset(); return; }
  run._b = true;
  const ta = document.getElementById("ed-sql");
  const withDb = (fn) => { edMsg("info", "⏳ Loading the SQL engine (first time only)…"); loadSqlEngine().then(() => { document.getElementById("ed-msg").innerHTML = ""; fn(); }).catch(e => edMsg("bad", "⚠ " + esc(e.message) + ". Open the site from a web server (or check your connection)."));
  };
  const doRun = () => withDb(() => { const st = edState(); st.drafts[edCur.id] = ta.value; edSave(st);
    try { document.getElementById("ed-out").innerHTML = edTable(edRun(ta.value)); } catch (e) { edMsg("bad", "❌ " + esc(e.message)); } });
  run.addEventListener("click", doRun);
  ta.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); doRun(); }
    if (e.key === "Tab") { e.preventDefault(); const p = ta.selectionStart; ta.value = ta.value.slice(0, p) + "  " + ta.value.slice(ta.selectionEnd); ta.selectionStart = ta.selectionEnd = p + 2; }
  });
  document.getElementById("ed-check").addEventListener("click", () => withDb(() => {
    let mine;
    try { mine = edRun(ta.value); } catch (e) { edMsg("bad", "❌ Your query has an error: " + esc(e.message)); return; }
    const exp = edRun(edCur.sol); document.getElementById("ed-out").innerHTML = edTable(mine);
    const ordered = /order\s+by[^()]*;?\s*$/i.test(edCur.sol);
    const ok = mine.columns.length === exp.columns.length && JSON.stringify(edNorm(mine, ordered)) === JSON.stringify(edNorm(exp, ordered));
    if (ok) { const st = edState(); if (!st.solved[edCur.id]) st.solved[edCur.id] = localDay(); st.drafts[edCur.id] = ta.value; edSave(st);
      const t3 = todaysProblems(); const done = t3.filter(p => st.solved[p.id]).length;
      edMsg("good", `✅ Correct · ${done} of 3 today · 🔥 ${solveStreak()} day streak`); renderHeroCards(); }
    else edMsg("bad", `✗ Not quite. Expected ${exp.values.length} row(s) × ${exp.columns.length} column(s); you returned ${mine.values.length} × ${mine.columns.length}. ${mine.columns.length === exp.columns.length ? "Check your values, rounding and filters." : "Check the columns you SELECT."}`);
  }));
  document.getElementById("ed-hint").addEventListener("click", () => edMsg("info", "💡 " + esc(edCur.hint)));
  document.getElementById("ed-solution").addEventListener("click", () => { ta.value = edCur.sol; edMsg("info", "🔓 Solution loaded. Run it and compare with your approach."); });
  document.getElementById("ed-reset").addEventListener("click", () => { const st = edState(); delete st.drafts[edCur.id]; edSave(st); openProblem(edCur.id); });
  document.getElementById("ed-back").addEventListener("click", showBrowse);
  const step = (k) => { const i = PRACTICE_PROBLEMS.indexOf(edCur); openProblem(PRACTICE_PROBLEMS[(i + k + PRACTICE_PROBLEMS.length) % PRACTICE_PROBLEMS.length].id); };
  document.getElementById("ed-prev").addEventListener("click", () => step(-1));
  document.getElementById("ed-next").addEventListener("click", () => step(1));
  document.getElementById("ps-search").addEventListener("input", renderProblemset);
  document.getElementById("ps-status").addEventListener("change", renderProblemset);
  document.getElementById("ps-random").addEventListener("click", () => { const st = edState(); const L = PRACTICE_PROBLEMS.filter(p => !st.solved[p.id]); const pool = L.length ? L : PRACTICE_PROBLEMS; openProblem(pool[Math.floor(Math.random() * pool.length)].id); });
  document.getElementById("ps-today-go").addEventListener("click", () => { const st = edState(); const t = todaysProblems(); openProblem((t.find(p => !st.solved[p.id]) || t[0]).id); });
  renderProblemset();
}

/* ---------------- Hero floating cards (DailySQL-style) ---------------- */
function renderHeroCards() {
  const st = edState(); const t3 = todaysProblems(); const done = t3.filter(p => st.solved[p.id]).length; const streak = solveStreak();
  const c3 = document.getElementById("hero-top-card");
  if (c3) {
    const ch = (K.top_merchants || []).slice(0, 4); const col = ["#1C64F2", "#7C3AED", "#38BDF8", "#0E1A5C"];
    c3.innerHTML = `<div class="hf-top"><span>🏆</span><span class="hf-lv dark">Top merchants by TPV</span></div>${ch.map((r, i) => `<div class="hf-lb"><i style="background:${col[i]}">${esc(r[1][0])}</i><span>${esc(r[1])}</span><b>$${(r[4] / 1e3).toFixed(0)}K</b></div>`).join("")}<div class="hf-foot">From the PayFlow dataset · top 10 = ${K.top10_share}% of TPV</div>`;
  }
}
function renderDailyCard() { renderHeroCards(); }
function renderIntegrity() {
  const t = document.getElementById("integrity-table"); const R = (window.MKT && window.MKT.integrity) || []; if (!t || !R.length) return;
  const ok = R.filter(r => r.ok).length;
  t.innerHTML = `<thead><tr><th>Check</th><th>Relationship / rule</th><th>Result</th><th>Status</th></tr></thead><tbody>${R.map(r => `<tr><td>${esc(r.check)}</td><td><code>${esc(r.relationship)}</code></td><td class="num">${fmtN(r.result)}${r.note ? `<div style="font-size:11.5px;color:var(--ink-muted);">${esc(r.note)}</div>` : ""}</td><td>${r.ok ? '<span class="recon-ok">✓ Pass</span>' : '<span style="color:var(--red);font-weight:700;">✗ Fail</span>'}</td></tr>`).join("")}</tbody><tfoot><tr><td colspan="4"><strong>${ok} / ${R.length} checks pass.</strong></td></tr></tfoot>`;
}
document.addEventListener("DOMContentLoaded", () => {
  renderHeroCards(); renderIntegrity();
  document.querySelectorAll("[data-scroll]").forEach(b => b.addEventListener("click", () => { const t = document.getElementById(b.dataset.scroll); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); }));
  document.querySelectorAll('.ds-announce [data-goto="editor"]').forEach(b => b.addEventListener("click", () => switchView("editor")));
});
/* ============================================================
   Project Schedule & Group Presentation Status  (multi-batch)
   - Several project codes can run at the same time (e.g. P1427 at 12 PM and P1428 at 9 PM),
     each with its own start date, presentation day, start/end time, groups and statuses.
   - Students: see ONLY their own project (the code they chose at check-in): next meeting,
     time, their group's status. Read-only.
   - Trainer (PIN): project tabs to switch between codes, "+ New project" form, edit everything,
     mark every group's presentation for every code, batch dashboard across all codes.
   - Live sync via this site's /api/schedule (Vercel + Upstash); falls back to project-schedule.js.
   ============================================================ */
const SCH_STAGES = [
  { key: "kickoff", t: "Project Kick-off", d: "Problem statement, dataset (18 tables) and KPI walkthrough; groups formed.", week: 0, track: false },
  { key: "excel", t: "Excel Dashboard Presentation", d: "Profiling, FX conversion, KPIs and the Excel dashboard.", week: 1, track: true },
  { key: "tableau", t: "Tableau Dashboard Presentation", d: "Merchant 360° and Fraud & Risk in Tableau, connected to MySQL. SQL QA can be presented this week or next.", week: 2, track: true, sqlqa: true },
  { key: "powerbi", t: "Power BI Dashboard Presentation", d: "The same pages in Power BI, connected to MySQL. Last chance to present SQL QA.", week: 3, track: true, sqlqa: true },
  { key: "final", t: "Final Presentation", d: "8 sections: Group Details → Summary → KPI List → Excel → Tableau → Power BI → SQL Query Image → Key Takeaway.", week: 4, track: true },
];
const SCH_COLS = [["excel", "Excel"], ["tableau", "Tableau"], ["powerbi", "Power BI"], ["sqlqa", "SQL QA"], ["final", "Final"]];
const SCH_ST = { done: ["✅", "Done", "st-done"], pending: ["⏳", "Pending", "st-pending"], absent: ["❌", "Nobody presented", "st-absent"] };
const SCH_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SCH_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SCH_KEY = "payflow", SCH_PNAME = "PayFlow Fintech Analytics Capstone";
const SCH_DRAFT = SCH_KEY + "_schedule_draft_v1", SCH_UNLOCK = SCH_KEY + "_schedule_unlocked", SCH_VIEW = SCH_KEY + "_schedule_view", SCH_PIN = SCH_KEY + "_schedule_pin";
let schEditCode = null, schNewOpen = false;
const SCH_CFG = String(window.PROJECT_SCHEDULE_API || "").trim();
const SCH_AUTO = SCH_CFG.toLowerCase() === "auto";
let SCH_API = SCH_AUTO ? "" : SCH_CFG;
let schRemote = null, schSyncMsg = "", schSaveTimer = null, schLoaded = !SCH_API;
function schProbe() {
  if (!SCH_AUTO || !/^https?:$/.test(location.protocol)) return;
  fetch("api/schedule?t=" + Date.now(), { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(j => {
    if (!j || j.configured === false || !Array.isArray(j.projects)) return;
    SCH_API = "api/schedule";
    if (schIsTrainer()) { try { if (!sessionStorage.getItem(SCH_PIN)) sessionStorage.removeItem(SCH_UNLOCK); } catch (e) {} }   // keep a server-checked login across reloads
    schRemote = j.projects.length ? j : null; schBase = schRemote ? schClone(schRemote) : null; schLoaded = true;
    renderSchedule(); renderHeroSchedule();
    setInterval(() => { if (!schIsTrainer() || schIdle()) schLoadRemote(true); }, schIsTrainer() ? 30000 : 60000);
  }).catch(() => {});
}
/* 3-way merge so two trainer tabs/devices never overwrite each other's changes */
let schBase = null;
const schJ = (x) => JSON.stringify(x === undefined ? null : x);
const schIsObj = (x) => x && typeof x === "object" && !Array.isArray(x);
function schMerge3(base, mine, theirs) {
  if (schJ(mine) === schJ(base)) return theirs;
  if (schJ(theirs) === schJ(base) || theirs === undefined && base === undefined) return mine;
  if (schIsObj(mine) && schIsObj(theirs)) {
    const out = {}, b = schIsObj(base) ? base : {};
    new Set([...Object.keys(mine), ...Object.keys(theirs)]).forEach(k => { const v = schMerge3(b[k], mine[k], theirs[k]); if (v !== undefined) out[k] = v; });
    return out;
  }
  return mine;
}
function schMergeDocs(base, mine, theirs) {
  const byCode = (d) => { const o = {}; ((d && d.projects) || []).forEach(p => { o[schNorm(p.code)] = p; }); return o; };
  const strip = (d) => { const o = Object.assign({}, d || {}); delete o.projects; delete o.updated; return o; };
  const out = schMerge3(strip(base), strip(mine), strip(theirs)) || {};
  const m = schMerge3(byCode(base), byCode(mine), byCode(theirs)) || {};
  const order = [...((mine && mine.projects) || []), ...((theirs && theirs.projects) || [])].map(p => schNorm(p.code));
  out.projects = [...new Set(order)].filter(c => m[c]).map(c => m[c]);
  out.updated = new Date().toISOString();
  return out;
}
function schIdle() {   // trainer is not in the middle of typing / a form
  const a = document.activeElement; const root = document.getElementById("sch-root");
  if (schNewOpen || document.getElementById("sch-login")) return false;
  return !(a && root && root.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && SCH_API && schIsTrainer() && schIdle()) schLoadRemote(true); });
function schApi(payload) { return fetch(SCH_API, { method: "POST", body: JSON.stringify(payload) }).then(r => r.json()); }
function schLoadRemote(silent) {
  if (!SCH_API) return Promise.resolve();
  return fetch(SCH_API + (SCH_API.includes("?") ? "&" : "?") + "t=" + Date.now()).then(r => r.json()).then(j => {
    if (schIsTrainer() && (schSaveTimer || !schIdle())) return;
    const nx = j && j.projects && j.projects.length ? j : null;
    if (schIsTrainer() && schJ(nx) === schJ(schRemote)) return;          // nothing new: don't re-render under the trainer
    schRemote = nx; schBase = nx ? schClone(nx) : null; schLoaded = true;
    renderSchedule(); renderHeroSchedule();
  }).catch(() => { schLoaded = true; if (!silent) { schSyncMsg = "⚠ Could not load the live schedule. Showing the last published file."; renderSchedule(); } });
}
function schPushRemote(d) {
  schRemote = d; schSyncMsg = "⏳ Saving…"; schShowSync();
  clearTimeout(schSaveTimer);
  schSaveTimer = setTimeout(() => {
    let pin = ""; try { pin = sessionStorage.getItem(SCH_PIN) || ""; } catch (e) {}
    fetch(SCH_API + (SCH_API.includes("?") ? "&" : "?") + "t=" + Date.now(), { cache: "no-store" }).then(r => r.json()).catch(() => null).then(latest => {
      let out = d;
      if (latest && Array.isArray(latest.projects)) {
        out = schMergeDocs(schBase, d, latest);
        if (schJ(out.projects) !== schJ(d.projects)) { schRemote = out; setTimeout(() => { try { renderSchedule(); renderHeroSchedule(); } catch (e) {} }, 0); }
      }
      return schApi({ action: "save", pin, data: out }).then(j => { if (j && j.ok) schBase = schClone(out); return j; });
    }).then(j => {
      schSaveTimer = null;
      schSyncMsg = j.ok ? `✅ Saved ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} · students see it now (on refresh)` : "⚠ Not saved: " + (j.error || "error");
      schShowSync();
    }).catch(() => { schSaveTimer = null; schSyncMsg = "⚠ Not saved: no internet or server not ready. Try again."; schShowSync(); });
  }, 700);
}
function schShowSync() { const e = document.getElementById("sch-sync"); if (e) e.textContent = schSyncMsg; }

/* ---------- tiny SHA-256 (works on file:// too) ---------- */
function sha256(str) {
  const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  const bytes = Array.from(new TextEncoder().encode(str)); const l = bytes.length * 8;
  bytes.push(0x80); while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (l >>> (i * 8)) & 255);
  let H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const r = (x, n) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < bytes.length; o += 64) {
    const w = [];
    for (let i = 0; i < 16; i++) w[i] = (bytes[o + 4 * i] << 24) | (bytes[o + 4 * i + 1] << 16) | (bytes[o + 4 * i + 2] << 8) | bytes[o + 4 * i + 3];
    for (let i = 16; i < 64; i++) { const s0 = r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10); w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0; }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0, t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H = H.map((v, i) => (v + [a, b, c, d, e, f, g, h][i]) | 0);
  }
  return H.map(v => (v >>> 0).toString(16).padStart(8, "0")).join("");
}
const schHash = (pin) => sha256("axon-mkt-trainer|" + pin);   // trainer password hash (same formula as the server)

/* ---------- time helpers ---------- */
const ymd = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
const parseYmd = (s) => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const fmtD = (s) => { const d = parseYmd(s); return `${SCH_DAYS[d.getDay()].slice(0, 3)}, ${d.getDate()} ${SCH_MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
const fmtT = (hm) => { const [h, m] = String(hm).split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
const SCH_TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);
function schParseClock(s) {            // "9:00 PM" → "21:00"
  const m = String(s || "").trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([AaPp])\.?[Mm]?/); if (!m) return null;
  let h = +m[1] % 12; if (/p/i.test(m[3])) h += 12; return `${String(h).padStart(2, "0")}:${m[2] || "00"}`;
}
function schTimes(p) {                 // start/end "HH:MM", migrating old free-text times
  let st = p.start, en = p.end;
  if (!st) { const parts = String(p.time || "").split(/[–\-—to]+/i).map(x => x.trim()).filter(Boolean); st = schParseClock(parts[0]) || "21:00"; en = schParseClock(parts[1]) || null; }
  if (!en) { const [h, m] = st.split(":").map(Number); en = `${String((h + 1) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`; }
  return [st, en];
}
const schTimeLabel = (p) => { const [s, e] = schTimes(p); return `${fmtT(s)} – ${fmtT(e)}`; };
function schStageDates(p) {
  const k = parseYmd(p.kickoff); const out = { kickoff: p.kickoff };
  let first = new Date(k); first.setDate(first.getDate() + 6);
  while (first.getDay() !== Number(p.presDay)) first.setDate(first.getDate() + 1);
  SCH_STAGES.filter(s => s.week > 0).forEach(s => { const d = new Date(first); d.setDate(d.getDate() + 7 * (s.week - 1)); out[s.key] = (p.overrides && p.overrides[s.key]) || ymd(d); });
  if (p.overrides && p.overrides.kickoff) out.kickoff = p.overrides.kickoff;
  return out;
}
function schWindow(p, dateStr) {       // [start, end] Date of the meeting on that day
  const [s, e] = schTimes(p); const d = parseYmd(dateStr);
  const at = (hm) => { const [h, m] = hm.split(":").map(Number); const x = new Date(d); x.setHours(h, m, 0, 0); return x; };
  const a = at(s); let b = at(e); if (b <= a) b = new Date(a.getTime() + 3600000); return [a, b];
}
function schPhase(p, dateStr) {
  const now = new Date(); const [a, b] = schWindow(p, dateStr);
  if (now > b) return ["past", "Completed"];
  if (now >= a) return ["today", "Happening now"];
  if (ymd(a) === ymd(now)) return ["today", "Today, " + fmtT(schTimes(p)[0])];
  const tm = new Date(now); tm.setDate(tm.getDate() + 1);
  if (ymd(a) === ymd(tm)) return ["next", "Tomorrow, " + fmtT(schTimes(p)[0])];
  return (a - now) < 7 * 86400000 ? ["next", "This week"] : ["future", "Upcoming"];
}
function schSoon(p, dateStr) {          // meeting is today or tomorrow (and not over yet) → shown in green
  const now = new Date(); const [a, b] = schWindow(p, dateStr); if (now > b) return false;
  const tm = new Date(now); tm.setDate(tm.getDate() + 1); return ymd(a) === ymd(now) || ymd(a) === ymd(tm);
}
function schNext(p) { const ds = schStageDates(p); const now = new Date(); return SCH_STAGES.find(s => schWindow(p, ds[s.key])[1] >= now) || null; }

/* ---------- data ---------- */
const schClone = (o) => JSON.parse(JSON.stringify(o));
function schPublished() { return schClone(window.PROJECT_SCHEDULE || { pinHash: "", active: "", projects: [] }); }
function schFromHash() {
  const m = location.hash.match(/schedule=([A-Za-z0-9_\-]+)/); if (!m) return null;
  try { return JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, "+").replace(/_/g, "/"))))); } catch (e) { return null; }
}
function schIsTrainer() { try { return sessionStorage.getItem(SCH_UNLOCK) === "1"; } catch (e) { return false; } }
function schDraft() { try { const d = JSON.parse(lsGet(SCH_DRAFT)); return d && d.projects ? d : null; } catch (e) { return null; } }
function schData() {
  if (SCH_API) {
    if (schIsTrainer()) { if (!schRemote) schRemote = schPublished(); return schRemote; }
    const base = schRemote ? schClone(schRemote) : schPublished(); const h = schFromHash();
    if (h && h.code) { base.projects = base.projects.filter(x => x.code !== h.code).concat([h]); base.active = h.code; }
    return base;
  }
  if (schIsTrainer()) return schDraft() || schPublished();
  const pub = schPublished(); const h = schFromHash();
  if (h && h.code) { pub.projects = pub.projects.filter(p => p.code !== h.code).concat([h]); pub.active = h.code; }
  return pub;
}
function schSaveDraft(d) { d.updated = new Date().toISOString(); if (SCH_API) { schPushRemote(d); return; } lsSet(SCH_DRAFT, JSON.stringify(d)); }
const schNorm = (c) => String(c || "").trim().toUpperCase().replace(/\s+/g, "");
function schMe() { try { const m = JSON.parse(lsGet(SCH_KEY + "_student_v1")); return m && m.name ? m : null; } catch (e) { return null; } }
function schCurrent(d) {
  const find = (c) => c && d.projects.find(p => schNorm(p.code) === schNorm(c));
  if (schIsTrainer()) return find(schEditCode) || find(d.active) || d.projects[0] || null;
  const h = schFromHash(); if (h && h.code && find(h.code)) return find(h.code);
  const m = schMe(); if (m && find(m.batch)) return find(m.batch);       // student: only their own project
  let v = null; try { v = lsGet(SCH_VIEW); } catch (e) {}
  return find(v) || find(d.active) || d.projects[0] || null;
}
function schGroupStatus(p, g, key) { const s = (p.status && p.status[g.id]) || {}; return s[key] || "pending"; }
function schCounts(p, key) { const c = { done: 0, pending: 0, absent: 0 }; (p.groups || []).forEach(g => c[schGroupStatus(p, g, key)]++); return c; }
function schNewProject(code, o) {
  o = o || {};
  const fri = new Date(); while (fri.getDay() !== 5) fri.setDate(fri.getDate() - 1);
  const n = Math.max(1, Math.min(20, +o.groups || 6));
  const groups = Array.from({ length: n }, (_, i) => ({ id: "g" + (i + 1), name: "Group " + (i + 1), members: "" }));
  const start = o.start || "21:00", end = o.end || "22:00";
  const p = { code, name: SCH_PNAME, kickoff: o.kickoff || ymd(fri), presDay: o.presDay != null ? +o.presDay : 6, start, end, overrides: {}, groups, status: {} };
  p.time = schTimeLabel(p); return p;
}
function schMyGroup(p) { const m = schMe(); if (!m || !p || schNorm(m.batch) !== schNorm(p.code)) return null; const k = String(m.group || "").trim().toLowerCase(); return (p.groups || []).find(g => String(g.name).trim().toLowerCase() === k) || null; }

/* ---------- rendering ---------- */
const stChip = (s, extra) => `<span class="st-chip ${SCH_ST[s][2]}">${SCH_ST[s][0]} ${SCH_ST[s][1]}${extra || ""}</span>`;
function schBatchesHtml(d, cur) {
  if (!d.projects.length) return "";
  const S = window.VK_SUMMARY && window.VK_SUMMARY.byBatch;
  const rows = d.projects.map(p => {
    const ds = schStageDates(p); const nx = schNext(p); const n = (p.groups || []).length;
    const cell = (k) => { const c = schCounts(p, k); return `<td class="sch-bc ${n && c.done === n ? "all" : ""}">${c.done}/${n}${c.absent ? ` <span title="Nobody from the group presented">❌${c.absent}</span>` : ""}</td>`; };
    const st = S ? (S[schNorm(p.code)] || { n: 0, today: 0 }) : null;
    return `<tr class="${cur && p.code === cur.code ? "sch-cur" : ""}" data-bcode="${esc(p.code)}" title="Open ${esc(p.code)}"><td><b>${esc(p.code)}</b>${p.name ? `<div class="sch-mem">${esc(p.name)}</div>` : ""}</td>
      <td>${SCH_DAYS[p.presDay].slice(0, 3)} · ${esc(schTimeLabel(p))}</td><td>${nx ? `<span class="sch-nx ${schSoon(p, ds[nx.key]) ? "sch-soon" : ""}">${esc(nx.t.replace(" Presentation", ""))}</span><div class="sch-mem">${fmtD(ds[nx.key])}</div>` : "Completed 🎉"}</td><td class="n">${n}</td>
      ${st ? `<td class="n">${st.n}</td><td class="n">${st.today}</td>` : ""}${SCH_COLS.map(([k]) => cell(k)).join("")}</tr>`;
  }).join("");
  return `<div class="card sch-batches" id="sch-batches"><div class="sch-bh"><h3>📊 Batch dashboard</h3><span>${d.projects.length} project code${d.projects.length > 1 ? "s" : ""} running · groups presented / all groups. Click a code to open and edit it.</span></div>
    <div class="table-scroll"><table class="dtable"><thead><tr><th>Project code</th><th>Timing</th><th>Next presentation</th><th>Groups</th>${S ? "<th>Students</th><th>Visited today</th>" : ""}${SCH_COLS.map(([, l]) => `<th>${l}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
}
function schMyCardHtml(p) {
  const m = schMe(); if (!m || schIsTrainer() || !p) return "";
  const g = schMyGroup(p);
  if (!g) return `<div class="card sch-my">👋 <b>${esc(m.name)}</b> · ${esc(p.code)}. Your group (${esc(m.group || "none")}) is not in this project's group list, so your status can't be shown. Click <b>change</b> next to your name in the sidebar and pick your group.</div>`;
  const ds = schStageDates(p); const nx = schNext(p); const st = (p.status && p.status[g.id]) || {};
  const pend = SCH_COLS.filter(([k]) => schGroupStatus(p, g, k) !== "done").map(([, l]) => l);
  return `<div class="card sch-my"><div class="sch-my-h">👋 <b>${esc(m.name)}</b> · <b>${esc(g.name)}</b> · ${esc(p.code)} · every ${SCH_DAYS[p.presDay]}, ${esc(schTimeLabel(p))}</div>
    <div class="sch-my-st">${SCH_COLS.map(([k, l]) => `<span><em>${l}</em> ${stChip(schGroupStatus(p, g, k))}</span>`).join("")}</div>
    <p>${pend.length ? `Still pending for your group: <b>${pend.join(", ")}</b>.` : "Your group has presented everything. 🎉"}${nx ? ` Next meeting: <b>${esc(nx.t)}</b> on <b>${fmtD(ds[nx.key])}</b> at <b>${esc(schTimeLabel(p))}</b>${schSoon(p, ds[nx.key]) ? ` <span class="sch-soon-pill">${esc(schPhase(p, ds[nx.key])[1])}</span>` : ""}.` : ""}${st.note ? ` Trainer note: <i>${esc(st.note)}</i>` : ""}</p></div>`;
}
function renderSchedule() {
  const root = document.getElementById("sch-root"); if (!root) return;
  const d = schData(); const p = schCurrent(d); const tr = schIsTrainer(); const me = schMe();
  const mode = document.getElementById("sch-mode");
  if (mode) mode.innerHTML = tr
    ? `<span class="sch-badge tr">🔓 Trainer mode</span><button class="btn-outline" id="sch-lock">Lock</button>`
    : `<span class="sch-badge">👀 Student view (read-only)</span><button class="sch-trainer-link" id="sch-unlock">Trainer login</button>`;
  // students who checked in see only their own project; others can pick
  const picker = !tr && !(me && me.batch && p && schNorm(me.batch) === schNorm(p.code)) && d.projects.length > 1
    ? `<label class="sch-pick">Project code <select id="sch-select">${d.projects.map(x => `<option value="${esc(x.code)}" ${p && x.code === p.code ? "selected" : ""}>${esc(x.code)} · ${esc(schTimeLabel(x))}</option>`).join("")}</select></label>` : "";
  const tabs = tr ? schTabsHtml(d, p) : "";
  if (!p) { root.innerHTML = `${tabs}<div class="card sch-empty">No project has been published yet. ${tr ? "Create one with <b>+ New project</b> above." : "Ask your trainer for the project code."}</div>`; schBind(d, null); return; }
  const ds = schStageDates(p); const nx = schNext(p);
  const timeline = SCH_STAGES.map((s, i) => {
    const [ph, pl] = schPhase(p, ds[s.key]);
    const up = nx && nx.key === s.key; const soon = up && schSoon(p, ds[s.key]);
    const c = s.track ? schCounts(p, s.key) : null;
    const qa = s.sqlqa ? schCounts(p, "sqlqa") : null;
    return `<div class="sch-stage ${ph} ${up ? "sch-upnext" : ""} ${soon ? "sch-soon" : ""}"><div class="sch-dot">${ph === "past" ? "✓" : i}</div><div class="sch-body">
      <div class="sch-when">${fmtD(ds[s.key])} · ${esc(schTimeLabel(p))} <span class="sch-ph ${ph}">${pl}</span>${up ? `<span class="sch-upnext-tag">${soon ? "Up next · get ready" : "Up next"}</span>` : ""}</div>
      <h4>${s.week ? "Week " + s.week + " · " : ""}${esc(s.t)}</h4><p>${esc(s.d)}</p>
      ${c ? `<div class="sch-counts">${stChip("done", ` ${c.done}`)}${stChip("pending", ` ${c.pending}`)}${c.absent ? stChip("absent", ` ${c.absent}`) : ""}</div>` : ""}
      ${s.sqlqa ? `<div class="sch-qa">+ SQL QA (either week): ${qa.done} of ${(p.groups || []).length} groups done</div>` : ""}
    </div></div>`;
  }).join("");
  const mine = schMyGroup(p);
  const rows = (p.groups || []).map(g => {
    const st = (p.status && p.status[g.id]) || {}; const isMine = mine && mine.id === g.id;
    return `<tr class="${isMine ? "sch-mine" : ""}"><td><strong>${esc(g.name)}</strong>${isMine ? ' <span class="sch-you">Your group</span>' : ""}${g.members ? `<div class="sch-mem">${esc(g.members)}</div>` : ""}</td>${SCH_COLS.map(([k]) => `<td>${stChip(schGroupStatus(p, g, k), k === "sqlqa" && st.sqlqaWeek ? ` · ${st.sqlqaWeek === "tableau" ? "Tableau wk" : "Power BI wk"}` : "")}</td>`).join("")}<td class="sch-note">${esc(st.note || "")}</td></tr>`;
  }).join("");
  root.innerHTML = `${tr ? `<div id="sch-batches-wrap">${schBatchesHtml(d, p)}</div>` : ""}${tabs}${picker}${schMyCardHtml(p)}
    <div class="sch-head card"><div><div class="sch-code">${esc(p.code)}</div><h3>${esc(p.name || SCH_PNAME)}</h3>
      <p>Kick-off ${fmtD(ds.kickoff)} · weekly presentations every <strong>${SCH_DAYS[p.presDay]}</strong> · <strong>${esc(schTimeLabel(p))}</strong> · ${(p.groups || []).length} groups</p></div>
      ${nx ? `<div class="sch-next ${schSoon(p, ds[nx.key]) ? "sch-soon" : ""}"><span>Next meeting</span><strong>${esc(nx.t)}</strong><em>${fmtD(ds[nx.key])} · ${esc(schTimeLabel(p))}</em></div>` : `<div class="sch-next done"><span>Status</span><strong>Project completed 🎉</strong></div>`}</div>
    <div class="sch-timeline">${timeline}</div>
    <div class="section-head mt-40" style="margin-bottom:12px;"><div class="eyebrow">Group status · ${esc(p.code)}</div><h2>Who has presented what</h2><p>✅ Done · ⏳ Pending · ❌ Nobody from the group presented in the meeting. SQL QA can be presented in the Tableau week or the Power BI week.</p></div>
    <div class="card table-scroll"><table class="dtable sch-table"><thead><tr><th>Group</th>${SCH_COLS.map(([, l]) => `<th>${l}</th>`).join("")}<th>Trainer note</th></tr></thead><tbody>${rows || `<tr><td colspan="7">No groups yet.</td></tr>`}</tbody></table></div>
    <p class="sch-upd">Last updated by trainer: ${p.updated ? new Date(p.updated).toLocaleString("en-IN") : "—"}</p>
    ${tr ? schAdminHtml(d, p) : ""}`;
  schBind(d, p);
}
const schSel = (id, opts, v, attrs) => `<select id="${id}" ${attrs || ""}>${opts.map(([val, lab]) => `<option value="${val}" ${String(val) === String(v) ? "selected" : ""}>${lab}</option>`).join("")}</select>`;
const schTimeOpts = SCH_TIMES.map(t => [t, fmtT(t)]);
function schTabsHtml(d, p) {
  const fri = new Date(); while (fri.getDay() !== 5) fri.setDate(fri.getDate() - 1);
  return `<div class="card sch-ptabs"><div class="sch-ptabs-row"><span class="sch-ptabs-l">Projects</span>
    ${d.projects.map(x => `<button type="button" class="sch-ptab ${p && x.code === p.code ? "on" : ""}" data-bcode="${esc(x.code)}"><b>${esc(x.code)}</b><small>${SCH_DAYS[x.presDay].slice(0, 3)} ${esc(fmtT(schTimes(x)[0]))}</small></button>`).join("")}
    <button type="button" class="sch-ptab add" id="sch-newopen">＋ New project</button></div>
    <div class="sch-newform" id="sch-newform" ${schNewOpen || !d.projects.length ? "" : "hidden"}>
      <h4>Start a new project</h4>
      <div class="sch-grid">
        <label>Project code<input class="search-input" id="sch-n-code" placeholder="e.g. P1428" maxlength="20"></label>
        <label>Kick-off date<input type="date" id="sch-n-kick" value="${ymd(fri)}"></label>
        <label>Presentation day ${schSel("sch-n-day", SCH_DAYS.map((x, i) => [i, x]), 6)}</label>
        <label>Start time ${schSel("sch-n-start", schTimeOpts, "21:00")}</label>
        <label>End time ${schSel("sch-n-end", schTimeOpts, "22:00")}</label>
        <label>Number of groups<input type="number" id="sch-n-groups" min="1" max="20" value="6"></label>
      </div>
      <div class="sch-row"><button class="btn-blue" id="sch-n-create">Create project</button><button class="btn-outline" id="sch-n-cancel">Cancel</button><span class="sch-n-err" id="sch-n-err"></span></div>
    </div></div>`;
}
function schAdminHtml(d, p) {
  const ds = schStageDates(p); const [st0, en0] = schTimes(p);
  const stSel = (gid, key, v) => `<select data-st="${gid}|${key}" class="st-sel ${SCH_ST[v][2]}">${Object.entries(SCH_ST).map(([s, [i, l]]) => `<option value="${s}" ${s === v ? "selected" : ""}>${i} ${l}</option>`).join("")}</select>`;
  const groups = (p.groups || []).map(g => { const st = (p.status && p.status[g.id]) || {};
    return `<tr><td><input data-gname="${g.id}" value="${esc(g.name)}"><input data-gmem="${g.id}" value="${esc(g.members || "")}" placeholder="Members (optional)"></td>
      ${SCH_COLS.map(([key]) => `<td>${stSel(g.id, key, st[key] || "pending")}${key === "sqlqa" ? `<select data-qaw="${g.id}">${[["", "Week?"], ["tableau", "Tableau wk"], ["powerbi", "Power BI wk"]].map(([v, l]) => `<option value="${v}" ${(st.sqlqaWeek || "") === v ? "selected" : ""}>${l}</option>`).join("")}</select>` : ""}</td>`).join("")}
      <td><input data-gnote="${g.id}" value="${esc(st.note || "")}" placeholder="Note"></td><td><button class="sch-del" data-gdel="${g.id}" title="Remove group">✕</button></td></tr>`; }).join("");
  return `<div class="card sch-admin">
    <div class="sch-admin-head"><h3>🔓 Trainer controls · <span class="sch-code">${esc(p.code)}</span></h3>${SCH_API ? `<span class="sch-live">☁ Live sync ON: every change saves automatically and students see it.</span>` : `<span>Changes save on this device. Students see them only after you <strong>Publish</strong> (or set up Live sync).</span>`}</div>
    ${SCH_API ? `<div class="sch-sync" id="sch-sync">${esc(schSyncMsg || "☁ Connected")}</div>` : ""}
    <div class="sch-grid">
      <label>Project code<input class="search-input" id="sch-code" value="${esc(p.code)}"></label>
      <label>Project name<input class="search-input" id="sch-name" value="${esc(p.name || "")}"></label>
      <label>Kick-off date<input type="date" id="sch-kick" value="${esc(ds.kickoff)}"></label>
      <label>Presentation day ${schSel("sch-pd", SCH_DAYS.map((x, i) => [i, x]), p.presDay)}</label>
      <label>Start time ${schSel("sch-start", schTimeOpts, st0)}</label>
      <label>End time ${schSel("sch-end", schTimeOpts, en0)}</label>
    </div>
    <p class="sch-hint">Weekly dates are worked out from the kick-off date and the presentation day. After a meeting's end time has passed, the next one becomes "Up next" automatically.</p>
    <details class="sch-over"><summary>Change a single presentation date (holiday, reschedule)</summary><div class="sch-grid">${SCH_STAGES.filter(s => s.week > 0).map(s => `<label>${s.t}<input type="date" data-over="${s.key}" value="${ds[s.key]}"></label>`).join("")}<button class="btn-outline" id="sch-clearover">Reset to weekly dates</button></div></details>
    <h4 style="margin:16px 0 8px;">Groups & presentation status · ${esc(p.code)}</h4>
    <div class="table-scroll"><table class="dtable sch-edit"><thead><tr><th>Group</th>${SCH_COLS.map(([, l]) => `<th>${l}</th>`).join("")}<th>Note</th><th></th></tr></thead><tbody>${groups}</tbody></table></div>
    <div class="sch-row"><button class="btn-outline" id="sch-addg">+ Add group</button><button class="btn-outline" id="sch-reset">↺ Reset all statuses</button><button class="btn-outline" id="sch-delp">🗑 Delete ${esc(p.code)}</button><button class="btn-outline" id="sch-pin">Change password</button>${SCH_API ? `<button class="btn-outline" id="sch-reload">⟳ Reload from server</button>` : `<button class="btn-outline" id="sch-discard">Load live file (discard draft)</button>`}</div>
    <div class="sch-publish" ${SCH_API ? 'style="display:none"' : ""}>
      <div><strong>Publish to students</strong><p>1) Download <code>project-schedule.js</code> → 2) replace that file in the site folder (GitHub / Vercel / hosting) → students see the update. Or share a link right now (works for the selected project).</p></div>
      <div class="sch-row"><button class="btn-blue" id="sch-download">⬇ Download project-schedule.js</button><button class="btn-dark" id="sch-link">🔗 Copy student link</button></div>
    </div></div>`;
}
/* ---------- trainer login (username + password) ---------- */
const SCH_USER = "mahendra";
function schLoginDialog() {
  if (document.getElementById("sch-login")) return;
  const ov = document.createElement("div"); ov.id = "sch-login"; ov.className = "sch-login-ov";
  ov.innerHTML = `<form class="sch-login" autocomplete="on"><h3>🔐 Trainer login</h3><p>Only the trainer can edit projects, dates and group statuses.</p>
    <label>Username<input id="sch-l-user" name="username" autocomplete="username" required></label>
    <label>Password<input id="sch-l-pass" name="password" type="password" autocomplete="current-password" required></label>
    <div class="sch-l-err" id="sch-l-err"></div>
    <div class="sch-row"><button class="btn-blue" type="submit" id="sch-l-go">Log in</button><button class="btn-outline" type="button" id="sch-l-cancel">Cancel</button></div></form>`;
  document.body.appendChild(ov);
  const q = (id) => ov.querySelector("#" + id); setTimeout(() => q("sch-l-user").focus(), 50);
  const close = () => ov.remove();
  q("sch-l-cancel").onclick = close; ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
  const ok = (pass) => {
    try { sessionStorage.setItem(SCH_UNLOCK, "1"); sessionStorage.setItem(SCH_PIN, pass); } catch (e) {}
    close(); if (SCH_API && !schRemote) { schRemote = schDraft() || schPublished(); schSaveDraft(schRemote); }
    if (SCH_API) schSyncMsg = "☁ Connected · changes save automatically";
    renderSchedule(); renderHeroSchedule(); try { window.dispatchEvent(new Event("hub-trainer")); } catch (e) {}
  };
  ov.querySelector("form").addEventListener("submit", (e) => {
    e.preventDefault(); const user = q("sch-l-user").value.trim(), pass = q("sch-l-pass").value; const err = (t) => { q("sch-l-err").textContent = t; };
    if (!user || !pass) return err("Enter username and password.");
    if (SCH_API) {
      q("sch-l-go").disabled = true;
      schApi({ action: "check", user, pin: pass }).then(j => { q("sch-l-go").disabled = false; if (!j.ok) return err(j.error || "Wrong username or password."); ok(pass); })
        .catch(() => { q("sch-l-go").disabled = false; err("Could not reach the live sync server. Check your internet and try again."); });
      return;
    }
    if (user.toLowerCase() === SCH_USER && (schHash(pass) === schPublished().pinHash || (schDraft() && schHash(pass) === schDraft().pinHash))) { if (!schDraft()) schSaveDraft(schPublished()); ok(pass); }
    else err("Wrong username or password.");
  });
}
window.schTrainerLogin = schLoginDialog;
function schBind(d, p) {
  const $ = (id) => document.getElementById(id);
  const save = () => { if (p) { p.time = schTimeLabel(p); p.updated = new Date().toISOString(); } schSaveDraft(d); renderSchedule(); renderHeroSchedule(); };
  const selEl = $("sch-select");
  if (selEl) selEl.addEventListener("change", () => { lsSet(SCH_VIEW, selEl.value); renderSchedule(); renderHeroSchedule(); });
  document.querySelectorAll("#sch-root [data-bcode]").forEach(r => r.addEventListener("click", () => {
    const c = r.dataset.bcode; if (schIsTrainer()) { schEditCode = c; d.active = c; } else lsSet(SCH_VIEW, c); renderSchedule(); renderHeroSchedule();
  }));
  const un = $("sch-unlock"); if (un) un.onclick = schLoginDialog;
  const lk = $("sch-lock"); if (lk) lk.onclick = () => { try { sessionStorage.removeItem(SCH_UNLOCK); sessionStorage.removeItem(SCH_PIN); } catch (e) {} schEditCode = null; renderSchedule(); renderHeroSchedule(); };
  if (!schIsTrainer()) return;
  const on = (id, ev, fn) => { const e = $(id); if (e) e.addEventListener(ev, fn); };
  // new project form
  on("sch-newopen", "click", () => { schNewOpen = true; const f = $("sch-newform"); if (f) { f.hidden = false; $("sch-n-code").focus(); } });
  on("sch-n-cancel", "click", () => { schNewOpen = false; const f = $("sch-newform"); if (f) f.hidden = true; });
  on("sch-n-create", "click", () => {
    const err = (t) => { $("sch-n-err").textContent = t; };
    const code = $("sch-n-code").value.trim().toUpperCase().replace(/\s+/g, "");
    if (!/^[A-Z0-9-]{2,20}$/.test(code)) return err("Enter a project code like P1428.");
    if (d.projects.some(x => schNorm(x.code) === code)) return err(code + " already exists. Click its tab to open it.");
    const s = $("sch-n-start").value, e = $("sch-n-end").value; if (e <= s) return err("End time must be after the start time.");
    d.projects.push(schNewProject(code, { kickoff: $("sch-n-kick").value, presDay: $("sch-n-day").value, start: s, end: e, groups: $("sch-n-groups").value }));
    d.active = code; schEditCode = code; schNewOpen = false; schSaveDraft(d); renderSchedule(); renderHeroSchedule();
  });
  if (!p) return;
  on("sch-code", "change", (e) => { const v = e.target.value.trim().toUpperCase().replace(/\s+/g, ""); if (!v || d.projects.some(x => x !== p && schNorm(x.code) === v)) { alert("Code must be unique."); renderSchedule(); return; } if (d.active === p.code) d.active = v; p.code = v; schEditCode = v; save(); });
  on("sch-name", "change", (e) => { p.name = e.target.value; save(); });
  on("sch-kick", "change", (e) => { if (e.target.value) { p.kickoff = e.target.value; if (p.overrides) delete p.overrides.kickoff; save(); } });
  on("sch-pd", "change", (e) => { p.presDay = +e.target.value; p.overrides = {}; save(); });
  on("sch-start", "change", (e) => { p.start = e.target.value; const [, en] = schTimes(p); if (!p.end || en <= p.start) { const [h, m] = p.start.split(":").map(Number); p.end = `${String((h + 1) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`; } save(); });
  on("sch-end", "change", (e) => { p.start = schTimes(p)[0]; p.end = e.target.value; save(); });
  document.querySelectorAll("[data-over]").forEach(i => i.addEventListener("change", () => { p.overrides = p.overrides || {}; p.overrides[i.dataset.over] = i.value; save(); }));
  on("sch-clearover", "click", () => { p.overrides = {}; save(); });
  const gst = (gid) => { p.status = p.status || {}; p.status[gid] = p.status[gid] || {}; return p.status[gid]; };
  document.querySelectorAll("[data-st]").forEach(s => s.addEventListener("change", () => { const [gid, key] = s.dataset.st.split("|"); gst(gid)[key] = s.value; save(); }));
  document.querySelectorAll("[data-qaw]").forEach(s => s.addEventListener("change", () => { gst(s.dataset.qaw).sqlqaWeek = s.value; save(); }));
  document.querySelectorAll("[data-gnote]").forEach(s => s.addEventListener("change", () => { gst(s.dataset.gnote).note = s.value; save(); }));
  document.querySelectorAll("[data-gname]").forEach(s => s.addEventListener("change", () => { p.groups.find(g => g.id === s.dataset.gname).name = s.value; save(); }));
  document.querySelectorAll("[data-gmem]").forEach(s => s.addEventListener("change", () => { p.groups.find(g => g.id === s.dataset.gmem).members = s.value; save(); }));
  document.querySelectorAll("[data-gdel]").forEach(b => b.addEventListener("click", () => { if (!confirm("Remove this group?")) return; p.groups = p.groups.filter(g => g.id !== b.dataset.gdel); if (p.status) delete p.status[b.dataset.gdel]; save(); }));
  on("sch-addg", "click", () => { const n = (p.groups || []).length + 1; let id = "g" + n; while (p.groups.some(g => g.id === id)) id += "x"; p.groups.push({ id, name: "Group " + n, members: "" }); save(); });
  on("sch-reset", "click", () => { if (confirm("Reset every group's status to Pending for " + p.code + "?")) { p.status = {}; save(); } });
  on("sch-delp", "click", () => { if (!confirm("Delete project " + p.code + "? Its groups and statuses are removed.")) return; d.projects = d.projects.filter(x => x !== p); schEditCode = null; d.active = d.projects[0] ? d.projects[0].code : ""; save(); });
  on("sch-pin", "click", () => { const a = prompt("New trainer password (min 6 characters)"); if (!a) return; if (a.length < 6) { alert("Password must be at least 6 characters."); return; } if (prompt("Type the new password again") !== a) { alert("Passwords don't match."); return; }
    if (SCH_API) { let pin = ""; try { pin = sessionStorage.getItem(SCH_PIN) || ""; } catch (e) {} schApi({ action: "setpin", pin, newPin: a }).then(j => { if (j.ok) { try { sessionStorage.setItem(SCH_PIN, a); } catch (e) {} alert("Password changed. Use the new password from now on."); } else alert(j.error || "Could not change the password."); }).catch(() => alert("Could not reach the server.")); return; } d.pinHash = schHash(a); save(); alert("Password changed. Download and upload project-schedule.js so it applies on the live site."); });
  on("sch-reload", "click", () => { schRemote = null; schLoadRemote(); });
  on("sch-discard", "click", () => { if (!confirm("Discard your unpublished changes on this device and load the live project-schedule.js?")) return; lsSet(SCH_DRAFT, JSON.stringify(schPublished())); schEditCode = null; renderSchedule(); renderHeroSchedule(); });
  on("sch-download", "click", () => {
    d.active = p.code; const out = schClone(d); out.updated = new Date().toISOString();
    const js = "/* Project schedule & group status. Edit it from the site (Trainer login), then replace this file. */\nwindow.PROJECT_SCHEDULE = " + JSON.stringify(out, null, 1) + ";\n";
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([js], { type: "text/javascript" })); a.download = "project-schedule.js"; document.body.appendChild(a); a.click(); a.remove();
  });
  on("sch-link", "click", (e) => {
    const one = schClone(p); one.updated = new Date().toISOString();
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(one)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    copyText(location.href.split("#")[0] + "#schedule=" + b64, e.target, "🔗 Copy student link");
  });
}
/* ---------- hero cards (home) ---------- */
function renderHeroSchedule() {
  const d = schData(); const p = schCurrent(d);
  const c1 = document.getElementById("hero-problem-card"), c2 = document.getElementById("hero-streak-card"), c4 = document.getElementById("hero-today-card");
  if (!p) { [c1, c2, c4].forEach(c => { if (c) c.innerHTML = `<div class="hf-lv dark">PROJECT SCHEDULE</div><p style="margin-top:6px;">Your trainer will publish the schedule here.</p>`; }); return; }
  const ds = schStageDates(p); const nx = schNext(p); const go = () => { if (typeof switchView === "function") switchView("schedule"); };
  if (c1) {
    c1.innerHTML = nx ? `<div class="hf-top"><span class="hf-ic">📅</span><span class="hf-lv">${esc(p.code)}</span><span class="hf-day ${schSoon(p, ds[nx.key]) ? "sch-soon" : ""}">${schPhase(p, ds[nx.key])[1]}</span></div><h5>Next: ${esc(nx.t)}</h5><p>${esc(nx.d)}</p>
      <div class="hf-when">${fmtD(ds[nx.key])}<br><small>${esc(schTimeLabel(p))}</small></div>` : `<div class="hf-top"><span class="hf-ic">🎉</span><span class="hf-lv">${esc(p.code)}</span></div><h5>Project completed</h5><p>All presentations are done.</p>`;
    c1.classList.toggle("sch-soon-card", !!(nx && schSoon(p, ds[nx.key])));
    c1.onclick = go;
  }
  if (c2) {
    const now = new Date();
    const stg = nx && nx.track ? nx : SCH_STAGES.filter(s => s.track).reverse().find(s => schWindow(p, ds[s.key])[0] <= now) || SCH_STAGES[1];
    const c = schCounts(p, stg.key); const n = (p.groups || []).length || 1; const mine = schMyGroup(p);
    const list = mine ? [mine, ...(p.groups || []).filter(g => g.id !== mine.id)] : (p.groups || []);
    c2.innerHTML = `<div class="hf-top"><span>👥</span><span class="hf-lv dark">GROUP STATUS</span><span class="hf-fire">${esc(stg.t.split(" ")[0])}</span></div>
      <div class="hf-big">${c.done}<small>of ${n} groups done</small></div><div class="hf-bar"><i style="width:${Math.round(c.done / n * 100)}%"></i></div>
      ${list.slice(0, 4).map(g => { const s = schGroupStatus(p, g, stg.key); return `<div class="hf-row"><span>${esc(g.name)}${mine && g.id === mine.id ? " (you)" : ""}</span><span class="${s === "done" ? "ok" : ""}">${SCH_ST[s][0]}</span></div>`; }).join("")}
      ${list.length > 4 ? `<div class="hf-foot">+${list.length - 4} more groups</div>` : ""}`;
    c2.onclick = go; c2.style.cursor = "pointer";
  }
  if (c4) {
    c4.innerHTML = `<div class="hf-lv dark" style="margin-bottom:8px;">PROJECT TIMELINE · ${esc(p.code)}</div>${SCH_STAGES.map(s => { const [ph] = schPhase(p, ds[s.key]); const up = nx && nx.key === s.key; return `<div class="hf-li ${ph} ${up ? "sch-upnext" : ""} ${up && schSoon(p, ds[s.key]) ? "sch-soon" : ""}" ${up ? 'title="Up next"' : ""}><span>${ph === "past" ? "✓" : ph === "next" || ph === "today" ? "●" : "○"}</span><span>${esc(s.t.replace(" Presentation", ""))}</span><small>${fmtD(ds[s.key]).replace(/, \d{4}$/, "")}</small></div>`; }).join("")}<div class="hf-foot"><i class="dot"></i> Weekly every ${SCH_DAYS[p.presDay]} · ${esc(schTimeLabel(p))}</div>`;
    c4.onclick = go; c4.style.cursor = "pointer";
  }
}
(function () {
  if (document.getElementById("sch-batch-css")) return;
  const s = document.createElement("style"); s.id = "sch-batch-css";
  s.textContent = `.sch-batches{padding:18px 20px;margin-bottom:16px}.sch-bh{display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:10px}.sch-bh h3{margin:0;font-size:18px}.sch-bh span{font-size:12.5px;color:var(--ink-muted,#666)}
  .sch-batches tr[data-bcode]{cursor:pointer}.sch-batches tr[data-bcode]:hover td{background:rgba(31,158,139,.06)}.sch-batches tr.sch-cur td{background:rgba(31,158,139,.10)}
  .sch-batches td.n,.sch-bc{font-family:var(--mono,monospace);text-align:center}.sch-bc.all{color:#15803D;font-weight:700}
  .sch-you{display:inline-block;font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:20px;background:#DCFCE7;color:#166534;margin-left:4px;vertical-align:middle}
  .sch-my{padding:16px 20px;margin-bottom:16px;border-left:4px solid #1F9E8B!important}
  .sch-my-h{font-size:15px;margin-bottom:10px}.sch-my-st{display:flex;flex-wrap:wrap;gap:8px 16px;margin-bottom:8px}.sch-my-st em{font-style:normal;font-size:12px;color:var(--ink-muted,#666);margin-right:4px}.sch-my p{margin:0;font-size:13.5px}
  tr.sch-mine td{background:rgba(31,158,139,.08)}
  .sch-stage.sch-upnext{background:rgba(250,204,21,.16);border:1px solid rgba(234,179,8,.45);border-radius:14px;padding:12px 14px;margin:4px 0}
  .sch-upnext-tag{display:inline-block;margin-left:6px;font-size:11px;font-weight:700;padding:2px 9px;border-radius:20px;background:#FACC15;color:#422006;vertical-align:middle}
  .hf-li.sch-upnext{background:rgba(250,204,21,.22);border-radius:8px;padding-left:6px;padding-right:6px;font-weight:600}
  .sch-stage.sch-upnext.sch-soon{background:rgba(34,197,94,.15);border-color:rgba(22,163,74,.55)}
  .sch-stage.sch-soon .sch-upnext-tag,.sch-soon-pill{background:#16A34A;color:#fff}
  .sch-nx.sch-soon{background:#16A34A;color:#fff;font-weight:700}
  .sch-stage.sch-soon .sch-ph.next,.sch-stage.sch-soon .sch-ph.today{background:#DCFCE7;color:#15803D}
  .hf-li.sch-soon span:first-child{color:#15803D!important}
  .sch-soon-pill{display:inline-block;font-size:11.5px;font-weight:700;padding:1px 8px;border-radius:20px;margin-left:4px}
  .hf-li.sch-upnext.sch-soon{background:rgba(34,197,94,.22);color:#14532D}
  .hf-day.sch-soon{background:#16A34A!important;color:#fff!important}
  .sch-soon-card{box-shadow:0 0 0 2px rgba(22,163,74,.55),0 10px 28px rgba(22,163,74,.18)!important}
  .sch-next.sch-soon{background:#15803D!important;color:#fff}
  .sch-nx{display:inline-block;background:rgba(250,204,21,.22);border-radius:6px;padding:1px 6px}
  .sch-ptabs{padding:14px 16px;margin-bottom:16px}.sch-ptabs-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.sch-ptabs-l{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-muted,#666);margin-right:4px}
  .sch-ptab{display:inline-flex;flex-direction:column;align-items:flex-start;gap:1px;padding:7px 12px;border-radius:10px;border:1px solid var(--line,#ddd);background:var(--paper-raised,#fff);color:var(--ink,#111);cursor:pointer;font-size:13px;line-height:1.2}
  .sch-ptab small{font-size:11px;color:var(--ink-muted,#666)}.sch-ptab.on{border-color:#1F9E8B;background:rgba(31,158,139,.12);box-shadow:0 0 0 2px rgba(31,158,139,.25)}
  .sch-ptab.add{border-style:dashed;color:#137A6A;font-weight:700;justify-content:center;min-height:42px}
  .sch-newform{margin-top:14px;padding-top:12px;border-top:1px dashed var(--line,#ddd)}.sch-newform h4{margin:0 0 8px}.sch-n-err{color:#DC2626;font-size:13px;align-self:center}
  .sch-newform input[type=date],.sch-newform input[type=number],.sch-admin input[type=date]{padding:8px 10px;border-radius:8px;border:1px solid var(--line,#ddd);background:var(--paper-raised,#fff);color:var(--ink,#111)}
  .sch-hint{font-size:12.5px;color:var(--ink-muted,#666);margin:8px 0 4px}
  .sch-login-ov{position:fixed;inset:0;background:rgba(10,15,30,.55);backdrop-filter:blur(3px);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px}
  .sch-login{background:var(--paper-raised,#fff);color:var(--ink,#111);border-radius:18px;max-width:380px;width:100%;padding:24px;box-shadow:0 24px 60px rgba(0,0,0,.25)}
  .sch-login h3{margin:0 0 6px;font-size:21px}.sch-login p{margin:0 0 12px;font-size:13px;color:var(--ink-muted,#666)}
  .sch-login label{display:block;font-size:12.5px;font-weight:600;margin:10px 0 0;color:var(--ink-muted,#555)}
  .sch-login input{display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:11px 12px;border-radius:10px;border:1px solid var(--line,#ddd);background:var(--paper,#fafafa);color:var(--ink,#111);font-size:15px}
  .sch-l-err{color:#DC2626;font-size:12.5px;min-height:16px;margin:8px 0}
  .sch-newform select,.sch-admin .sch-grid select{padding:8px 10px;border-radius:8px;border:1px solid var(--line,#ddd);background:var(--paper-raised,#fff);color:var(--ink,#111);font-size:13.5px;min-height:38px}`;
  document.head.appendChild(s);
})();
window.addEventListener("hub-student", () => { try { renderSchedule(); renderHeroSchedule(); } catch (e) {} });
window.addEventListener("vk-summary", () => { if (!schIsTrainer()) return; const w = document.getElementById("sch-batches-wrap"); if (!w) return; const d = schData(); w.innerHTML = schBatchesHtml(d, schCurrent(d));
  w.querySelectorAll("[data-bcode]").forEach(r => r.addEventListener("click", () => { schEditCode = r.dataset.bcode; d.active = r.dataset.bcode; renderSchedule(); renderHeroSchedule(); })); });
setInterval(() => { try { if (!schIsTrainer()) renderHeroSchedule(); } catch (e) {} }, 300000);   // roll "Up next" forward after a meeting ends
document.addEventListener("DOMContentLoaded", () => {
  renderSchedule(); renderHeroSchedule();
  if (schFromHash()) setTimeout(() => { if (typeof switchView === "function") switchView("schedule"); }, 50);
  if (SCH_API) { schLoadRemote(); setInterval(() => { if (!schIsTrainer()) schLoadRemote(true); }, 60000); }
  else schProbe();
});
/* ============================================================
   Job Simulator: Incident Room, Broken Dashboard, Stakeholder Simulator
   + cloud progress hook (window.HUB_PROGRESS, used by visit-kit.js)
   Every number below is a PayFlow answer-key value (pf-data.js).
   ============================================================ */
const SIM_KEY = "payflow_sim_v1";
function simState() { try { const s = JSON.parse(lsGet(SIM_KEY)); if (s && typeof s === "object") return Object.assign({ inc: {}, brk: {}, stk: {} }, s); } catch (e) {} return { inc: {}, brk: {}, stk: {} }; }
function simSave(s) { lsSet(SIM_KEY, JSON.stringify(s)); try { window.dispatchEvent(new Event("hub-progress")); } catch (e) {} }
const simPct = (n) => `${Math.round(n)}%`;
const N_ = (n) => Number(n).toLocaleString("en-US");
const CUR_ = (K.fx_currencies || []);
const IB_ = K.story_integration_bug || [];

/* ============================================================
   1) INCIDENT ROOM
   ============================================================ */
const INCIDENTS = [
  { id: "i1", lvl: "Easy", title: `“TPV is $${(K.tpv_naive / 1e6).toFixed(0)} million?!”`, from: "Anita Rao · CFO", time: "Mon 9:05 AM",
    msg: `The finance extract says we processed ${N_(Math.round(K.tpv_naive))} last year. That's 50× what the board pack said. Which number is right before I present on Thursday?`,
    metric: [["Finance extract", N_(Math.round(K.tpv_naive))], ["Board pack", usd(K.tpv)]],
    evidence: [
      { id: "e1", rel: true, t: "Raw amounts by currency", sql: "SELECT currency_code, COUNT(*), SUM(transaction_amount)\nFROM fact_payment GROUP BY currency_code;", res: CUR_.slice(0, 5).map(c => [c[0], `${N_(c[1])} attempts`]), note: "INR is the biggest currency by rows, and ₹1 ≈ $0.011. Adding rupees to dollars inflates the total enormously." },
      { id: "e2", rel: true, t: "Amounts by transaction status", sql: "SELECT s.transaction_status, COUNT(*) FROM fact_payment p\nJOIN dim_transaction_status s USING (transaction_status_id) GROUP BY 1;", res: (K.status_counts || []).map(([k, v]) => [k, N_(v)]), note: `${N_(K.failed + K.pending)} attempts never captured money but were still added.` },
      { id: "e3", rel: true, t: "Converted with dim_fx_rate, Succeeded only", sql: "SELECT SUM(p.transaction_amount * fx.usd_per_unit)\nFROM fact_payment p JOIN dim_fx_rate fx\n  ON fx.rate_date_key = p.transaction_date_key AND fx.currency_code = p.currency_code\nWHERE p.transaction_status_id = 1;", res: [["TPV (USD)", usd(K.tpv)]], note: "This is the governed definition." },
      { id: "e4", rel: false, t: "Merchant count by country", sql: "SELECT country, COUNT(*) FROM dim_merchant GROUP BY country;", res: [["IN", "most merchants"], ["US", "second"]], note: "Interesting, but it doesn't explain a 50× difference." },
    ],
    causes: [["c1", "A duplicate load doubled fact_payment"], ["c2", "The extract added amounts across 8 currencies and included failed attempts", true], ["c3", "The board pack is missing a quarter"], ["c4", "Fees were added to the amounts"], ["c5", "FX rates were applied twice"]],
    fixes: [["f1", `Convert each succeeded payment with dim_fx_rate on its own date and currency: TPV = ${usd(K.tpv)}; publish the definition with the number`, true], ["f2", "Divide the extract by 85"], ["f3", "Only report Indian payments"], ["f4", "Use the average exchange rate of the year on the total"]],
    answer: `Root cause: SUM(transaction_amount) mixed INR, USD, GBP, AED and four more currencies, and counted failed / pending attempts. Converted at each payment's date and currency, succeeded only: <b>${usd(K.tpv)}</b>.`,
    tell: `“The ${(K.tpv_naive / 1e6).toFixed(0)}M figure adds rupees to dollars. Correctly converted, TPV is ${usdM(K.tpv)} — the board pack is right. I've added the definition to the extract so it can't happen again.”` },
  { id: "i2", lvl: "Easy", title: "“Fraud is 40% higher than we thought”", from: "Vikram Shah · Head of Risk", time: "Tue 10:30 AM",
    msg: `Your dashboard shows ${usd(K.cf_amount_case_sum)} of confirmed fraud. Our case tool says less. Did fraud really jump, and which number goes to the risk committee?`,
    metric: [["Dashboard", usd(K.cf_amount_case_sum)], ["Risk team", usd(K.cf_amount)]],
    evidence: [
      { id: "e1", rel: true, t: "Cases vs distinct payments", sql: "SELECT COUNT(*) cases, COUNT(DISTINCT payment_id) payments\nFROM fact_fraud_case WHERE confirmed_fraud_flag = 1;", res: [["confirmed cases", N_(K.cf_cases)], ["distinct payments", N_(K.cf_payments)]], note: "Several cases point at the same payment." },
      { id: "e2", rel: true, t: "One payment, several cases", sql: "SELECT payment_id, case_source, confirmed_fraud_amount FROM fact_fraud_case\nWHERE payment_id = '…';", res: [["risk_review_queue", "same amount"], ["issuer_fraud_report", "same amount"], ["chargeback_fraudulent", "same amount"]], note: `${K.multi_case_payments} payments have 2–3 cases from different sources.` },
      { id: "e3", rel: true, t: "Measure definition on the card", sql: "-- Confirmed Fraud = SUM(fact_fraud_case[confirmed_fraud_amount])", res: [["grain summed", "case"], ["grain needed", "payment"]], note: "The measure sums cases." },
      { id: "e4", rel: false, t: "Monthly payment volume", sql: "SELECT month_label, SUM(tpv_usd) FROM mart_merchant_month GROUP BY 1;", res: [["trend", "steady growth"]], note: "Volume didn't jump; this doesn't explain the gap." },
    ],
    causes: [["c1", "A new fraud ring appeared"], ["c2", "The card sums investigation CASES; one payment can have 2–3 cases", true], ["c3", "Recovered amounts were added"], ["c4", "Currency conversion is missing"], ["c5", "Open cases were counted as confirmed"]],
    fixes: [["f1", "Build vw_confirmed_fraud (one row per payment, MAX amount) and use it everywhere; add a test that cases ≥ payments", true], ["f2", "Divide the total by 1.4"], ["f3", "Delete duplicate cases from the case tool"], ["f4", "Report only the issuer-report cases"]],
    answer: `Root cause: the measure summed ${K.cf_cases} cases instead of ${K.cf_payments} payments. Counted once per payment, confirmed fraud is <b>${usd(K.cf_amount)}</b> (${K.cf_rate_value}% of TPV).`,
    tell: `“Fraud didn't jump. We were counting the same payment up to three times. The correct figure is ${usd(K.cf_amount)}, ${K.cf_rate_value}% of volume. I've fixed the measure.”` },
  { id: "i3", lvl: "Medium", title: `“${SN.integration_bug} says payments keep failing”`, from: "Neha Kulkarni · Merchant Support Lead", time: "Wed 2:15 PM",
    msg: `${SN.integration_bug} escalated: their students can't pay. Is PayFlow down? Should we tell them to switch to UPI?`,
    metric: [["Their success rate (May)", (IB_[4] || [])[4] + "%"], ["Their usual rate", (IB_[3] || [])[4] + "%"]],
    evidence: [
      { id: "e1", rel: true, t: "Success rate by month", sql: "SELECT month_label, SUM(succeeded)/SUM(attempts - pending)\nFROM mart_merchant_month WHERE merchant_id = '" + SI.integration_bug + "' GROUP BY 1;", res: IB_.slice(2, 7).map(r => [MON(r[0]), r[4] + "%"]), note: "Only May dips." },
      { id: "e2", rel: true, t: "Failure reasons by method, 12-May → 3-Jun", sql: "SELECT payment_method_category, failure_reason, COUNT(*) FROM vw_payment\nWHERE merchant_id = '…' AND transaction_timestamp BETWEEN '2025-05-12' AND '2025-06-03' GROUP BY 1, 2;", res: [["Card · authentication_failed", "spike"], ["Card · processing_error", "spike"], ["UPI · any", "normal"]], note: "Only cards and wallets fail, with 3-D Secure errors." },
      { id: "e3", rel: true, t: "Platform-wide success rate in May", sql: "SELECT SUM(is_successful)/COUNT(*) FROM vw_payment WHERE MONTH(transaction_timestamp) = 5;", res: [["all merchants", (MD.month_sr || []).find(x => x[0] === "05") ? (MD.month_sr.find(x => x[0] === "05")[1] + "%") : "normal"]], note: "PayFlow overall was fine — it's one merchant." },
      { id: "e4", rel: false, t: "Refunds at the merchant", sql: "SELECT COUNT(*) FROM fact_refund WHERE merchant_id = '…';", res: [["refunds", "normal"]], note: "Unrelated to failed payments." },
    ],
    causes: [["c1", "PayFlow had an outage in May"], ["c2", "Students ran out of money"], ["c3", "A 3-D Secure integration problem on the merchant's checkout (cards/wallets, 12-May → 3-Jun)", true], ["c4", "Fraudsters targeted the merchant"], ["c5", "UPI was down"]],
    fixes: [["f1", "Share the failure-reason evidence with the merchant's developers, verify their 3DS setup, and add a daily per-merchant success-rate alert", true], ["f2", "Tell them to switch everyone to UPI"], ["f3", "Turn off 3-D Secure for this merchant"], ["f4", "Suspend the merchant"]],
    answer: `Root cause: cards and wallets failed with authentication_failed / processing_error only at ${SN.integration_bug} between 12-May and 3-Jun; the platform and UPI were normal. A checkout integration issue.`,
    tell: `“PayFlow wasn't down. Card payments at ${SN.integration_bug} failed at the 3-D Secure step from 12 May; UPI kept working. Their developers need to fix the 3DS integration — I've sent them the error breakdown.”` },
  { id: "i4", lvl: "Medium", title: "“We haven't been paid since November”", from: `Accounts team · ${SN.payout_failure}`, time: "Thu 11:00 AM",
    msg: "Our sales are fine but nothing has reached our bank account for weeks. Are you holding our money?",
    metric: [["Failed payouts", K.settle_status.find(s => s[0] === "failed")[1] + ""], ["Outstanding (USD)", usd(K.outstanding_payout_usd)]],
    evidence: [
      { id: "e1", rel: true, t: "Settlements by status for the merchant", sql: "SELECT settlement_status, COUNT(*), MIN(expected_payout_date)\nFROM fact_settlement WHERE merchant_id = '" + SI.payout_failure + "' GROUP BY 1;", res: [["paid", "until mid-Nov"], ["failed", "since 18-Nov"]], note: "Payouts flip from paid to failed on one date." },
      { id: "e2", rel: true, t: "payout_failure_reason", sql: "SELECT DISTINCT payout_failure_reason FROM fact_settlement WHERE settlement_status = 'failed' AND merchant_id = '…';", res: [["reason", "account_closed: beneficiary bank account closed"]], note: "The bank rejected the transfers." },
      { id: "e3", rel: false, t: "Merchant risk tier", sql: "SELECT risk_tier, merchant_status FROM dim_merchant WHERE merchant_id = '…';", res: [["status", "Active"], ["risk tier", "Low"]], note: "Not suspended, not held for risk." },
      { id: "e4", rel: false, t: "Sales in December", sql: "SELECT SUM(tpv_usd) FROM mart_merchant_month WHERE merchant_id = '…' AND month_label = '2025-12';", res: [["TPV", "normal"]], note: "Sales are fine — the issue is the payout, not the payments." },
    ],
    causes: [["c1", "PayFlow put the merchant on hold for risk"], ["c2", "The merchant's beneficiary bank account was closed, so every payout since 18-Nov failed", true], ["c3", "The merchant had no sales"], ["c4", "Refunds exceeded charges"], ["c5", "Settlements are weekly"]],
    fixes: [["f1", "Collect and verify new bank details, re-pay the failed settlements, and alert when a merchant has 2+ consecutive failed payouts", true], ["f2", "Wait for the bank to reopen the account"], ["f3", "Suspend the merchant"], ["f4", "Refund all their customers"]],
    answer: `Root cause: payouts to ${SN.payout_failure} fail with 'account_closed' since 18-Nov-2025. The money is owed, not held: ${usd(K.outstanding_payout_usd)} outstanding at the extract.`,
    tell: "“We're not holding your money. Your bank rejected our transfers because the account on file is closed. Please send new verified bank details and we'll re-pay all failed settlements.”" },
  { id: "i5", lvl: "Advanced", title: "“The merchant table doesn't match finance”", from: "Rahul Menon · Finance Controller", time: "Fri 6:10 PM",
    msg: `Your merchant master table adds up to ${usd(K.tpv_fanout || K.tpv * 1.06)} of TPV. Finance says ${usd(K.tpv)}. Which is right?`,
    metric: [["Merchant table total", usd(K.tpv_fanout || K.tpv * 1.06)], ["Finance", usd(K.tpv)]],
    evidence: [
      { id: "e1", rel: true, t: "Rows before and after the joins", sql: "SELECT COUNT(*) FROM vw_payment WHERE is_successful = 1;\nSELECT COUNT(*) FROM vw_payment p LEFT JOIN fact_refund r ON r.payment_id = p.payment_id\n  LEFT JOIN fact_fraud_case f ON f.payment_id = p.payment_id WHERE p.is_successful = 1;", res: [["payments", N_(K.succ)], ["rows after joins", N_(K.rows_fanout || K.succ)]], note: "The join created extra rows." },
      { id: "e2", rel: true, t: "The view's SQL", sql: "SELECT m.merchant_id, SUM(p.amount_usd) tpv, SUM(r.refund_amount) refunds, SUM(f.confirmed_fraud_amount) fraud\nFROM dim_merchant m JOIN vw_payment p … LEFT JOIN fact_refund r … LEFT JOIN fact_fraud_case f … GROUP BY m.merchant_id;", res: [["joins", "payment → refund (1:N) → case (1:N)"]], note: "Payments with several refunds or cases are repeated." },
      { id: "e3", rel: true, t: "Payments with >1 refund or >1 case", sql: "SELECT COUNT(*) FROM (SELECT payment_id FROM fact_refund GROUP BY 1 HAVING COUNT(*) > 1) x;", res: [["multi-refund payments", N_(K.multi_refund_payments)], ["multi-case payments", N_(K.multi_case_payments)]], note: "Each of these duplicates the payment amount." },
      { id: "e4", rel: false, t: "FX rates", sql: "SELECT COUNT(*) FROM dim_fx_rate;", res: [["rows", "8 currencies × each day"]], note: "FX is applied correctly in vw_payment." },
    ],
    causes: [["c1", "Finance excluded some merchants"], ["c2", "FX was applied twice"], ["c3", "Join fan-out: payments joined to refunds and cases before aggregating repeat the payment amount", true], ["c4", "Pending payments were included"], ["c5", "Late-arriving rows were double-loaded"]],
    fixes: [["f1", "Aggregate refunds, cases and payments to merchant (or payment) grain in separate CTEs, then join; add a row-count / SUM test before and after", true], ["f2", "Use SUM(DISTINCT amount_usd)"], ["f3", "Divide by the average number of refunds"], ["f4", "Remove refunds from the table"]],
    answer: `Root cause: fan-out. Joining payments to fact_refund and fact_fraud_case before aggregating repeated each payment once per refund / case. Finance's <b>${usd(K.tpv)}</b> is right.`,
    tell: `“Finance is right at ${usdM(K.tpv)}. My table joined payments to refunds and fraud cases before summing, so payments with several refunds were counted more than once. I've rebuilt it with pre-aggregated CTEs and added a reconciliation check.”` },
];
let incCur = null, incOpened = new Set();
function incBest(id) { const s = simState(); return s.inc[id] ? s.inc[id].best : null; }

/* ============================================================
   1) INCIDENT ROOM
   ============================================================ */
function renderIncidentRoom() {
  const root = document.getElementById("inc-root"); if (!root) return;
  if (!incCur) {
    root.innerHTML = `<div class="js-grid">${INCIDENTS.map((x, i) => { const b = incBest(x.id); return `<button class="card js-case" data-inc="${x.id}">
        <div class="js-case-top"><span class="lvl lvl-${x.lvl.toLowerCase()}">${x.lvl}</span><span class="js-case-n">Incident ${i + 1}</span>${b != null ? `<span class="js-best ${b >= 70 ? "ok" : ""}">Best ${b}%</span>` : ""}</div>
        <h4>🚨 ${x.title}</h4><p>${esc(x.from)}</p><span class="js-open">${b != null ? "Retry" : "Investigate"} →</span></button>`; }).join("")}</div>`;
    root.querySelectorAll("[data-inc]").forEach(b => b.addEventListener("click", () => { incCur = INCIDENTS.find(x => x.id === b.dataset.inc); incOpened = new Set(); renderIncidentRoom(); window.scrollTo({ top: 0 }); }));
    return;
  }
  const x = incCur;
  root.innerHTML = `<button class="btn-outline js-back" id="inc-back">← All incidents</button>
    <div class="card js-alert"><div class="js-alert-h"><span>🚨 DATA INCIDENT</span><small>${esc(x.time)}</small></div>
      <div class="js-msg"><b>${esc(x.from)}</b><p>${esc(x.msg)}</p></div>
      <div class="js-metrics">${x.metric.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("")}</div></div>
    <h4 class="js-step">Step 1 · Collect evidence <small>(open what you need, not everything)</small></h4>
    <div class="js-ev">${x.evidence.map(e => `<div class="card js-evc ${incOpened.has(e.id) ? "open" : ""}" data-ev="${e.id}"><button class="js-evb">${incOpened.has(e.id) ? "▾" : "▸"} ${esc(e.t)}</button>
      ${incOpened.has(e.id) ? `<pre>${esc(e.sql)}</pre><table class="js-res">${e.res.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</table><p class="js-note">${esc(e.note)}</p>` : ""}</div>`).join("")}</div>
    <h4 class="js-step">Step 2 · What is the root cause?</h4>
    <div class="js-opts">${x.causes.map(([id, t]) => `<label class="js-opt"><input type="radio" name="inc-c" value="${id}"> ${esc(t)}</label>`).join("")}</div>
    <h4 class="js-step">Step 3 · How do you fix it and stop it happening again?</h4>
    <div class="js-opts">${x.fixes.map(([id, t]) => `<label class="js-opt"><input type="radio" name="inc-f" value="${id}"> ${esc(t)}</label>`).join("")}</div>
    <h4 class="js-step">Step 4 · Your one-line reply to ${esc(x.from.split(" · ")[0])} <small>(not scored; compare with the model answer)</small></h4>
    <textarea class="js-reply" id="inc-reply" placeholder="Write it the way you would in Slack or email…"></textarea>
    <div class="js-actions"><button class="btn-blue" id="inc-submit">Submit investigation</button></div>
    <div id="inc-result"></div>`;
  root.querySelector("#inc-back").addEventListener("click", () => { incCur = null; renderIncidentRoom(); });
  root.querySelectorAll("[data-ev] .js-evb").forEach(b => b.addEventListener("click", () => { const id = b.parentNode.dataset.ev; if (incOpened.has(id)) incOpened.delete(id); else incOpened.add(id); const c = root.querySelector('input[name="inc-c"]:checked'), f = root.querySelector('input[name="inc-f"]:checked'), r = root.querySelector("#inc-reply").value; renderIncidentRoom(); if (c) root.querySelector(`input[name="inc-c"][value="${c.value}"]`).checked = true; if (f) root.querySelector(`input[name="inc-f"][value="${f.value}"]`).checked = true; root.querySelector("#inc-reply").value = r; }));
  root.querySelector("#inc-submit").addEventListener("click", () => {
    const c = root.querySelector('input[name="inc-c"]:checked'), f = root.querySelector('input[name="inc-f"]:checked');
    if (!c || !f) { root.querySelector("#inc-result").innerHTML = `<div class="ed-msg bad">Pick a root cause and a fix first.</div>`; return; }
    const relOpen = x.evidence.filter(e => e.rel && incOpened.has(e.id)).length, decoys = x.evidence.filter(e => !e.rel && incOpened.has(e.id)).length;
    const cOk = x.causes.find(o => o[0] === c.value)[2] === true, fOk = x.fixes.find(o => o[0] === f.value)[2] === true;
    const ev = Math.max(0, Math.min(20, relOpen * 8) - decoys * 2), sc = Math.round(ev + (cOk ? 50 : 0) + (fOk ? 30 : 0));
    const s = simState(); const prev = s.inc[x.id] || {}; s.inc[x.id] = { best: Math.max(prev.best || 0, sc), last: sc, tries: (prev.tries || 0) + 1, ts: Date.now() }; simSave(s);
    root.querySelector("#inc-result").innerHTML = `<div class="card js-score"><div class="js-score-h"><span>Investigation score</span><b>${sc}%</b></div>
      <div class="js-bars">${[["Evidence", ev, 20], ["Root cause", cOk ? 50 : 0, 50], ["Fix & prevention", fOk ? 30 : 0, 30]].map(([k, v, m]) => `<div class="js-bar"><span>${k}</span><i><em style="width:${v / m * 100}%"></em></i><b>${Math.round(v)}/${m}</b></div>`).join("")}</div>
      <p>${cOk ? "✅" : "❌"} ${x.answer}</p><p>${fOk ? "✅" : "❌"} <b>Fix:</b> ${esc(x.fixes.find(o => o[2])[1])}</p>
      <p class="js-note">${relOpen < 2 ? "Tip: an analyst confirms the cause with evidence before answering. Open the relevant evidence next time." : decoys ? `You opened ${decoys} evidence card(s) that didn't help. That's fine, but be quick to drop a lead that doesn't explain the number.` : "Good evidence trail: you went straight to what explains the number."}</p>
      <div class="js-tell"><b>Model reply to the stakeholder</b><p>${x.tell}</p></div></div>`;
    renderSimSummary();
  });
}

/* ============================================================
   2) BROKEN DASHBOARD
   ============================================================ */
const BROKEN_TILES = [
  { id: "t1", label: "Active Merchants", val: N_(ST_(K.merchant_status, "Active")[1]), bad: true, why: `Counts merchant_status = 'Active' (today's status). Active on the dashboard = ≥1 successful payment in the period: ${K.active}.` },
  { id: "t2", label: "Total Payment Volume", val: "$" + N_(Math.round(K.tpv_naive)), bad: true, why: `Sums transaction_amount across 8 currencies and every status. Correct (USD, succeeded): ${usd(K.tpv)}.` },
  { id: "t3", label: "Processing Revenue", val: usd(K.revenue), bad: false, why: "Correct: fees on succeeded payments, converted to USD." },
  { id: "t4", label: "Payment Success Rate", val: K.success_rate + "%", bad: false, why: "Correct: succeeded ÷ attempts with a final status." },
  { id: "t5", label: "Transactions", val: N_(K.attempts), bad: true, why: `That is attempts, including ${N_(K.retry_attempts)} retries, labelled as transactions. Show intents (${N_(K.intents)}) or rename the card 'Payment attempts'.` },
  { id: "t6", label: "Confirmed Fraud", val: usd(K.cf_amount_case_sum), bad: true, why: `Sums fraud CASES; ${K.multi_case_payments} payments have several. Once per payment: ${usd(K.cf_amount)}.` },
  { id: "t7", label: "Fraud Value Rate", val: K.cf_rate_value + "%", bad: false, why: "Correct: confirmed fraud (per payment) ÷ TPV." },
  { id: "t8", label: "Chargebacks", val: usd(K.dispute_amt_2025), bad: true, why: `That's the disputed amount, including disputes the merchant won and those still pending. Chargebacks (lost + accepted): ${usd(K.chargeback_amt)}.` },
  { id: "t9", label: "Refund Rate", val: K.refund_rate + "%", bad: false, why: "Correct: succeeded refund value ÷ TPV (payment-date cohort)." },
  { id: "t10", label: "Merchant Activation Rate", val: f1(100 * K.activated_cum / K.registered) + "%", bad: true, why: `Activated ÷ all registered merchants since 2021 — no cohort, no window. 2025 cohort, 30-day window: ${K.activation_rate}%.` },
  { id: "t11", label: "Top-10 Merchant Share", val: K.top10_share + "%", bad: false, why: "Correct: top-10 TPV ÷ total TPV." },
];
const BROKEN_CHART = (() => {
  const rows = (K.fx_currencies || []).map(c => [c[0], c[1]]); const tot = rows.reduce((a, r) => a + r[1], 0);
  return { id: "c1", bad: true, title: "Payment volume by currency (share of total)", rows: rows.slice(0, 6).map(([k, v]) => [k, 100 * v / tot]),
    why: `The chart shares are ROW COUNTS per currency, not money, and the tooltip claims 'TPV'. INR has the most rows but the smallest values per row. In USD: ${(MD.currency_tpv_m || []).slice(0, 4).map(([k, v]) => `${k} $${v}M`).join(", ")}…` };
})();
let brkFlags = new Set(), brkDone = false;
function renderBroken() {
  const root = document.getElementById("brk-root"); if (!root) return;
  const best = simState().brk.best;
  const tiles = BROKEN_TILES.map(t => { const f = brkFlags.has(t.id); const cls = brkDone ? (t.bad ? (f ? "hit" : "miss") : (f ? "false" : "okay")) : (f ? "flag" : ""); return `<button class="js-tile ${cls}" data-t="${t.id}"><span>${esc(t.label)}</span><b>${esc(t.val)}</b>${brkDone ? `<small>${t.bad ? (f ? "✅ You caught it" : "❌ Missed") : (f ? "⚠ This one was correct" : "✓ Correct")}</small>` : f ? "<small>🚩 Flagged</small>" : ""}</button>`; }).join("");
  const cf = brkFlags.has("c1"); const ccls = brkDone ? (cf ? "hit" : "miss") : (cf ? "flag" : "");
  root.innerHTML = `<div class="card js-brief"><b>📩 From the CFO's office:</b> “A junior analyst built this one-page snapshot for tomorrow's board review. Something feels off. Flag every number you would NOT present, then submit.”${best != null ? `<span class="js-best ${best >= 70 ? "ok" : ""}">Your best: ${best}%</span>` : ""}</div>
    <div class="card js-dash"><div class="js-dash-h"><span>PayFlow · Merchant &amp; Risk Snapshot · 2025</span><small>click a tile or the chart to flag it</small></div>
      <div class="js-tiles">${tiles}</div>
      <button class="js-chart ${ccls}" data-t="c1"><div class="js-chart-h">${esc(BROKEN_CHART.title)} ${brkDone ? `<small>${cf ? "✅ You caught it" : "❌ Missed"}</small>` : cf ? "<small>🚩 Flagged</small>" : ""}</div>
        ${BROKEN_CHART.rows.map(([s, v]) => `<div class="js-cbar"><span>${s}</span><i><em style="width:${Math.min(100, v * 1.4)}%"></em></i><b>${v.toFixed(1)}%</b></div>`).join("")}</button></div>
    <div class="js-actions">${brkDone ? `<button class="btn-outline" id="brk-reset">↺ Try again</button>` : `<button class="btn-blue" id="brk-submit">Submit review (${brkFlags.size} flagged)</button><button class="btn-outline" id="brk-clear">Clear flags</button>`}</div>
    <div id="brk-result"></div>`;
  root.querySelectorAll("[data-t]").forEach(b => b.addEventListener("click", () => { if (brkDone) return; const id = b.dataset.t; if (brkFlags.has(id)) brkFlags.delete(id); else brkFlags.add(id); renderBroken(); }));
  const sub = root.querySelector("#brk-submit"); if (sub) sub.addEventListener("click", () => {
    const all = BROKEN_TILES.concat([BROKEN_CHART]); const bad = all.filter(t => t.bad);
    const hits = bad.filter(t => brkFlags.has(t.id)).length, falses = all.filter(t => !t.bad && brkFlags.has(t.id)).length;
    const sc = Math.max(0, Math.round((hits - falses) / bad.length * 100));
    const s = simState(); const prev = s.brk || {}; s.brk = { best: Math.max(prev.best || 0, sc), last: sc, tries: (prev.tries || 0) + 1, ts: Date.now() }; simSave(s);
    brkDone = true; renderBroken();
    document.getElementById("brk-result").innerHTML = `<div class="card js-score"><div class="js-score-h"><span>Dashboard QA score</span><b>${sc}%</b></div>
      <p>You caught <b>${hits} of ${bad.length}</b> errors${falses ? ` and flagged <b>${falses}</b> correct number(s) by mistake (−1 each)` : ""}.</p>
      <ul class="js-why">${all.map(t => `<li class="${t.bad ? "bad" : "good"}"><b>${esc(t.label || t.title)}</b> ${t.bad ? "✗" : "✓"} ${esc(t.why)}</li>`).join("")}</ul></div>`;
    renderSimSummary();
  });
  const cl = root.querySelector("#brk-clear"); if (cl) cl.addEventListener("click", () => { brkFlags.clear(); renderBroken(); });
  const rs = root.querySelector("#brk-reset"); if (rs) rs.addEventListener("click", () => { brkFlags.clear(); brkDone = false; renderBroken(); });
}

/* ============================================================
   3) STAKEHOLDER SIMULATOR
   ============================================================ */
const STK_CATS = [["obj", "Business objective"], ["metric", "Metric definition"], ["time", "Time period"], ["scope", "Audience & granularity"], ["rules", "Filters & business rules"]];
const STAKEHOLDERS = [
  { id: "s1", who: "Anita Rao · CFO", ask: "I need a dashboard on merchant performance.",
    qs: [
      ["What decision will this dashboard help you make?", "obj", 18, "Where to focus account managers and pricing next quarter, and how exposed we are to our biggest merchants."],
      ["Who will use it: you, the merchant team, or the board?", "scope", 14, "Me and the Head of Merchant Ops; the RMs use the merchant table."],
      ["Does 'performance' mean volume (TPV), revenue, or success rate?", "metric", 18, "TPV and revenue first, success rate as a health check."],
      ["Should amounts be in USD, converted at each payment's date?", "rules", 14, "Yes — USD at the payment-date rate, never mixed currencies."],
      ["What counts as an 'active' merchant?", "metric", 12, "At least one successful payment in the period."],
      ["Which period, and do you want a comparison?", "time", 16, "2025 by month, with month-over-month and Q4 vs Q3."],
      ["Should merchants that never went live be included?", "scope", 8, "Count them in 'registered', not in performance."],
      ["How often should it refresh?", "time", 6, "Daily is fine; I review it weekly."],
      ["Which colour theme do you like?", "bad", -8, "Use our brand colours. (Not a scoping question.)"],
      ["Can I put all 18 tables on the canvas?", "bad", -8, "No — only what supports the decision."],
      ["Can I connect directly to the CSV files?", "bad", -6, "Use the database so QA can reconcile."],
    ] },
  { id: "s2", who: "Vikram Shah · Head of Risk", ask: "How much fraud do we have?",
    qs: [
      ["Is this for the risk committee, a regulator, or tuning rules?", "obj", 18, "The monthly risk committee — they decide on rule changes."],
      ["Do you mean confirmed fraud only, or also suspected / blocked payments?", "metric", 18, "Confirmed as the headline, suspected shown separately."],
      ["Count it per fraudulent payment or per investigation case?", "rules", 14, "Per payment. Several cases can point at one payment."],
      ["As an amount, or as a rate of volume?", "metric", 12, "Both: amount and fraud ÷ TPV."],
      ["By transaction date or by detection date?", "time", 16, "Transaction date for rates; detection date for the ops view."],
      ["Should recoveries be netted off?", "rules", 10, "Show gross, recovered and net loss."],
      ["Which segments matter: method, industry, amount band, cross-border?", "scope", 10, "All four, plus top merchants."],
      ["Do you want the last 60 days flagged as immature?", "time", 8, "Yes — late chargebacks change them."],
      ["Should I add a word cloud of fraud reasons?", "bad", -8, "No."],
      ["Can I treat declined payments as fraud?", "bad", -10, "No — a decline is not fraud."],
      ["Can I skip QA this month?", "bad", -10, "No. Risk numbers must reconcile."],
    ] },
  { id: "s3", who: "Kiran Bose · Merchant Growth Manager", ask: "Which merchants should my team call?",
    qs: [
      ["What should a call achieve: save volume, upsell, or fix problems?", "obj", 18, "Save declining merchants first, then fix payment problems."],
      ["What does 'declining' mean: month over month or quarter over quarter?", "metric", 16, "Quarter over quarter, at least −20%."],
      ["Should tiny merchants be excluded?", "rules", 14, "Yes — at least $5,000 in the previous quarter."],
      ["Which other warning signs: failure rate, refunds, no recent payments?", "metric", 12, "All three, each with its own threshold."],
      ["One list for the whole team, or per account manager?", "scope", 14, "Per account manager, plus a total."],
      ["How recent should the data be?", "time", 12, "Up to yesterday, refreshed daily."],
      ["Should the reason for each flag be shown?", "scope", 10, "Yes — the RM needs to know what to say."],
      ["Can I rank merchants by their risk tier label?", "bad", -6, "The label is static; use observed behaviour."],
      ["Should I email the list to every merchant?", "bad", -10, "No, it's internal."],
      ["Can we hard-code the thresholds?", "bad", -6, "Make them parameters; we'll tune them."],
    ] },
];

let stkCur = null, stkSel = new Set(), stkDone = false;
const STK_MAX = 6;
function renderStakeholder() {
  const root = document.getElementById("stk-root"); if (!root) return;
  const st = simState();
  if (!stkCur) {
    root.innerHTML = `<div class="js-grid">${STAKEHOLDERS.map((x, i) => { const b = st.stk[x.id] ? st.stk[x.id].best : null; return `<button class="card js-case" data-stk="${x.id}">
      <div class="js-case-top"><span class="js-case-n">Request ${i + 1}</span>${b != null ? `<span class="js-best ${b >= 70 ? "ok" : ""}">Best ${b}%</span>` : ""}</div>
      <h4>💬 “${esc(x.ask)}”</h4><p>${esc(x.who)}</p><span class="js-open">${b != null ? "Retry" : "Clarify the request"} →</span></button>`; }).join("")}</div>`;
    root.querySelectorAll("[data-stk]").forEach(b => b.addEventListener("click", () => { stkCur = STAKEHOLDERS.find(x => x.id === b.dataset.stk); stkSel = new Set(); stkDone = false; renderStakeholder(); window.scrollTo({ top: 0 }); }));
    return;
  }
  const x = stkCur; const order = x.qs.map((q, i) => i).sort((a, b) => ((a * 7 + 3) % x.qs.length) - ((b * 7 + 3) % x.qs.length));
  root.innerHTML = `<button class="btn-outline js-back" id="stk-back">← All requests</button>
    <div class="card js-alert stk"><div class="js-alert-h"><span>💬 NEW REQUEST</span><small>${esc(x.who)}</small></div><div class="js-msg"><p class="js-big">“${esc(x.ask)}”</p></div></div>
    <h4 class="js-step">Before you build anything, pick up to ${STK_MAX} clarifying questions <small>(${stkSel.size}/${STK_MAX} chosen)</small></h4>
    <div class="js-opts">${order.map(i => { const q = x.qs[i]; const on = stkSel.has(i); const cls = stkDone ? (q[1] === "bad" ? (on ? "false" : "") : (on ? "hit" : "")) : ""; return `<label class="js-opt ${cls}"><input type="checkbox" data-q="${i}" ${on ? "checked" : ""} ${stkDone ? "disabled" : ""}> ${esc(q[0])}${stkDone && on ? `<span class="js-reply-a">↳ ${esc(q[3])}</span>` : ""}</label>`; }).join("")}</div>
    <div class="js-actions">${stkDone ? `<button class="btn-outline" id="stk-retry">↺ Try again</button>` : `<button class="btn-blue" id="stk-submit">Send questions</button>`}</div><div id="stk-result"></div>`;
  root.querySelector("#stk-back").addEventListener("click", () => { stkCur = null; renderStakeholder(); });
  root.querySelectorAll("[data-q]").forEach(c => c.addEventListener("change", () => { const i = +c.dataset.q; if (c.checked) { if (stkSel.size >= STK_MAX) { c.checked = false; return; } stkSel.add(i); } else stkSel.delete(i); renderStakeholder(); }));
  const rt = root.querySelector("#stk-retry"); if (rt) rt.addEventListener("click", () => { stkSel = new Set(); stkDone = false; renderStakeholder(); });
  const sb = root.querySelector("#stk-submit"); if (sb) sb.addEventListener("click", () => {
    if (stkSel.size < 3) { root.querySelector("#stk-result").innerHTML = `<div class="ed-msg bad">Ask at least 3 questions.</div>`; return; }
    stkDone = true; const sel = [...stkSel].map(i => x.qs[i]);
    const covered = STK_CATS.map(([c]) => sel.some(q => q[1] === c)); const bad = sel.filter(q => q[1] === "bad");
    const raw = sel.reduce((a, q) => a + q[2], 0); const bestPossible = x.qs.filter(q => q[2] > 0).map(q => q[2]).sort((a, b) => b - a).slice(0, STK_MAX).reduce((a, b) => a + b, 0);
    const sc = Math.max(0, Math.min(100, Math.round(raw / bestPossible * 70 + covered.filter(Boolean).length / STK_CATS.length * 30)));
    const s = simState(); const prev = s.stk[x.id] || {}; s.stk[x.id] = { best: Math.max(prev.best || 0, sc), last: sc, tries: (prev.tries || 0) + 1, ts: Date.now() }; simSave(s);
    renderStakeholder();
    const good = sel.filter(q => q[1] !== "bad");
    document.getElementById("stk-result").innerHTML = `<div class="card js-score"><div class="js-score-h"><span>Requirement quality</span><b>${sc}%</b></div>
      <div class="js-cov">${STK_CATS.map(([c, n], i) => `<span class="${covered[i] ? "ok" : "no"}">${covered[i] ? "✓" : "✗"} ${n}</span>`).join("")}</div>
      ${bad.length ? `<p>⚠ ${bad.length} question(s) didn't help scope the work: ${bad.map(q => `“${esc(q[0])}”`).join(", ")}.</p>` : `<p>✅ Every question you asked helped scope the work.</p>`}
      ${covered.some(v => !v) ? `<p>Missing: ${STK_CATS.filter((c, i) => !covered[i]).map(c => c[1]).join(", ")}. Without these you'd have to guess.</p>` : ""}
      <div class="js-tell"><b>📄 Your requirement brief (from the answers)</b><ul>${good.map(q => `<li><b>${esc(STK_CATS.find(c => c[0] === q[1])[1])}:</b> ${esc(q[3])}</li>`).join("")}</ul></div></div>`;
    renderSimSummary();
  });
}

/* ============================================================
   Summary strip on every simulator page + progress hook
   ============================================================ */
function simScores() {
  const s = simState(); const avg = (o, ids) => { const v = ids.map(i => o[i] && o[i].best).filter(x => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
  return { inc: avg(s.inc, INCIDENTS.map(i => i.id)), incN: INCIDENTS.filter(i => s.inc[i.id]).length, brk: s.brk && s.brk.best != null ? s.brk.best : null, stk: avg(s.stk, STAKEHOLDERS.map(i => i.id)), stkN: STAKEHOLDERS.filter(i => s.stk[i.id]).length };
}
function renderSimSummary() {
  const sc = simScores();
  document.querySelectorAll(".js-summary").forEach(el => {
    el.innerHTML = [["🚨 Incident Room", sc.inc, `${sc.incN}/${INCIDENTS.length} solved`, "incident"], ["🧩 Broken Dashboard", sc.brk, sc.brk != null ? "best score" : "not tried", "broken"], ["💬 Stakeholder", sc.stk, `${sc.stkN}/${STAKEHOLDERS.length} done`, "stakeholder"]]
      .map(([t, v, sub, view]) => `<button class="js-sum" data-goto-sim="${view}"><span>${t}</span><b>${v != null ? v + "%" : "—"}</b><small>${sub}</small></button>`).join("");
    el.querySelectorAll("[data-goto-sim]").forEach(b => b.addEventListener("click", () => switchView(b.dataset.gotoSim)));
  });
}
function mergeObj(a, b) { let ch = false; for (const k in (b || {})) { if (!(k in a)) { a[k] = b[k]; ch = true; } else if (a[k] && typeof a[k] === "object" && b[k] && typeof b[k] === "object" && "ok" in b[k] && b[k].ok && !a[k].ok) { a[k] = b[k]; ch = true; } } return ch; }
window.HUB_PROGRESS = {
  collect() {
    const st = loadState(), ed = edState(), sc = simScores(), sim = simState();
    return { data: { state: st, solved: ed.solved || {}, sim }, summary: { pct: trackScores().overall, sql: Object.keys(ed.solved || {}).length, inc: sc.inc, brk: sc.brk, stk: sc.stk } };
  },
  apply(r) {
    if (!r) return false; let ch = false;
    const st = loadState(); Object.keys(r.state || {}).forEach(k => { if (!st[k] || typeof st[k] !== "object") { st[k] = r.state[k]; ch = true; } else if (mergeObj(st[k], r.state[k])) ch = true; });
    if (ch) saveState(st);
    const ed = edState(); let ech = false; Object.entries(r.solved || {}).forEach(([k, d]) => { if (!ed.solved[k]) { ed.solved[k] = d; ech = true; } }); if (ech) { edSave(ed); ch = true; }
    const sim = simState(); let sch = false;
    ["inc", "stk"].forEach(g => Object.entries((r.sim || {})[g] || {}).forEach(([k, v]) => { if (!sim[g][k] || (v.best || 0) > (sim[g][k].best || 0)) { sim[g][k] = v; sch = true; } }));
    if (r.sim && r.sim.brk && (r.sim.brk.best || 0) > ((sim.brk && sim.brk.best) || 0)) { sim.brk = r.sim.brk; sch = true; }
    if (sch) { lsSet(SIM_KEY, JSON.stringify(sim)); ch = true; }
    return ch;
  },
  reportHead() { return ["Progress", "SQL solved", "Incidents", "Broken DB", "Stakeholder"]; },
  reportCells(p) { const f = (v) => v == null ? "—" : v + "%"; return [f(p.pct), `${p.sql || 0}/${PRACTICE_PROBLEMS.length}`, f(p.inc), f(p.brk), f(p.stk)]; },
  welcome(profile) { simProfile = profile; renderContinueBanner(); },
};

/* Welcome back banner (uses the existing "continue" banner on Home) */
let simProfile = null;
const _origContinue = renderContinueBanner;
renderContinueBanner = function () {
  const wrap = document.getElementById("continue-banner"); if (!wrap) return;
  if (!simProfile || !simProfile.name) { _origContinue(); return; }
  const s = loadState(); const next = JOURNEY.find(j => !s.journey[j.id]); const pct = trackScores().overall;
  let last = null; try { last = JSON.parse(lsGet(LAST_VIEW_KEY)); } catch (e) {}
  const first = String(simProfile.name).split(" ")[0];
  wrap.style.display = "flex";
  wrap.innerHTML = `<span class="continue-text">👋 Welcome back, <strong>${esc(first)}</strong>. You're <strong>${pct}%</strong> through the capstone.${next ? ` Next step: <strong>${esc(next.t)}</strong>` : " All journey steps done 🎉"}</span>
    <div class="continue-actions">${next ? `<button type="button" class="continue-go" data-v="${next.go}">Continue project →</button>` : ""}${last && last.view && VIEW_LABELS[last.view] ? `<button type="button" class="continue-go alt" data-v="${last.view}">Back to ${esc(VIEW_LABELS[last.view])}</button>` : ""}<button type="button" class="continue-dismiss" title="Dismiss">✕</button></div>`;
  wrap.querySelectorAll(".continue-go").forEach(b => b.addEventListener("click", () => switchView(b.dataset.v)));
  wrap.querySelector(".continue-dismiss").addEventListener("click", () => { wrap.style.display = "none"; });
};

Object.assign(VIEW_LABELS, { incident: "Incident Room", broken: "Broken Dashboard Challenge", stakeholder: "Stakeholder Simulator" });
document.addEventListener("DOMContentLoaded", () => { renderIncidentRoom(); renderBroken(); renderStakeholder(); renderSimSummary(); });

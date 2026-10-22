/* Mahendra Dashboard Evaluation Feedback — settings for this project.
   weights: points per category (they are scaled to total 100). focus: extra review rules the AI must check. */
window.REVIEW_CONFIG = {
  "siteKey": "payflow",
  "weights": {
    "visual": 20,
    "kpi": 20,
    "model": 20,
    "insight": 20,
    "usability": 20
  },
  "focus": [
    "KPI formulas must match the definitions on this project's KPI page (name, numerator, denominator, filters).",
    "Each dashboard should answer the project's business questions and required views, not just show charts.",
    "Known data traps listed on the site must be handled before calculating KPIs: amounts converted to USD, attempts vs intents, fraud counted once per payment, Pending excluded from rates."
  ]
};

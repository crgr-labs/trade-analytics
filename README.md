# Trade Analytics & Crypto Journal

A high-integrity, analytical cryptocurrency trade journal and performance analytics dashboard engineered for active discretionary traders and quantitative market participants.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Status](https://img.shields.io/badge/status-active-success.svg)

---

## Overview

Trade Analytics delivers clinical fintech clarity, Swiss grid discipline, and developer-grade data ergonomics. It emphasizes quantitative truth, emotional detachment from market volatility, and disciplined risk management.

### Key Capabilities

- **Interactive Trade Ledger & Analytics:** Detailed trade logging tracking symbol, direction (Long/Short), entry/exit prices, position sizing, fees, R:R multiples, and net PnL.
- **Quantitative Metrics & KPIs:** Real-time computation of Win Rate, Profit Factor, Average R:R, Max Drawdown, and cumulative equity curve.
- **Confluence Matrix & Strategy Tagging:** Systematically evaluate setup factors, market context, and execution quality.
- **Timing & Heatmap Analysis:** Analyze trading performance across different sessions, days of the week, and market conditions.
- **Spreadsheet Import/Export:** Seamless export and backup capabilities via Excel/CSV powered by SheetJS (`vendor/xlsx.full.min.js`).
- **Zero-Build Architecture:** Lightweight, standalone client-side architecture requiring no complex compilation steps.

---

## Tech Stack

- **Core:** HTML5, Modern ES6+ JavaScript
- **Styling & Design System:** Tailwind CSS, Google Fonts (`Inter`, `JetBrains Mono`), Material Symbols
- **Spreadsheet Processing:** SheetJS / XLSX (`vendor/xlsx.full.min.js`)

---

## Getting Started

### Local Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/crgr-labs/trade-analytics.git
   cd trade-analytics
   ```

2. **Run locally:**
   Simply open `index.html` in any modern web browser, or serve it using your preferred static server:
   ```bash
   # Using Python
   python -m http.server 8000

   # Or using Node.js / npx
   npx serve .
   ```

3. Open `http://localhost:8000` (or `http://localhost:3000`) in your browser.

---

## License

MIT License. See [LICENSE](LICENSE) for details.

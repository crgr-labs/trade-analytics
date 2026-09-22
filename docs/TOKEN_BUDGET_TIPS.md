# AI Assistant & Token Budget Management Guide

This guide outlines how to monitor token limits, recognize when your budget is exceeded, and manage token consumption when working with AI coding assistants (Antigravity, Gemini API, Claude Code, and related tools).

---

## 1. How to Know if You Exceeded Your Token Budget

### A. Within Antigravity / Chat Sessions
* **Context Window Budget (Automatic Summarization)**:
  * When a conversation becomes long, you will see a notice such as `<CONTEXT_SUMMARY>` appearing in the transcript.
  * Antigravity automatically compresses older turns into a high-level summary so you stay within the model's active context window without losing project state.
* **API Quota Exceeded (Hard Limit)**:
  * If your account or project runs out of allocated tokens/requests, an error message will appear:
    * `429 Too Many Requests`
    * `RESOURCE_EXHAUSTED` / `Quota exceeded for quota metric...`
    * A banner in the UI stating that your token limit or hourly/daily quota has been reached.

### B. Checking Usage on Google AI Studio / Google Cloud (Gemini API)
If you are using your own API key:
1. **Google AI Studio**:
   * Navigate to [aistudio.google.com](https://aistudio.google.com/).
   * Check your dashboard under **Plan & Billing** / **Usage** to see your current tier (Free vs. Pay-As-You-Go) and request/token counts.
2. **Google Cloud Console**:
   * Navigate to [console.cloud.google.com/apis/dashboard](https://console.cloud.google.com/apis/dashboard).
   * Filter by **Generative Language API** (or **Vertex AI API**) to view real-time token count, request rates, and quota caps.
   * Under **Billing > Budgets & Alerts**, configure email notifications before hitting a monetary or token ceiling.

---

## 2. Best Practices to Manage & Conserve Tokens

1. **Start Fresh Sessions for New Tasks**:
   * When beginning an unrelated feature or bug fix, start a new chat conversation. This clears old file views, long diffs, and debugging logs from the active context window.
2. **Be Specific in Prompts**:
   * Direct the assistant to the exact file and lines needed rather than asking broad open-ended questions that require inspecting the whole repository.
3. **Use Intensive Modes Selectively**:
   * Use specialized modes or commands (e.g. `/boost` or deep research) only for complex architecture or tricky bugs; use standard prompts for routine edits and single-file updates.
4. **Keep Artifacts and Diffs Focused**:
   * Break large refactors into smaller, verifiable chunks to prevent hitting context limits during generation.


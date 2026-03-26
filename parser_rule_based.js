/**
 * VisionParser
 * Rule-based parser for structured receipt extraction.
 */
const VisionParser = {
  parseFromText(fullText, file) {
    const amount = this.extractAmount(fullText);
    const date = this.extractDate(fullText);
    const vendor = this.extractVendor(fullText);
    const description = this.extractDescription(fullText);
    const confidence = this.calculateConfidence(fullText, date);
    const uploader = file && file.getOwner ? file.getOwner().getName() : "Unknown";

    return { date, fileName: file ? file.getName() : "Unknown", vendor, description,
             category: "", amount, confidence, uploader, url: file ? file.getUrl() : "",
             hash: "", rawText: fullText, humanCorrection: "" };
  },

  extractAmount(text) {
    const matches = [...text.matchAll(/\$?\s?(\d{1,4}(?:,\d{3})*\.\d{2})/g)];
    if (!matches.length) return 0;
    const lines = text.split("\n").map(l => l.trim());
    let candidates = matches.map(m => {
      const value = parseFloat(m[1].replace(/,/g, ""));
      const line = lines.find(l => l.includes(m[0])) || "";
      let score = 0;
      APP_DEFAULTS.AMOUNT_KEYWORDS.forEach(k => { if (line.toLowerCase().includes(k)) score += 100; });
      APP_DEFAULTS.SUBTRACT_KEYWORDS.forEach(k => { if (line.toLowerCase().includes(k)) score -= 40; });
      return { value, score, line };
    });
    const maxValue = Math.max(...candidates.map(c => c.value));
    candidates = candidates.map(c => { if (c.value === maxValue) c.score += 25; return c; });
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].value;
  },

  // Bug 7 fix: the original code silently wrote today's date when no date was
  // found on the receipt. This produced plausible-looking but wrong data in the
  // sheet with no warning. Now returns an empty string (visibly blank in the
  // sheet) and logs a warning. Confidence penalty is applied in calculateConfidence.
  extractDate(text) {
    const dateRegex = /(\d{1,2}\/\d{1,2}\/\d{2,4})/g;
    const lines = text.split("\n");
    for (let line of lines) {
      if (APP_DEFAULTS.DATE_KEYWORDS.some(k => line.toLowerCase().includes(k))) {
        const match = line.match(dateRegex);
        if (match) return match[0];
      }
    }
    const fallback = text.match(dateRegex);
    if (fallback) return fallback[0];
    LoggerService.warn("No date found in receipt — date left blank");
    return "";
  },

  extractVendor(text) {
    const lines = text.split("\n").map(l => l.trim());
    for (let line of lines) {
      if (!line || /[\w._%+-]+@[\w.-]+\.[a-z]{2,}/i.test(line)) continue;
      if (/(\+?\d[\d\s.-]{6,}\d)/.test(line)) continue;
      return line;
    }
    return "Unknown Vendor";
  },

  extractDescription(text) {
    const lines = text.split("\n").map(l => l.trim());
    for (let line of lines) {
      for (const k of APP_DEFAULTS.DESCRIPTION_KEYWORDS) {
        if (line.toLowerCase().includes(k)) return line.replace(new RegExp(k + ":?", "i"), "").trim();
      }
    }
    return "";
  },

  // Bug 7 fix: accept date as a parameter so a missing date can apply a
  // confidence penalty, making low-quality parses visible in the sheet.
  calculateConfidence(text, date) {
    let score = APP_DEFAULTS.CONFIDENCE_BASE;
    APP_DEFAULTS.AMOUNT_KEYWORDS.forEach(k => { if (text.toLowerCase().includes(k)) score += APP_DEFAULTS.CONFIDENCE_BOOST; });
    if (!date) score -= 20;
    return Math.min(Math.max(score, 0), APP_DEFAULTS.CONFIDENCE_MAX);
  }
};

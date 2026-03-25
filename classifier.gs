const CategoryClassifier = {
  classify(text, vendor) {
    const t = (text + vendor).toLowerCase();

    if (/utility|electric|water|gas/.test(t)) return "Utilities";
    if (/landscap|lawn/.test(t)) return "Landscaping";
    if (/repair|maintenance/.test(t)) return "Maintenance";
    if (/clean/.test(t)) return "Cleaning";
    if (/insurance/.test(t)) return "Insurance";

    return "Other";
  }
};

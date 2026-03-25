const Utils = {
  generateHash(text) {
    const raw = Utilities.computeDigest(
      Utilities.DigestAlgorithm.MD5,
      text
    );

    return raw.map(b => (b + 256).toString(16).slice(-2)).join('');
  }
};

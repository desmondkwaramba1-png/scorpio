// Stops people moving a dispute off the platform, where nobody can protect
// them. It has to catch real contact details without blocking normal messages,
// so a filename ("proof.pdf"), a sentence with a missing space ("It broke.Please"),
// and an order or EcoCash reference number all have to pass.
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+\s*@\s*[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+/i;
// A bare domain only counts with a real web ending, not any word after a dot.
const BARE_DOMAIN_PATTERN = /\b[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.(?:com|net|org|info|biz|io|co|me|app|xyz|site|online|store|shop|link|ly|gg|zw|za|uk)\b(?:\/\S*)?/i;
// Zimbabwean mobiles, plus any international number written with a plus sign.
const ZW_MOBILE_PATTERN = /(?<![\d.])(?:\+?263|0)[\s().-]*7[\s().-]*(?:\d[\s().-]*){7}\d(?!\d)/;
const INTERNATIONAL_PATTERN = /(?<![\w])\+\d(?:[\s().-]*\d){8,14}(?!\d)/;

function hasOffPlatformContact(text) {
  return EMAIL_PATTERN.test(text) || URL_PATTERN.test(text) || BARE_DOMAIN_PATTERN.test(text) ||
    ZW_MOBILE_PATTERN.test(text) || INTERNATIONAL_PATTERN.test(text);
}

module.exports = { hasOffPlatformContact };

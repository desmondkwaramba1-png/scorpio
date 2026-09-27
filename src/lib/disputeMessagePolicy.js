const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+\s*@\s*[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const LINK_PATTERN = /\b(?:https?:\/\/|www\.)\S+|\b(?:[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?\.)+[A-Z]{2,}\b(?:\/\S*)?/i;
const PHONE_CANDIDATE_PATTERN = /(?<!\w)\+?\d(?:[\s().-]*\d){7,}(?!\w)/g;

function hasPhoneNumber(text) {
  return [...text.matchAll(PHONE_CANDIDATE_PATTERN)]
    .some(([candidate]) => candidate.replace(/\D/g, '').length >= 9);
}

function hasOffPlatformContact(text) {
  return EMAIL_PATTERN.test(text) || LINK_PATTERN.test(text) || hasPhoneNumber(text);
}

module.exports = { hasOffPlatformContact };
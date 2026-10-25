// Sample prompts are display text. This module grants no permission.
function demoPrompts(raw) {
  let data = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!data || !Array.isArray(data.prompts)) return [];
  return data.prompts
    .filter(
      (prompt) =>
        prompt &&
        typeof prompt.title === "string" &&
        typeof prompt.text === "string" &&
        prompt.title.length > 0 &&
        prompt.title.length <= 80 &&
        prompt.text.length > 0 &&
        prompt.text.length <= 500,
    )
    .slice(0, 8);
}

module.exports = { demoPrompts };

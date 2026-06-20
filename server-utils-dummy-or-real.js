// Helper to safely fetch getAi without circular dependencies
let getAi = null;

try {
  // Standalone safe initialization to completely avoid Node circular references
  const { GoogleGenAI } = require('@google/genai');
  getAi = function() {
    if (process.env.GEMINI_API_KEY) {
      try {
        return new GoogleGenAI({
          apiKey: process.env.GEMINI_API_KEY,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
        });
      } catch (e) {
        console.error('[SEO-Utils] Error instantiating backup GoogleGenAI client:', e.message);
      }
    }
    return null;
  };
} catch(err) {
  console.error('[SEO-Utils] GoogleGenAI module fail:', err.message);
}

module.exports = { getAi };

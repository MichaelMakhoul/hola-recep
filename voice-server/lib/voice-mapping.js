/**
 * Maps ElevenLabs voice IDs to Deepgram Aura voice names.
 *
 * Deepgram Aura voices: https://developers.deepgram.com/docs/tts-models
 * Mapping is by gender, tone, and accent similarity.
 */

const DEFAULT_DEEPGRAM_VOICE = "aura-asteria-en";

/**
 * ElevenLabs voice ID → Deepgram Aura voice name.
 *
 * Deepgram Aura voices used:
 * Female: asteria (warm), luna (professional), stella (upbeat), athena (authoritative), hera (soothing)
 * Male: orion (friendly), arcas (calm/pro), orpheus (warm), angus (authoritative), perseus (casual), helios (conversational)
 * British: all map to their closest gender match with accent note
 * Australian: map to closest general voice
 */
const VOICE_MAP = {
  // --- American Female ---
  "EXAVITQu4vr4xnSDxMaL": "aura-asteria-en",    // Sarah — warm, professional → Asteria (warm female)
  "21m00Tcm4TlvDq8ikWAM": "aura-luna-en",        // Rachel — professional, authoritative → Luna (professional female)
  "jBpfuIE2acCO8z3wKNLl": "aura-stella-en",      // Emily — upbeat, friendly → Stella (upbeat female)
  "MF3mGyEYCl7XYWbV9V6O": "aura-asteria-en",     // Elli — warm, friendly → Asteria (warm female)
  "AZnzlk1XvdvUeBnXmlld": "aura-stella-en",      // Domi — energetic, friendly → Stella (upbeat female)

  // --- American Male ---
  "pNInz6obpgDQGcFmaJgB": "aura-orion-en",       // Adam — friendly → Orion (friendly male)
  "yoZ06aMxZJJ28mfd3POQ": "aura-arcas-en",       // Sam — calm, professional → Arcas (calm male)
  "ErXwobaYiN019PkySvjV": "aura-orion-en",       // Antoni — friendly, conversational → Orion (friendly male)
  "TxGEqnHWrfWFTfGW9XjX": "aura-orpheus-en",     // Josh — deep, warm → Orpheus (warm male)
  "VR6AewLTigWG4xSOukaG": "aura-angus-en",       // Arnold — authoritative → Angus (authoritative male)
  "CYw3kZ02Hs0563khs1Fj": "aura-perseus-en",     // Dave — casual, conversational → Perseus (casual male)

  // --- British ---
  "onwK4e9ZLuTAKqWW03F9": "aura-arcas-en",       // Daniel — polished British male → Arcas (calm pro)
  "ThT5KcBeYPX3keUQqHPh": "aura-asteria-en",     // Dorothy — warm British female → Asteria (warm)
  "SOYHLrjzK2X1ezoPC6cr": "aura-angus-en",       // Harry — authoritative British → Angus (authoritative)
  "oWAxZDx7w5VEj9dCyTzz": "aura-hera-en",        // Grace — soothing British female → Hera (soothing)

  // --- Australian ---
  "ZQe5CZNOzWyzPSCn5a3c": "aura-arcas-en",       // James — professional AU male → Arcas
  "XB0fDUnXU5powFXDhCwa": "aura-asteria-en",     // Charlotte — warm AU female → Asteria
  "IKne3meq5aSn9XLyUdCD": "aura-orion-en",       // Liam — friendly AU male → Orion
};

/**
 * Resolve an ElevenLabs voice ID (or legacy short name) to a Deepgram Aura voice.
 *
 * @param {string} [voiceId] - ElevenLabs voice ID or legacy short name
 * @returns {string} Deepgram Aura voice model name
 */
function getDeepgramVoice(voiceId) {
  if (!voiceId) return DEFAULT_DEEPGRAM_VOICE;

  // Direct ElevenLabs ID lookup
  if (VOICE_MAP[voiceId]) return VOICE_MAP[voiceId];

  // Legacy short name support
  const SHORT_NAME_TO_ID = {
    rachel: "21m00Tcm4TlvDq8ikWAM",
    sarah: "EXAVITQu4vr4xnSDxMaL",
    adam: "pNInz6obpgDQGcFmaJgB",
    emily: "jBpfuIE2acCO8z3wKNLl",
    sam: "yoZ06aMxZJJ28mfd3POQ",
    domi: "AZnzlk1XvdvUeBnXmlld",
    dave: "CYw3kZ02Hs0563khs1Fj",
  };

  const resolvedId = SHORT_NAME_TO_ID[voiceId.toLowerCase()];
  if (resolvedId && VOICE_MAP[resolvedId]) return VOICE_MAP[resolvedId];

  return DEFAULT_DEEPGRAM_VOICE;
}

module.exports = { getDeepgramVoice, VOICE_MAP, DEFAULT_DEEPGRAM_VOICE };

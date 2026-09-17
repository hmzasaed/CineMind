/**
 * Deterministic intent router. Uses keyword/pattern matching only.
 * The LLM is NEVER used for intent classification.
 * This ensures predictable, auditable routing.
 */

import type { AnyIntent, IntentCategory } from "./intents.js";

/**
 * Keywords and patterns for each intent.
 * These are matched in order of specificity (most specific first).
 */
interface IntentPattern {
  intent: AnyIntent;
  keywords: string[];
  patterns: RegExp[];
  minConfidence: number;
}

/**
 * Intent patterns ordered by specificity.
 * More specific patterns should come before general ones.
 */
const INTENT_PATTERNS: IntentPattern[] = [
  // Movie Information - Basic
  {
    intent: "movie.info.basic",
    keywords: ["what is", "tell me about", "overview", "synopsis", "plot", "summary", "basic info", "about"],
    patterns: [
      /^what is (.+) about\??$/i,
      /^tell me about (.+)\??$/i,
      /^overview of (.+)\??$/i,
      /^(.+) plot\??$/i,
    ],
    minConfidence: 0.6,
  },
  {
    intent: "movie.info.details",
    keywords: ["details", "metadata", "imdb", "external ids", "tagline"],
    patterns: [
      /^details (?:for|of) (.+)\??$/i,
      /^(.+) imdb id\??$/i,
      /^tagline (?:for|of) (.+)\??$/i,
    ],
    minConfidence: 0.6,
  },
  {
    intent: "movie.info.release",
    keywords: ["release date", "released", "when did", "release year", "certification", "rated"],
    patterns: [
      /^when (?:was|did) (.+) (?:come out|released?)\??$/i,
      /^release date (?:for|of) (.+)\??$/i,
      /^(.+) certification\??$/i,
      /^what (?:is|was) (.+) rated\??$/i,
    ],
    minConfidence: 0.3,
  },
  {
    intent: "movie.info.visuals",
    keywords: ["poster", "backdrop", "image", "still", "screenshot", "visual"],
    patterns: [
      /^poster (?:for|of) (.+)\??$/i,
      /^backdrop (?:for|of) (.+)\??$/i,
      /^images? (?:for|of) (.+)\??$/i,
    ],
    minConfidence: 0.3,
  },
  {
    intent: "movie.info.production",
    keywords: ["production company", "studio", "produced by", "production country", "language"],
    patterns: [
      /^production (?:company|companies) (?:for|of) (.+)\??$/i,
      /^studio (?:for|of) (.+)\??$/i,
      /^who produced (.+)\??$/i,
    ],
    minConfidence: 0.3,
  },
  {
    intent: "movie.info.financials",
    keywords: ["budget", "revenue", "box office", "gross", "earnings", "made money", "cost"],
    patterns: [
      /^budget (?:for|of) (.+)\??$/i,
      /^revenue (?:for|of) (.+)\??$/i,
      /^box office (?:for|of) (.+)\??$/i,
      /^how much did (.+) (?:make|cost)\??$/i,
    ],
    minConfidence: 0.3,
  },
  {
    intent: "movie.info.ratings",
    keywords: ["rating", "score", "imdb", "rotten tomatoes", "metacritic", "rated"],
    patterns: [
      /^rating (?:for|of) (.+)\??$/i,
      /^score (?:for|of) (.+)\??$/i,
      /^imdb (?:rating|score) (?:for|of) (.+)\??$/i,
      /^rotten tomatoes (?:for|of) (.+)\??$/i,
    ],
    minConfidence: 0.3,
  },
  {
    intent: "movie.info.credits",
    keywords: ["cast", "crew", "actor", "actress", "director", "writer", "starring", "directed", "written"],
    patterns: [
      /^cast (?:for|of) (.+)\??$/i,
      /^crew (?:for|of) (.+)\??$/i,
      /^who (?:directed|wrote|stars in) (.+)\??$/i,
      /^actors? (?:in|of) (.+)\??$/i,
    ],
    minConfidence: 0.3,
  },

  // Search
  {
    intent: "search.movie",
    keywords: ["find movie", "search movie", "look for movie", "movie called", "movie named", "find", "search"],
    patterns: [
      /^find (?:me )?(?:the )?movie (.+)\??$/i,
      /^search (?:for )?movie (.+)\??$/i,
      /^movie (?:called|named) (.+)\??$/i,
    ],
    minConfidence: 0.3,
  },
  {
    intent: "search.person",
    keywords: ["find actor", "search person", "find director", "who is", "actor named"],
    patterns: [
      /^find (?:actor|person|director) (.+)\??$/i,
      /^search (?:for )?(?:actor|person|director) (.+)\??$/i,
    ],
    minConfidence: 0.3,
  },
  {
    intent: "search.discover",
    keywords: ["discover", "what to watch", "what should i watch", "browse movies", "explore movies", "movies from"],
    patterns: [
      /^discover (?:movies?)?\??$/i,
      /^what (?:should i|to) watch\??$/i,
      /^browse (?:movies?)?\??$/i,
      /^explore (?:movies?)?\??$/i,
      /^movies? from \d{4}\??$/i,
    ],
    minConfidence: 0.3,
  },
  {
    intent: "search.multi",
    keywords: ["search", "find", "look up"],
    patterns: [
      /^search (.+)\??$/i,
      /^find (.+)\??$/i,
      /^look up (.+)\??$/i,
    ],
    minConfidence: 0.3,
  },

  // Recommendation
  {
    intent: "recommend.similar",
    keywords: ["similar to", "movies like", "if you liked", "like this"],
    patterns: [
      /^similar (?:movies?|to) (.+)\??$/i,
      /^if you liked (.+) (?:watch|try)\??$/i,
      /^movies? like (.+)\??$/i,
    ],
    minConfidence: 0.3,
  },
  {
    intent: "recommend.based_on",
    keywords: ["recommend based on", "recommend with", "based on genre", "based on actor"],
    patterns: [
      /^recommend (?:movies? )?(?:based on|with) (.+)\??$/i,
      /^recommend (?:by|for) (.+)\??$/i,
    ],
    minConfidence: 0.3,
  },
  {
    intent: "recommend.trending",
    keywords: ["trending", "popular", "top movies", "what's hot", "trending now", "what is popular"],
    patterns: [
      /^trending (?:movies?)?\??$/i,
      /^popular (?:movies?)?\??$/i,
      /^top (?:movies?)?\??$/i,
      /^what'?s (?:hot|trending)\??$/i,
    ],
    minConfidence: 0.3,
  },
  {
    intent: "recommend.discovery",
    keywords: ["discover", "explore", "browse"],
    patterns: [
      /^discover (?:movies?)?\??$/i,
      /^explore (?:movies?)?\??$/i,
      /^browse (?:movies?)?\??$/i,
    ],
    minConfidence: 0.3,
  },

  // Comparison
  {
    intent: "compare.movies",
    keywords: ["compare", "versus", "vs", "difference between", "better"],
    patterns: [
      /^compare (.+) (?:and|vs|versus) (.+)\??$/i,
      /^(.+) vs (.+)\??$/i,
      /^difference between (.+) and (.+)\??$/i,
      /^which is better (.+) or (.+)\??$/i,
    ],
    minConfidence: 0.3,
  },
  {
    intent: "compare.ratings",
    keywords: ["compare rating", "rating comparison", "higher rated", "which has higher", "which is higher"],
    patterns: [
      /^compare rating (?:of|for) (.+) (?:and|vs) (.+)\??$/i,
      /^which (?:has|is) higher rating:?\s*(.+) or (.+)\??$/i,
    ],
    minConfidence: 0.3,
  },
  {
    intent: "compare.financials",
    keywords: ["compare budget", "compare revenue", "box office comparison"],
    patterns: [
      /^compare (?:budget|revenue|box office) (?:of|for) (.+) (?:and|vs) (.+)\??$/i,
    ],
    minConfidence: 0.3,
  },

  // Review
  {
    intent: "review.get_user",
    keywords: ["user review", "audience review", "what people say", "reviews", "review"],
    patterns: [
      /^user reviews? (?:for|of) (.+)\??$/i,
      /^audience reviews? (?:for|of) (.+)\??$/i,
      /^what (?:do|did) people think (?:of|about) (.+)\??$/i,
      /^reviews? (?:for|of) (.+)\??$/i,
    ],
    minConfidence: 0.3,
  },
  {
    intent: "review.get_critic",
    keywords: ["critic review", "professional review", "critics say", "what critics"],
    patterns: [
      /^critic reviews? (?:for|of) (.+)\??$/i,
      /^professional reviews? (?:for|of) (.+)\??$/i,
      /^what (?:do|did) critics think (?:of|about) (.+)\??$/i,
    ],
    minConfidence: 0.3,
  },
  {
    intent: "review.get_aggregate",
    keywords: ["aggregate review", "review score", "overall rating"],
    patterns: [
      /^aggregate reviews? (?:for|of) (.+)\??$/i,
      /^overall (?:review|rating) (?:for|of) (.+)\??$/i,
      /^review score (?:for|of) (.+)\??$/i,
    ],
    minConfidence: 0.3,
  },

  // Critic Analysis
  {
    intent: "critic.consensus",
    keywords: ["critical consensus", "critics consensus", "consensus"],
    patterns: [
      /^critical consensus (?:for|of) (.+)\??$/i,
      /^critics consensus (?:for|of) (.+)\??$/i,
      /^consensus (?:for|of) (.+)\??$/i,
    ],
    minConfidence: 0.3,
  },
  {
    intent: "critic.top_critics",
    keywords: ["top critic", "top critics", "notable critic"],
    patterns: [
      /^top critics? (?:for|of) (.+)\??$/i,
      /^notable critics? (?:for|of) (.+)\??$/i,
    ],
    minConfidence: 0.3,
  },

  // Upcoming
  {
    intent: "upcoming.list",
    keywords: ["upcoming", "coming soon", "future releases", "new movies", "releases"],
    patterns: [
      /^upcoming (?:movies?)?\??$/i,
      /^coming soon\??$/i,
      /^future releases?\??$/i,
      /^new movies? (?:coming|this)\??$/i,
    ],
    minConfidence: 0.3,
  },
  {
    intent: "upcoming.by_date",
    keywords: ["releasing", "release date", "this month", "next month", "this year"],
    patterns: [
      /^releasing (?:this|next) (?:week|month|year)\??$/i,
      /^movies? (?:this|next) (?:week|month|year)\??$/i,
      /^what'?s (?:coming|out) (?:this|next) (?:week|month)\??$/i,
    ],
    minConfidence: 0.3,
  },
  {
    intent: "upcoming.by_region",
    keywords: ["in us", "in uk", "in canada", "region", "country"],
    patterns: [
      /^upcoming (?:in|for) ([a-z]{2})\??$/i,
      /^releases? (?:in|for) ([a-z]{2})\??$/i,
    ],
    minConfidence: 0.3,
  },

  // Hype Prediction
  {
    intent: "hype.predict",
    keywords: ["predict", "opening weekend", "box office prediction", "will it make"],
    patterns: [
      /^predict (?:opening|box office) (?:for|of) (.+)\??$/i,
      /^opening weekend (?:for|of) (.+)\??$/i,
      /^box office prediction (?:for|of) (.+)\??$/i,
      /^how much will (.+) make\??$/i,
    ],
    minConfidence: 0.3,
  },

  // User Review
  {
    intent: "user_review.get",
    keywords: ["my review", "user review", "review by"],
    patterns: [
      /^my review (?:for|of) (.+)\??$/i,
      /^user review (?:by|for) (.+)\??$/i,
    ],
    minConfidence: 0.3,
  },

  // General Chat
  {
    intent: "chat.greeting",
    keywords: ["hello", "hi", "hey", "greetings", "good morning", "good afternoon", "good evening"],
    patterns: [
      /^(?:hello|hi|hey|greetings)[\s!]*$/i,
      /^good (?:morning|afternoon|evening)[\s!]*$/i,
    ],
    minConfidence: 0.3,
  },
  {
    intent: "chat.farewell",
    keywords: ["goodbye", "bye", "see you", "farewell", "take care"],
    patterns: [
      /^(?:goodbye|bye|farewell|see you)[\s!]*$/i,
      /^take care[\s!]*$/i,
    ],
    minConfidence: 0.3,
  },
  {
    intent: "chat.thanks",
    keywords: ["thanks", "thank you", "appreciate"],
    patterns: [
      /^thanks?[\s!]*$/i,
      /^thank you[\s!]*$/i,
      /^appreciate it[\s!]*$/i,
    ],
    minConfidence: 0.3,
  },
  {
    intent: "chat.help",
    keywords: ["help", "how to", "commands", "how do i"],
    patterns: [
      /^help$/i,
      /^how (?:to|do) (?:i )?use/i,
      /^commands$/i,
    ],
    minConfidence: 0.3,
  },
  {
    intent: "chat.capabilities",
    keywords: ["capabilities", "features", "abilities", "what can you do", "what do you do"],
    patterns: [
      /^capabilities$/i,
      /^features$/i,
      /^abilities$/i,
      /^what (?:can|do) you do$/i,
    ],
    minConfidence: 0.3,
  },
];

/**
 * Fallback intent when nothing matches.
 */
const FALLBACK_INTENT: AnyIntent = "chat.fallback";

/**
 * Off-topic detection keywords.
 */
const OFF_TOPIC_KEYWORDS = [
  "weather", "news", "politics", "sports", "stock", "crypto", "bitcoin",
  "recipe", "cooking", "travel", "hotel", "flight", "shopping",
  "programming", "code", "debug", "error", "api", "database",
  "math", "calculate", "translate", "definition", "dictionary",
];

/**
 * Router result.
 */
export interface RouterResult {
  intent: AnyIntent;
  confidence: number;
  category: IntentCategory;
  extractedEntities: Record<string, string>;
  isOffTopic: boolean;
}

/**
 * Extract potential entities (movie titles, names, years) from text.
 */
function extractEntities(text: string): Record<string, string> {
  const entities: Record<string, string> = {};

  // Extract year (4 digits, 1888-2100) - handle both standalone and in phrases like "from 2010"
  const yearMatch = text.match(/\b(1[89]\d{2}|20\d{2}|2100)\b/);
  if (yearMatch) entities.year = yearMatch[1];

  // Extract quoted strings as potential titles
  const quoted = text.match(/"([^"]+)"/g) ?? text.match(/'([^']+)'/g);
  if (quoted?.[0]) {
    entities.quotedText = quoted[0].slice(1, -1);
  }

  // Extract comparison pairs: "compare X and Y"
  const compareMatch = text.match(/compare\s+["']?(.+?)["']?\s+(?:and|with|to|vs\.?)\s+["']?([^?]+?)["']?\??$/i);
  if (compareMatch) {
    entities.potentialTitle = compareMatch[1].trim();
    entities.potentialTitle2 = compareMatch[2].trim();
  }

  // Extract after "tell me about", "about", "details for", etc.
  if (!entities.potentialTitle) {
    const aboutMatch = text.match(/(?:tell me about|what is|overview of|info on|details (?:for|of)|about|search for)\s+["']?([^?]+?)["']?\??$/i);
    if (aboutMatch) {
      entities.potentialTitle = aboutMatch[1].trim();
    }
  }

  // Extract after "called", "named", "titled"
  const titledMatch = text.match(/(?:called|named|titled)\s+["']?([^"']+)["']?/i);
  if (titledMatch) entities.potentialTitle = titledMatch[1].trim();

  // Extract after "from" for year ranges
  const fromYearMatch = text.match(/(?:from|since)\s+(\d{4})/i);
  if (fromYearMatch) entities.year = fromYearMatch[1];

  return entities;
}

/**
 * Calculate keyword match score.
 * Returns a score 0-1 based on how many keywords match.
 * Uses a more generous scoring that rewards any match.
 */
function keywordScore(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  let matches = 0;
  for (const kw of keywords) {
    if (lower.includes(kw.toLowerCase())) matches++;
  }
  if (matches === 0) return 0;
  // Score based on number of matches, capped at 1
  // Each match gives ~0.3, so 1 match = 0.3, 2 = 0.6, 3+ = 1
  return Math.min(1, matches * 0.35);
}

/**
 * Calculate pattern match score.
 */
function patternScore(text: string, patterns: RegExp[]): number {
  for (const pattern of patterns) {
    if (pattern.test(text)) return 1;
  }
  return 0;
}
  /**
 * Main deterministic router.
 * Returns the best matching intent with confidence score.
 */
export function routeIntent(text: string): RouterResult {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  // Check for off-topic FIRST - if off-topic, return immediately
  for (const kw of OFF_TOPIC_KEYWORDS) {
    if (lower.includes(kw)) {
      return {
        intent: "chat.off_topic",
        confidence: 0.9,
        category: "general_chat",
        extractedEntities: {},
        isOffTopic: true,
      };
    }
  }

  let bestMatch: { intent: AnyIntent; confidence: number } = { intent: FALLBACK_INTENT, confidence: 0 };
  let bestEntities: Record<string, string> = {};

  for (const { intent, keywords, patterns, minConfidence } of INTENT_PATTERNS) {
    const kwScore = keywordScore(lower, keywords);
    const patScore = patternScore(lower, patterns);
    const confidence = Math.max(kwScore, patScore);

    if (confidence >= minConfidence && confidence > bestMatch.confidence) {
      bestMatch = { intent, confidence };
      bestEntities = extractEntities(trimmed);
    }
  }

  // If no match, return fallback
  if (bestMatch.intent === FALLBACK_INTENT) {
    return {
      intent: FALLBACK_INTENT,
      confidence: bestMatch.confidence,
      category: "general_chat",
      extractedEntities: bestEntities,
      isOffTopic: false,
    };
  }

  return {
    intent: bestMatch.intent,
    confidence: bestMatch.confidence,
    category: getCategoryForIntent(bestMatch.intent),
    extractedEntities: bestEntities,
    isOffTopic: false,
  };
}

/**
 * Map intent to category.
 */
function getCategoryForIntent(intent: AnyIntent): IntentCategory {
  if (intent.startsWith("movie.info.")) return "movie_information";
  if (intent.startsWith("person.info.")) return "person_information";
  if (intent.startsWith("search.")) return "search";
  if (intent.startsWith("recommend.")) return "recommendation";
  if (intent.startsWith("compare.")) return "comparison";
  if (intent.startsWith("review.")) return "review";
  if (intent.startsWith("critic.")) return "critic_analysis";
  if (intent.startsWith("upcoming.")) return "upcoming_movie";
  if (intent.startsWith("hype.")) return "hype_prediction";
  if (intent.startsWith("user_review.")) return "user_review";
  if (intent.startsWith("chat.")) return "general_chat";
  // Fallback for any future intent types
  return "general_chat";
}

/**
 * Map intent to required tool(s).
 * This is the deterministic tool selection logic.
 */
export interface ToolSelection {
  tools: Array<{
    name: string;
    args: Record<string, unknown>;
    priority: number;
  }>;
  requiresAuth: boolean;
  estimatedBudget: number; // estimated tool calls
}

const TOOL_MAPPING: Record<string, (entities: Record<string, string>) => ToolSelection> = {
  "movie.info.basic": (e) => ({
    tools: [{ name: "get_movie_details", args: { movie_id: e.potentialTitle ?? e.quotedText ?? "" }, priority: 1 }],
    requiresAuth: false,
    estimatedBudget: 1,
  }),
  "movie.info.details": (e) => ({
    tools: [{ name: "get_movie_details", args: { movie_id: e.potentialTitle ?? e.quotedText ?? "" }, priority: 1 }],
    requiresAuth: false,
    estimatedBudget: 1,
  }),
  "movie.info.release": (e) => ({
    tools: [{ name: "get_movie_details", args: { movie_id: e.potentialTitle ?? e.quotedText ?? "" }, priority: 1 }],
    requiresAuth: false,
    estimatedBudget: 1,
  }),
  "movie.info.visuals": (e) => ({
    tools: [{ name: "get_movie_details", args: { movie_id: e.potentialTitle ?? e.quotedText ?? "" }, priority: 1 }],
    requiresAuth: false,
    estimatedBudget: 1,
  }),
  "movie.info.production": (e) => ({
    tools: [{ name: "get_movie_details", args: { movie_id: e.potentialTitle ?? e.quotedText ?? "" }, priority: 1 }],
    requiresAuth: false,
    estimatedBudget: 1,
  }),
  "movie.info.financials": (e) => ({
    tools: [{ name: "get_movie_financials", args: { movie_id: e.potentialTitle ?? e.quotedText ?? "" }, priority: 1 }],
    requiresAuth: false,
    estimatedBudget: 1,
  }),
  "movie.info.ratings": (e) => ({
    tools: [{ name: "get_movie_ratings", args: { movie_id: e.potentialTitle ?? e.quotedText ?? "" }, priority: 1 }],
    requiresAuth: false,
    estimatedBudget: 1,
  }),
  "movie.info.credits": (e) => ({
    tools: [
      { name: "get_movie_cast", args: { movie_id: e.potentialTitle ?? e.quotedText ?? "" }, priority: 1 },
      { name: "get_movie_crew", args: { movie_id: e.potentialTitle ?? e.quotedText ?? "" }, priority: 1 },
    ],
    requiresAuth: false,
    estimatedBudget: 2,
  }),

  "search.movie": (e) => ({
    tools: [{ name: "search_movies", args: { title: e.potentialTitle ?? e.quotedText ?? "", year: e.year ? parseInt(e.year) : undefined }, priority: 1 }],
    requiresAuth: false,
    estimatedBudget: 1,
  }),
  "search.person": (e) => ({
    tools: [{ name: "search_movies", args: { title: e.potentialTitle ?? e.quotedText ?? "" }, priority: 1 }],
    requiresAuth: false,
    estimatedBudget: 1,
  }),
  "search.discover": (_e) => ({
    tools: [{ name: "recommend_movies", args: { based_on: "discovery" }, priority: 1 }],
    requiresAuth: false,
    estimatedBudget: 1,
  }),
  "search.multi": (e) => ({
    tools: [{ name: "search_movies", args: { title: e.quotedText ?? e.potentialTitle ?? "" }, priority: 1 }],
    requiresAuth: false,
    estimatedBudget: 1,
  }),

  "recommend.similar": (e) => ({
    tools: [{ name: "recommend_movies", args: { based_on: "movie_id", movie_id: e.potentialTitle ?? e.quotedText ?? "" }, priority: 1 }],
    requiresAuth: false,
    estimatedBudget: 1,
  }),
  "recommend.based_on": (e) => ({
    tools: [{ name: "recommend_movies", args: { based_on: "genres", genres: e.potentialTitle ? [e.potentialTitle] : undefined }, priority: 1 }],
    requiresAuth: false,
    estimatedBudget: 1,
  }),
  "recommend.trending": () => ({
    tools: [{ name: "recommend_movies", args: { based_on: "trending" }, priority: 1 }],
    requiresAuth: false,
    estimatedBudget: 1,
  }),
  "recommend.discovery": () => ({
    tools: [{ name: "recommend_movies", args: { based_on: "discovery" }, priority: 1 }],
    requiresAuth: false,
    estimatedBudget: 1,
  }),

  "compare.movies": (e) => ({
    tools: [{ name: "compare_movies", args: { movie_ids: [e.potentialTitle ?? "", e.potentialTitle2 ?? ""].filter(Boolean) }, priority: 1 }],
    requiresAuth: false,
    estimatedBudget: 1,
  }),
  "compare.ratings": (e) => ({
    tools: [{ name: "compare_movies", args: { movie_ids: [e.potentialTitle ?? "", e.potentialTitle2 ?? ""].filter(Boolean), fields: ["ratings"] }, priority: 1 }],
    requiresAuth: false,
    estimatedBudget: 1,
  }),
  "compare.financials": (e) => ({
    tools: [{ name: "compare_movies", args: { movie_ids: [e.potentialTitle ?? "", e.potentialTitle2 ?? ""].filter(Boolean), fields: ["financials"] }, priority: 1 }],
    requiresAuth: false,
    estimatedBudget: 1,
  }),

  "review.get_user": (e) => ({
    tools: [{ name: "get_user_reviews", args: { movie_id: e.potentialTitle ?? e.quotedText ?? "" }, priority: 1 }],
    requiresAuth: false,
    estimatedBudget: 1,
  }),
  "review.get_critic": (e) => ({
    tools: [{ name: "get_user_reviews", args: { movie_id: e.potentialTitle ?? e.quotedText ?? "", sort: "helpful" }, priority: 1 }],
    requiresAuth: false,
    estimatedBudget: 1,
  }),
  "review.get_aggregate": (e) => ({
    tools: [{ name: "get_movie_ratings", args: { movie_id: e.potentialTitle ?? e.quotedText ?? "" }, priority: 1 }],
    requiresAuth: false,
    estimatedBudget: 1,
  }),

  "critic.consensus": (e) => ({
    tools: [{ name: "get_movie_ratings", args: { movie_id: e.potentialTitle ?? e.quotedText ?? "" }, priority: 1 }],
    requiresAuth: false,
    estimatedBudget: 1,
  }),

  "upcoming.list": () => ({
    tools: [{ name: "get_upcoming_movies", args: { limit: 20 }, priority: 1 }],
    requiresAuth: false,
    estimatedBudget: 1,
  }),
  "upcoming.by_date": (e) => ({
    tools: [{ name: "get_upcoming_movies", args: { limit: 20, from_date: e.year ? `${e.year}-01-01` : undefined }, priority: 1 }],
    requiresAuth: false,
    estimatedBudget: 1,
  }),
  "upcoming.by_region": (e) => ({
    tools: [{ name: "get_upcoming_movies", args: { limit: 20, region: e.potentialTitle }, priority: 1 }],
    requiresAuth: false,
    estimatedBudget: 1,
  }),

  "hype.predict": (e) => ({
    tools: [{ name: "get_movie_details", args: { movie_id: e.potentialTitle ?? e.quotedText ?? "" }, priority: 1 }],
    requiresAuth: false,
    estimatedBudget: 1,
  }),

  "user_review.get": (e) => ({
    tools: [{ name: "get_user_reviews", args: { movie_id: e.potentialTitle ?? e.quotedText ?? "" }, priority: 1 }],
    requiresAuth: false,
    estimatedBudget: 1,
  }),

  "chat.greeting": () => ({ tools: [], requiresAuth: false, estimatedBudget: 0 }),
  "chat.farewell": () => ({ tools: [], requiresAuth: false, estimatedBudget: 0 }),
  "chat.thanks": () => ({ tools: [], requiresAuth: false, estimatedBudget: 0 }),
  "chat.help": () => ({ tools: [], requiresAuth: false, estimatedBudget: 0 }),
  "chat.capabilities": () => ({ tools: [], requiresAuth: false, estimatedBudget: 0 }),
  "chat.fallback": () => ({ tools: [], requiresAuth: false, estimatedBudget: 0 }),
  "chat.off_topic": () => ({ tools: [], requiresAuth: false, estimatedBudget: 0 }),
};

/**
 * Select tools for a given intent and entities.
 */
export function selectTools(intent: AnyIntent, entities: Record<string, string>): ToolSelection {
  const mapper = TOOL_MAPPING[intent];
  if (!mapper) {
    return { tools: [], requiresAuth: false, estimatedBudget: 0 };
  }
  return mapper(entities);
}
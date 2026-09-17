/**
 * Intent classification system. Every user message maps to exactly one intent.
 * The router is deterministic and never uses the LLM for classification.
 */

export type MovieInformationIntent =
  | "movie.info.basic"           // title, year, overview, genre, runtime
  | "movie.info.details"         // tagline, imdb_id, external_ids
  | "movie.info.release"         // release dates, status, certifications
  | "movie.info.visuals"         // posters, backdrops, stills
  | "movie.info.production"      // companies, countries, languages
  | "movie.info.financials"      // budget, revenue, currency
  | "movie.info.ratings"         // aggregate scores, certifications
  | "movie.info.credits"         // cast/crew overview
  | "movie.info.keywords"        // keywords, themes
  | "movie.info.watch_providers" // where to stream/buy
  | "movie.info.similar"         // similar movies
  | "movie.info.recommendations"; // recommendation engine output

export type PersonInformationIntent =
  | "person.info.basic"          // name, birthday, deathday, bio
  | "person.info.filmography"    // known_for, credits
  | "person.info.images"         // profile, tagged images
  | "person.info.changes"        // recent changes
  | "person.info.external_ids";  // imdb_id, wikidata, etc.

export type SearchIntent =
  | "search.movie"               // find movies by title
  | "search.person"              // find people by name
  | "search.keyword"             // find by keyword
  | "search.collection"          // find collections
  | "search.company"             // find companies
  | "search.discover"            // discover with filters (genre, year, rating, etc.)
  | "search.multi";              // multi-type search

export type RecommendationIntent =
  | "recommend.similar"          // similar to a given movie
  | "recommend.based_on"         // based on genres/actors/directors
  | "recommend.trending"         // trending/popular
  | "recommend.personalized"     // personalized (requires user context)
  | "recommend.discovery";       // discovery with filters

export type ComparisonIntent =
  | "compare.movies"             // side-by-side comparison
  | "compare.ratings"            // rating comparison
  | "compare.financials"         // budget/revenue comparison
  | "compare.cast"               // cast overlap
  | "compare.crew"               // crew overlap
  | "compare.details";           // detailed field comparison

export type ReviewIntent =
  | "review.get_user"            // get user reviews for a movie
  | "review.get_critic"          // get critic reviews
  | "review.get_aggregate"       // aggregate review scores
  | "review.search"              // search reviews
  | "review.sentiment";          // sentiment analysis of reviews

export type CriticAnalysisIntent =
  | "critic.consensus"           // critical consensus summary
  | "critic.top_critics"         // top critic reviews
  | "critic.score_distribution"  // score distribution
  | "critic.key_points"          // key praise/criticism points
  | "critic.comparison";         // critic vs audience

export type UpcomingMovieIntent =
  | "upcoming.list"              // list upcoming releases
  | "upcoming.by_date"           // by release date window
  | "upcoming.by_region"         // by region/country
  | "upcoming.by_genre"          // by genre
  | "upcoming.anticipated"       // most anticipated
  | "upcoming.changed";          // recently changed dates

export type HypePredictionIntent =
  | "hype.predict"               // predict opening weekend
  | "hype.trajectory"            // hype trajectory over time
  | "hype.social_signals"        // social media signals
  | "hype.comparison";           // compare to similar releases

export type UserReviewIntent =
  | "user_review.get"            // get user reviews
  | "user_review.aggregate"      // aggregate user sentiment
  | "user_review.recent"         // recent reviews
  | "user_review.helpful"        // most helpful reviews
  | "user_review.by_rating";     // filter by rating

export type GeneralMovieChatIntent =
  | "chat.greeting"              // hello, hi
  | "chat.farewell"              // goodbye
  | "chat.thanks"                // thank you
  | "chat.help"                  // how to use
  | "chat.capabilities"          // what can you do
  | "chat.fallback"              // unrecognized but movie-related
  | "chat.off_topic";            // not movie-related

/**
 * Union of all intent types. The deterministic router maps every message
 * to exactly one of these. The LLM is NEVER used for classification.
 */
export type AnyIntent =
  | MovieInformationIntent
  | PersonInformationIntent
  | SearchIntent
  | RecommendationIntent
  | ComparisonIntent
  | ReviewIntent
  | CriticAnalysisIntent
  | UpcomingMovieIntent
  | HypePredictionIntent
  | UserReviewIntent
  | GeneralMovieChatIntent;

/**
 * Intent categories for routing and budget allocation.
 */
export type IntentCategory =
  | "movie_information"
  | "person_information"
  | "search"
  | "recommendation"
  | "comparison"
  | "review"
  | "critic_analysis"
  | "upcoming_movie"
  | "hype_prediction"
  | "user_review"
  | "general_chat";

/**
 * Maps each intent to its category.
 */
export function getIntentCategory(intent: AnyIntent): IntentCategory {
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
  // Fallback for any future intent types (should not happen with current types)
  return "general_chat";
}

/**
 * All valid intents as a flat array for validation.
 */
export const ALL_INTENTS: readonly AnyIntent[] = [
  // Movie Information
  "movie.info.basic",
  "movie.info.details",
  "movie.info.release",
  "movie.info.visuals",
  "movie.info.production",
  "movie.info.financials",
  "movie.info.ratings",
  "movie.info.credits",
  "movie.info.keywords",
  "movie.info.watch_providers",
  "movie.info.similar",
  "movie.info.recommendations",
  // Person Information
  "person.info.basic",
  "person.info.filmography",
  "person.info.images",
  "person.info.changes",
  "person.info.external_ids",
  // Search
  "search.movie",
  "search.person",
  "search.keyword",
  "search.collection",
  "search.company",
  "search.discover",
  "search.multi",
  // Recommendation
  "recommend.similar",
  "recommend.based_on",
  "recommend.trending",
  "recommend.personalized",
  "recommend.discovery",
  // Comparison
  "compare.movies",
  "compare.ratings",
  "compare.financials",
  "compare.cast",
  "compare.crew",
  "compare.details",
  // Review
  "review.get_user",
  "review.get_critic",
  "review.get_aggregate",
  "review.search",
  "review.sentiment",
  // Critic Analysis
  "critic.consensus",
  "critic.top_critics",
  "critic.score_distribution",
  "critic.key_points",
  "critic.comparison",
  // Upcoming
  "upcoming.list",
  "upcoming.by_date",
  "upcoming.by_region",
  "upcoming.by_genre",
  "upcoming.anticipated",
  "upcoming.changed",
  // Hype
  "hype.predict",
  "hype.trajectory",
  "hype.social_signals",
  "hype.comparison",
  // User Review
  "user_review.get",
  "user_review.aggregate",
  "user_review.recent",
  "user_review.helpful",
  "user_review.by_rating",
  // General Chat
  "chat.greeting",
  "chat.farewell",
  "chat.thanks",
  "chat.help",
  "chat.capabilities",
  "chat.fallback",
  "chat.off_topic",
] as const;

/**
 * Check if a string is a valid intent.
 */
export function isValidIntent(value: string): value is AnyIntent {
  return ALL_INTENTS.includes(value as AnyIntent);
}
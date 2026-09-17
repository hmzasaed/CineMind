/**
 * Unit tests for intent classification and deterministic router.
 */

import { describe, expect, it } from "vitest";
import {
  ALL_INTENTS,
  isValidIntent,
  getIntentCategory,
  type AnyIntent,
  type IntentCategory,
} from "../intents.js";
import { routeIntent, selectTools, type RouterResult } from "../router.js";
import { isRegisteredTool, REGISTERED_TOOLS } from "../tools.js";

describe("Intent Classification", () => {
  describe("ALL_INTENTS", () => {
    it("contains all expected intent categories", () => {
      // Movie Information (12)
      expect(ALL_INTENTS.filter((i) => i.startsWith("movie.info."))).toHaveLength(12);
      // Person Information (5)
      expect(ALL_INTENTS.filter((i) => i.startsWith("person.info."))).toHaveLength(5);
      // Search (7)
      expect(ALL_INTENTS.filter((i) => i.startsWith("search."))).toHaveLength(7);
      // Recommendation (5)
      expect(ALL_INTENTS.filter((i) => i.startsWith("recommend."))).toHaveLength(5);
      // Comparison (6)
      expect(ALL_INTENTS.filter((i) => i.startsWith("compare."))).toHaveLength(6);
      // Review (5)
      expect(ALL_INTENTS.filter((i) => i.startsWith("review."))).toHaveLength(5);
      // Critic Analysis (5)
      expect(ALL_INTENTS.filter((i) => i.startsWith("critic."))).toHaveLength(5);
      // Upcoming (6)
      expect(ALL_INTENTS.filter((i) => i.startsWith("upcoming."))).toHaveLength(6);
      // Hype (4)
      expect(ALL_INTENTS.filter((i) => i.startsWith("hype."))).toHaveLength(4);
      // User Review (5)
      expect(ALL_INTENTS.filter((i) => i.startsWith("user_review."))).toHaveLength(5);
      // General Chat (7)
      expect(ALL_INTENTS.filter((i) => i.startsWith("chat."))).toHaveLength(7);
    });

    it("has no duplicate intents", () => {
      const unique = new Set(ALL_INTENTS);
      expect(unique.size).toBe(ALL_INTENTS.length);
    });
  });

  describe("isValidIntent", () => {
    it("returns true for valid intents", () => {
      expect(isValidIntent("movie.info.basic")).toBe(true);
      expect(isValidIntent("search.movie")).toBe(true);
      expect(isValidIntent("chat.greeting")).toBe(true);
    });

    it("returns false for invalid intents", () => {
      expect(isValidIntent("invalid.intent")).toBe(false);
      expect(isValidIntent("movie.info")).toBe(false);
      expect(isValidIntent("")).toBe(false);
    });
  });

  describe("getIntentCategory", () => {
    it("maps movie info intents correctly", () => {
      expect(getIntentCategory("movie.info.basic")).toBe("movie_information");
      expect(getIntentCategory("movie.info.financials")).toBe("movie_information");
      expect(getIntentCategory("movie.info.credits")).toBe("movie_information");
    });

    it("maps search intents correctly", () => {
      expect(getIntentCategory("search.movie")).toBe("search");
      expect(getIntentCategory("search.discover")).toBe("search");
    });

    it("maps other categories correctly", () => {
      expect(getIntentCategory("recommend.similar")).toBe("recommendation");
      expect(getIntentCategory("compare.movies")).toBe("comparison");
      expect(getIntentCategory("review.get_user")).toBe("review");
      expect(getIntentCategory("critic.consensus")).toBe("critic_analysis");
      expect(getIntentCategory("upcoming.list")).toBe("upcoming_movie");
      expect(getIntentCategory("hype.predict")).toBe("hype_prediction");
      expect(getIntentCategory("user_review.get")).toBe("user_review");
      expect(getIntentCategory("chat.help")).toBe("general_chat");
    });
  });
});

describe("Deterministic Router", () => {
  describe("Movie Information Routing", () => {
    it("routes basic movie info queries", () => {
      const result = routeIntent("What is The Shawshank Redemption about?");
      expect(result.intent).toBe("movie.info.basic");
      expect(result.confidence).toBeGreaterThan(0.7);
      expect(result.category).toBe("movie_information");
    });

    it("routes release date queries", () => {
      const result = routeIntent("When was The Dark Knight released?");
      expect(result.intent).toBe("movie.info.release");
      expect(result.category).toBe("movie_information");
    });

    it("routes financial queries", () => {
      const result = routeIntent("What was Inception's budget and box office?");
      expect(result.intent).toBe("movie.info.financials");
      expect(result.category).toBe("movie_information");
    });

    it("routes rating queries", () => {
      const result = routeIntent("What is the IMDB rating of The Shawshank Redemption?");
      expect(result.intent).toBe("movie.info.ratings");
      expect(result.category).toBe("movie_information");
    });

    it("routes cast/crew queries", () => {
      const result = routeIntent("Who directed The Dark Knight?");
      expect(result.intent).toBe("movie.info.credits");
      expect(result.category).toBe("movie_information");
    });
  });

  describe("Search Routing", () => {
    it("routes movie search", () => {
      const result = routeIntent("Find me the movie Inception");
      expect(result.intent).toBe("search.movie");
      expect(result.category).toBe("search");
    });

    it("routes discover queries", () => {
      const result = routeIntent("What should I watch?");
      expect(result.intent).toBe("search.discover");
      expect(result.category).toBe("search");
    });

    it("routes discover with from year", () => {
      const result = routeIntent("Movies from 2010");
      expect(result.intent).toBe("search.discover");
      expect(result.category).toBe("search");
      expect(result.extractedEntities.year).toBe("2010");
    });
  });

  describe("Recommendation Routing", () => {
    it("routes similar movie recommendations", () => {
      const result = routeIntent("Movies similar to Inception");
      expect(result.intent).toBe("recommend.similar");
      expect(result.category).toBe("recommendation");
    });

    it("routes trending recommendations", () => {
      const result = routeIntent("What's trending now?");
      expect(result.intent).toBe("recommend.trending");
      expect(result.category).toBe("recommendation");
    });
  });

  describe("Comparison Routing", () => {
    it("routes movie comparison", () => {
      const result = routeIntent("Compare The Dark Knight and Batman Begins");
      expect(result.intent).toBe("compare.movies");
      expect(result.category).toBe("comparison");
    });

    it("routes rating comparison", () => {
      const result = routeIntent("Which has higher rating: Inception or Interstellar?");
      expect(result.intent).toBe("compare.ratings");
      expect(result.category).toBe("comparison");
    });
  });

  describe("Review Routing", () => {
    it("routes user review queries", () => {
      const result = routeIntent("What do people think of The Shawshank Redemption?");
      expect(result.intent).toBe("review.get_user");
      expect(result.category).toBe("review");
    });

    it("routes critic review queries", () => {
      const result = routeIntent("What did critics say about The Dark Knight?");
      expect(result.intent).toBe("review.get_critic");
      expect(result.category).toBe("review");
    });
  });

  describe("Upcoming Routing", () => {
    it("routes upcoming movies list", () => {
      const result = routeIntent("What movies are coming soon?");
      expect(result.intent).toBe("upcoming.list");
      expect(result.category).toBe("upcoming_movie");
    });

    it("routes upcoming by date", () => {
      const result = routeIntent("What movies are releasing this month?");
      expect(result.intent).toBe("upcoming.by_date");
      expect(result.category).toBe("upcoming_movie");
    });
  });

  describe("General Chat Routing", () => {
    it("routes greetings", () => {
      const result = routeIntent("Hello!");
      expect(result.intent).toBe("chat.greeting");
      expect(result.confidence).toBeGreaterThan(0.9);
      expect(result.category).toBe("general_chat");
    });

    it("routes farewells", () => {
      const result = routeIntent("Goodbye!");
      expect(result.intent).toBe("chat.farewell");
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    it("routes help", () => {
      const result = routeIntent("Help");
      expect(result.intent).toBe("chat.help");
      expect(result.category).toBe("general_chat");
    });

    it("routes capabilities", () => {
      const result = routeIntent("What can you do?");
      expect(result.intent).toBe("chat.capabilities");
      expect(result.category).toBe("general_chat");
    });
  });

  describe("Off-topic Detection", () => {
    it("detects weather queries as off-topic", () => {
      const result = routeIntent("What's the weather like?");
      expect(result.isOffTopic).toBe(true);
      expect(result.intent).toBe("chat.off_topic");
    });

    it("detects programming queries as off-topic", () => {
      const result = routeIntent("How do I debug this code?");
      expect(result.isOffTopic).toBe(true);
      expect(result.intent).toBe("chat.off_topic");
    });

    it("detects crypto queries as off-topic", () => {
      const result = routeIntent("What's the bitcoin price?");
      expect(result.isOffTopic).toBe(true);
      expect(result.intent).toBe("chat.off_topic");
    });
  });

  describe("Entity Extraction", () => {
    it("extracts year from query", () => {
      const result = routeIntent("Movies from 2010");
      expect(result.extractedEntities.year).toBe("2010");
    });

    it("extracts quoted text", () => {
      const result = routeIntent('Tell me about "Inception"');
      expect(result.extractedEntities.quotedText).toBe("Inception");
    });
  });
});

describe("Tool Selection", () => {
  it("selects get_movie_details for movie.info.basic", () => {
    const selection = selectTools("movie.info.basic", { quotedText: "Inception" });
    expect(selection.tools).toHaveLength(1);
    expect(selection.tools[0].name).toBe("get_movie_details");
    expect(selection.requiresAuth).toBe(false);
  });

  it("selects search_movies for search.movie", () => {
    const selection = selectTools("search.movie", { potentialTitle: "Inception", year: "2010" });
    expect(selection.tools).toHaveLength(1);
    expect(selection.tools[0].name).toBe("search_movies");
    expect(selection.tools[0].args).toMatchObject({ title: "Inception", year: 2010 });
  });

  it("selects compare_movies for compare.movies", () => {
    const selection = selectTools("compare.movies", { potentialTitle: "Inception" });
    expect(selection.tools).toHaveLength(1);
    expect(selection.tools[0].name).toBe("compare_movies");
  });

  it("selects recommend_movies for recommend.similar", () => {
    const selection = selectTools("recommend.similar", { potentialTitle: "Inception" });
    expect(selection.tools).toHaveLength(1);
    expect(selection.tools[0].name).toBe("recommend_movies");
    expect(selection.tools[0].args.based_on).toBe("movie_id");
  });

  it("selects get_upcoming_movies for upcoming.list", () => {
    const selection = selectTools("upcoming.list", {});
    expect(selection.tools).toHaveLength(1);
    expect(selection.tools[0].name).toBe("get_upcoming_movies");
  });

  it("returns no tools for chat intents", () => {
    const selection = selectTools("chat.greeting", {});
    expect(selection.tools).toHaveLength(0);
    expect(selection.estimatedBudget).toBe(0);
  });
});

describe("Tool Allowlist", () => {
  it("contains exactly 10 registered tools", () => {
    expect(REGISTERED_TOOLS).toHaveLength(10);
  });

  it("includes all required tools", () => {
    expect(REGISTERED_TOOLS).toContain("search_movies");
    expect(REGISTERED_TOOLS).toContain("get_movie_details");
    expect(REGISTERED_TOOLS).toContain("get_movie_cast");
    expect(REGISTERED_TOOLS).toContain("get_movie_crew");
    expect(REGISTERED_TOOLS).toContain("get_movie_financials");
    expect(REGISTERED_TOOLS).toContain("get_movie_ratings");
    expect(REGISTERED_TOOLS).toContain("get_user_reviews");
    expect(REGISTERED_TOOLS).toContain("compare_movies");
    expect(REGISTERED_TOOLS).toContain("recommend_movies");
    expect(REGISTERED_TOOLS).toContain("get_upcoming_movies");
  });

  it("isRegisteredTool returns true for registered tools", () => {
    expect(isRegisteredTool("search_movies")).toBe(true);
    expect(isRegisteredTool("get_movie_details")).toBe(true);
  });

  it("isRegisteredTool returns false for unregistered tools", () => {
    expect(isRegisteredTool("invalid_tool")).toBe(false);
    expect(isRegisteredTool("delete_movie")).toBe(false);
    expect(isRegisteredTool("")).toBe(false);
  });
});
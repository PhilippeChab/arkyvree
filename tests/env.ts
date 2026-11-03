/**
 * Preloaded first (bunfig.toml), before any module reads it: an exported NODE_ENV would otherwise win over .env.test.
 */

process.env.NODE_ENV = "test";

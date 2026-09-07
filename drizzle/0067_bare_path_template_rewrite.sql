-- Rewrite legacy bare-path template values to bracketed form so the
-- template-expression parser sees a single canonical shape:
--   {{ abilities.charisma.modifier }}  →  {{ [abilities.charisma.modifier] }}
--
-- The parser accepts both, but the modifier-editor UI's "single path"
-- detection cares about brackets — without this rewrite, legacy rows
-- silently fall back to literal mode on edit.
--
-- Lives in drizzle (not a content-package update) because the template
-- syntax is engine-wide: any base ruleset using the customization tables
-- inherits this rewrite, regardless of which content packages are installed.
--
-- Pattern: `{{ <identifier-with-dots> }}` exactly — single bare path, no
-- spaces inside, no operators or function calls. Anything more complex is
-- already in the new form (or always was) and skipped.

UPDATE customization.modifiers
SET value = regexp_replace(value, '^\{\{\s*([a-zA-Z][a-zA-Z0-9_.]*)\s*\}\}$', '{{ [\1] }}')
WHERE value ~ '^\{\{\s*[a-zA-Z][a-zA-Z0-9_.]*\s*\}\}$'
  AND deleted_at IS NULL;

UPDATE customization.requirements
SET value = regexp_replace(value, '^\{\{\s*([a-zA-Z][a-zA-Z0-9_.]*)\s*\}\}$', '{{ [\1] }}')
WHERE value ~ '^\{\{\s*[a-zA-Z][a-zA-Z0-9_.]*\s*\}\}$'
  AND deleted_at IS NULL;

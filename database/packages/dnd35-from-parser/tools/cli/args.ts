/** The parser commands' arguments. */

/**
 * A command's filters, from its arguments (`argv`, the command line's by default): `<book> [<name>] [--type <type>]
 * [--key <key>]`.
 */
export function parseCliArgs(argv = process.argv.slice(2)): {
  bookFilter?: string;
  keyFilter?: string;
  nameFilter?: string;
  typeFilter?: string;
} {
  const args = [...argv];

  const typeIdx = args.indexOf("--type");
  const typeFilter = typeIdx >= 0 ? args.splice(typeIdx, 2)[1] : undefined;

  const keyIdx = args.indexOf("--key");
  const keyFilter = keyIdx >= 0 ? args.splice(keyIdx, 2)[1] : undefined;

  // Any other option would be read as a book, and match none
  const unknown = args.find((arg) => arg.startsWith("--"));
  if (unknown)
    throw new Error(`Unknown option ${unknown}: a book is named without one (<book> [<name>] [--type <type>])`);

  const bookFilter = args[0];
  const nameFilter = args[1]?.toLowerCase();

  return { bookFilter, typeFilter, nameFilter, keyFilter };
}

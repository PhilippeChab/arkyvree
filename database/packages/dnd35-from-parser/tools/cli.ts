/** The parser commands' arguments. */

export function parseCliArgs(): { bookFilter?: string; typeFilter?: string; nameFilter?: string; keyFilter?: string } {
  const args = process.argv.slice(2);

  const typeIdx = args.indexOf("--type");
  const typeFilter = typeIdx >= 0 ? args.splice(typeIdx, 2)[1] : undefined;

  const keyIdx = args.indexOf("--key");
  const keyFilter = keyIdx >= 0 ? args.splice(keyIdx, 2)[1] : undefined;

  const bookFilter = args[0];
  const nameFilter = args[1]?.toLowerCase();

  return { bookFilter, typeFilter, nameFilter, keyFilter };
}

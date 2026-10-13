// Command-line arguments: positionals plus a few known flags. Unknown flags are a usage error,
// so a typo never runs a command with the wrong meaning.

export interface Args {
  positionals: string[];
  json: boolean;
  help: boolean;
  version: boolean;
  undo: boolean;
  token: string | undefined;
  agent: string | undefined;
  file: string | undefined;
}

export class UsageError extends Error {}

const VALUE_FLAGS = ["token", "agent", "file"] as const;
type ValueFlag = (typeof VALUE_FLAGS)[number];

export function parseArgs(argv: string[]): Args {
  const out: Args = {
    positionals: [],
    json: false,
    help: false,
    version: false,
    undo: false,
    token: undefined,
    agent: undefined,
    file: undefined,
  };
  let rest = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (rest || !arg.startsWith("-") || arg === "-" || /^-\d/.test(arg)) {
      out.positionals.push(arg);
      continue;
    }
    if (arg === "--") {
      rest = true;
      continue;
    }
    const [flag, inline] = arg.includes("=")
      ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)]
      : [arg, undefined];
    switch (flag) {
      case "--json":
        out.json = true;
        break;
      case "-h":
      case "--help":
        out.help = true;
        break;
      case "-v":
      case "--version":
        out.version = true;
        break;
      case "--undo":
        out.undo = true;
        break;
      default: {
        const name = flag.slice(2) as ValueFlag;
        if (!flag.startsWith("--") || !VALUE_FLAGS.includes(name))
          throw new UsageError(`There's no option ${flag}. Run kriyan --help to see the options.`);
        const value = inline ?? argv[++i];
        if (value === undefined || value === "") throw new UsageError(`${flag} needs a value.`);
        out[name] = value;
      }
    }
  }
  return out;
}

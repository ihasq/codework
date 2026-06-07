const KEY_VALUE_ARG = /^([a-z][a-z0-9-]*)=(.*)$/;

export function preprocessArgv(argv: string[]): string[] {
  return argv.map((arg) => {
    if (arg.startsWith("-")) {
      return arg;
    }

    const match = KEY_VALUE_ARG.exec(arg);
    if (!match) {
      return arg;
    }

    return `--${match[1]}=${match[2]}`;
  });
}

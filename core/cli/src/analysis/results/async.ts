import { AsyncMode } from './arguments';

let warn = true;

export function withAsync<A extends AsyncMode | boolean, T>(
  cb: () => A,
  value: T,
): T & { async: A } {
  let async: A | undefined;

  return {
    ...value,
    get async(): A {
      if (warn) {
        console.trace('Warning: async getter called prematurely!');
      }

      return (async ??= cb());
    },
  };
}

withAsync.stopWarnings = () => {
  warn = false;
};

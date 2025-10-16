import {
  AutowiringErrorReporter,
  ConfigErrorReporter,
  CyclicDependencyErrorReporter,
  DefinitionErrorReporter,
  ExtensionErrorReporter,
  InternalErrorReporter,
  UnknownErrorReporter,
  UnsupportedErrorReporter,
  UserCodeErrorReporter,
  UserErrorReporter,
} from './reporters';
import { ErrorReporter } from './types';

const reporters: Set<ErrorReporter<any>> = new Set([
  new CyclicDependencyErrorReporter(),
  new AutowiringErrorReporter(),
  new DefinitionErrorReporter(),
  new UnsupportedErrorReporter(),
  new UserCodeErrorReporter(),
  new ConfigErrorReporter(),
  new UserErrorReporter(),
  new ExtensionErrorReporter(),
  new InternalErrorReporter(),
  new UnknownErrorReporter(),
]);

export function* formatErrorReport(error: unknown): Iterable<string> {
  for (const reporter of reporters) {
    if (reporter.supports(error)) {
      yield* reporter.report(error);
      return;
    }
  }

  yield 'unreachable!!';
}

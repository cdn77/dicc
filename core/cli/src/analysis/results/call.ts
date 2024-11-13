import { ArgumentList } from './arguments';

export type Call = {
  resource: string;
  statement: string;
  args: ArgumentList;
  async: boolean;
};

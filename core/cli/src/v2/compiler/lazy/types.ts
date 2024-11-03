import { LazyTemplate } from './lazyTemplate';
import { LazyWriter } from './lazyWriter';

export type LazyCallback = () => Lazy;
export type Lazy = LazyWriter | LazyTemplate | LazyCallback | string;

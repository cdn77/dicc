import { ContainerBuilder } from '../container';
import { Event } from '../events';
import { Container } from './results';
import { ServiceAnalyser } from './serviceAnalyser';

export class ContainersAnalysed extends Event {
  constructor(readonly containers: Map<ContainerBuilder, Container>) {
    super();
  }
}

export class AnalyseServices extends Event {
  constructor(
    readonly container: Container,
    readonly builder: ContainerBuilder,
    readonly analyser: ServiceAnalyser,
  ) {
    super();
  }
}

export class ServicesAnalysed extends Event {
  constructor(
    readonly container: Container,
    readonly builder: ContainerBuilder,
    readonly analyser: ServiceAnalyser,
  ) {
    super();
  }
}

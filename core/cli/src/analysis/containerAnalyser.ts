import { SourceFile } from 'ts-morph';
import { ContainerBuilder } from '../container';
import { LocalServiceDefinition } from '../definitions';
import { getOrCreate } from '../utils';
import { ContainerReflector } from './reflection';
import { Call, Container, Service, TypeSpecifierWithAsync, withAsync } from './results';
import { ServiceAnalyser } from './serviceAnalyser';

export class ContainerAnalyser {
  private readonly builders: Map<SourceFile, ContainerBuilder> = new Map();
  private readonly results: Map<ContainerBuilder, Container> = new Map();

  constructor(
    private readonly reflector: ContainerReflector,
    private readonly serviceAnalyser: ServiceAnalyser,
  ) {
  }

  analyse(builders: Iterable<ContainerBuilder>): Iterable<[ContainerBuilder, Container]> {
    for (const builder of builders) {
      this.builders.set(builder.sourceFile, builder);
      this.results.set(builder, createEmptyResult(builder.options.className, builder.options.preamble));
    }

    this.mergeChildContainers();
    this.analyseServices();
    this.analyseContainers();

    return this.results;
  }

  private mergeChildContainers(): void {
    for (const container of this.builders.values()) {
      for (const child of container.getChildContainers()) {
        this.mergeChildServices(container, child);
      }
    }
  }

  private mergeChildServices(parent: ContainerBuilder, child: LocalServiceDefinition): void {
    const reflection = this.reflector.getContainerReflection(child);

    for (const svc of reflection.getPublicServices()) {
      parent.addForeignDefinition(child, svc.id, svc.type, svc.aliases, svc.definition, svc.async);
    }
  }

  private analyseServices(): void {
    for (const builder of this.builders.values()) {
      for (const service of builder.getPublicServices()) {
        this.serviceAnalyser.analyseServiceDefinition(service);
      }
    }

    withAsync.stopWarnings();

    for (const [builder, service] of this.serviceAnalyser.getAnalysedServices()) {
      this.results.get(builder)?.services.add(service);
    }
  }

  private analyseContainers(): void {
    for (const [builder, result] of this.results) {
      this.analyseContainer(builder, result);
    }
  }

  private analyseContainer(builder: ContainerBuilder, container: Container): void {
    this.registerResources(builder, container);

    for (const service of container.services) {
      this.analyseService(container, service, builder);
    }
  }

  private registerResources(builder: ContainerBuilder, container: Container): void {
    for (const [alias, staticImport, dynamicImport] of builder.getResourceMap()) {
      container.resources.set(alias, {
        staticImport,
        dynamicImport,
        needsType: false,
        needsValue: !builder.options.lazyImports,
      });
    }
  }

  private analyseService(container: Container, service: Service, builder: ContainerBuilder): void {
    this.registerServiceTypes(container, service);

    if (builder.options.lazyImports) {
      this.analyseServiceResources(container, service);
    }
  }

  private registerServiceTypes(container: Container, service: Service): void {
    const type: TypeSpecifierWithAsync = { ...service.type, async: service.async };

    if (type.kind === 'local') {
      const resource = container.resources.get(type.resource);
      resource && (resource.needsType = true);
      type.indirect && container.imports.add('type ServiceType');
    } else {
      const resource = container.resources.get(type.container.resource);
      resource && (resource.needsType = true);
      type.container.indirect && container.imports.add('type ServiceType');
      container.imports.add('type ForeignServiceType');
    }

    const map = service.factory ? container.anonymousTypes : container.dynamicTypes;

    if (!service.id.startsWith('#')) {
      container.publicTypes.set(service.id, type);
    } else {
      getOrCreate(map, service.id, () => new Set()).add(type);
    }

    for (const alias of service.aliases) {
      getOrCreate(map, alias, () => new Set()).add(type);
    }
  }

  private analyseServiceResources(container: Container, service: Service): void {
    if (service.factory) {
      if (service.factory.kind === 'local' || service.factory.kind === 'auto-class') {
        this.analyseCallResources(container, service.factory.call, service.async);
      }

      if (service.factory.kind === 'auto-class' || service.factory.kind === 'auto-interface') {
        if (service.factory.method.name === 'create' && !service.factory.method.async) {
          this.analyseServiceResources(container, service.factory.method.service);
        }
      }
    }

    if (service.decorate) {
      this.analyseCallListResources(container, service.decorate.calls, service.async);
    }

    if (service.onCreate) {
      this.analyseCallListResources(container, service.onCreate.calls, service.async);
    }

    if (service.onFork) {
      if (service.onFork.serviceCall) {
        this.analyseCallResources(container, service.onFork.serviceCall, true);
      }

      this.analyseCallListResources(container, service.onFork.calls, true);
    }

    if (service.onDestroy) {
      this.analyseCallListResources(container, service.onDestroy.calls, service.onDestroy.async);
    }
  }

  private analyseCallListResources(container: Container, calls: Call[], async?: boolean): void {
    for (const call of calls) {
      this.analyseCallResources(container, call, async);
    }
  }

  private analyseCallResources(container: Container, call: Call, async: boolean = call.async): void {
    if (!async) {
      const resource = container.resources.get(call.resource);
      resource && (resource.needsValue = true);
    }

    if (container.imports.has('toAsyncIterable') && container.imports.has('toSyncIterable')) {
      return;
    }

    for (const arg of call.args) {
      if (arg.kind === 'injected' && arg.mode === 'iterable') {
        switch (arg.async) {
          case 'await': container.imports.add('toSyncIterable'); break;
          case 'wrap': container.imports.add('toAsyncIterable'); break;
        }
      }
    }
  }
}

function createEmptyResult(className: string, preamble?: string): Container {
  return {
    resources: new Map(),
    imports: new Set(),
    publicTypes: new Map(),
    dynamicTypes: new Map(),
    anonymousTypes: new Map(),
    services: new Set(),
    className,
    preamble,
  };
}

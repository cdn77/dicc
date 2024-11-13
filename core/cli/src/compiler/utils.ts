import {
  ForeignTypeSpecifier,
  LocalTypeSpecifier, Resource, Service,
  TypeSpecifier,
} from '../analysis';
import { MapEntry } from '../utils';

export function formatLocalType(type: LocalTypeSpecifier): string {
  return type.indirect ? `ServiceType<typeof ${type.path}>` : type.path;
}

export function formatForeignType(type: ForeignTypeSpecifier): string {
  return `ForeignServiceType<${formatLocalType(type.container)}, '${type.id}'>`;
}

export function formatType(type: TypeSpecifier): string {
  return type.kind === 'foreign' ? formatForeignType(type) : formatLocalType(type);
}

function strcmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function compareKeys<V>(a: MapEntry<string, V>, b: MapEntry<string, V>): number {
  return strcmp(a.k, b.k);
}

function pathcmp(a: string, b: string): number {
  const upa = a.match(/^(?:\.\/)?((?:\.\.\/)*)(.+)$/)!;
  const upb = b.match(/^(?:\.\/)?((?:\.\.\/)*)(.+)$/)!;
  return (upb[1].length - upa[1].length) || strcmp(upa[2], upb[2]);
}

export function compareResources(a: MapEntry<string, Resource>, b: MapEntry<string, Resource>): number {
  return pathcmp(a.v.staticImport, b.v.staticImport) || strcmp(a.k, b.k);
}

export function compareServiceIds(a: Service, b: Service): number {
  return (a.id.indexOf('#') - b.id.indexOf('#')) || strcmp(a.id, b.id);
}

export function compareTypes(a: TypeSpecifier, b: TypeSpecifier): number {
  const [na, ka] = a.kind === 'foreign' ? [a.container.path, a.id] : [a.path, ''];
  const [nb, kb] = b.kind === 'foreign' ? [b.container.path, b.id] : [b.path, ''];
  return strcmp(na, nb) || strcmp(ka, kb);
}

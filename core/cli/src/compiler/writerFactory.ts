import { CodeBlockWriter, Project } from 'ts-morph';

export class WriterFactory {
  constructor(private readonly project: Project) {}

  create(): CodeBlockWriter {
    return this.project.createWriter();
  }
}

import type { Agent } from '..';
import type {
  CompilePhysicsContextOptions,
  PhysicsCapsule,
  PhysicsContextPack,
  PhysicsMemoryRegistry,
} from '../../physics-memory';

export type PhysicsMemoryRecordSource = 'session-start' | 'model-tool' | 'controller' | 'replay';

export interface PhysicsMemoryToolRecordOptions {
  readonly source: PhysicsMemoryRecordSource;
  readonly toolCallId?: string | undefined;
}

export class PhysicsMemoryManager {
  constructor(
    private readonly agent: Agent,
    readonly registry: PhysicsMemoryRegistry,
  ) {}

  recordRootsLoaded(source: PhysicsMemoryRecordSource): void {
    this.agent.records.logRecord({
      type: 'physics_memory.roots_loaded',
      source,
      roots: this.registry.getRoots(),
      capsuleCount: this.registry.listCapsules().length,
      domains: this.registry.listDomains(),
      diagnostics: this.registry.getDiagnostics().map((diagnostic) => ({
        severity: diagnostic.severity,
        code: diagnostic.code,
        capsuleId: diagnostic.capsuleId,
        path: diagnostic.path,
        rootPath: diagnostic.rootPath,
      })),
    });
  }

  recordCapsuleLoaded(
    capsule: PhysicsCapsule,
    options: PhysicsMemoryToolRecordOptions,
  ): void {
    this.agent.records.logRecord({
      type: 'physics_memory.capsule_loaded',
      source: options.source,
      capsuleId: capsule.metadata.id,
      domain: capsule.metadata.domain,
      kind: capsule.metadata.kind,
      ...(options.toolCallId === undefined ? {} : { toolCallId: options.toolCallId }),
    });
  }

  recordContextCompiled(
    input: CompilePhysicsContextOptions,
    pack: PhysicsContextPack,
    options: PhysicsMemoryToolRecordOptions,
  ): void {
    this.agent.records.logRecord({
      type: 'physics_memory.context_compiled',
      source: options.source,
      domain: input.domain,
      focus: input.focus ?? [],
      capsuleIds: pack.capsules.map((capsule) => capsule.metadata.id),
      diagnostics: pack.diagnostics.map((diagnostic) => ({
        severity: diagnostic.severity,
        code: diagnostic.code,
        capsuleId: diagnostic.capsuleId,
      })),
      ...(options.toolCallId === undefined ? {} : { toolCallId: options.toolCallId }),
    });
  }
}

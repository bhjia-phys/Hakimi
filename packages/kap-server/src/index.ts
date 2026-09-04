/**
 * `@moonshot-ai/kap-server` public surface — the Kimi Code server backed by the
 * DI × Scope agent engine (`@moonshot-ai/agent-core-v2`).
 */

export { startServer } from './start';
export type { ServerHostIdentity, ServerStartOptions, RunningServer } from './start';
export { okEnvelope, errEnvelope } from './envelope';
export type { Envelope } from './envelope';
export {
  createRemoteShareController,
  createEphemeralAuthTokenService,
  RemoteShareError,
  REMOTE_SHARE_ALREADY_ACTIVE_CODE,
} from './remoteShare/controller';
export { REMOTE_SHARE_FLAG_ID, projectRemoteShareStatus } from './remoteShare/contract';
export type {
  IRemoteShareController,
  RemoteShareStatus,
  RemoteShareStartResult,
  RemoteShareStartInput,
  RemoteAccessEdge,
  RemoteAccessEdgeFactory,
  RemoteAccessEdgeFactoryArgs,
} from './remoteShare/contract';
export {
  REMOTE_PERSISTENT_FLAG_ID,
  projectRemotePersistentStatus,
  RemotePersistentError,
  REMOTE_PERSISTENT_START_FAILED_CODE,
  REMOTE_PERSISTENT_STOP_FAILED_CODE,
  REMOTE_PERSISTENT_UNSUPPORTED_CODE,
} from './remotePersistent/contract';
export type {
  IRemotePersistentController,
  RemotePersistentStatus,
} from './remotePersistent/contract';
export { classify } from './security/bindClassify';
export type { BindClass } from './security/bindClassify';
export { rotateServerToken, serverTokenPath } from './services/auth/persistentToken';
export { createServerLogger } from './services/pinoLoggerService';
export type {
  CreateLoggerOptions,
  ServerLogger,
  ServerLogLevel,
} from './services/pinoLoggerService';
export {
  createInstanceRegistry,
  listLiveServerInstances,
  getLiveServerInstance,
  resolveServerInstancesDir,
  DEFAULT_SERVER_DIR,
  DEFAULT_SERVER_INSTANCES_DIR,
  HEARTBEAT_INTERVAL_MS,
} from './instanceRegistry';
export type {
  IInstanceRegistry,
  InstanceRegistration,
  InstanceRegistryOptions,
  ServerInstanceInfo,
} from './instanceRegistry';

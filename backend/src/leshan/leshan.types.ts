export interface LeshanObjectLink {
  url: string;
  attributes: Record<string, string>;
}

export interface LeshanClientRegistration {
  endpoint: string;
  registrationId: string;
  registrationDate: number;
  lastUpdate: number;
  address: string;
  lwM2mVersion: string;
  lifetime: number;
  bindingMode: string;
  rootPath: string;
  objectLinks: LeshanObjectLink[];
  secure: boolean;
  queuemode: boolean;
  availableInstances?: Record<string, number[]>;
  [key: string]: unknown;
}

export interface LeshanResponse<T = unknown> {
  status: string;
  valid: boolean;
  success: boolean;
  failure: boolean;
  content?: T;
  errorMessage?: string;
}

export interface LeshanResourceContent {
  kind: 'singleResource';
  id: number;
  type: string;
  value: unknown;
}

export interface LeshanInstanceContent {
  kind: 'instance';
  id: number;
  resources: LeshanResourceContent[];
}

export interface LeshanHealth {
  status: 'ok';
  clients: number;
}

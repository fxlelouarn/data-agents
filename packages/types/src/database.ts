// Enum types used by database
export enum AgentType {
  EXTRACTOR = 'EXTRACTOR',
  COMPARATOR = 'COMPARATOR',
  VALIDATOR = 'VALIDATOR',
  CLEANER = 'CLEANER',
  DUPLICATOR = 'DUPLICATOR',
  SPECIFIC_FIELD = 'SPECIFIC_FIELD'
}

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

export enum ProposalType {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
}

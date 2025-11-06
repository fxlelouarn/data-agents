// Configuration schema for dynamic forms
export interface ConfigFieldOption {
  value: string
  label: string
}

export interface ConfigFieldValidation {
  required?: boolean
  min?: number
  max?: number
  step?: number
  pattern?: string
  message?: string
}

export interface ConfigField {
  name: string
  label: string
  type: 'text' | 'number' | 'password' | 'select' | 'textarea' | 'switch' | 'slider'
  category?: string
  required?: boolean
  defaultValue?: any
  description?: string
  helpText?: string
  placeholder?: string
  options?: ConfigFieldOption[]
  validation?: ConfigFieldValidation
}

export interface ConfigCategory {
  id: string
  label: string
  description?: string
}

export interface ConfigSchema {
  title: string
  description?: string
  categories?: ConfigCategory[]
  fields: ConfigField[]
}

declare module 'lodash' {
  export type DebouncedFunction<T extends (...args: any[]) => any> = T & {
    cancel(): void
    flush(): void
  }

  export function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait?: number,
    options?: any
  ): DebouncedFunction<T>
}

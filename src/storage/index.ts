export interface CacheStorage {
  canCachePromise(): boolean
  get(key: string): Promise<any | undefined> | any | undefined
  set(key: string, value: any, exp: number): void
}

export * from './inmemory'
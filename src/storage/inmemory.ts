import type { CacheStorage } from '.'

export class InMemoryStorage implements CacheStorage {

  public store: { [key: string]: { value: Promise<any> | any, exp: number } } = {}

  canCachePromise() {
    return true
  }

  get(key: string): any | undefined {
    const found = this.store[key]
    if (!found || found.exp < new Date().getTime()) {
      return undefined
    }
    return found.value
  }

  set(key: string, value: any | Promise<any>, exp: number) {
    this.store[key] = { value, exp }
  }
}
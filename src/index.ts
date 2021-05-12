import type { CacheStorage } from './storage'
import { InMemoryStorage } from './storage'

interface CacheKeyOptions {
  /**
   * Number of Milliseconds to store this value.
   */
  ttl: number
}

interface CacheKeyManyOptions<S, R> extends CacheKeyOptions {
  cacheKey: (source: S) => string
  resultKey: (result: R) => string
}

interface SingleCacher<T> {
  (resolver: () => Promise<T>): Promise<T>
}

/**
 * Attempt to all objects in ordered fashion based on given source.
 *
 * @param prefix 
 * @param opts 
 * @returns 
 */
interface IterableCacher<S, R> {
  (source: S[], resolver: (missedSource: S[], missedKeys: string[]) => Promise<R[]>): Promise<R[]>
}

const isNil = (o: any): boolean => (typeof o === 'undefined' || o === null)


export class Capsu {

  constructor(
    private readonly storage: CacheStorage = new InMemoryStorage(),
    private readonly prefix: string = '',
    private readonly defaultTtlInMs: number = 2000
  ) {}

  public nested(prefix: string): Capsu {
    return new Capsu(this.storage, `${this.prefix}:${prefix}`, this.defaultTtlInMs)
  }

  /**
   * Create cachable object with specific key
   *
   * @param key 
   * @param op 
   * @returns 
   */
  public of<T>(key: string, op: Partial<CacheKeyOptions> = {}): SingleCacher<T> {
    const opts: CacheKeyOptions = {
      ttl: op.ttl || this.defaultTtlInMs,
    }
    const concreteKey = `${this.prefix}:${key}`
    return async (resolver) => {
      const cached = this.storage.get(concreteKey)
      if (!isNil(cached)) {
        return cached
      }
      if (this.storage.canCachePromise()) {
        const toCache = resolver()
        this.storage.set(concreteKey, toCache, new Date().getTime() + opts.ttl)
        return toCache
      }
      const toCache = await resolver()
      this.storage.set(concreteKey, toCache, new Date().getTime() + opts.ttl)
      return toCache
    }
  }

  /**
   * Create a listOf cachable proxy object.
   *
   * @param prefix
   * @param op
   * @returns cache proxy object.
   */
  public listOf<S, R>(prefix: string, op: Partial<CacheKeyManyOptions<S, R>> = {}): IterableCacher<S, R> {
    const concreteKeyPrefix = `${this.prefix}:${prefix}`
    const opts: CacheKeyManyOptions<S, R> = {
      ttl: op.ttl || this.defaultTtlInMs,
      cacheKey: op.cacheKey || ((k: any) => `${k}`),
      resultKey: op.resultKey || ((r: R) => r && `${(r as any)['id']}`)
    }
    return async (source, resolve) => {
      const result = new Array<R>(source.length)
      const missedKeys: string[] = []
      const missedKeyToIndex: { [key: string]: number } = {}

      // determine if any key misses from cache?
      const missedSources: S[] = []
      for (let index = 0; index < source.length; index += 1) {
        const src = source[index]
        const key = opts.cacheKey(src)
        const cached = await this.storage.get(`${concreteKeyPrefix}:${key}`)
        if (!isNil(cached)) {
          result[index] = cached
          continue
        }
        // missed key items
        missedKeyToIndex[key] = index
        missedKeys.push(key)
        missedSources.push(src)
      }

      // Perform resolve only missed items.
      if (missedSources.length > 0) {
        let toCacheList: any = resolve(missedSources, missedKeys)

        // If this is cachable result.
        if (toCacheList.then && this.storage.canCachePromise()) {
          const exp = new Date().getTime() + opts.ttl
          const toWait: Promise<void>[] = []
          for (const src of missedSources) {
            const key = opts.cacheKey(src)
            const index = missedKeyToIndex[key]
            const toCache = toCacheList
              .then((results: any[]) => {
                const matched = results.find((r: any) => (opts.resultKey(r) === `${key}`))
                result[index] = matched
                return matched
              })
            this.storage.set(
              `${concreteKeyPrefix}:${key}`,
              toCache,
              exp,
            )
            toWait.push(toCache)
          }
          await Promise.all(toWait)
        } else {
          const resolved = await toCacheList
          const exp = new Date().getTime() + opts.ttl
          for (const toCache of resolved) {
            const key = opts.resultKey(toCache)
            this.storage.set(`${concreteKeyPrefix}:${key}`, toCache, exp)
            
            // try to maintain key index.
            const index = missedKeyToIndex[key]
            result[index] = toCache
          }
        }
      }
      return result
    }
  }
}
interface CacheStorage {
  get(key: string): [Promise<any> | any, number]
  set(key: string, value: Promise<any> | any, exp: number): void
}

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
  (resolver: () => Promise<T>)
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

export class Capsu {

  constructor(private readonly storage: CacheStorage, private readonly prefix: string = '') {
  }

  public nested(prefix: string): Capsu {
    return new Capsu(this.storage, `${this.prefix}:${prefix}`)
  }

  public of<T>(key: string, opts: CacheKeyOptions): SingleCacher<T> {
    const concreteKey = `${this.prefix}:${key}`
    return (resolver) => {
      const cached = this.storage.get(concreteKey)
      const now = new Date().getTime()
      if (cached[1] > now) {
        return cached[0]
      }
      const toCache = resolver()
      this.storage.set(concreteKey, toCache, now + opts.ttl)
    }
  }

  public listOf<S, R>(prefix: string, opts: CacheKeyManyOptions<S, R>): IterableCacher<S, R> {
    const concreteKeyPrefix = `${this.prefix}:${prefix}`
    return async (source, resolve) => {
      const result = new Array<R>(source.length)
      const missedKeys: string[] = []
      const missedKeyToIndex: { [key: string]: number } = {}
      const now = new Date().getTime()

      // determine if any key misses from cache?
      const missedSources = source.filter((src, index) => {
        const key = opts.cacheKey(src)
        const cached = this.storage.get(`${concreteKeyPrefix}:${key}`)
        if (cached[1] > now) {
          result[index] = cached[0]
          return false // cache hit, no need to load this. return false to remove from required output.
        }
        missedKeys.push(key)
        missedKeyToIndex[key] = index
        return true
      })

      // Perform resolve only missed items.
      const toCacheList = await resolve(missedSources, missedKeys)
      const exp = new Date().getTime() + opts.ttl
      for (const toCache of toCacheList) {
        const key = opts.resultKey(toCache)
        this.storage.set(`${concreteKeyPrefix}:${key}`, toCache, exp)

        // try to maintain key index.
        const index = missedKeyToIndex[key]
        result[index] = toCache
      }
      return result
    }
  }
}
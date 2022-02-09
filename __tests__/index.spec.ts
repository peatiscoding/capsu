import { Capsu, InMemoryStorage } from "../src"

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

describe('in-memory cache', () => {
  const capsu = new Capsu()
  describe('using "of" command', () => {
    it('Can cache Promise<object>', async () => {
      const keyed = capsu.of('G', { ttl: 20 })
      const first = await keyed(async () => Math.random())
      const second = await keyed(async () => Math.random())
      expect(typeof first).toEqual('number')
      expect(first).toEqual(second)
      await delay(10)
      const third = await keyed(async () => Math.random())
      expect(first).toEqual(third)
      await delay(12)
      const forth = await keyed(async () => Math.random())
      expect(typeof forth).toEqual('number')
      expect(first).not.toEqual(forth)
    })

    it('Can handle caching same promisified object with same key race condition', async () => {
      const keyed = capsu.of('D', { ttl: 20 })
      let calledCount = 0
      const callMe = () => keyed(async () => {
        await delay(1)
        calledCount = calledCount + 1
        return Math.random()
      })
      const [r1, r2, r3, r4, r5] = await Promise.all([
        callMe(),
        callMe(),
        callMe(),
        callMe(),
        callMe(),
      ])
      expect(calledCount).toEqual(1)
      expect(typeof r1).toEqual('number')
      expect(typeof r2).toEqual('number')
      expect(typeof r3).toEqual('number')
      expect(typeof r4).toEqual('number')
      expect(typeof r5).toEqual('number')
      expect(r1).toEqual(r2)
      expect(r1).toEqual(r3)
      expect(r1).toEqual(r4)
      expect(r1).toEqual(r5)
    })

    it('will not cache the resolved as error promisified object', async () => {
      const keyed = capsu.of('ErrorPromised', { ttl: 20 })
      let calledCount = 0
      const callMe = () => keyed(async () => {
        await delay(1)
        calledCount = calledCount + 1
        throw new Error('this should not be cached')
      })
      const [r1, r2, r3] = await Promise.allSettled([
        callMe(),
        callMe(),
        callMe(),
      ])
      expect(calledCount).toEqual(1)
      expect(r1.status).toEqual('rejected')
      expect(r2.status).toEqual('rejected')
      expect(r3.status).toEqual('rejected')

      // second call
      const [r4, r5] = await Promise.allSettled([
        callMe(),
        callMe(),
      ])
      expect(calledCount).toEqual(2)
      expect(r4.status).toEqual('rejected')
      expect(r5.status).toEqual('rejected')
    })

    it('Can handle caching same non-promisified object with same key race condition', async () => {
      const keyed = capsu.of('racecond_no_promise', { ttl: 20 })
      let calledCount = 0
      const callMe = () => keyed(async () => {
        calledCount = calledCount + 1
        return Math.random()
      })
      const [r1, r2, r3, r4, r5] = await Promise.all([
        callMe(),
        callMe(),
        callMe(),
        callMe(),
        callMe(),
      ])
      expect(calledCount).toEqual(1)
      expect(typeof r1).toEqual('number')
      expect(typeof r2).toEqual('number')
      expect(typeof r3).toEqual('number')
      expect(typeof r4).toEqual('number')
      expect(typeof r5).toEqual('number')
      expect(r1).toEqual(r2)
      expect(r1).toEqual(r3)
      expect(r1).toEqual(r4)
      expect(r1).toEqual(r5)
    })
    
    it('Can cache plain object', async () => {
      const keyed = capsu.of('P', { ttl: 10 })
      const first = await keyed(async () => 'hello')
      const second = await keyed(async () => 'hello')
      expect(first).toEqual(second)
      await delay(15)
      const third = await keyed(async () => 'hello')
      expect(first).toEqual(third)
      expect(first).toEqual('hello')
    })

    it('Can defined a callable interface using 3rd args', async () => {
      const callMe = () => capsu.of('D', { ttl: 10 }, async () => {
        await delay(1)
        return Math.random()
      })

      const c1 = await callMe()
      const c2 = await callMe()
      expect(c1).toEqual(c2)

      await delay(10)

      const c3 = await callMe()
      expect(c1).not.toEqual(c3)
    })
  })

  describe('using "listOf" command', () => {
    it('Can cache Promise<[id]>', async () => {
      const listKeyed = capsu.listOf<string, string>('L1', {
        cacheKey: (id) => id, // transform incoming source to cachable key
        resultKey: (result) => result.toLowerCase(), // transform result to cachable key
        ttl: 20,
      })
      const result = await listKeyed(['a', 'b', 'c'], async (missedSource) => {
        expect(missedSource).toEqual(['a', 'b', 'c'])
        await delay(2)
        return missedSource.map((o) => o.toUpperCase())
      })
      expect(result).toEqual(['A', 'B', 'C'])

      let called = 0
      const result2 = await listKeyed(['a', 'b', 'c'], async (missedSource) => {
        called = called + 1
        await delay(2)
        return missedSource.map((o) => o.toUpperCase())
      })
      expect(called).toEqual(0)
      expect(result2).toEqual(['A', 'B', 'C'])

      const result3 = await listKeyed(['d', 'f', 'c'], async (missedSource) => {
        expect(missedSource).toEqual(['d', 'f'])
        await delay(5)
        return missedSource.map((o) => o.toUpperCase())
      })
      expect(result3).toEqual(['D', 'F', 'C'])
  
      // wait for all cached entries to expire
      await delay(20)

      const result4 = await listKeyed(['a', 'f', 'b', 'c'], async (missedSource) => {
        expect(missedSource).toEqual(['a', 'f', 'b', 'c'])
        return missedSource.map((o) => o.toUpperCase())
      })
      expect(result4).toEqual(['A', 'F', 'B', 'C'])
    })

    it('Can cache pending items simulataneously', async () => {
      const listKeyed = capsu.listOf<string, string>('promise-all-cache-ds', {
        cacheKey: (id) => `${id}`.toLowerCase(), // transform incoming source to cachable key
        resultKey: (result) => result.toLowerCase(), // transform result to cachable key
        ttl: 20,
      })

      let aCalled = false
      let bCalled = false
      let cCalled = false
      const resolveA = () => listKeyed(['a', 'b', 'c'], async (missedSource) => {
        aCalled = true
        expect(missedSource).toEqual(['a', 'b', 'c'])
        await delay(2)
        return missedSource.map((o) => o.toUpperCase())
      })
      const resolveB = () => listKeyed(['b', 'c'], async (missedSource) => {
        bCalled = true
        await delay(2)
        return missedSource.map((o) => o.toUpperCase())
      })
      const resolveC = () => listKeyed(['b', 'c', 'f', 'j'], async (missedSource) => {
        cCalled = true
        expect(missedSource).toEqual(['f', 'j'])
        await delay(2)
        return missedSource.map((o) => o.toUpperCase())
      })

      // execute!
      const [
        resultA,
        resultB,
        resultC,
      ] = await Promise.all([
        resolveA(),
        resolveB(),
        resolveC(),
      ])

      expect(resultA).toEqual(['A', 'B', 'C'])
      expect(resultB).toEqual(['B', 'C'])
      expect(resultC).toEqual(['B', 'C', 'F', 'J'])
      expect(aCalled).toBeTruthy()
      expect(bCalled).toBeFalsy()
      expect(cCalled).toBeTruthy()
    })

    it('Can define a callable interface using 4th arg', async () => {
      let lastCached: string[] = []
      const callMe = (source: string[]) => capsu.listOf('forth-arg-simple', { ttl: 10, cacheKey: (o) => o, resultKey: (r) => `${r}`.toLowerCase() }, source, async (missed) => {
        delay(1)
        lastCached = [...missed]
        return missed.map((k) => k.toUpperCase())
      })

      let res = await callMe(['a', 'b', 'c'])
      expect(res).toEqual(['A', 'B', 'C'])
      expect(lastCached).toEqual(['a', 'b', 'c'])

      res = await callMe(['d', 'e', 'c'])
      expect(res).toEqual(['D', 'E', 'C'])
      expect(lastCached).toEqual(['d' ,'e'])

      res = await callMe(['d', 'f', 'c'])
      expect(res).toEqual(['D', 'F', 'C'])
      expect(lastCached).toEqual(['f'])
    })
  })
})

describe('promised-based storage cache', () => {
  const sto = new InMemoryStorage()
  // try replace this with Redis implementation
  const capsu = new Capsu({
    queryWithPromise: true,
    canCachePromise: () => false,
    get: async (key): Promise<any> => {
      await delay(1)
      return sto.get(key)
    },
    set: sto.set.bind(sto),
  })

  // Using 'of' command
  describe('using "of" command', () => {
    it('Can cache Promise<object>', async () => {
      const keyed = capsu.of('G', { ttl: 20 })
      const first = await keyed(async () => Math.random())
      const second = await keyed(async () => Math.random())
      expect(typeof first).toEqual('number')
      expect(first).toEqual(second)
      await delay(10)
      const third = await keyed(async () => Math.random())
      expect(first).toEqual(third)
      await delay(12)
      const forth = await keyed(async () => Math.random())
      expect(typeof forth).toEqual('number')
      expect(first).not.toEqual(forth)
    })

    it('**Cannot** handle caching same promisified object with same key race condition', async () => {
      const keyed = capsu.of('racecond_with_promise', { ttl: 20 })
      let calledCount = 0
      const callMe = () => keyed(async () => {
        await delay(1)
        calledCount = calledCount + 1
        return Math.random()
      })
      const [r1, r2, r3, r4, r5] = await Promise.all([
        callMe(),
        callMe(),
        callMe(),
        callMe(),
        callMe(),
      ])
      expect(calledCount).toEqual(5)
      expect(typeof r1).toEqual('number')
      expect(typeof r2).toEqual('number')
      expect(typeof r3).toEqual('number')
      expect(typeof r4).toEqual('number')
      expect(typeof r5).toEqual('number')
      expect(r1).not.toEqual(r2)
      expect(r1).not.toEqual(r3)
      expect(r1).not.toEqual(r4)
      expect(r1).not.toEqual(r5)
    })

    it('Can handle caching same non-promisified object with same key race condition', async () => {
      const keyed = capsu.of('racecond_no_promise', { ttl: 20 })
      let calledCount = 0
      const callMe = () => keyed(async () => {
        calledCount = calledCount + 1
        return Math.random()
      })
      const [r1, r2, r3, r4, r5] = await Promise.all([
        callMe(),
        callMe(),
        callMe(),
        callMe(),
        callMe(),
      ])
      expect(calledCount).toEqual(1)
      expect(typeof r1).toEqual('number')
      expect(typeof r2).toEqual('number')
      expect(typeof r3).toEqual('number')
      expect(typeof r4).toEqual('number')
      expect(typeof r5).toEqual('number')
      expect(r1).toEqual(r2)
      expect(r1).toEqual(r3)
      expect(r1).toEqual(r4)
      expect(r1).toEqual(r5)
    })
  })

  describe('using "listOf" command', () => {
    it('Can cache Promise<[id]>', async () => {
      const listKeyed = capsu.listOf<string, string>('L1', {
        cacheKey: (id) => id, // transform incoming source to cachable key
        resultKey: (result) => result.toLowerCase(), // transform result to cachable key
        ttl: 20,
      })
      const result = await listKeyed(['a', 'b', 'c'], async (missedSource) => {
        expect(missedSource).toEqual(['a', 'b', 'c'])
        await delay(2)
        return missedSource.map((o) => o.toUpperCase())
      })
      expect(result).toEqual(['A', 'B', 'C'])

      let called = 0
      const result2 = await listKeyed(['a', 'b', 'c'], async (missedSource) => {
        called = called + 1
        await delay(2)
        return missedSource.map((o) => o.toUpperCase())
      })
      expect(called).toEqual(0)
      expect(result2).toEqual(['A', 'B', 'C'])

      const result3 = await listKeyed(['d', 'f', 'c'], async (missedSource) => {
        expect(missedSource).toEqual(['d', 'f'])
        await delay(5)
        return missedSource.map((o) => o.toUpperCase())
      })
      expect(result3).toEqual(['D', 'F', 'C'])
  
      // wait for all cached entries to expire
      await delay(20)

      const result4 = await listKeyed(['a', 'f', 'b', 'c'], async (missedSource) => {
        expect(missedSource).toEqual(['a', 'f', 'b', 'c'])
        return missedSource.map((o) => o.toUpperCase())
      })
      expect(result4).toEqual(['A', 'F', 'B', 'C'])
    })

    it('Can define a callable interface using 4th arg', async () => {
      let lastCached: string[] = []
      const callMe = (source: string[]) => capsu.listOf('X', { ttl: 10, cacheKey: (o) => o, resultKey: (r) => `${r}`.toLowerCase() }, source, async (missed) => {
        lastCached = [...missed]
        await delay(1)
        return missed.map((k) => k.toUpperCase())
      })

      let res = await callMe(['a', 'b', 'c'])
      expect(res).toEqual(['A', 'B', 'C'])
      expect(lastCached).toEqual(['a', 'b', 'c'])

      res = await callMe(['d', 'e', 'c'])
      expect(res).toEqual(['D', 'E', 'C'])
      expect(lastCached).toEqual(['d' ,'e'])

      await delay(3)

      res = await callMe(['d', 'f', 'c'])
      expect(res).toEqual(['D', 'F', 'C'])
      expect(lastCached).toEqual(['f', 'c'])
    })
  })
})
import { Capsu } from ".."

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

describe('in-memory cache', () => {
  const capsu = new Capsu()
  describe('using "of" command', () => {
    it('Can cache Promise<object>', async () => {
      const keyed = capsu.of('G', { ttl: 20 })
      const first = await keyed(async () => Math.random())
      const second = await keyed(async () => Math.random())
      expect(first).toEqual(second)
      await delay(10)
      const third = await keyed(async () => Math.random())
      expect(first).toEqual(third)
      await delay(12)
      const forth = await keyed(async () => Math.random())
      expect(first).not.toEqual(forth)
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

    it('Can define a callable interface using 4th arg', async () => {
      let lastCached: string[] = []
      const callMe = (source: string[]) => capsu.listOf('X', { ttl: 10, cacheKey: (o) => o, resultKey: (r) => `${r}`.toLowerCase() }, source, async (missed) => {
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
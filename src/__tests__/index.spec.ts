import { Capsu } from ".."
import { InMemoryStorage } from "../storage"

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

describe('in-memory cache', () => {
  const capsu = new Capsu()
  describe('of command', () => {
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
  })

  describe('listOf command', () => {
    it('Can cache Promise<byId>', async () => {
      const listKeyed = capsu.listOf<string, string>('L1', {
        cacheKey: (id) => id,
        resultKey: (result) => result.toLowerCase(),
        ttl: 20,
      })
      const result = await listKeyed(['a', 'b', 'c'], async (missedSource) => {
        expect(missedSource).toEqual(['a', 'b', 'c'])
        return missedSource.map((o) => o.toUpperCase())
      })
      expect(result).toEqual(['A', 'B', 'C'])

      let called = 0
      const result2 = await listKeyed(['a', 'b', 'c'], async (missedSource) => {
        called = called + 1
        return missedSource.map((o) => o.toUpperCase())
      })
      expect(called).toEqual(0)
      expect(result2).toEqual(['A', 'B', 'C'])

      const result3 = await listKeyed(['d', 'f', 'c'], async (missedSource) => {
        expect(missedSource).toEqual(['d', 'f'])
        return missedSource.map((o) => o.toUpperCase())
      })
      expect(result3).toEqual(['D', 'F', 'C'])
    
      await delay(15)

      const result4 = await listKeyed(['a', 'f', 'b', 'c'], async (missedSource) => {
        expect(missedSource).toEqual(['a', 'f', 'b', 'c'])
        return missedSource.map((o) => o.toUpperCase())
      })
      expect(result4).toEqual(['A', 'F', 'B', 'C'])
    })
  })
})
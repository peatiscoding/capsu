# Capsu

Capsu - caching framework to use with.

## Install

```bash
yarn add capsu
```

or 

```bash
npm i --save capsu
```

## Usage

UseCase1: `of`

Create a function wrapper to wrap around certain async function to capture result value, and capture input values as a cached key.

```ts
const capsu = new Capsu() // create in-memory-cache
const once = capsu.of(`some-key`, { ttl: 120 }) // save the result in `some-key` for 120 seconds.

// Your existing function
const myAsyncFunction = async (arg1, arg2): Promise<number> => {
  // ... do some costly process
  return arg1 + arg2
}

const myAsyncFunction = (arg1, arg2): Promise<number> => once(async () => {
  // no need to update your function!
})

// Or if your cache key is dynamic you can.
const myAsyncFunction = (arg1, arg2): Promise<number> => capsu.of(`some-key-${arg1}-${arg2}`, { ttl: 120 }, async () => {
  // no need to update your function.
})

```

UseCase2: `listOf` - saving multiple items in single multiple key stroke

```ts
const capsu = new Capsu()
const missed = capsu.listOf(`some-key-prefix`, {
  ttl: 120,
  inputKey: (data) => data,
  resultKey: (result) => result.id,
})

// Your existing function
const getCategoryByIds = async (categoryIds: string[]): Promise<Category[]> => {
  return await db.findMany({
    ids: categoryIds
  })
}

// categoryIds can be called multiple times with repeated ids.
const getCategoryByIds = (categoryIds: string[]): Promise<Category[]> => missed(categoryIds, async (filteredCategoryIds) => {
  return await db.findMany({
    ids: categoryIds
  })
})

```

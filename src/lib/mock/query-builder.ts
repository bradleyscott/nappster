import { mockStore, insertRecord } from './store'

type TableName = 'babies' | 'family_members' | 'sleep_events' | 'chat_messages' | 'sleep_plans'
type FilterOp = 'eq' | 'gte' | 'lt' | 'in'

interface Filter {
  column: string
  op: FilterOp
  value: unknown
}

interface QueryResult<T> {
  data: T | null
  error: Error | null
}

export class MockQueryBuilder<T = unknown> {
  private tableName: TableName
  private filters: Filter[] = []
  private ordering: { column: string; ascending: boolean } | null = null
  private limitCount: number | null = null
  private isSingleResult = false
  private insertData: Partial<T> | null = null
  private updateData: Partial<T> | null = null
  private isDelete = false
  private selectCalled = false

  constructor(table: TableName) {
    this.tableName = table
  }

  select(_columns?: string): this {
    this.selectCalled = true
    return this
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ column, op: 'eq', value })
    return this
  }

  gte(column: string, value: unknown): this {
    this.filters.push({ column, op: 'gte', value })
    return this
  }

  lt(column: string, value: unknown): this {
    this.filters.push({ column, op: 'lt', value })
    return this
  }

  in(column: string, values: unknown[]): this {
    this.filters.push({ column, op: 'in', value: values })
    return this
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.ordering = {
      column,
      ascending: options?.ascending ?? true,
    }
    return this
  }

  limit(count: number): this {
    this.limitCount = count
    return this
  }

  single(): Promise<QueryResult<T>> {
    this.isSingleResult = true
    return this.execute()
  }

  insert(data: Partial<T>): this {
    this.insertData = data
    return this
  }

  update(data: Partial<T>): this {
    this.updateData = data
    return this
  }

  delete(): this {
    this.isDelete = true
    return this
  }

  // Allow the builder to be awaited directly (for non-single queries)
  then<TResult1 = QueryResult<T[]>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<T[]>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.executeArray().then(onfulfilled, onrejected)
  }

  private async executeArray(): Promise<QueryResult<T[]>> {
    // Handle delete
    if (this.isDelete) {
      const result = await this.executeDelete()
      return { data: result.data ? [result.data] : [], error: result.error }
    }

    // Handle update
    if (this.updateData) {
      const result = await this.executeUpdate()
      return { data: result.data ? [result.data] : [], error: result.error }
    }

    // Handle insert
    if (this.insertData) {
      const newRecord = insertRecord<T>(this.tableName, this.insertData as Record<string, unknown>)
      return { data: [newRecord], error: null }
    }

    let results = [...(mockStore[this.tableName] as T[])]

    // Apply filters
    results = this.applyFilters(results)

    // Apply ordering
    if (this.ordering) {
      results = this.applyOrdering(results)
    }

    // Apply limit
    if (this.limitCount !== null) {
      results = results.slice(0, this.limitCount)
    }

    return { data: results, error: null }
  }

  private async execute(): Promise<QueryResult<T>> {
    // Handle delete with single
    if (this.isDelete) {
      return this.executeDelete()
    }

    // Handle update with single
    if (this.updateData) {
      return this.executeUpdate()
    }

    // Handle insert with single
    if (this.insertData) {
      const newRecord = insertRecord<T>(this.tableName, this.insertData as Record<string, unknown>)
      return { data: newRecord, error: null }
    }

    const { data } = await this.executeArray()

    if (this.isSingleResult) {
      if (!data || data.length === 0) {
        return { data: null, error: null }
      }
      return { data: data[0], error: null }
    }

    return { data: data as unknown as T, error: null }
  }

  private async executeUpdate(): Promise<QueryResult<T>> {
    const table = mockStore[this.tableName] as T[]
    const updated: T[] = []

    for (let i = 0; i < table.length; i++) {
      const record = table[i] as Record<string, unknown>
      const matches = this.filters.every((filter) => {
        const value = record[filter.column]
        if (filter.op === 'eq') {
          return value === filter.value
        }
        return true
      })

      if (matches) {
        table[i] = { ...table[i], ...this.updateData } as T
        updated.push(table[i])
      }
    }

    // Return last updated for single(), all updated for array
    return { data: updated.length > 0 ? updated[updated.length - 1] : null, error: null }
  }

  private async executeDelete(): Promise<QueryResult<T>> {
    const table = mockStore[this.tableName] as T[]
    let deleted: T | null = null

    const index = table.findIndex((record) => {
      return this.filters.every((filter) => {
        const value = (record as Record<string, unknown>)[filter.column]
        if (filter.op === 'eq') {
          return value === filter.value
        }
        return true
      })
    })

    if (index !== -1) {
      deleted = table[index]
      table.splice(index, 1)
    }

    return { data: deleted, error: null }
  }

  private applyFilters(records: T[]): T[] {
    return records.filter((record) => {
      return this.filters.every((filter) => {
        const value = (record as Record<string, unknown>)[filter.column]

        switch (filter.op) {
          case 'eq':
            return value === filter.value
          case 'gte':
            if (typeof value === 'string' && typeof filter.value === 'string') {
              return value >= filter.value
            }
            return Number(value) >= Number(filter.value)
          case 'lt':
            if (typeof value === 'string' && typeof filter.value === 'string') {
              return value < filter.value
            }
            return Number(value) < Number(filter.value)
          case 'in':
            return Array.isArray(filter.value) && filter.value.includes(value)
          default:
            return true
        }
      })
    })
  }

  private applyOrdering(records: T[]): T[] {
    if (!this.ordering) return records

    const { column, ascending } = this.ordering

    return [...records].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[column]
      const bVal = (b as Record<string, unknown>)[column]

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return ascending ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }

      const aNum = Number(aVal)
      const bNum = Number(bVal)
      return ascending ? aNum - bNum : bNum - aNum
    })
  }
}

export function createQueryBuilder<T>(table: TableName): MockQueryBuilder<T> {
  return new MockQueryBuilder<T>(table)
}

import { PrismaClient } from '@prisma/client'

export interface IAgentStateService {
  getState<T = any>(agentId: string, key: string): Promise<T | null>
  setState<T = any>(agentId: string, key: string, value: T): Promise<void>
  deleteState(agentId: string, key: string): Promise<void>
  getAllStates(agentId: string): Promise<Record<string, any>>
  clearAllStates(agentId: string): Promise<void>
}

export class AgentStateService implements IAgentStateService {
  constructor(private prisma: PrismaClient) {}

  async getState<T = any>(agentId: string, key: string): Promise<T | null> {
    const state = await this.prisma.agentState.findUnique({
      where: {
        agentId_key: {
          agentId,
          key
        }
      }
    })

    return state ? (state.value as T) : null
  }

  async setState<T = any>(agentId: string, key: string, value: T): Promise<void> {
    await this.prisma.agentState.upsert({
      where: {
        agentId_key: {
          agentId,
          key
        }
      },
      update: {
        value: value as any,
        updatedAt: new Date()
      },
      create: {
        agentId,
        key,
        value: value as any
      }
    })
  }

  async deleteState(agentId: string, key: string): Promise<void> {
    await this.prisma.agentState.deleteMany({
      where: {
        agentId,
        key
      }
    })
  }

  async getAllStates(agentId: string): Promise<Record<string, any>> {
    const states = await this.prisma.agentState.findMany({
      where: { agentId }
    })

    const result: Record<string, any> = {}
    for (const state of states) {
      result[state.key] = state.value
    }

    return result
  }

  async clearAllStates(agentId: string): Promise<void> {
    await this.prisma.agentState.deleteMany({
      where: { agentId }
    })
  }

  // Helper methods for common state patterns
  async incrementCounter(agentId: string, key: string, increment: number = 1): Promise<number> {
    const current = await this.getState<number>(agentId, key) || 0
    const newValue = current + increment
    await this.setState(agentId, key, newValue)
    return newValue
  }

  async getOffset(agentId: string): Promise<number> {
    return await this.getState<number>(agentId, 'offset') || 0
  }

  async setOffset(agentId: string, offset: number): Promise<void> {
    await this.setState(agentId, 'offset', offset)
  }

  async resetOffset(agentId: string): Promise<void> {
    await this.setState(agentId, 'offset', 0)
  }

  async getLastProcessedId(agentId: string): Promise<string | null> {
    return await this.getState<string>(agentId, 'lastProcessedId')
  }

  async setLastProcessedId(agentId: string, id: string): Promise<void> {
    await this.setState(agentId, 'lastProcessedId', id)
  }

  async getLastRunTimestamp(agentId: string): Promise<Date | null> {
    const timestamp = await this.getState<string>(agentId, 'lastRunTimestamp')
    return timestamp ? new Date(timestamp) : null
  }

  async setLastRunTimestamp(agentId: string, timestamp: Date = new Date()): Promise<void> {
    await this.setState(agentId, 'lastRunTimestamp', timestamp.toISOString())
  }
}
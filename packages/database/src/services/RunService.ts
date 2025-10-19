import { PrismaClient } from '@prisma/client'
import { IRunService, ILogService, RunFilters, LogFilters } from './interfaces'

export class RunService implements IRunService {
  constructor(private prisma: PrismaClient) {}

  async getRuns(filters: RunFilters = {}) {
    const whereClause: any = {}
    if (filters.agentId) whereClause.agentId = filters.agentId
    if (filters.status) whereClause.status = filters.status as any

    return this.prisma.agentRun.findMany({
      where: whereClause,
      orderBy: { startedAt: 'desc' },
      take: filters.limit || 50,
      skip: filters.offset || 0
    })
  }

  async getRun(id: string) {
    return this.prisma.agentRun.findUnique({
      where: { id },
      include: {
        logs: {
          orderBy: { timestamp: 'desc' }
        }
      }
    })
  }

  async createRun(agentId: string) {
    return this.prisma.agentRun.create({
      data: {
        agentId,
        status: 'RUNNING'
      }
    })
  }

  async updateRun(id: string, data: {
    status?: string
    endedAt?: Date
    duration?: number
    result?: any
    error?: string
  }) {
    return this.prisma.agentRun.update({
      where: { id },
      data: {
        ...data,
        status: data.status as any
      }
    })
  }

  async getAgentRuns(agentId: string, limit: number = 50) {
    return this.prisma.agentRun.findMany({
      where: { agentId },
      orderBy: { startedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        agentId: true,
        status: true,
        startedAt: true,
        endedAt: true,
        duration: true,
        error: true,
        result: true
      }
    })
  }
}

export class LogService implements ILogService {
  constructor(private prisma: PrismaClient) {}

  async getLogs(filters: LogFilters = {}) {
    const whereClause: any = {}
    if (filters.agentId) whereClause.agentId = filters.agentId
    if (filters.runId) whereClause.runId = filters.runId
    if (filters.level) whereClause.level = filters.level as any

    return this.prisma.agentLog.findMany({
      where: whereClause,
      orderBy: { timestamp: 'desc' },
      take: filters.limit || 100,
      skip: filters.offset || 0
    })
  }

  async createLog(data: {
    agentId: string
    runId?: string
    level: string
    message: string
    data?: any
  }) {
    return this.prisma.agentLog.create({
      data: {
        ...data,
        level: data.level as any
      }
    })
  }

  async getAgentLogs(agentId: string, limit: number = 100) {
    return this.prisma.agentLog.findMany({
      where: { agentId },
      orderBy: { timestamp: 'desc' },
      take: limit
    })
  }

  async getRunLogs(runId: string) {
    return this.prisma.agentLog.findMany({
      where: { runId },
      orderBy: { timestamp: 'desc' }
    })
  }
}
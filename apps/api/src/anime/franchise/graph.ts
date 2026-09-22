import type { AnimeFranchise, AnimeFranchiseRelation, AnimeTitleSummary } from '@consumit/contracts'

export type FranchiseNode = {
  anime: AnimeTitleSummary
  relations: FranchiseEdge[]
}

export type FranchiseEdge = {
  type: AnimeFranchiseRelation['type']
  target: AnimeTitleSummary
}

export type FranchiseGraph = {
  main: FranchiseNode
  all: FranchiseNode[]
}

export type AnimeFranchiseService = {
  buildGraph(franchise: AnimeFranchise): FranchiseGraph
  getWatchOrder(graph: FranchiseGraph): AnimeTitleSummary[]
}

export function createAnimeFranchiseService(): AnimeFranchiseService {
  return {
    buildGraph(franchise) {
      const mainNode: FranchiseNode = {
        anime: franchise.main,
        relations: franchise.relations.map((r) => ({ type: r.type, target: r.anime })),
      }

      const allNodes = new Map<number, FranchiseNode>()
      allNodes.set(franchise.main.anilistId, mainNode)

      for (const relation of franchise.relations) {
        const targetId = relation.anime.anilistId
        if (!allNodes.has(targetId)) {
          allNodes.set(targetId, {
            anime: relation.anime,
            relations: [],
          })
        }
      }

      return {
        main: mainNode,
        all: [...allNodes.values()],
      }
    },

    getWatchOrder(graph) {
      const visited = new Set<number>()
      const order: AnimeTitleSummary[] = []

      const walk = (node: FranchiseNode) => {
        if (visited.has(node.anime.anilistId)) return
        visited.add(node.anime.anilistId)
        order.push(node.anime)

        const sequel = node.relations.find((r) => r.type === 'SEQUEL')
        if (sequel) {
          const targetNode = graph.all.find((n) => n.anime.anilistId === sequel.target.anilistId)
          if (targetNode) walk(targetNode)
        }
      }

      walk(graph.main)

      for (const node of graph.all) {
        if (!visited.has(node.anime.anilistId)) {
          order.push(node.anime)
        }
      }

      return order
    },
  }
}

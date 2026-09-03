"use client";

import type { EdgeData, Graph as G6Graph, GraphData, IElementEvent, NodeData } from "@antv/g6";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  buildEvidenceClusters,
  buildInsightRelations,
  buildOrganicLayout,
  compareGraphNodePriority,
  type OrganicLayoutLink,
  type OrganicLayoutNode,
  type ProfileGraphInsight,
} from "./profile-graph-model";
import {
  PROFILE_DIMENSIONS,
  PROFILE_DIMENSION_LABELS,
  type ProfileInsightKind,
} from "@/lib/candidate-profile/types";

export type { ProfileGraphEvidence, ProfileGraphInsight } from "./profile-graph-model";

type ProfileGraphProps = {
  insights: ProfileGraphInsight[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  reducedMotion: boolean;
};

type GraphTheme = {
  background: string;
  foreground: string;
  surface: string;
  muted: string;
  mutedForeground: string;
  border: string;
  brand: string;
  info: string;
  success: string;
  warning: string;
  danger: string;
};

function readGraphTheme(element: HTMLElement): GraphTheme {
  const styles = getComputedStyle(element);
  const token = (name: string) => styles.getPropertyValue(name).trim();
  return {
    background: token("--background"),
    foreground: token("--foreground"),
    surface: token("--surface"),
    muted: token("--muted"),
    mutedForeground: token("--muted-foreground"),
    border: token("--border"),
    brand: token("--brand"),
    info: token("--info"),
    success: token("--success"),
    warning: token("--warning"),
    danger: token("--danger"),
  };
}

function colorForInsight(kind: ProfileInsightKind, theme: GraphTheme): string {
  if (kind === "strength") return theme.success;
  if (kind === "weakness") return theme.danger;
  if (kind === "training_focus") return theme.warning;
  return theme.info;
}

function reasonLabel(reasons: string[]): string {
  if (reasons.includes("shared_observation")) return "共享观察";
  if (reasons.includes("shared_question")) return "同一回答";
  if (reasons.includes("shared_interview")) return "同场面试";
  return "同一维度";
}

function compactLabel(value: string, maxLength = 22): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

function mergeLivePositions(graph: G6Graph, data: GraphData): GraphData {
  const current = new Map(
    graph.getNodeData().flatMap((node) =>
      typeof node.style?.x === "number" && typeof node.style?.y === "number"
        ? [[node.id, { x: node.style.x, y: node.style.y }] as const]
        : [],
    ),
  );
  return {
    ...data,
    nodes: data.nodes?.map((node) => {
      const position = current.get(node.id);
      return position
        ? { ...node, style: { ...node.style, x: position.x, y: position.y } }
        : node;
    }),
  };
}

export function ProfileGraph({ insights, selectedId, onSelect, reducedMotion }: ProfileGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<G6Graph | null>(null);
  const graphDataRef = useRef<GraphData>({ nodes: [], edges: [] });
  const insightsRef = useRef(insights);
  const onSelectRef = useRef(onSelect);
  const [renderError, setRenderError] = useState("");
  const [graphTheme, setGraphTheme] = useState<GraphTheme | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    setGraphTheme(readGraphTheme(container));
    const observer = new MutationObserver(() => {
      setGraphTheme(readGraphTheme(container));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  const graphModel = useMemo(() => {
    const relations = buildInsightRelations(insights);
    const evidenceClusters = buildEvidenceClusters(insights);
    const layoutNodes: OrganicLayoutNode[] = [
      { id: "profile:root", kind: "root" },
      ...PROFILE_DIMENSIONS.map((dimension) => ({
        id: `dimension:${dimension}`,
        kind: "dimension" as const,
        dimension,
      })),
      ...insights.map((insight) => ({
        id: insight.id,
        kind: "insight" as const,
        dimension: insight.dimension,
      })),
      ...evidenceClusters.map((cluster) => ({
        id: cluster.id,
        kind: "bridge" as const,
        insightIds: cluster.insightIds,
      })),
    ];
    const layoutLinks: OrganicLayoutLink[] = [
      ...insights.map((insight) => ({
        source: `dimension:${insight.dimension}`,
        target: insight.id,
        strength: 2.4,
        length: 112,
      })),
      ...relations.map((relation) => ({
        source: relation.source,
        target: relation.target,
        strength: Math.min(4, relation.strength),
        length: relation.strength >= 3 ? 105 : 150,
      })),
      ...evidenceClusters.flatMap((cluster) =>
        cluster.insightIds.map((insightId) => ({
          source: insightId,
          target: cluster.id,
          strength: cluster.shared ? 3.2 : 1.5,
          length: cluster.shared ? 62 : 82,
        })),
      ),
    ];
    const positions = buildOrganicLayout(layoutNodes, layoutLinks);
    return { relations, evidenceClusters, positions };
  }, [insights]);

  const graphData = useMemo(() => {
    if (!graphTheme) return { nodes: [], edges: [] } satisfies GraphData;
    const nodes: NodeData[] = [];
    const edges: EdgeData[] = [];
    const position = (id: string) => graphModel.positions.get(id) ?? { x: 500, y: 350 };
    nodes.push({
      id: "profile:root",
      data: { label: "能力画像", nodeKind: "root" },
      style: {
        ...position("profile:root"),
        size: 20,
        fill: graphTheme.brand,
        stroke: graphTheme.foreground,
        lineWidth: 2,
        shadowBlur: 24,
        shadowColor: graphTheme.brand,
      },
    });
    for (const dimension of PROFILE_DIMENSIONS) {
      const id = `dimension:${dimension}`;
      nodes.push({
        id,
        data: { label: PROFILE_DIMENSION_LABELS[dimension], nodeKind: "dimension", dimension },
        style: {
          ...position(id),
          size: 10,
          fill: graphTheme.mutedForeground,
          stroke: graphTheme.border,
          lineWidth: 1.5,
          opacity: insights.some((insight) => insight.dimension === dimension) ? 0.85 : 0.3,
        },
      });
      edges.push({
        id: `root:${dimension}`,
        source: "profile:root",
        target: id,
        data: { edgeKind: "context" },
      });
    }
    for (const insight of insights) {
      const selected = insight.id === selectedId;
      const trendMarker = insight.trend === "up" ? "↑" : insight.trend === "down" ? "↓" : "";
      nodes.push({
        id: insight.id,
        data: {
          label: `${trendMarker ? `${trendMarker} ` : ""}${compactLabel(insight.title)}`,
          nodeKind: "insight",
          insightId: insight.id,
        },
        style: {
          ...position(insight.id),
          size: 18 + insight.confidence * 14,
          fill: colorForInsight(insight.kind, graphTheme),
          stroke: selected ? graphTheme.foreground : graphTheme.background,
          lineWidth: selected ? 3.5 : 1.5,
          shadowBlur: selected ? 28 : 12,
          shadowColor: colorForInsight(insight.kind, graphTheme),
        },
      });
      edges.push({
        id: `membership:${insight.id}`,
        source: `dimension:${insight.dimension}`,
        target: insight.id,
        data: { edgeKind: "membership" },
      });
    }
    for (const relation of graphModel.relations) {
      const touchesSelected = selectedId === relation.source || selectedId === relation.target;
      edges.push({
        id: relation.id,
        source: relation.source,
        target: relation.target,
        type: "quadratic",
        data: {
          edgeKind: "relation",
          strength: relation.strength,
          label: touchesSelected ? reasonLabel(relation.reasons) : "",
        },
      });
    }
    for (const cluster of graphModel.evidenceClusters) {
      const selected = selectedId !== null && cluster.insightIds.includes(selectedId);
      const visible = cluster.shared || selected;
      const isMockEvidence = cluster.evidence.sourceKind === "mock_text";
      nodes.push({
        id: cluster.id,
        data: {
          label: selected
            ? `${isMockEvidence ? "AI 模拟" : "真实"} · ${cluster.evidence.companyName} · ${cluster.evidence.question.slice(0, 18)}`
            : "",
          nodeKind: "evidence",
          insightId: cluster.insightIds[0],
          shared: cluster.shared,
          sourceKind: cluster.evidence.sourceKind,
        },
        style: {
          ...position(cluster.id),
          size: selected ? (isMockEvidence ? 8 : 12) : cluster.shared ? (isMockEvidence ? 5 : 8) : isMockEvidence ? 2.5 : 4.5,
          fill:
            cluster.evidence.polarity === "contradicts"
              ? graphTheme.danger
              : isMockEvidence
                ? graphTheme.brand
                : graphTheme.info,
          stroke: isMockEvidence ? graphTheme.brand : graphTheme.info,
          lineWidth: isMockEvidence ? 0.8 : cluster.shared ? 1.8 : 1,
          opacity: visible ? (selected ? 1 : isMockEvidence ? 0.42 : 0.82) : isMockEvidence ? 0.08 : 0.2,
          shadowBlur: selected ? (isMockEvidence ? 8 : 18) : 0,
          shadowColor: isMockEvidence ? graphTheme.brand : graphTheme.info,
        },
      });
      for (const insightId of cluster.insightIds) {
        edges.push({
          id: `evidence-link:${cluster.id}:${insightId}`,
          source: insightId,
          target: cluster.id,
          data: {
            edgeKind: "evidence",
            selected,
            shared: cluster.shared,
            polarity: cluster.evidence.polarity,
            sourceKind: cluster.evidence.sourceKind,
          },
        });
      }
    }
    return { nodes, edges } satisfies GraphData;
  }, [graphModel, graphTheme, insights, selectedId]);

  useEffect(() => {
    insightsRef.current = insights;
    onSelectRef.current = onSelect;
    graphDataRef.current = graphData;
  }, [graphData, insights, onSelect]);

  useEffect(() => {
    if (!containerRef.current || !graphTheme) return;
    let disposed = false;
    void import("@antv/g6").then(async ({ Graph }) => {
      if (disposed || !containerRef.current) return;
      const graph = new Graph({
        container: containerRef.current,
        autoResize: true,
        autoFit: { type: "view", options: { when: "always", direction: "both" }, animation: false },
        padding: 56,
        height: containerRef.current.clientHeight,
        data: graphDataRef.current,
        animation: reducedMotion ? false : { duration: 480, easing: "ease-out" },
        behaviors: [
          "drag-canvas",
          "zoom-canvas",
          "drag-element",
          {
            type: "hover-activate",
            degree: 1,
            state: "active",
            inactiveState: "inactive",
            animation: !reducedMotion,
          },
          {
            type: "auto-adapt-label",
            padding: 5,
            throttle: 80,
            sortNode: compareGraphNodePriority,
          },
        ],
        zoomRange: [0.35, 2.5],
        node: {
          type: "circle",
          style: (datum) => {
            const nodeKind = String(datum.data?.nodeKind ?? "");
            return {
              ...datum.style,
              labelText: String(datum.data?.label ?? ""),
              labelFontSize: nodeKind === "dimension" ? 12 : nodeKind === "root" ? 11 : 10.5,
              labelFontWeight: nodeKind === "dimension" ? 600 : 400,
              labelFill: nodeKind === "root" ? graphTheme.surface : graphTheme.foreground,
              labelPlacement: nodeKind === "root" ? "center" : "bottom",
              labelOffsetY: nodeKind === "evidence" ? 8 : 5,
              labelMaxWidth: nodeKind === "dimension" ? 130 : 150,
              cursor: nodeKind === "insight" || nodeKind === "evidence" ? "pointer" : "default",
            };
          },
          state: {
            active: { opacity: 1, labelOpacity: 1, lineWidth: 3 },
            inactive: { opacity: 0.12, labelOpacity: 0.12 },
          },
        },
        edge: {
          style: (datum) => {
            const kind = String(datum.data?.edgeKind ?? "");
            const strength = Number(datum.data?.strength ?? 1);
            const selected = Boolean(datum.data?.selected);
            const isMockEvidence = datum.data?.sourceKind === "mock_text";
            return {
              stroke:
                datum.data?.polarity === "contradicts"
                  ? graphTheme.danger
                  : kind === "relation"
                    ? graphTheme.brand
                    : kind === "evidence"
                      ? graphTheme.info
                      : graphTheme.mutedForeground,
              lineWidth:
                kind === "relation"
                  ? Math.min(2.4, 0.7 + strength * 0.22)
                  : kind === "evidence" && selected
                    ? isMockEvidence ? 1 : 2
                    : 0.8,
              opacity:
                kind === "context"
                  ? 0.07
                  : kind === "membership"
                    ? 0.18
                    : kind === "relation"
                      ? 0.3
                      : selected
                        ? isMockEvidence ? 0.48 : 0.88
                        : datum.data?.shared
                          ? isMockEvidence ? 0.16 : 0.4
                          : isMockEvidence ? 0.035 : 0.1,
              lineDash:
                datum.data?.polarity === "contradicts"
                  ? [4, 5]
                  : kind === "evidence" && isMockEvidence
                    ? [2, 4]
                    : [],
              labelText: String(datum.data?.label ?? ""),
              labelFill: graphTheme.foreground,
              labelFontSize: 9,
              labelBackground: true,
              labelBackgroundFill: graphTheme.surface,
              labelBackgroundOpacity: 0.88,
              labelPadding: [3, 5],
            };
          },
          state: {
            active: { opacity: 0.95, lineWidth: 2.4 },
            inactive: { opacity: 0.025 },
          },
        },
      });
      graph.on("node:click", (event) => {
        const target = (event as IElementEvent).target;
        if (!target) return;
        const datum = graph.getNodeData(String(target.id));
        if (!datum) return;
        const insightId = typeof datum.data?.insightId === "string" ? datum.data.insightId : null;
        if (insightId && insightsRef.current.some((insight) => insight.id === insightId)) {
          onSelectRef.current(insightId);
        }
      });
      graph.on("canvas:click", () => onSelectRef.current(null));
      await graph.render();
      graphRef.current = graph;
    }).catch((error: unknown) => {
      if (!disposed) {
        setRenderError(error instanceof Error ? error.message : "图谱渲染失败");
      }
    });
    return () => {
      disposed = true;
      graphRef.current?.destroy();
      graphRef.current = null;
    };
  }, [graphTheme, reducedMotion]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    graph.setData(mergeLivePositions(graph, graphData));
    void graph.draw().catch((error: unknown) => {
      setRenderError(error instanceof Error ? error.message : "图谱更新失败");
    });
  }, [graphData]);

  return (
    <section
      aria-label="能力画像知识网络。拖拽节点或画布探索关系，选择洞察后突出相关证据。"
      className="profile-graph-canvas relative h-[calc(100vh-7rem)] min-h-[640px] w-full overflow-hidden rounded-panel border border-border"
    >
      <button
        className="absolute right-4 top-4 z-10 rounded-lg border border-border bg-surface/85 px-3 py-1.5 text-[11px] font-medium text-foreground backdrop-blur hover:bg-surface-raised"
        onClick={() => void graphRef.current?.fitView({ when: "always", direction: "both" }, reducedMotion ? false : { duration: 320 })}
        type="button"
      >
        适应画布
      </button>
      <div className="h-full w-full" ref={containerRef} />
      {renderError ? (
        <div className="absolute inset-x-4 top-20 z-20 rounded-control border border-danger/30 bg-danger-soft/90 px-4 py-3 text-sm text-danger-strong backdrop-blur">
          图谱暂时无法渲染：{renderError}
        </div>
      ) : null}
      <div className="pointer-events-none absolute bottom-4 left-4 z-10 flex max-w-[calc(100%-2rem)] flex-wrap gap-x-4 gap-y-2 rounded-control border border-border bg-surface/85 px-3 py-2 text-[10px] text-muted-foreground backdrop-blur">
        <span>拖拽节点 · 滚轮缩放 · 悬停追踪</span>
        <span><i className="mr-1.5 inline-block size-2 rounded-full bg-success" />优势</span>
        <span><i className="mr-1.5 inline-block size-2 rounded-full bg-danger" />短板</span>
        <span><i className="mr-1.5 inline-block size-2 rounded-full bg-info" />模式</span>
        <span><i className="mr-1.5 inline-block size-2 rounded-full bg-warning" />训练</span>
        <span><i className="mr-1.5 inline-block size-2 rounded-full bg-info-soft ring-1 ring-info" />真实证据（高权重）</span>
        <span><i className="mr-1.5 inline-block size-2 rounded-full bg-brand" />AI 模拟（低权重）</span>
        <span className="text-brand">曲线：洞察间隐含关系（{graphModel.relations.length}）</span>
      </div>
    </section>
  );
}

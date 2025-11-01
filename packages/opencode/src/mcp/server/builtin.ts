import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import z from "zod/v4"
import { Installation } from "@/installation"
import { Log } from "@/util/log"

type BuiltinServer = () => Promise<void>

const log = Log.create({ service: "mcp-builtin" })

type McpToolConfig = Parameters<McpServer["registerTool"]>[1]
type McpRawShape = NonNullable<McpToolConfig["inputSchema"]>
type McpToolCallback = Parameters<McpServer["registerTool"]>[2]
type McpCallbackParameters = Parameters<McpToolCallback>
type McpToolExtra = McpCallbackParameters extends [any, infer Extra]
  ? Extra
  : McpCallbackParameters extends [infer Extra]
    ? Extra
    : never
type McpToolResult = Awaited<ReturnType<McpToolCallback>>

function toMcpRawShape(schema: z.ZodObject<z.ZodRawShape>) {
  return schema.shape as unknown as McpRawShape
}

function registerZodTool<
  InputSchema extends z.ZodObject<z.ZodRawShape>,
  OutputSchema extends z.ZodObject<z.ZodRawShape> | undefined,
>(
  server: McpServer,
  name: string,
  config: {
    title?: string
    description?: string
    annotations?: McpToolConfig["annotations"]
    inputSchema: InputSchema
    outputSchema?: OutputSchema
  },
  handler: (args: z.infer<InputSchema>, extra: McpToolExtra) => McpToolResult | Promise<McpToolResult>,
) {
  const preparedConfig: McpToolConfig = {
    title: config.title,
    description: config.description,
    annotations: config.annotations,
    inputSchema: toMcpRawShape(config.inputSchema),
    outputSchema: config.outputSchema ? toMcpRawShape(config.outputSchema) : undefined,
  }

  const callback = ((args: unknown, extra: McpToolExtra) => handler(args as z.infer<InputSchema>, extra)) as McpToolCallback

  server.registerTool(name, preparedConfig, callback)
}

const SERVERS: Record<string, BuiltinServer> = {
  sequential: createSequentialThinkingServer,
  sketch: createSketchpadServer,
  duckduckgo: createDuckDuckGoServer,
}

export async function startBuiltinServer(name: string) {
  const start = SERVERS[name]
  if (!start) throw new Error(`Unknown builtin MCP server: ${name}`)
  await start()
}

async function runServer(
  info: { name: string; version?: string; instructions?: string },
  register: (server: McpServer) => Promise<void>,
) {
  const server = new McpServer(
    {
      name: info.name,
      version: info.version ?? Installation.VERSION,
    },
    {
      instructions: info.instructions,
    },
  )

  await register(server)

  const transport = new StdioServerTransport()

  const shutdown = async () => {
    await server.close().catch(() => {})
  }

  transport.onclose = () => {
    shutdown()
      .catch(() => {})
      .finally(() => process.exit(0))
  }
  transport.onerror = (error: Error) => {
    log.error("builtin mcp transport error", { error: error.message })
    shutdown()
      .catch(() => {})
      .finally(() => process.exit(1))
  }

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      shutdown()
        .catch(() => {})
        .finally(() => process.exit(0))
    })
  }

  await server.connect(transport)

  log.info("builtin mcp server ready", { name: info.name })

  await new Promise<void>(() => {})
}

async function createSequentialThinkingServer() {
  return runServer(
    {
      name: "opencode-sequential-thinking",
      instructions:
        "Generates structured step-by-step execution plans. Accepts an objective and optional context.",
    },
    async (server) => {
      const sequentialInputSchema = z.object({
        objective: z.string().min(3, "Describe the objective."),
        context: z.string().optional(),
      })
      const sequentialOutputSchema = z.object({
        summary: z.string(),
        steps: z
          .object({
            title: z.string(),
            detail: z.string(),
          })
          .array()
          .min(1),
      })
      registerZodTool(
        server,
        "sequential_thinking_plan",
        {
          title: "Sequential Thinking",
          description: "Produce a disciplined, auditable execution plan that can be followed without guesswork.",
          inputSchema: sequentialInputSchema,
          outputSchema: sequentialOutputSchema,
        },
        async ({ objective, context }) => {
          const trimmedObjective = objective.trim()
          const normalizedContext = context?.trim()
          const sections = buildPlan(trimmedObjective, normalizedContext)
          const body = sections
            .map((item, index) => {
              const number = String(index + 1).padStart(2, "0")
              return `${number}. ${item.title}\n    ${item.detail}`
            })
            .join("\n\n")
          return {
            content: [
              {
                type: "text" as const,
                text: body,
              },
            ],
            structuredContent: {
              summary: summarizePlan(trimmedObjective, sections.length),
              steps: sections,
            },
          }
        },
      )
    },
  )
}

function buildPlan(objective: string, context?: string | null) {
  const base = [
    {
      title: "Clarify success criteria",
      detail: `Translate the objective into explicit acceptance checks. ${context ? `Incorporate context: ${context}.` : "Capture relevant constraints."}`,
    },
    {
      title: "Map constraints and unknowns",
      detail: "List external dependencies, risks, and information gaps. Resolve blockers before implementation.",
    },
    {
      title: "Execute incrementally",
      detail: "Sequence concrete work items so that each step yields a verifiable artifact. Validate after every step.",
    },
    {
      title: "Review and harden",
      detail: "Cross-check results against success criteria, add tests, and document decisions for downstream maintainers.",
    },
  ]

  if (objective.length > 140) {
    base.splice(2, 0, {
      title: "Partition the scope",
      detail: "Break the work into cohesive sub-problems so each can be solved independently before integration.",
    })
  }

  return base
}

function summarizePlan(objective: string, stepCount: number) {
  return `${stepCount}-step execution plan for: ${objective}`
}

async function createSketchpadServer() {
  return runServer(
    {
      name: "opencode-sketchpad",
      instructions:
        "Turns textual prompts into high-contrast ASCII layout sketches that illustrate structural ideas quickly.",
    },
    async (server) => {
      const sketchInputSchema = z.object({
        prompt: z.string().min(3, "Describe the visual you want."),
        accent: z.enum(["grid", "wave", "circuit"]).default("grid"),
      })
      const sketchOutputSchema = z.object({
        lines: z.string().array().min(1),
      })
      registerZodTool(
        server,
        "sketchpad_draw",
        {
          title: "ASCII Sketchpad",
          description: "Render a fast visual mock using unicode box drawing glyphs.",
          inputSchema: sketchInputSchema,
          outputSchema: sketchOutputSchema,
        },
        async ({ prompt, accent }) => {
          const frame = renderSketch(prompt.trim(), accent)
          return {
            content: [
              {
                type: "text" as const,
                text: frame.join("\n"),
              },
            ],
            structuredContent: {
              lines: frame,
            },
          }
        },
      )
    },
  )
}

function renderSketch(prompt: string, accent: "grid" | "wave" | "circuit") {
  const motif = (() => {
    if (accent === "wave") return "≈"
    if (accent === "circuit") return "╂"
    return "▒"
  })()

  const words = prompt.split(/\s+/).filter(Boolean)
  const title = words.slice(0, 6).join(" ")
  const maxContentWidth = Math.max(prompt.length, title.length, 24)
  const width = Math.min(68, Math.max(32, maxContentWidth + 4))

  const pad = (value: string) => {
    const clean = value.slice(0, width - 4)
    const padding = width - 4 - clean.length
    return clean + " ".repeat(padding)
  }

  const roof = `┏${motif.repeat(width - 2)}┓`
  const divider = `┣${motif.repeat(width - 2)}┫`
  const base = `┗${motif.repeat(width - 2)}┛`
  const lines = [`┃ ${pad("AGENT ➜ MCP VISUALIZER")} ┃`, divider]

  lines.push(`┃ ${pad(`Focus: ${title}`)} ┃`)
  lines.push(divider)

  const wrapped: string[] = []
  let current = ""
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length > width - 4) {
      if (current) wrapped.push(current)
      current = word
      continue
    }
    current = next
  }
  if (current) wrapped.push(current)

  for (const line of wrapped) {
    lines.push(`┃ ${pad(line)} ┃`)
  }

  if (wrapped.length === 0) {
    lines.push(`┃ ${pad(prompt)} ┃`)
  }

  return [roof, ...lines, base]
}

async function createDuckDuckGoServer() {
  return runServer(
    {
      name: "opencode-duckduckgo",
      instructions: "Runs live DuckDuckGo Instant Answer searches and summarises the top findings.",
    },
    async (server) => {
      const duckInputSchema = z.object({
        query: z.string().min(2, "Provide a search query."),
        region: z.string().optional().describe("Region code, e.g. us-en"),
      })
      const duckOutputSchema = z.object({
        summary: z.string(),
        results: z
          .object({
            title: z.string(),
            url: z.string(),
            snippet: z.string().optional(),
          })
          .array(),
      })
      registerZodTool(
        server,
        "duckduckgo_search",
        {
          title: "DuckDuckGo",
          description: "Query DuckDuckGo's Instant Answer API for fast factual lookups.",
          inputSchema: duckInputSchema,
          outputSchema: duckOutputSchema,
        },
        async ({ query, region }) => {
          const endpoint = new URL("https://duckduckgo.com/")
          endpoint.searchParams.set("q", query)
          endpoint.searchParams.set("format", "json")
          endpoint.searchParams.set("no_redirect", "1")
          endpoint.searchParams.set("no_html", "1")
          if (region) endpoint.searchParams.set("kl", region)

          const response = await fetch(endpoint, {
            headers: {
              "User-Agent": Installation.USER_AGENT,
              Accept: "application/json",
            },
          }).catch((error: unknown) => {
            log.warn("duckduckgo request failed", { error: String(error) })
            return null
          })

          if (!response || !response.ok) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "DuckDuckGo search failed. Check your network connectivity.",
                },
              ],
              isError: true,
            }
          }

          const parsed = await response
            .json()
            .catch((error: unknown) => {
              log.warn("duckduckgo json parse failed", { error: String(error) })
              return null
            })

          if (!parsed || typeof parsed !== "object") {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "DuckDuckGo returned an invalid payload.",
                },
              ],
              isError: true,
            }
          }

          const dataRecord = parsed as Record<string, unknown>
          const items = collectDuckDuckGoResults(parsed)
          const text = items
            .map((item, index) => `${index + 1}. ${item.title}\n   ${item.url}${item.snippet ? `\n   ${item.snippet}` : ""}`)
            .join("\n\n") || "No results found."

          return {
            content: [
              {
                type: "text" as const,
                text,
              },
            ],
            structuredContent: {
              summary: typeof dataRecord.Heading === "string" && dataRecord.Heading
                ? (dataRecord.Heading as string)
                : `Results for ${query}`,
              results: items,
            },
          }
        },
      )
    },
  )
}

function collectDuckDuckGoResults(input: unknown) {
  const results: { title: string; url: string; snippet?: string }[] = []

  const pushResult = (item: unknown) => {
    if (!item || typeof item !== "object") return
    const record = item as Record<string, unknown>
    const titleValue = record["Text"]
    const urlValue = record["FirstURL"]
    const title = typeof titleValue === "string" && titleValue.trim().length > 0 ? titleValue.trim() : undefined
    const url = typeof urlValue === "string" && urlValue.trim().length > 0 ? urlValue.trim() : undefined
    if (!title || !url) return
    const snippetValue = record["Result"]
    const snippet = typeof snippetValue === "string" && snippetValue !== title ? stripTags(snippetValue) : undefined
    results.push({
      title,
      url,
      snippet,
    })
  }

  const container = (typeof input === "object" && input) ? (input as Record<string, unknown>) : undefined

  const topics = container && Array.isArray(container.RelatedTopics)
    ? (container.RelatedTopics as unknown[])
    : []

  for (const topic of topics) {
    if (!topic || typeof topic !== "object") continue
    const topicRecord = topic as Record<string, unknown>
    const nested = topicRecord["Topics"]
    if (Array.isArray(nested)) {
      for (const nestedItem of nested) pushResult(nestedItem)
      continue
    }
    pushResult(topic)
  }

  const abstractUrl = container ? container["AbstractURL"] : undefined
  const abstractText = container ? container["AbstractText"] : undefined
  if (typeof abstractUrl === "string" && abstractUrl && typeof abstractText === "string" && abstractText) {
    results.unshift({
      title: abstractText.trim(),
      url: abstractUrl.trim(),
      snippet: container && typeof container["AbstractSource"] === "string" ? (container["AbstractSource"] as string) : undefined,
    })
  }

  return results.slice(0, 6)
}

function stripTags(input: string) {
  return input.replace(/<[^>]+>/g, "").trim()
}


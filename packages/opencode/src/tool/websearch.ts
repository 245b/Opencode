import z from "zod/v4"
import { Tool } from "./tool"
import DESCRIPTION from "./websearch.txt"
import { Config } from "../config/config"
import { Permission } from "../permission"
import { Identifier } from "../id/id"
import type { MessageV2 } from "../session/message-v2"

const SERPER_API_ENDPOINT = "https://google.serper.dev/search"
const SERPER_IMAGE_ENDPOINT = "https://google.serper.dev/images"
const SERPER_API_KEY = process.env.SERPER_API_KEY ?? "93a10c7e83587026b870c8d0a88a197a95a37759"
const DEFAULT_RESULT_LIMIT = 5
const MAX_RESULT_LIMIT = 10
const DEFAULT_TIMEOUT_MS = 20_000
const MAX_IMAGE_COUNT = 5
const MAX_IMAGE_BYTES = 2 * 1024 * 1024

type SerperOrganicResult = {
  title?: string
  link?: string
  snippet?: string
  date?: string
}

type SerperResponse = {
  organic?: SerperOrganicResult[]
}

type SerperImageResult = {
  imageUrl?: string
  title?: string
  source?: string
}

type SerperImageResponse = {
  images?: SerperImageResult[]
}

const isOperatorModel = (modelID?: string) => {
  if (!modelID) return false
  const value = modelID.toLowerCase()
  if (value.includes("operator")) return true
  if (value.includes("deepseek-reasoner")) return true
  return false
}

export const WebSearchTool = Tool.define("websearch", async () => {
  if (!SERPER_API_KEY) throw new Error("Serper API key is not configured")
  return {
    description: DESCRIPTION,
    parameters: z.object({
      query: z.string().min(1).describe("The search query to run"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(MAX_RESULT_LIMIT)
        .optional()
        .describe("Maximum number of results to return (default 5, max 10)"),
      includeDomains: z
        .array(z.string().min(1))
        .nonempty()
        .optional()
        .describe("Only return results from these domains"),
      excludeDomains: z
        .array(z.string().min(1))
        .nonempty()
        .optional()
        .describe("Exclude results from these domains"),
      imageCount: z
        .number()
        .int()
        .min(1)
        .max(MAX_IMAGE_COUNT)
        .optional()
        .describe("If provided, download this many web images (max 5)"),
    }),
    async execute(params, ctx) {
      const modelID = typeof ctx.extra?.modelID === "string" ? ctx.extra.modelID : ""
      if (!isOperatorModel(modelID)) throw new Error("The websearch tool is only available for Operator models")

      const cfg = await Config.get()
      if (cfg.permission?.websearch === "ask")
        await Permission.ask({
          type: "websearch",
          sessionID: ctx.sessionID,
          messageID: ctx.messageID,
          callID: ctx.callID,
          title: `Search the web for "${params.query}"`,
          metadata: {
            query: params.query,
            limit: params.limit,
            includeDomains: params.includeDomains,
            excludeDomains: params.excludeDomains,
            imageCount: params.imageCount,
          },
        })

      const limit = params.limit ?? DEFAULT_RESULT_LIMIT
      const trimmedQuery = params.query.trim()
      if (!trimmedQuery) throw new Error("Search query cannot be empty")
      const include = params.includeDomains?.map((domain) => domain.trim()).filter(Boolean) ?? []
      const includeClause =
        include.length > 0
          ? ` (${include.map((domain) => `site:${domain.replace(/^https?:\/\//i, "")}`).join(" OR ")})`
          : ""
      const baseQuery = `${trimmedQuery}${includeClause}`
      const exclude = params.excludeDomains?.map((domain) => domain.trim()).filter(Boolean) ?? []
      const finalQuery = exclude.reduce(
        (value, domain) => `${value} -site:${domain.replace(/^https?:\/\//i, "")}`,
        baseQuery,
      )

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

      const response = await fetch(SERPER_API_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": SERPER_API_KEY,
        },
        body: JSON.stringify({
          q: finalQuery,
          gl: "us",
          hl: "en",
          num: Math.min(limit, MAX_RESULT_LIMIT),
          autocorrect: true,
        }),
        signal: AbortSignal.any([ctx.abort, controller.signal]),
      })

      clearTimeout(timeout)

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`Serper request failed (${response.status}): ${text}`)
      }

      const json = (await response.json()) as SerperResponse
      const organic = Array.isArray(json.organic) ? json.organic.slice(0, limit) : []
      if (organic.length === 0) throw new Error("No search results were returned for this query")

      const images = await fetchImages({
        query: finalQuery,
        originalQuery: params.query,
        count: params.imageCount,
        abort: ctx.abort,
        sessionID: ctx.sessionID,
        messageID: ctx.messageID,
      })

      const metadata = {
        query: params.query,
        finalQuery,
        limit: organic.length,
        includeDomains: params.includeDomains ?? [],
        excludeDomains: params.excludeDomains ?? [],
        provider: "serper",
        results: organic.map((item) => ({
          title: item.title ?? "",
          url: item.link ?? "",
        })),
        images: images.metadata,
      }

      ctx.metadata({
        title: `Web search - ${params.query}`,
        metadata,
      })

      const output = organic
        .map((item, index) => {
          const lines = [`${index + 1}. ${item.title ?? "Untitled result"}`]
          if (item.link) lines.push(`URL: ${item.link}`)
          if (item.date) lines.push(`Date: ${item.date}`)
          if (item.snippet) lines.push(item.snippet)
          return lines.join("\n")
        })
        .join("\n\n")
      return {
        title: `Web search results for "${params.query}"`,
        metadata,
        output,
        attachments: images.attachments,
      }
    },
  }
})

async function fetchImages(input: {
  query: string
  originalQuery: string
  count?: number
  abort: AbortSignal
  sessionID: string
  messageID: string
}): Promise<{
  metadata: {
    title: string
    url: string
  }[]
  attachments?: MessageV2.FilePart[]
}> {
  if (!input.count || input.count <= 0) {
    return {
      metadata: [],
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

  try {
    const response = await fetch(SERPER_IMAGE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": SERPER_API_KEY,
      },
      body: JSON.stringify({
        q: input.query,
        gl: "us",
        hl: "en",
        num: Math.min(input.count, MAX_IMAGE_COUNT),
      }),
      signal: AbortSignal.any([input.abort, controller.signal]),
    })

    if (!response.ok) {
      const text = await response.text().catch(() => "")
      throw new Error(`Serper image request failed (${response.status}): ${text}`)
    }

    const json = (await response.json()) as SerperImageResponse
    const results = Array.isArray(json.images) ? json.images.slice(0, input.count) : []
    if (results.length === 0) {
      return {
        metadata: [],
      }
    }

    const downloads = await Promise.all(
      results.map(async (item) => {
        if (!item.imageUrl) return
        return downloadImage({
          url: item.imageUrl,
          abort: input.abort,
        })
          .then((file) => ({ file, item }))
          .catch(() => undefined)
      }),
    )

    const attachments: MessageV2.FilePart[] = []
    const meta: { title: string; url: string }[] = []

    for (const result of downloads) {
      if (!result?.file || !result.item?.imageUrl) continue
      meta.push({
        title: result.item.title ?? input.originalQuery,
        url: result.item.imageUrl,
      })
      attachments.push({
        id: Identifier.ascending("part"),
        sessionID: input.sessionID,
        messageID: input.messageID,
        type: "file",
        mime: result.file.mime,
        url: `data:${result.file.mime};base64,${result.file.data}`,
      })
    }

    return {
      metadata: meta,
      attachments: attachments.length > 0 ? attachments : undefined,
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function downloadImage(input: { url: string; abort: AbortSignal }): Promise<{ mime: string; data: string }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
  try {
    const response = await fetch(input.url, {
      method: "GET",
      signal: AbortSignal.any([input.abort, controller.signal]),
    })

    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status}`)
    }

    const mime = response.headers.get("content-type") ?? guessMime(input.url)
    const buffer = await response.arrayBuffer()
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      throw new Error("Image exceeds maximum size of 2MB")
    }

    return {
      mime,
      data: Buffer.from(buffer).toString("base64"),
    }
  } finally {
    clearTimeout(timeout)
  }
}

function guessMime(url: string) {
  const lower = url.toLowerCase()
  if (lower.endsWith(".png")) return "image/png"
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg"
  if (lower.endsWith(".gif")) return "image/gif"
  if (lower.endsWith(".webp")) return "image/webp"
  if (lower.endsWith(".svg")) return "image/svg+xml"
  return "application/octet-stream"
}

import { describe, expect, test } from "bun:test"
import { MCP } from "../../src/mcp"

describe("MCP.evaluateStatus", () => {
  test("marks connected servers", () => {
    const result = MCP.evaluateStatus(
      {
        local: {},
      },
      {
        local: {},
      },
    )
    expect(result).toStrictEqual({ local: "connected" })
  })

  test("marks disabled servers", () => {
    const result = MCP.evaluateStatus(
      {
        duckduckgo: { enabled: false },
      },
      {},
    )
    expect(result).toStrictEqual({ duckduckgo: "disabled" })
  })

  test("marks missing servers as failed", () => {
    const result = MCP.evaluateStatus(
      {
        sequential: {},
      },
      {},
    )
    expect(result).toStrictEqual({ sequential: "failed" })
  })
})

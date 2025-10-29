import { startBuiltinServer } from "./builtin"

const [, , server] = process.argv

if (!server) {
  console.error("Missing builtin MCP server name.")
  process.exit(1)
}

startBuiltinServer(server).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Failed to start builtin MCP server ${server}: ${message}`)
  process.exit(1)
})

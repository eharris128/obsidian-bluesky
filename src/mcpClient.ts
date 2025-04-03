import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

console.log("Starting MCP client setup...");

const transport = new StdioClientTransport({
  command: "node",
  args: ["/home/evan/projects/mcp/pulumi-mcp-server/build/index.js"]
});

console.log("Created transport with args:", transport);

const client = new Client(
  {
    name: "obsidian-bluesky-mcp",
    version: "1.0.0"
  },
  {
    capabilities: {
      resources: {},
      tools: {}
    }
  }
);

console.log("Created MCP client with capabilities:", client);

// Store styles globally
let discordStyles: any = null;
let blueskyStyles: any = null;

// Connect and list resources when plugin loads
export async function initMCPClient() {
  try {
    console.log("Attempting to connect to MCP server...");
    await client.connect(transport);
    console.log("Successfully connected to MCP server");

    console.log("Listing available resources...");
    const resources = await client.listResources();
    console.log("Available MCP Resources:", JSON.stringify(resources, null, 2));

    // Read specific style resources
    try {
      console.log("Attempting to read Discord styles...");
      const result = await client.readResource({ uri: "styles://discord" });
      discordStyles = result;
      console.log("Discord styles loaded:", JSON.stringify(discordStyles, null, 2));
    } catch (error) {
      console.error("Failed to read Discord styles:", error);
    }

    try {
      console.log("Attempting to read Bluesky styles...");
      const result = await client.readResource({ uri: "styles://bluesky" });
      blueskyStyles = result;
      console.log("Bluesky styles loaded:", JSON.stringify(blueskyStyles, null, 2));
    } catch (error) {
      console.error("Failed to read Bluesky styles:", error);
    }

    return resources;
  } catch (error) {
    console.error("Failed to initialize MCP client:", error);
    return null;
  }
}

// Function to get styles for a specific platform
export function getStyles(platform: 'discord' | 'bluesky') {
  return platform === 'discord' ? discordStyles : blueskyStyles;
}

export { client }; 
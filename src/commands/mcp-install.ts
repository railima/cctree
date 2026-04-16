import { execSync } from 'node:child_process';

export async function mcpInstallCommand(options: { scope: string }): Promise<void> {
  const scope = options.scope;

  try {
    execSync('claude mcp get cctree', { stdio: 'pipe' });
    console.log('cctree MCP server is already registered.');
    console.log('To reinstall, first run: claude mcp remove cctree');
    return;
  } catch {
    // not installed, proceed
  }

  try {
    const cmd = `claude mcp add --scope ${scope} cctree -- npx -y cctree --server`;
    console.log(`Registering cctree MCP server (scope: ${scope})...`);
    execSync(cmd, { stdio: 'inherit' });
    console.log('');
    console.log('Done. The cctree tools are now available inside Claude Code sessions.');
  } catch (err) {
    console.error(`Failed to register MCP server: ${(err as Error).message}`);
    console.error('Make sure "claude" is available in your PATH.');
    process.exit(1);
  }
}

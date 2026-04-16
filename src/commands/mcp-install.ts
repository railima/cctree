import { execFileSync } from 'node:child_process';

const VALID_SCOPES = ['local', 'project', 'user'] as const;

export async function mcpInstallCommand(options: { scope: string }): Promise<void> {
  const scope = options.scope;

  if (!VALID_SCOPES.includes(scope as typeof VALID_SCOPES[number])) {
    console.error(`Invalid scope "${scope}". Must be one of: ${VALID_SCOPES.join(', ')}`);
    process.exit(1);
  }

  try {
    execFileSync('claude', ['mcp', 'get', 'cctree'], { stdio: 'pipe' });
    console.log('cctree MCP server is already registered.');
    console.log('To reinstall, first run: claude mcp remove cctree');
    return;
  } catch {
    // not installed, proceed
  }

  try {
    console.log(`Registering cctree MCP server (scope: ${scope})...`);
    execFileSync(
      'claude',
      ['mcp', 'add', '--scope', scope, 'cctree', '--', 'npx', '-y', '@railima/cctree', '--server'],
      { stdio: 'inherit' },
    );
    console.log('');
    console.log('Done. The cctree tools are now available inside Claude Code sessions.');
  } catch (err) {
    console.error(`Failed to register MCP server: ${(err as Error).message}`);
    console.error('Make sure "claude" is available in your PATH.');
    process.exit(1);
  }
}

import { Command, Option } from 'commander';

// When invoked as MCP server (npx cctree --server), skip CLI and start stdio server
if (process.argv.includes('--server')) {
  await import('./server.js');
} else {

const program = new Command();

program
  .name('cctree')
  .description('Hierarchical session management for Claude Code')
  .version('0.1.0');

program
  .command('init')
  .description('Create a new session tree')
  .argument('<name>', 'tree name (e.g., "MCP Release")')
  .option('-c, --context <files...>', 'initial context files to include')
  .action(async (name: string, options: { context?: string[] }) => {
    const { initCommand } = await import('./commands/init.js');
    await initCommand(name, options);
  });

program
  .command('branch')
  .description('Create a child session and open Claude Code')
  .argument('<name>', 'child session name')
  .option('--no-open', 'create the session entry without opening Claude')
  .option(
    '-w, --worktree [branch]',
    'create a git worktree for this session (branch defaults to cctree/<tree>/<child>)',
  )
  .action(
    async (
      name: string,
      options: { open: boolean; worktree?: string | boolean },
    ) => {
      const { branchCommand } = await import('./commands/branch.js');
      await branchCommand(name, options);
    },
  );

program
  .command('list')
  .description('Show the session tree')
  .option('-a, --all', 'show all trees, not just the active one')
  .action(async (options: { all?: boolean }) => {
    const { listCommand } = await import('./commands/list.js');
    await listCommand(options);
  });

program
  .command('resume')
  .description('Resume an existing child session in Claude Code')
  .argument('<name>', 'child session name or slug')
  .action(async (name: string) => {
    const { resumeCommand } = await import('./commands/resume.js');
    await resumeCommand(name);
  });

program
  .command('status')
  .description('Show active tree info')
  .action(async () => {
    const { statusCommand } = await import('./commands/status.js');
    await statusCommand();
  });

const context = program
  .command('context')
  .description('Print the accumulated context')
  .option('--raw', 'output raw markdown without paging')
  .action(async (options: { raw?: boolean }) => {
    const { contextCommand } = await import('./commands/context.js');
    await contextCommand(options);
  });

context
  .command('add')
  .description('Add initial-context files to an existing tree')
  .argument('<files...>', 'files to copy into the tree\'s initial-context dir')
  .option('-t, --tree <name>', 'target tree (name or slug); defaults to active tree')
  .action(async (files: string[], options: { tree?: string }) => {
    const { contextAddCommand } = await import('./commands/context.js');
    await contextAddCommand(files, options);
  });

program
  .command('use')
  .description('Switch active tree')
  .argument('<name>', 'tree name or slug')
  .action(async (name: string) => {
    const { useCommand } = await import('./commands/use.js');
    await useCommand(name);
  });

program
  .command('mcp-install')
  .description('Register the cctree MCP server with Claude Code')
  .addOption(
    new Option('-s, --scope <scope>', 'MCP scope')
      .choices(['local', 'project', 'user'])
      .default('user'),
  )
  .action(async (options: { scope: string }) => {
    const { mcpInstallCommand } = await import('./commands/mcp-install.js');
    await mcpInstallCommand(options);
  });

await program.parseAsync(process.argv);

} // end else (CLI mode)

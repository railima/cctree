import { createRequire } from 'node:module';
import { Command, Option } from 'commander';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

// When invoked as MCP server (npx cctree --server), skip CLI and start stdio server
if (process.argv.includes('--server')) {
  await import('./server.js');
} else {

const program = new Command();

program
  .name('cctree')
  .description('Hierarchical session management for Claude Code')
  .version(version);

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
  .command('abandon')
  .description('Mark a child session as abandoned (or fully delete with --delete)')
  .argument('<name>', 'child session name or slug')
  .option('--delete', 'delete the session entirely (removes summary, worktree, and auto-named branch)')
  .option('-t, --tree <name>', 'target tree (name or slug); defaults to active tree')
  .action(
    async (name: string, options: { delete?: boolean; tree?: string }) => {
      const { abandonCommand } = await import('./commands/abandon.js');
      await abandonCommand(name, options);
    },
  );

const exportCmd = program
  .command('export')
  .description('Export the session trees to a portable format (diagram, vault, ...)');

exportCmd
  .command('mermaid')
  .description('Render the session trees as a Mermaid graph diagram')
  .option('-t, --tree <name>', 'render only one tree (name or slug); defaults to all trees')
  .option('-o, --output <file>', 'write the diagram to a file instead of stdout')
  .action(async (options: { tree?: string; output?: string }) => {
    const { exportMermaidCommand } = await import('./commands/export.js');
    await exportMermaidCommand(options);
  });

exportCmd
  .command('obsidian')
  .description('Export the session trees as a wiki-linked vault for Obsidian graph view')
  .argument('<vault-path>', 'path to an existing Obsidian vault directory')
  .option('-t, --tree <name>', 'export only one tree (name or slug); defaults to all trees')
  .action(async (vaultPath: string, options: { tree?: string }) => {
    const { exportObsidianCommand } = await import('./commands/export.js');
    await exportObsidianCommand(vaultPath, options);
  });

exportCmd
  .command('report')
  .description('Generate a shareable markdown progress report for a tree (decisions, open questions, hot files, timeline, structure)')
  .argument('<tree>', 'tree name or slug to report on')
  .option('-c, --children <slugs>', 'comma-separated list of child slugs to include; defaults to all children in the tree')
  .option('-a, --author <name>', 'override the auto-detected author name (default: git config user.name)')
  .option('-o, --output <file>', 'write the report to a file instead of stdout')
  .action(
    async (
      treeName: string,
      options: { children?: string; author?: string; output?: string },
    ) => {
      const { exportReportCommand } = await import('./commands/export.js');
      await exportReportCommand(treeName, options);
    },
  );

program
  .command('rename')
  .description('Rename a tree (display name; optionally the slug)')
  .argument('<new-name>', 'new display name for the tree')
  .option('-s, --slug <slug>', 'also rename the tree slug (moves the on-disk directory and worktrees)')
  .option('-t, --tree <name>', 'target tree (name or slug); defaults to active tree')
  .action(
    async (newName: string, options: { slug?: string; tree?: string }) => {
      const { renameCommand } = await import('./commands/rename.js');
      await renameCommand(newName, options);
    },
  );

program
  .command('statusline')
  .description('Print a compact status line (for Claude Code statusline, tmux, etc.)')
  .option(
    '-f, --format <template>',
    'format template; placeholders: {tree}, {tree_slug}, {child}, {child_slug}, {committed}, {active}, {total}',
  )
  .action(async (options: { format?: string }) => {
    const { statuslineCommand } = await import('./commands/statusline.js');
    await statuslineCommand(options);
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

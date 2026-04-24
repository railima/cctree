import { execFile } from 'node:child_process';
import { userInfo } from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface ResolveAuthorOptions {
  override?: string;
  cwd?: string;
}

async function gitConfigUserName(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['config', 'user.name'], { cwd });
    const trimmed = stdout.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

function osUsername(): string | null {
  try {
    const name = userInfo().username;
    return name && name.length > 0 ? name : null;
  } catch {
    return null;
  }
}

export async function resolveAuthor(
  options: ResolveAuthorOptions = {},
): Promise<string> {
  if (options.override && options.override.trim().length > 0) {
    return options.override.trim();
  }

  const cwd = options.cwd ?? process.cwd();
  const gitName = await gitConfigUserName(cwd);
  if (gitName) return gitName;

  const osName = osUsername();
  if (osName) return osName;

  return 'Unknown';
}

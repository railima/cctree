export interface TreeConfig {
  name: string;
  slug: string;
  created_at: string;
  cwd: string;
  initial_context_files: string[];
  children: ChildSession[];
}

export interface WorktreeInfo {
  path: string;
  branch: string;
  base_ref: string;
}

export interface ChildSession {
  name: string;
  slug: string;
  status: 'active' | 'committed' | 'abandoned';
  claude_session_name: string;
  created_at: string;
  committed_at?: string;
  worktree?: WorktreeInfo;
}

export interface ActiveSession {
  tree: string;
  child: string;
}

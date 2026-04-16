export interface TreeConfig {
  name: string;
  slug: string;
  created_at: string;
  cwd: string;
  initial_context_files: string[];
  children: ChildSession[];
}

export interface ChildSession {
  name: string;
  slug: string;
  status: 'active' | 'committed' | 'abandoned';
  claude_session_name: string;
  created_at: string;
  committed_at?: string;
}

export interface ActiveSession {
  tree: string;
  child: string;
}

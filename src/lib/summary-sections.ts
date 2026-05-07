export interface SummarySections {
  tldr: string;
  decisions: string[];
  artifactsCreated: string[];
  openQuestions: string[];
  nextSteps: string[];
  details: string;
}

type SectionKind = 'bullet' | 'text';

interface SectionMatcher {
  key: keyof SummarySections;
  kind: SectionKind;
  patterns: RegExp[];
}

const MATCHERS: SectionMatcher[] = [
  {
    key: 'tldr',
    kind: 'text',
    patterns: [
      /^##\s+tl;?\s*dr\s*$/i,
      /^##\s+resumo\s*$/i,
      /^##\s+sum[áa]rio\s*$/i,
    ],
  },
  {
    key: 'decisions',
    kind: 'bullet',
    patterns: [/^##\s+decisions\s*$/i, /^##\s+decis[õo]es\s*$/i],
  },
  {
    key: 'artifactsCreated',
    kind: 'bullet',
    patterns: [
      /^##\s+artifacts\s+created\s*$/i,
      /^##\s+artifacts\s*$/i,
      /^##\s+artefatos\s+criados\s*$/i,
      /^##\s+artefatos\s*$/i,
    ],
  },
  {
    key: 'openQuestions',
    kind: 'bullet',
    patterns: [
      /^##\s+open\s+questions\s*$/i,
      /^##\s+perguntas\s+abertas\s*$/i,
      /^##\s+quest[õo]es\s+abertas\s*$/i,
    ],
  },
  {
    key: 'nextSteps',
    kind: 'bullet',
    patterns: [
      /^##\s+next\s+steps\s*$/i,
      /^##\s+pr[óo]ximos\s+passos\s*$/i,
    ],
  },
  {
    key: 'details',
    kind: 'text',
    patterns: [
      /^##\s+details\s*$/i,
      /^##\s+detalhes\s*$/i,
    ],
  },
];

function matchSection(
  line: string,
): { key: keyof SummarySections; kind: SectionKind } | null {
  for (const matcher of MATCHERS) {
    for (const pattern of matcher.patterns) {
      if (pattern.test(line)) return { key: matcher.key, kind: matcher.kind };
    }
  }
  return null;
}

function isBulletLine(line: string): boolean {
  return /^\s*[-*]\s+/.test(line);
}

function stripBulletMarker(line: string): string {
  return line.replace(/^\s*[-*]\s+/, '').trim();
}

function isSectionHeader(line: string): boolean {
  return /^##\s+/.test(line);
}

export function parseSummarySections(summary: string): SummarySections {
  const sections: SummarySections = {
    tldr: '',
    decisions: [],
    artifactsCreated: [],
    openQuestions: [],
    nextSteps: [],
    details: '',
  };

  const lines = summary.split(/\r?\n/);
  let currentKey: keyof SummarySections | null = null;
  let currentKind: SectionKind | null = null;
  let bulletBuffer: string | null = null;
  let textBuffer: string[] = [];

  const flushBullet = () => {
    if (
      bulletBuffer !== null &&
      currentKey !== null &&
      currentKind === 'bullet'
    ) {
      const trimmed = bulletBuffer.trim();
      if (trimmed.length > 0) {
        (sections[currentKey] as string[]).push(trimmed);
      }
    }
    bulletBuffer = null;
  };

  const flushText = () => {
    if (
      textBuffer.length > 0 &&
      currentKey !== null &&
      currentKind === 'text'
    ) {
      const joined = textBuffer.join('\n').trim();
      if (joined.length > 0) {
        (sections as unknown as Record<string, unknown>)[currentKey] = joined;
      }
    }
    textBuffer = [];
  };

  const flush = () => {
    flushBullet();
    flushText();
  };

  for (const line of lines) {
    const matched = matchSection(line);
    if (matched) {
      flush();
      currentKey = matched.key;
      currentKind = matched.kind;
      continue;
    }

    if (currentKey === null) continue;

    if (isSectionHeader(line)) {
      flush();
      currentKey = null;
      currentKind = null;
      continue;
    }

    if (currentKind === 'text') {
      textBuffer.push(line);
      continue;
    }

    if (isBulletLine(line)) {
      flushBullet();
      bulletBuffer = stripBulletMarker(line);
    } else if (bulletBuffer !== null && line.trim().length > 0) {
      // Continuation of the previous bullet (wrapped line or nested bullet indent)
      bulletBuffer += ` ${line.trim()}`;
    } else if (bulletBuffer !== null && line.trim().length === 0) {
      // Blank line ends the current bullet
      flushBullet();
    }
  }
  flush();

  return sections;
}

export function renderInjectableMarkdown(sections: SummarySections): string {
  const parts: string[] = [];

  if (sections.tldr.length > 0) {
    parts.push('## TL;DR');
    parts.push(sections.tldr);
    parts.push('');
  }

  if (sections.decisions.length > 0) {
    parts.push('## Decisions');
    for (const d of sections.decisions) parts.push(`- ${d}`);
    parts.push('');
  }

  if (sections.artifactsCreated.length > 0) {
    parts.push('## Artifacts');
    for (const a of sections.artifactsCreated) parts.push(`- ${a}`);
    parts.push('');
  }

  return parts.join('\n').trim();
}

export interface SummarySections {
  decisions: string[];
  artifactsCreated: string[];
  openQuestions: string[];
  nextSteps: string[];
}

interface SectionMatcher {
  key: keyof SummarySections;
  patterns: RegExp[];
}

const MATCHERS: SectionMatcher[] = [
  {
    key: 'decisions',
    patterns: [/^##\s+decisions\s*$/i, /^##\s+decis[õo]es\s*$/i],
  },
  {
    key: 'artifactsCreated',
    patterns: [
      /^##\s+artifacts\s+created\s*$/i,
      /^##\s+artifacts\s*$/i,
      /^##\s+artefatos\s+criados\s*$/i,
      /^##\s+artefatos\s*$/i,
    ],
  },
  {
    key: 'openQuestions',
    patterns: [
      /^##\s+open\s+questions\s*$/i,
      /^##\s+perguntas\s+abertas\s*$/i,
      /^##\s+quest[õo]es\s+abertas\s*$/i,
    ],
  },
  {
    key: 'nextSteps',
    patterns: [
      /^##\s+next\s+steps\s*$/i,
      /^##\s+pr[óo]ximos\s+passos\s*$/i,
    ],
  },
];

function matchSection(line: string): keyof SummarySections | null {
  for (const matcher of MATCHERS) {
    for (const pattern of matcher.patterns) {
      if (pattern.test(line)) return matcher.key;
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
    decisions: [],
    artifactsCreated: [],
    openQuestions: [],
    nextSteps: [],
  };

  const lines = summary.split(/\r?\n/);
  let currentSection: keyof SummarySections | null = null;
  let buffered: string | null = null;

  const flush = () => {
    if (buffered !== null && currentSection !== null) {
      const trimmed = buffered.trim();
      if (trimmed.length > 0) sections[currentSection].push(trimmed);
    }
    buffered = null;
  };

  for (const line of lines) {
    const matched = matchSection(line);
    if (matched) {
      flush();
      currentSection = matched;
      continue;
    }

    if (currentSection === null) continue;

    if (isSectionHeader(line)) {
      flush();
      currentSection = null;
      continue;
    }

    if (isBulletLine(line)) {
      flush();
      buffered = stripBulletMarker(line);
    } else if (buffered !== null && line.trim().length > 0) {
      // Continuation of the previous bullet (wrapped line or nested bullet indent)
      buffered += ` ${line.trim()}`;
    } else if (buffered !== null && line.trim().length === 0) {
      // Blank line ends the current bullet
      flush();
    }
  }
  flush();

  return sections;
}

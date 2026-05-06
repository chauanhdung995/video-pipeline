const MAX_RAW_GROUP = 12;
const SKIP_RAW_COST = 0.95;
const INSERT_SCRIPT_COST = 1.2;

export function correctSubtitleArtifacts(srtContent, voiceScript, rawWordTimings = []) {
  if (!voiceScript || !srtContent) {
    return { srt: srtContent, wordTimings: normalizeRawWordTimings(rawWordTimings) };
  }

  const parsed = parseSRTForCorrection(srtContent);
  const scriptTokens = tokenizeVoice(voiceScript);
  if (!parsed.words.length || !scriptTokens.length) {
    return { srt: srtContent, wordTimings: normalizeRawWordTimings(rawWordTimings) };
  }

  const alignment = alignScriptToWhisper(parsed.words, scriptTokens);
  if (!alignment?.assignments?.length) {
    return { srt: srtContent, wordTimings: normalizeRawWordTimings(rawWordTimings) };
  }

  const timingSource = normalizeRawWordTimings(rawWordTimings);
  const blockTokens = parsed.blocks.map(() => []);
  const correctedWordTimings = [];
  let lastBlockIndex = 0;

  for (const assignment of alignment.assignments) {
    const rawStart = assignment.rawStart;
    const rawEnd = assignment.rawEnd;
    const hasRawRange = rawEnd > rawStart;
    const anchorIndex = hasRawRange ? Math.min(rawEnd - 1, parsed.words.length - 1) : Math.min(rawStart, parsed.words.length - 1);
    const blockIndex = hasRawRange
      ? parsed.words[anchorIndex]?.blockIndex ?? lastBlockIndex
      : lastBlockIndex;
    lastBlockIndex = Math.max(0, Math.min(parsed.blocks.length - 1, blockIndex));
    blockTokens[lastBlockIndex].push(assignment.token);

    const timing = timingForAssignment(assignment, timingSource, correctedWordTimings);
    if (timing) {
      correctedWordTimings.push({
        word: assignment.token,
        start: roundTime(timing.start),
        end: roundTime(timing.end),
      });
    }
  }

  const correctedBlocks = parsed.blocks
    .map((block, index) => ({
      ...block,
      text: cleanupSubtitleText(blockTokens[index].join(' ')),
    }))
    .filter(block => block.text);
  const srt = correctedBlocks.map((block, index) => {
    const header = renumberSRTHeader(block.header, index + 1);
    return [...header, block.text].join('\n');
  }).join('\n\n') + '\n';

  return {
    srt,
    wordTimings: correctedWordTimings.length ? correctedWordTimings : normalizeRawWordTimings(rawWordTimings),
  };
}

function parseSRTForCorrection(srtContent) {
  const rawBlocks = String(srtContent || '').replace(/\r/g, '').trim().split(/\n\s*\n+/).filter(Boolean);
  const blocks = rawBlocks.map((block, blockIndex) => {
    const lines = block.split('\n');
    const timeLineIndex = lines.findIndex(line => line.includes('-->'));
    const headerEnd = timeLineIndex >= 0 ? timeLineIndex + 1 : Math.min(2, lines.length);
    const header = lines.slice(0, headerEnd);
    const textLines = lines.slice(headerEnd);
    const words = textLines.join(' ').trim().split(/\s+/).filter(Boolean);
    return { blockIndex, header, words };
  });

  const words = [];
  for (const block of blocks) {
    block.words.forEach((word, wordIndex) => {
      words.push({
        text: word,
        blockIndex: block.blockIndex,
        wordIndex,
      });
    });
  }
  return { blocks, words };
}

function tokenizeVoice(value) {
  return String(value || '').trim().split(/\s+/).filter(Boolean);
}

function alignScriptToWhisper(rawWords, scriptTokens) {
  const m = rawWords.length;
  const n = scriptTokens.length;
  const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(Infinity));
  const back = Array.from({ length: n + 1 }, () => Array(m + 1).fill(null));
  dp[0][0] = 0;

  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      const base = dp[i][j];
      if (!Number.isFinite(base)) continue;

      if (j < m && base + SKIP_RAW_COST < dp[i][j + 1]) {
        dp[i][j + 1] = base + SKIP_RAW_COST;
        back[i][j + 1] = { prevI: i, prevJ: j, type: 'skipRaw' };
      }

      if (i < n && base + INSERT_SCRIPT_COST < dp[i + 1][j]) {
        dp[i + 1][j] = base + INSERT_SCRIPT_COST;
        back[i + 1][j] = {
          prevI: i,
          prevJ: j,
          type: 'insertScript',
          token: scriptTokens[i],
          rawStart: j,
          rawEnd: j,
        };
      }

      if (i < n) {
        const maxGroup = Math.min(MAX_RAW_GROUP, m - j);
        for (let groupSize = 1; groupSize <= maxGroup; groupSize++) {
          const rawGroup = rawWords.slice(j, j + groupSize).map(item => item.text);
          const cost = tokenGroupCost(rawGroup, scriptTokens[i]);
          const groupPenalty = normalizeAlignText(rawGroup.join('')) === normalizeAlignText(scriptTokens[i])
            ? 0
            : 0.04 * (groupSize - 1);
          const next = base + cost + groupPenalty;
          if (next < dp[i + 1][j + groupSize]) {
            dp[i + 1][j + groupSize] = next;
            back[i + 1][j + groupSize] = {
              prevI: i,
              prevJ: j,
              type: 'match',
              token: scriptTokens[i],
              rawStart: j,
              rawEnd: j + groupSize,
            };
          }
        }
      }
    }
  }

  let i = n;
  let j = m;
  const best = dp[n][m];

  const assignments = [];
  while (i > 0 || j > 0) {
    const step = back[i][j];
    if (!step) break;
    if (step.type === 'match' || step.type === 'insertScript') {
      assignments.push({
        token: step.token,
        rawStart: step.rawStart,
        rawEnd: step.rawEnd,
      });
    }
    i = step.prevI;
    j = step.prevJ;
  }
  assignments.reverse();

  return { cost: best, assignments };
}

function tokenGroupCost(rawGroup, scriptToken) {
  const rawCompact = normalizeAlignText(rawGroup.join(''));
  const rawSpaced = normalizeAlignText(rawGroup.join(' '));
  const script = normalizeAlignText(scriptToken);
  if (!rawCompact && !script) return 0;
  if (rawCompact === script || rawSpaced === script) return 0;
  const aliasCost = spokenAliasCost(rawGroup, scriptToken);
  if (Number.isFinite(aliasCost)) return aliasCost;
  const raw = rawCompact || rawSpaced;
  if (!raw || !script) return 1;
  return editDistance(raw, script) / Math.max(raw.length, script.length, 1);
}

function spokenAliasCost(rawGroup, scriptToken) {
  const raw = normalizeSpokenAlias(rawGroup.join(' '));
  const aliases = buildTokenAliases(scriptToken).map(normalizeSpokenAlias).filter(Boolean);
  if (!raw || !aliases.length) return NaN;
  if (aliases.includes(raw)) return 0;

  const compactScript = normalizeAlignText(scriptToken);
  if (compactScript.includes('%') && raw.endsWith('phantram')) return 0.08;
  if (compactScript === 'usd' && /(dolamy|dola|uetde|uetd|usd|mykim)$/.test(raw)) return 0.05;
  if (compactScript === 'm2' && /(emhai|mhai|mohai|m2)$/.test(raw)) return 0.05;
  if (compactScript === 'okx' && /(okayex|okeex|okex|okx)$/.test(raw)) return 0.05;
  if (compactScript === 'ice' && /(ice|ais|intercontinentalexchange)$/.test(raw)) return 0.08;
  if (compactScript === 'nyse' && /(nyse|newyorkstockexchange)$/.test(raw)) return 0.08;
  if (compactScript === '247' && /(haimuoibontrenbay|haibontrenbay|haitutrenbay|247)$/.test(raw)) return 0.05;
  return NaN;
}

function buildTokenAliases(scriptToken) {
  const raw = String(scriptToken || '');
  const compact = normalizeAlignText(raw);
  const aliases = [raw, compact];
  if (compact.includes('%')) aliases.push(compact.replace('%', 'phantram'));
  if (compact === 'usd') aliases.push('do la my', 'do la', 'u ét đê', 'u ét dê', 'u s d');
  if (compact === 'm2') aliases.push('em hai', 'm hai', 'mờ hai');
  if (compact === 'okx') aliases.push('ô kây ex', 'ô kê ex', 'ô kê ích', 'ok ex');
  if (compact === 'ice') aliases.push('ai xi i', 'intercontinental exchange');
  if (compact === 'nyse') aliases.push('new york stock exchange');
  if (compact === '247') aliases.push('hai mươi bốn trên bảy', 'hai bốn trên bảy', 'hai tư trên bảy');
  return aliases;
}

function normalizeAlignText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9%$€£¥₫+-]+/g, '');
}

function normalizeSpokenAlias(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9%$€£¥₫+-]+/g, '');
}

function cleanupSubtitleText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?%])/g, '$1')
    .replace(/([([{])\s+/g, '$1')
    .replace(/([+\-]?\d+(?:[.,]\d+)*)%\s+%/g, '$1%')
    .replace(/([+\-]?\d+(?:[.,]\d+)*)\s+([.,]\d+)/g, '$1$2')
    .replace(/\b(USD|USDC|BTC|ETH|OKX|NYSE|ICE|M2)\s+([,.;:!?])/g, '$1$2')
    .trim();
}

function renumberSRTHeader(header, index) {
  if (!Array.isArray(header) || !header.length) return [String(index)];
  const next = [...header];
  if (/^\d+$/.test(String(next[0] || '').trim())) next[0] = String(index);
  return next;
}

function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function normalizeRawWordTimings(rawWordTimings = []) {
  return (Array.isArray(rawWordTimings) ? rawWordTimings : [])
    .map(item => {
      const word = String(item?.word || item?.text || '').trim();
      const start = Number(item?.start);
      const end = Number(item?.end);
      if (!word || !Number.isFinite(start) || !Number.isFinite(end)) return null;
      return { word, start, end: Math.max(start, end) };
    })
    .filter(Boolean);
}

function timingForAssignment(assignment, timingSource, correctedWordTimings) {
  if (assignment.rawEnd > assignment.rawStart && timingSource.length) {
    const first = timingSource[assignment.rawStart];
    const last = timingSource[Math.max(assignment.rawStart, assignment.rawEnd - 1)];
    if (first && last) {
      return {
        start: Number(first.start),
        end: Math.max(Number(first.start), Number(last.end)),
      };
    }
  }

  const previous = correctedWordTimings[correctedWordTimings.length - 1];
  const start = previous ? previous.end : 0;
  return { start, end: start + 0.18 };
}

function roundTime(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

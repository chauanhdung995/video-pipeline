import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OBJECTIVES_DIR = path.join(__dirname, 'hyperframes', 'catalog', 'objectives');

export const SCENE_TEMPLATES = [
  'hook',
  'comparison',
  'comparison-vs',
  'stat-hero',
  'stat-pill',
  'feature-list',
  'feature-stack',
  'callout',
  'news-card',
  'image-background-hero',
  'image-inset-card',
  'market-chart',
  'crypto-card-hero',
  'onchain-payment',
  'payment-network-halo',
  'outro',
];

export const TEMPLATE_ALIASES = new Map([
  ['hero', 'crypto-card-hero'],
  ['hero-card', 'crypto-card-hero'],
  ['crypto-hero', 'crypto-card-hero'],
  ['payment-halo', 'payment-network-halo'],
  ['onchain', 'onchain-payment'],
  ['comparison', 'comparison-vs'],
  ['comparison-vs', 'comparison-vs'],
  ['list', 'feature-stack'],
  ['feature-list', 'feature-list'],
  ['feature-stack', 'feature-stack'],
  ['stat', 'stat-pill'],
  ['stat-badge', 'stat-pill'],
  ['stat-pill', 'stat-pill'],
  ['chart', 'market-chart'],
  ['market-chart', 'market-chart'],
  ['news', 'news-card'],
  ['news-card', 'news-card'],
  ['image-background', 'image-background-hero'],
  ['photo-background', 'image-background-hero'],
  ['image-background-hero', 'image-background-hero'],
  ['image-card', 'image-inset-card'],
  ['photo-card', 'image-inset-card'],
  ['image-inset', 'image-inset-card'],
  ['image-inset-card', 'image-inset-card'],
  ['outro', 'outro'],
  ['hook', 'hook'],
  ['callout', 'callout'],
  ['breaking-opener', 'news-alert-opener'],
  ['breaking-news-opener', 'news-alert-opener'],
  ['news-alert', 'news-alert-opener'],
  ['alert-opener', 'news-alert-opener'],
  ['issue-comparison', 'issue-comparison'],
  ['news-comparison', 'issue-comparison'],
  ['bullet-list', 'news-bullet-list'],
  ['news-list', 'news-bullet-list'],
  ['timeline', 'event-timeline'],
  ['news-timeline', 'event-timeline'],
  ['quote', 'quote-card'],
  ['quote-card', 'quote-card'],
  ['evidence', 'visual-evidence'],
  ['image-evidence', 'visual-evidence'],
  ['visual-evidence', 'visual-evidence'],
  ['key-number', 'key-number'],
  ['number-highlight', 'key-number'],
  ['breaking-stat', 'key-number'],
  ['follow-outro', 'follow-outro'],
  ['subscribe-outro', 'follow-outro'],
  ['data-snapshot', 'data-snapshot-chart'],
  ['data-chart', 'data-snapshot-chart'],
  ['data-snapshot-chart', 'data-snapshot-chart'],
  ['source-check', 'source-check'],
  ['fact-check', 'source-check'],
  ['live-update', 'live-update-ticker'],
  ['live-update-ticker', 'live-update-ticker'],
  ['location', 'location-context'],
  ['location-context', 'location-context'],
  ['concept-hook', 'explainer-concept-hook'],
  ['explainer-hook', 'explainer-concept-hook'],
  ['definition', 'explainer-concept-hook'],
  ['problem-solution', 'explainer-problem-solution'],
  ['solution-split', 'explainer-problem-solution'],
  ['process-steps', 'explainer-process-steps'],
  ['steps', 'explainer-process-steps'],
  ['how-it-works', 'explainer-process-steps'],
  ['cause-effect', 'explainer-cause-effect'],
  ['causal-flow', 'explainer-cause-effect'],
  ['analogy', 'explainer-analogy-bridge'],
  ['analogy-bridge', 'explainer-analogy-bridge'],
  ['data-proof', 'explainer-data-proof'],
  ['proof-chart', 'explainer-data-proof'],
  ['myth-fact', 'explainer-myth-fact'],
  ['myth-vs-fact', 'explainer-myth-fact'],
  ['recap', 'explainer-recap-outro'],
  ['recap-outro', 'explainer-recap-outro'],
  ['image-context', 'explainer-image-context'],
  ['photo-context', 'explainer-image-context'],
  ['image-annotations', 'explainer-image-annotations'],
  ['annotated-image', 'explainer-image-annotations'],
  ['image-zoom', 'explainer-image-zoom'],
  ['zoom-detail', 'explainer-image-zoom'],
  ['image-timeline', 'explainer-image-timeline'],
  ['photo-timeline', 'explainer-image-timeline'],
  ['image-side-panel', 'explainer-image-side-panel'],
  ['photo-side-panel', 'explainer-image-side-panel'],
  ['image-recap', 'explainer-image-recap'],
  ['photo-recap', 'explainer-image-recap'],
]);

const DEFAULT_BACKGROUND = {
  type: 'gradient',
  colors: ['#111827', '#2563eb'],
  pattern: 'subtle data grid',
  opacity: 0.18,
};

export const DEFAULT_VIDEO_OBJECTIVE = 'mac-dinh';

function readJsonFile(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function safeListDirs(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

function loadObjectiveRecords() {
  const dirs = safeListDirs(OBJECTIVES_DIR);
  const records = dirs.map(id => {
    const meta = readJsonFile(path.join(OBJECTIVES_DIR, id, 'objective.json'), {});
    return {
      id,
      name: String(meta?.name || id).trim(),
      description: String(meta?.description || '').trim(),
      status: String(meta?.status || 'empty').trim(),
    };
  });
  if (!records.some(item => item.id === DEFAULT_VIDEO_OBJECTIVE)) {
    records.unshift({
      id: DEFAULT_VIDEO_OBJECTIVE,
      name: 'Mặc định',
      description: 'Bộ template mặc định đang dùng trong pipeline hiện tại.',
      status: 'ready',
    });
  }
  return records;
}

export const VIDEO_OBJECTIVES = loadObjectiveRecords();

export function normalizeVideoObjective(value) {
  const key = String(value || '').trim().toLowerCase().replace(/_/g, '-');
  return loadObjectiveRecords().some(item => item.id === key) ? key : DEFAULT_VIDEO_OBJECTIVE;
}

function readObjectiveTemplateRecords(videoObjective = DEFAULT_VIDEO_OBJECTIVE) {
  const objectiveId = normalizeVideoObjective(videoObjective);
  const objectiveDir = path.join(OBJECTIVES_DIR, objectiveId);
  const templateDirs = safeListDirs(objectiveDir);
  return templateDirs
    .map(template => {
      const schema = readJsonFile(path.join(objectiveDir, template, 'schema.json'), null);
      if (!schema?.template) return null;
      return {
        template: String(schema.template || template).trim(),
        description: String(schema.description || '').trim(),
        templateData: schema.templateData && typeof schema.templateData === 'object' ? schema.templateData : {},
        demo: {
          json: path.join(objectiveDir, template, 'demo.json'),
          html: path.join(objectiveDir, template, 'demo.html'),
          mp4: path.join(objectiveDir, template, 'demo.mp4'),
        },
      };
    })
    .filter(Boolean);
}

function allCatalogTemplateNames() {
  const names = new Set(SCENE_TEMPLATES);
  for (const objective of loadObjectiveRecords()) {
    for (const record of readObjectiveTemplateRecords(objective.id)) {
      if (record.template) names.add(record.template);
    }
  }
  return [...names];
}

export function getTemplatesForObjective(videoObjective = DEFAULT_VIDEO_OBJECTIVE) {
  return readObjectiveTemplateRecords(videoObjective).map(item => item.template);
}

export function getTemplateRecordsForObjective(videoObjective = DEFAULT_VIDEO_OBJECTIVE) {
  return readObjectiveTemplateRecords(videoObjective).map(item => ({
    template: item.template,
    description: item.description,
    templateData: clone(item.templateData || {}),
  }));
}

export function templateNeedsImage(template, videoObjective = DEFAULT_VIDEO_OBJECTIVE) {
  const name = normalizeTemplateName(template);
  const records = readObjectiveTemplateRecords(videoObjective);
  const record = records.find(item => item.template === name);
  return Boolean(record?.templateData && hasKeyDeep(record.templateData, 'imageSearch'));
}

export function listVideoObjectives() {
  return loadObjectiveRecords().map(objective => {
    const templates = getTemplatesForObjective(objective.id);
    return {
      ...objective,
      templates,
      templateCount: templates.length,
    };
  });
}

function hasKeyDeep(value, key) {
  if (!value || typeof value !== 'object') return false;
  if (Object.prototype.hasOwnProperty.call(value, key)) return true;
  if (Array.isArray(value)) return value.some(item => hasKeyDeep(item, key));
  return Object.values(value).some(item => hasKeyDeep(item, key));
}

export const TEMPLATE_SCHEMAS = {
  hook: {
    description: 'Opening hook with one bold headline and one support line.',
    sample: {
      headline: 'Câu mở gây chú ý',
      subhead: 'Một ý phụ ngắn',
      background: DEFAULT_BACKGROUND,
      appearanceOrder: ['headline', 'subhead'],
      timingPhrases: { headline: 'cụm hook chính', subhead: 'cụm bổ trợ' },
      sfx: { intro: 0.08, headline: 'cụm hook chính' },
    },
  },
  comparison: {
    description: 'Two-side comparison with left and right cards.',
    sample: {
      left: { label: 'Bên A', value: 'điểm yếu', color: 'cyan' },
      right: { label: 'Bên B', value: 'điểm mạnh', color: 'purple', winner: true },
      background: DEFAULT_BACKGROUND,
      appearanceOrder: ['left', 'right'],
      timingPhrases: { left: 'bên A', right: 'bên B' },
      sfx: { left: 'bên A', right: 'bên B' },
    },
  },
  'comparison-vs': {
    description: 'Versus / before-after contrast.',
    sample: {
      left: { label: 'Trước đây', value: 'chậm, đắt', color: 'cyan' },
      right: { label: 'Bây giờ', value: 'nhanh, rõ ràng', color: 'purple', winner: true },
      background: DEFAULT_BACKGROUND,
      appearanceOrder: ['left', 'vs', 'right'],
      timingPhrases: { left: 'trước đây', right: 'bây giờ' },
      sfx: { left: 'trước đây', versus: 'so với', right: 'bây giờ' },
    },
  },
  'stat-hero': {
    description: 'Large central metric with label and context.',
    sample: {
      value: '90%',
      label: 'thị phần',
      context: 'một câu ngắn giải thích số liệu',
      background: DEFAULT_BACKGROUND,
      appearanceOrder: ['value', 'label', 'context'],
      timingPhrases: { value: 'chín mươi phần trăm', label: 'thị phần' },
      sfx: { value: 'chín mươi phần trăm', context: 'xu hướng' },
    },
  },
  'stat-pill': {
    description: 'Metric badge / pill that pops in as the voice reads the number.',
    sample: {
      value: '+500%',
      label: 'tăng trưởng chi tiêu',
      context: '~600M USD/tháng',
      background: DEFAULT_BACKGROUND,
      appearanceOrder: ['value', 'label', 'context'],
      timingPhrases: { value: 'năm trăm phần trăm', context: 'sáu trăm triệu' },
      sfx: { value: 'năm trăm phần trăm', context: 'sáu trăm triệu' },
    },
  },
  'feature-list': {
    description: 'Short list of features, reasons, or steps.',
    sample: {
      title: 'Ba điểm cần nhớ',
      bullets: ['ý 1', 'ý 2', 'ý 3'],
      background: DEFAULT_BACKGROUND,
      appearanceOrder: ['title', 'bullet-1', 'bullet-2', 'bullet-3'],
      timingPhrases: { title: 'điểm cần nhớ' },
      sfx: { card: 'điểm cần nhớ', item1: 'ý 1', item2: 'ý 2', item3: 'ý 3' },
    },
  },
  'feature-stack': {
    description: 'Stacked feature cards or layered ideas.',
    sample: {
      title: 'Điều gì đang thay đổi',
      bullets: ['lớp 1', 'lớp 2', 'lớp 3'],
      background: DEFAULT_BACKGROUND,
      appearanceOrder: ['title', 'stack-1', 'stack-2', 'stack-3'],
      timingPhrases: { title: 'đang thay đổi' },
      sfx: { title: 'đang thay đổi', item1: 'lớp 1', item2: 'lớp 2', item3: 'lớp 3' },
    },
  },
  callout: {
    description: 'Warning, key takeaway, or important note.',
    sample: {
      tag: 'Điểm chính',
      statement: 'Một thông điệp ngắn cần nhấn mạnh',
      background: DEFAULT_BACKGROUND,
      appearanceOrder: ['callout'],
      timingPhrases: { statement: 'cụm thông điệp chính' },
      sfx: { alert: 'cụm thông điệp chính' },
    },
  },
  'news-card': {
    description: 'News-style card with kicker, title, and body.',
    sample: {
      kicker: 'Tin chính',
      title: 'Tiêu đề ngắn',
      body: 'Một câu giải thích hoặc trích dẫn ngắn',
      source: 'Nguồn/brand nếu có',
      background: DEFAULT_BACKGROUND,
      appearanceOrder: ['card'],
      timingPhrases: { title: 'tiêu đề chính' },
      sfx: { card: 'tiêu đề chính', alert: 0.35 },
    },
  },
  'image-background-hero': {
    description: 'Full-screen searched image background with Ken Burns motion and concise title overlay.',
    sample: {
      kicker: 'Bối cảnh',
      title: 'Tiêu đề chính trên ảnh',
      subtitle: 'Một câu ngắn giải thích vì sao hình ảnh này quan trọng',
      source: '',
      imageSearch: {
        q: '"bitcoin adoption" OR "crypto payment" chart -logo -icon',
        intent: 'Find a high-resolution crop-safe image that can work as a full-screen vertical background.',
        orientation: 'portrait',
        prefer: ['bitcoin', 'crypto payment', 'editorial'],
        avoid: ['logo', 'icon', 'clipart', 'stock']
      },
      image: {
        title: '',
        src: '',
        width: 0,
        height: 0,
        alt: ''
      },
      background: {
        type: 'image',
        src: '',
        fit: 'cover',
        colors: ['#0f172a', '#2563eb'],
        opacity: 0.12
      },
      overlay: { opacity: 0.56 },
      appearanceOrder: ['image', 'kicker', 'title', 'subtitle'],
      timingPhrases: { title: 'cụm tiêu đề chính', subtitle: 'cụm giải thích' },
      sfx: { image: 0.08, title: 'cụm tiêu đề chính' },
    },
  },
  'image-inset-card': {
    description: 'Searched image as an inset media panel with adjacent news/explainer text.',
    sample: {
      kicker: 'Hình ảnh minh họa',
      title: 'Ý chính của cảnh',
      body: 'Một câu ngắn đặt hình ảnh vào đúng ngữ cảnh',
      source: '',
      imageSearch: {
        q: '"bitcoin vs gold" chart OR infographic -logo -icon',
        intent: 'Find an image that illustrates the scene and remains readable inside a rounded media panel.',
        orientation: 'any',
        prefer: ['chart', 'infographic', 'comparison'],
        avoid: ['logo', 'icon', 'clipart', 'stock']
      },
      image: {
        title: '',
        src: '',
        width: 0,
        height: 0,
        alt: ''
      },
      background: DEFAULT_BACKGROUND,
      appearanceOrder: ['image', 'title', 'body'],
      timingPhrases: { image: 'cụm nhắc tới hình ảnh', title: 'cụm tiêu đề chính' },
      sfx: { image: 'cụm nhắc tới hình ảnh', title: 'cụm tiêu đề chính' },
    },
  },
  'market-chart': {
    description: 'Market/chart/dashboard visual with a metric and trend.',
    sample: {
      title: 'Xu hướng thị trường',
      value: '90%',
      context: 'thị phần hoặc biến động chính',
      chartType: 'line',
      trend: 'up',
      dataPoints: [20, 34, 28, 52, 71, 90],
      background: DEFAULT_BACKGROUND,
      appearanceOrder: ['title', 'chart', 'value'],
      timingPhrases: { value: 'chín mươi phần trăm' },
      sfx: { chart: 'xu hướng', value: 'chín mươi phần trăm' },
    },
  },
  'crypto-card-hero': {
    description: 'Crypto/payment card hero with wallet, halo, consumer icons, and stat badge.',
    sample: {
      title: 'THẺ CRYPTO HẰNG NGÀY',
      cardLabel: 'VISA CRYPTO',
      statMain: '+500%',
      statSub: '~600M USD/tháng',
      note: 'Visa 90% on-chain',
      background: DEFAULT_BACKGROUND,
      elements: {
        card: { x: 540, y: 840, timingPhrase: 'thẻ crypto' },
        wallet: { x: 540, y: 910, timingPhrase: 'ví' },
        halo: { x: 540, y: 840, timingPhrase: 'Visa on-chain' },
        icons: [
          { label: 'Cà phê', x: 265, y: 510, timingPhrase: 'cà phê' },
          { label: 'Siêu thị', x: 540, y: 455, timingPhrase: 'siêu thị' },
          { label: 'Đặt xe', x: 815, y: 510, timingPhrase: 'đặt xe' }
        ]
      },
      appearanceOrder: ['wallet', 'card', 'icons', 'halo', 'stat'],
      timingPhrases: { card: 'thẻ crypto', stat: 'năm trăm phần trăm' },
      sfx: { wallet: 'ví', card: 'thẻ crypto', halo: 'Visa on-chain', stat: 'năm trăm phần trăm' },
    },
  },
  'onchain-payment': {
    description: 'On-chain payment flow centered on card/wallet/network.',
    sample: {
      title: 'Thanh toán on-chain',
      cardLabel: 'VISA CRYPTO',
      statMain: '90%',
      statSub: 'on-chain',
      note: 'Luồng thanh toán minh bạch',
      background: DEFAULT_BACKGROUND,
      elements: {
        card: { x: 540, y: 840, timingPhrase: 'thẻ' },
        wallet: { x: 540, y: 910, timingPhrase: 'ví' },
        halo: { x: 540, y: 840, timingPhrase: 'on-chain' },
        icons: []
      },
      appearanceOrder: ['wallet', 'card', 'halo', 'stat'],
      timingPhrases: { halo: 'on-chain', stat: 'chín mươi phần trăm' },
      sfx: { wallet: 'ví', card: 'thẻ', halo: 'on-chain', stat: 'chín mươi phần trăm' },
    },
  },
  'payment-network-halo': {
    description: 'Payment network halo/orbit around a central object.',
    sample: {
      title: 'Mạng thanh toán',
      cardLabel: 'PAYMENT',
      statMain: '24/7',
      statSub: 'kết nối tức thì',
      note: 'Mạng lưới bao quanh giao dịch',
      background: DEFAULT_BACKGROUND,
      elements: {
        card: { x: 540, y: 840, timingPhrase: 'giao dịch' },
        wallet: { x: 540, y: 910, timingPhrase: 'ví' },
        halo: { x: 540, y: 840, timingPhrase: 'mạng lưới' },
        icons: [
          { label: 'Node', x: 265, y: 510 },
          { label: 'User', x: 540, y: 455 },
          { label: 'Merchant', x: 815, y: 510 }
        ]
      },
      appearanceOrder: ['card', 'halo', 'icons', 'stat'],
      timingPhrases: { halo: 'mạng lưới' },
      sfx: { card: 'giao dịch', halo: 'mạng lưới', nodes: 'merchant', stat: 1.4 },
    },
  },
  outro: {
    description: 'Closing summary / CTA.',
    sample: {
      ctaTop: 'Theo dõi để xem tiếp',
      channelName: 'Bản Tin Nhanh',
      source: 'Tóm tắt nội dung chính',
      background: DEFAULT_BACKGROUND,
      appearanceOrder: ['cta', 'channel', 'source'],
      timingPhrases: { channelName: 'theo dõi' },
      sfx: { cta: 0.12, finish: 'theo dõi' },
    },
  },
};

export function normalizeTemplateName(value) {
  const key = String(value || '').trim().toLowerCase().replace(/_/g, '-');
  const catalogTemplates = allCatalogTemplateNames();
  if (catalogTemplates.includes(key)) return key;
  const alias = TEMPLATE_ALIASES.get(key) || key;
  return catalogTemplates.includes(alias) ? alias : '';
}

export function getTemplateSchemaPrompt(videoObjective = DEFAULT_VIDEO_OBJECTIVE) {
  const catalogRecords = readObjectiveTemplateRecords(videoObjective);
  return JSON.stringify(
    catalogRecords.map(({ template, description, templateData }) => ({ template, description, templateData })),
    null,
    2
  );
}

export function getDefaultTemplateData(template) {
  return clone(TEMPLATE_SCHEMAS[template]?.sample || TEMPLATE_SCHEMAS.hook.sample);
}

export function normalizeTemplateData(template, raw = {}, fallback = {}) {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const merged = clone(input);
  const theme = themeFromBackground(merged.background, fallback.theme);
  const sfx = normalizeSfxTiming(merged.sfx, fallback.sfx);

  if (template === 'explainer-concept-hook') {
    return {
      template,
      theme,
      sfx,
      kicker: text(merged.kicker, fallback.kicker || 'GIẢI THÍCH NHANH'),
      title: text(merged.title || merged.headline, fallback.title || fallback.headline),
      subtitle: text(merged.subtitle || merged.subhead, fallback.subtitle || fallback.subhead),
      coreTerm: text(merged.coreTerm || merged.term, fallback.coreTerm || fallback.term),
      definition: text(merged.definition || merged.body, fallback.definition || fallback.body),
      icon: text(merged.icon, fallback.icon || 'spark'),
      blockRefs: list(merged.blockRefs || merged.blocks, fallback.blockRefs),
      appearanceOrder: list(merged.appearanceOrder, fallback.appearanceOrder),
      timingPhrases: normalizeTimingPhrases(merged.timingPhrases),
    };
  }

  if (template === 'explainer-problem-solution') {
    return {
      template,
      theme,
      sfx,
      title: text(merged.title, fallback.title),
      problem: normalizeComparisonIssue(merged.problem || merged.left, fallback.problem || fallback.left, 'Vấn đề'),
      solution: normalizeComparisonIssue(merged.solution || merged.right, fallback.solution || fallback.right, 'Cách hiểu đúng'),
      bridge: text(merged.bridge || merged.verdict, fallback.bridge || fallback.verdict),
      blockRefs: list(merged.blockRefs || merged.blocks, fallback.blockRefs),
      appearanceOrder: list(merged.appearanceOrder, fallback.appearanceOrder),
      timingPhrases: normalizeTimingPhrases(merged.timingPhrases),
    };
  }

  if (template === 'explainer-process-steps') {
    return {
      template,
      theme,
      sfx,
      kicker: text(merged.kicker, fallback.kicker || 'QUY TRÌNH'),
      title: text(merged.title, fallback.title),
      steps: normalizeNewsItems(merged.steps || merged.items || merged.bullets, fallback.steps || fallback.items || fallback.bullets, 5),
      result: text(merged.result || merged.takeaway, fallback.result || fallback.takeaway),
      blockRefs: list(merged.blockRefs || merged.blocks, fallback.blockRefs),
      appearanceOrder: list(merged.appearanceOrder, fallback.appearanceOrder),
      timingPhrases: normalizeTimingPhrases(merged.timingPhrases),
    };
  }

  if (template === 'explainer-cause-effect') {
    return {
      template,
      theme,
      sfx,
      title: text(merged.title, fallback.title),
      causes: normalizeNewsItems(merged.causes || merged.left || merged.items, fallback.causes || fallback.left || fallback.items, 4),
      effects: normalizeNewsItems(merged.effects || merged.right || merged.outcomes, fallback.effects || fallback.right || fallback.outcomes, 4),
      insight: text(merged.insight || merged.takeaway, fallback.insight || fallback.takeaway),
      blockRefs: list(merged.blockRefs || merged.blocks, fallback.blockRefs),
      appearanceOrder: list(merged.appearanceOrder, fallback.appearanceOrder),
      timingPhrases: normalizeTimingPhrases(merged.timingPhrases),
    };
  }

  if (template === 'explainer-analogy-bridge') {
    return {
      template,
      theme,
      sfx,
      title: text(merged.title, fallback.title),
      abstract: normalizeComparisonIssue(merged.abstract || merged.left, fallback.abstract || fallback.left, 'Khái niệm'),
      analogy: normalizeComparisonIssue(merged.analogy || merged.right, fallback.analogy || fallback.right, 'Ví dụ quen thuộc'),
      bridge: text(merged.bridge, fallback.bridge),
      takeaway: text(merged.takeaway || merged.insight, fallback.takeaway || fallback.insight),
      blockRefs: list(merged.blockRefs || merged.blocks, fallback.blockRefs),
      appearanceOrder: list(merged.appearanceOrder, fallback.appearanceOrder),
      timingPhrases: normalizeTimingPhrases(merged.timingPhrases),
    };
  }

  if (template === 'explainer-data-proof') {
    return {
      template,
      theme,
      sfx,
      kicker: text(merged.kicker, fallback.kicker || 'BẰNG CHỨNG'),
      title: text(merged.title, fallback.title),
      metric: text(merged.metric || merged.value, fallback.metric || fallback.value),
      metricLabel: text(merged.metricLabel || merged.label, fallback.metricLabel || fallback.label),
      insight: text(merged.insight || merged.context || merged.body, fallback.insight || fallback.context || fallback.body),
      labels: normalizeChartLabels(merged.labels, fallback.labels, 8),
      dataPoints: normalizeNumericList(merged.dataPoints || merged.values, fallback.dataPoints || fallback.values, 8),
      blockRefs: list(merged.blockRefs || merged.blocks, fallback.blockRefs),
      appearanceOrder: list(merged.appearanceOrder, fallback.appearanceOrder),
      timingPhrases: normalizeTimingPhrases(merged.timingPhrases),
    };
  }

  if (template === 'explainer-myth-fact') {
    return {
      template,
      theme,
      sfx,
      title: text(merged.title, fallback.title || 'Hiểu đúng trong 10 giây'),
      myth: normalizeComparisonIssue(merged.myth || merged.left, fallback.myth || fallback.left, 'Hiểu lầm'),
      fact: normalizeComparisonIssue(merged.fact || merged.right, fallback.fact || fallback.right, 'Sự thật'),
      takeaway: text(merged.takeaway || merged.bridge || merged.verdict, fallback.takeaway || fallback.bridge || fallback.verdict),
      blockRefs: list(merged.blockRefs || merged.blocks, fallback.blockRefs),
      appearanceOrder: list(merged.appearanceOrder, fallback.appearanceOrder),
      timingPhrases: normalizeTimingPhrases(merged.timingPhrases),
    };
  }

  if (template === 'explainer-recap-outro') {
    return {
      template,
      theme,
      sfx,
      title: text(merged.title, fallback.title || 'Tóm lại'),
      takeaways: normalizeNewsItems(merged.takeaways || merged.items || merged.bullets, fallback.takeaways || fallback.items || fallback.bullets, 4),
      cta: text(merged.cta || merged.ctaTop, fallback.cta || fallback.ctaTop || 'Theo dõi để hiểu nhanh hơn'),
      channelName: text(merged.channelName || merged.channel, fallback.channelName || fallback.channel || 'Explainer'),
      blockRefs: list(merged.blockRefs || merged.blocks, fallback.blockRefs),
      appearanceOrder: list(merged.appearanceOrder, fallback.appearanceOrder),
      timingPhrases: normalizeTimingPhrases(merged.timingPhrases),
    };
  }

  if (template === 'explainer-image-context') {
    const image = normalizeImageAsset(merged.image, fallback.image);
    return {
      template,
      theme,
      sfx,
      kicker: text(merged.kicker, fallback.kicker || 'BỐI CẢNH'),
      title: text(merged.title || merged.headline, fallback.title || fallback.headline),
      subtitle: text(merged.subtitle || merged.body, fallback.subtitle || fallback.body),
      caption: text(merged.caption || merged.source, fallback.caption || fallback.source || image.title),
      imageSearch: normalizeImageSearch(merged.imageSearch, fallback.imageSearch),
      image,
      overlay: normalizeOverlay(merged.overlay, fallback.overlay),
      blockRefs: list(merged.blockRefs || merged.blocks, fallback.blockRefs),
      appearanceOrder: list(merged.appearanceOrder, fallback.appearanceOrder),
      timingPhrases: normalizeTimingPhrases(merged.timingPhrases),
    };
  }

  if (template === 'explainer-image-annotations') {
    return {
      template,
      theme,
      sfx,
      kicker: text(merged.kicker, fallback.kicker || 'NHÌN VÀO ẢNH'),
      title: text(merged.title, fallback.title),
      imageSearch: normalizeImageSearch(merged.imageSearch, fallback.imageSearch),
      image: normalizeImageAsset(merged.image, fallback.image),
      annotations: normalizeAnnotationItems(merged.annotations || merged.items, fallback.annotations || fallback.items, 4),
      caption: text(merged.caption || merged.body, fallback.caption || fallback.body),
      blockRefs: list(merged.blockRefs || merged.blocks, fallback.blockRefs),
      appearanceOrder: list(merged.appearanceOrder, fallback.appearanceOrder),
      timingPhrases: normalizeTimingPhrases(merged.timingPhrases),
    };
  }

  if (template === 'explainer-image-zoom') {
    return {
      template,
      theme,
      sfx,
      kicker: text(merged.kicker, fallback.kicker || 'CHI TIẾT'),
      title: text(merged.title, fallback.title),
      detailTitle: text(merged.detailTitle || merged.zoomTitle, fallback.detailTitle || fallback.zoomTitle),
      detail: text(merged.detail || merged.body, fallback.detail || fallback.body),
      zoomLabel: text(merged.zoomLabel || merged.label, fallback.zoomLabel || fallback.label),
      lens: normalizeLens(merged.lens, fallback.lens),
      imageSearch: normalizeImageSearch(merged.imageSearch, fallback.imageSearch),
      image: normalizeImageAsset(merged.image, fallback.image),
      blockRefs: list(merged.blockRefs || merged.blocks, fallback.blockRefs),
      appearanceOrder: list(merged.appearanceOrder, fallback.appearanceOrder),
      timingPhrases: normalizeTimingPhrases(merged.timingPhrases),
    };
  }

  if (template === 'explainer-image-timeline') {
    return {
      template,
      theme,
      sfx,
      kicker: text(merged.kicker, fallback.kicker || 'DIỄN TIẾN'),
      title: text(merged.title, fallback.title),
      imageSearch: normalizeImageSearch(merged.imageSearch, fallback.imageSearch),
      image: normalizeImageAsset(merged.image, fallback.image),
      events: normalizeTimelineEvents(merged.events || merged.items, fallback.events || fallback.items, 4),
      caption: text(merged.caption || merged.source, fallback.caption || fallback.source),
      overlay: normalizeOverlay(merged.overlay, fallback.overlay),
      blockRefs: list(merged.blockRefs || merged.blocks, fallback.blockRefs),
      appearanceOrder: list(merged.appearanceOrder, fallback.appearanceOrder),
      timingPhrases: normalizeTimingPhrases(merged.timingPhrases),
    };
  }

  if (template === 'explainer-image-side-panel') {
    return {
      template,
      theme,
      sfx,
      kicker: text(merged.kicker, fallback.kicker || 'GIẢI THÍCH'),
      title: text(merged.title, fallback.title),
      panelTitle: text(merged.panelTitle || merged.label, fallback.panelTitle || fallback.label),
      body: text(merged.body || merged.context, fallback.body || fallback.context),
      bullets: normalizeNewsItems(merged.bullets || merged.items, fallback.bullets || fallback.items, 3),
      imageSearch: normalizeImageSearch(merged.imageSearch, fallback.imageSearch),
      image: normalizeImageAsset(merged.image, fallback.image),
      blockRefs: list(merged.blockRefs || merged.blocks, fallback.blockRefs),
      appearanceOrder: list(merged.appearanceOrder, fallback.appearanceOrder),
      timingPhrases: normalizeTimingPhrases(merged.timingPhrases),
    };
  }

  if (template === 'explainer-image-recap') {
    return {
      template,
      theme,
      sfx,
      kicker: text(merged.kicker, fallback.kicker || 'TÓM TẮT BẰNG HÌNH'),
      title: text(merged.title, fallback.title),
      imageSearch: normalizeImageSearch(merged.imageSearch, fallback.imageSearch),
      image: normalizeImageAsset(merged.image, fallback.image),
      takeaways: normalizeNewsItems(merged.takeaways || merged.items || merged.bullets, fallback.takeaways || fallback.items || fallback.bullets, 3),
      cta: text(merged.cta || merged.summary, fallback.cta || fallback.summary),
      blockRefs: list(merged.blockRefs || merged.blocks, fallback.blockRefs),
      appearanceOrder: list(merged.appearanceOrder, fallback.appearanceOrder),
      timingPhrases: normalizeTimingPhrases(merged.timingPhrases),
    };
  }

  if (['crypto-card-hero', 'onchain-payment', 'payment-network-halo'].includes(template)) {
    return {
      template,
      theme,
      sfx,
      title: text(merged.title, fallback.title),
      cardLabel: text(merged.cardLabel, fallback.cardLabel || 'CRYPTO CARD'),
      statMain: text(merged.statMain, fallback.statMain || '+'),
      statSub: text(merged.statSub, fallback.statSub),
      note: text(merged.note, fallback.note),
      elements: normalizePaymentElements(merged.elements, fallback.elements),
      appearanceOrder: list(merged.appearanceOrder, fallback.appearanceOrder),
      timingPhrases: normalizeTimingPhrases(merged.timingPhrases),
    };
  }

  if (template === 'market-chart') {
    return {
      template,
      theme,
      sfx,
      title: text(merged.title, fallback.title),
      value: text(merged.value, fallback.value),
      context: text(merged.context, fallback.context),
      chartType: text(merged.chartType, 'line'),
      trend: text(merged.trend, 'up'),
      dataPoints: Array.isArray(merged.dataPoints) ? merged.dataPoints.map(Number).filter(Number.isFinite).slice(0, 12) : [],
      appearanceOrder: list(merged.appearanceOrder, fallback.appearanceOrder),
      timingPhrases: normalizeTimingPhrases(merged.timingPhrases),
    };
  }

  if (template === 'news-card') {
    return {
      template,
      theme,
      sfx,
      kicker: text(merged.kicker, fallback.kicker || 'Tin chính'),
      title: text(merged.title, fallback.title),
      body: text(merged.body, fallback.body),
      source: text(merged.source, fallback.source),
      appearanceOrder: list(merged.appearanceOrder, fallback.appearanceOrder),
      timingPhrases: normalizeTimingPhrases(merged.timingPhrases),
    };
  }

  if (template === 'news-alert-opener') {
    return {
      template,
      theme,
      sfx,
      kicker: text(merged.kicker, fallback.kicker || 'TIN NÓNG'),
      headline: text(merged.headline || merged.title, fallback.headline || fallback.title),
      subhead: text(merged.subhead || merged.subtitle, fallback.subhead || fallback.subtitle),
      timestamp: text(merged.timestamp || merged.time, fallback.timestamp),
      location: text(merged.location, fallback.location),
      blockRefs: list(merged.blockRefs || merged.blocks, fallback.blockRefs),
      appearanceOrder: list(merged.appearanceOrder, fallback.appearanceOrder),
      timingPhrases: normalizeTimingPhrases(merged.timingPhrases),
    };
  }

  if (template === 'issue-comparison') {
    return {
      template,
      theme,
      sfx,
      title: text(merged.title, fallback.title),
      left: normalizeComparisonIssue(merged.left, fallback.left, 'Vấn đề A'),
      right: normalizeComparisonIssue(merged.right, fallback.right, 'Vấn đề B'),
      verdict: text(merged.verdict, fallback.verdict),
      blockRefs: list(merged.blockRefs || merged.blocks, fallback.blockRefs),
      appearanceOrder: list(merged.appearanceOrder, fallback.appearanceOrder),
      timingPhrases: normalizeTimingPhrases(merged.timingPhrases),
    };
  }

  if (template === 'news-bullet-list') {
    return {
      template,
      theme,
      sfx,
      kicker: text(merged.kicker, fallback.kicker || 'CẦN BIẾT'),
      title: text(merged.title, fallback.title),
      items: normalizeNewsItems(merged.items || merged.bullets, fallback.items || fallback.bullets, 5),
      blockRefs: list(merged.blockRefs || merged.blocks, fallback.blockRefs),
      appearanceOrder: list(merged.appearanceOrder, fallback.appearanceOrder),
      timingPhrases: normalizeTimingPhrases(merged.timingPhrases),
    };
  }

  if (template === 'event-timeline') {
    return {
      template,
      theme,
      sfx,
      kicker: text(merged.kicker, fallback.kicker || 'DIỄN BIẾN'),
      title: text(merged.title, fallback.title),
      events: normalizeTimelineEvents(merged.events || merged.items, fallback.events || fallback.items, 5),
      source: text(merged.source, fallback.source),
      blockRefs: list(merged.blockRefs || merged.blocks, fallback.blockRefs),
      appearanceOrder: list(merged.appearanceOrder, fallback.appearanceOrder),
      timingPhrases: normalizeTimingPhrases(merged.timingPhrases),
    };
  }

  if (template === 'quote-card') {
    return {
      template,
      theme,
      sfx,
      kicker: text(merged.kicker, fallback.kicker || 'TRÍCH DẪN'),
      quote: text(merged.quote, fallback.quote),
      speaker: text(merged.speaker, fallback.speaker),
      role: text(merged.role || merged.title, fallback.role || fallback.title),
      source: text(merged.source, fallback.source),
      context: text(merged.context || merged.body, ''),
      blockRefs: list(merged.blockRefs || merged.blocks, fallback.blockRefs),
      appearanceOrder: list(merged.appearanceOrder, fallback.appearanceOrder),
      timingPhrases: normalizeTimingPhrases(merged.timingPhrases),
    };
  }

  if (template === 'visual-evidence') {
    return {
      template,
      theme,
      sfx,
      kicker: text(merged.kicker, fallback.kicker || 'BẰNG CHỨNG HÌNH ẢNH'),
      title: text(merged.title, fallback.title),
      caption: text(merged.caption || merged.body, fallback.caption || fallback.body),
      source: text(merged.source, fallback.source),
      imageSearch: normalizeImageSearch(merged.imageSearch, fallback.imageSearch),
      image: normalizeImageAsset(merged.image, fallback.image),
      overlay: normalizeOverlay(merged.overlay, fallback.overlay),
      blockRefs: list(merged.blockRefs || merged.blocks, fallback.blockRefs),
      appearanceOrder: list(merged.appearanceOrder, fallback.appearanceOrder),
      timingPhrases: normalizeTimingPhrases(merged.timingPhrases),
    };
  }

  if (template === 'key-number') {
    return {
      template,
      theme,
      sfx,
      kicker: text(merged.kicker, fallback.kicker || 'CON SỐ NỔI BẬT'),
      value: text(merged.value || merged.statMain, fallback.value || fallback.statMain),
      label: text(merged.label, fallback.label),
      context: text(merged.context || merged.body, fallback.context || fallback.body),
      source: text(merged.source, fallback.source),
      blockRefs: list(merged.blockRefs || merged.blocks, fallback.blockRefs),
      appearanceOrder: list(merged.appearanceOrder, fallback.appearanceOrder),
      timingPhrases: normalizeTimingPhrases(merged.timingPhrases),
    };
  }

  if (template === 'follow-outro') {
    return {
      template,
      theme,
      sfx,
      ctaTop: text(merged.ctaTop || merged.cta, fallback.ctaTop || fallback.cta || 'Theo dõi để cập nhật tiếp'),
      channelName: text(merged.channelName || merged.channel, fallback.channelName || fallback.channel || 'Breaking News'),
      handle: text(merged.handle, fallback.handle || '@breakingnews'),
      subscriberText: text(merged.subscriberText || merged.followers, fallback.subscriberText || fallback.followers || 'Cập nhật tin nóng mỗi ngày'),
      summary: text(merged.summary || merged.source, fallback.summary || fallback.source),
      platform: text(merged.platform, fallback.platform || 'YouTube'),
      blockRefs: list(merged.blockRefs || merged.blocks, fallback.blockRefs),
      appearanceOrder: list(merged.appearanceOrder, fallback.appearanceOrder),
      timingPhrases: normalizeTimingPhrases(merged.timingPhrases),
    };
  }

  if (template === 'data-snapshot-chart') {
    return {
      template,
      theme,
      sfx,
      title: text(merged.title, fallback.title),
      subtitle: text(merged.subtitle || merged.context, fallback.subtitle || fallback.context),
      metric: text(merged.metric || merged.value, fallback.metric || fallback.value),
      metricLabel: text(merged.metricLabel || merged.label, fallback.metricLabel || fallback.label),
      source: text(merged.source, fallback.source),
      labels: normalizeChartLabels(merged.labels, fallback.labels, 8),
      dataPoints: normalizeNumericList(merged.dataPoints || merged.values, fallback.dataPoints || fallback.values, 8),
      blockRefs: list(merged.blockRefs || merged.blocks, fallback.blockRefs),
      appearanceOrder: list(merged.appearanceOrder, fallback.appearanceOrder),
      timingPhrases: normalizeTimingPhrases(merged.timingPhrases),
    };
  }

  if (template === 'source-check') {
    return {
      template,
      theme,
      sfx,
      kicker: text(merged.kicker, fallback.kicker || 'KIỂM CHỨNG'),
      title: text(merged.title, fallback.title),
      confirmed: normalizeNewsItems(merged.confirmed, fallback.confirmed, 4),
      unverified: normalizeNewsItems(merged.unverified || merged.pending, fallback.unverified || fallback.pending, 4),
      source: text(merged.source, fallback.source),
      blockRefs: list(merged.blockRefs || merged.blocks, fallback.blockRefs),
      appearanceOrder: list(merged.appearanceOrder, fallback.appearanceOrder),
      timingPhrases: normalizeTimingPhrases(merged.timingPhrases),
    };
  }

  if (template === 'live-update-ticker') {
    return {
      template,
      theme,
      sfx,
      label: text(merged.label || merged.kicker, fallback.label || fallback.kicker || 'LIVE'),
      headline: text(merged.headline || merged.title, fallback.headline || fallback.title),
      updates: normalizeTimelineEvents(merged.updates || merged.items, fallback.updates || fallback.items, 5),
      timestamp: text(merged.timestamp || merged.time, fallback.timestamp || fallback.time),
      source: text(merged.source, fallback.source),
      blockRefs: list(merged.blockRefs || merged.blocks, fallback.blockRefs),
      appearanceOrder: list(merged.appearanceOrder, fallback.appearanceOrder),
      timingPhrases: normalizeTimingPhrases(merged.timingPhrases),
    };
  }

  if (template === 'location-context') {
    return {
      template,
      theme,
      sfx,
      kicker: text(merged.kicker, fallback.kicker || 'ĐỊA ĐIỂM'),
      title: text(merged.title, fallback.title),
      location: text(merged.location, fallback.location),
      caption: text(merged.caption || merged.body, fallback.caption || fallback.body),
      facts: normalizeNewsItems(merged.facts || merged.items, fallback.facts || fallback.items, 3),
      source: text(merged.source, fallback.source),
      imageSearch: normalizeImageSearch(merged.imageSearch, fallback.imageSearch),
      image: normalizeImageAsset(merged.image, fallback.image),
      blockRefs: list(merged.blockRefs || merged.blocks, fallback.blockRefs),
      appearanceOrder: list(merged.appearanceOrder, fallback.appearanceOrder),
      timingPhrases: normalizeTimingPhrases(merged.timingPhrases),
    };
  }

  if (template === 'image-background-hero') {
    const image = normalizeImageAsset(merged.image, fallback.image);
    const nextTheme = { ...theme };
    if (!nextTheme.bgImage && image.src) nextTheme.bgImage = image.src;
    return {
      template,
      theme: nextTheme,
      sfx,
      kicker: text(merged.kicker, fallback.kicker || 'Bối cảnh'),
      title: text(merged.title, fallback.title),
      subtitle: text(merged.subtitle, fallback.subtitle),
      source: text(merged.source, fallback.source || image.title),
      imageSearch: normalizeImageSearch(merged.imageSearch, fallback.imageSearch),
      image,
      overlay: normalizeOverlay(merged.overlay, fallback.overlay),
      appearanceOrder: list(merged.appearanceOrder, fallback.appearanceOrder),
      timingPhrases: normalizeTimingPhrases(merged.timingPhrases),
    };
  }

  if (template === 'image-inset-card') {
    return {
      template,
      theme,
      sfx,
      kicker: text(merged.kicker, fallback.kicker || 'Hình ảnh'),
      title: text(merged.title, fallback.title),
      body: text(merged.body, fallback.body),
      source: text(merged.source, fallback.source),
      imageSearch: normalizeImageSearch(merged.imageSearch, fallback.imageSearch),
      image: normalizeImageAsset(merged.image, fallback.image),
      appearanceOrder: list(merged.appearanceOrder, fallback.appearanceOrder),
      timingPhrases: normalizeTimingPhrases(merged.timingPhrases),
    };
  }

  if (template === 'comparison-vs' || template === 'comparison') {
    return {
      template,
      theme,
      sfx,
      left: normalizeSide(merged.left, fallback.left, 'Bên A'),
      right: normalizeSide(merged.right, fallback.right, 'Bên B'),
      appearanceOrder: list(merged.appearanceOrder, fallback.appearanceOrder),
      timingPhrases: normalizeTimingPhrases(merged.timingPhrases),
    };
  }

  if (template === 'feature-stack' || template === 'feature-list') {
    return {
      template,
      theme,
      sfx,
      title: text(merged.title, fallback.title),
      bullets: list(merged.bullets, fallback.bullets).slice(0, 5),
      appearanceOrder: list(merged.appearanceOrder, fallback.appearanceOrder),
      timingPhrases: normalizeTimingPhrases(merged.timingPhrases),
    };
  }

  if (template === 'stat-pill' || template === 'stat-hero') {
    return {
      template,
      theme,
      sfx,
      value: text(merged.value, fallback.value),
      label: text(merged.label, fallback.label),
      context: text(merged.context, fallback.context),
      appearanceOrder: list(merged.appearanceOrder, fallback.appearanceOrder),
      timingPhrases: normalizeTimingPhrases(merged.timingPhrases),
    };
  }

  if (template === 'outro') {
    return {
      template,
      theme,
      sfx,
      ctaTop: text(merged.ctaTop, fallback.ctaTop || 'Theo dõi để xem tiếp'),
      channelName: text(merged.channelName, fallback.channelName || 'Bản Tin Nhanh'),
      source: text(merged.source, fallback.source),
      appearanceOrder: list(merged.appearanceOrder, fallback.appearanceOrder),
      timingPhrases: normalizeTimingPhrases(merged.timingPhrases),
    };
  }

  if (template === 'callout') {
    return {
      template,
      theme,
      sfx,
      tag: text(merged.tag, fallback.tag || 'Điểm chính'),
      statement: text(merged.statement, fallback.statement),
      appearanceOrder: list(merged.appearanceOrder, fallback.appearanceOrder),
      timingPhrases: normalizeTimingPhrases(merged.timingPhrases),
    };
  }

  return {
    template,
    theme,
    sfx,
    headline: text(merged.headline, fallback.headline),
    subhead: text(merged.subhead, fallback.subhead),
    appearanceOrder: list(merged.appearanceOrder, fallback.appearanceOrder),
    timingPhrases: normalizeTimingPhrases(merged.timingPhrases),
  };
}

function themeFromBackground(background = {}, fallback = {}) {
  const colors = Array.isArray(background.colors) ? background.colors.filter(Boolean) : [];
  return {
    ...fallback,
    bgTop: colors[0] || fallback?.bgTop || '#111827',
    bgBottom: colors[1] || fallback?.bgBottom || '#2563eb',
    accent: colors.find(c => String(c).toLowerCase() === '#06b6d4') || background.accent || fallback?.accent || '#06b6d4',
    mint: colors.find(c => String(c).toLowerCase() === '#22c55e') || background.mint || fallback?.mint || '#22c55e',
    patternOpacity: number(background.opacity, fallback?.patternOpacity ?? 0.18, 0, 1),
    bgImage: String(background.src || background.imageUrl || fallback?.bgImage || '').trim(),
    bgFit: String(background.fit || fallback?.bgFit || 'cover').trim(),
    bgType: String(background.type || 'gradient').trim(),
  };
}

function normalizePaymentElements(elements = {}, fallback = []) {
  if (Array.isArray(elements)) return elements.map(normalizeElement).filter(Boolean);
  const out = [];
  const entries = [
    ['wallet', elements.wallet],
    ['card', elements.card],
    ['halo', elements.halo],
  ];
  for (const [kind, item] of entries) {
    const normalized = normalizeElement({ ...(item || {}), kind, label: item?.label || kind });
    if (normalized) out.push(normalized);
  }
  const icons = Array.isArray(elements.icons) ? elements.icons : [];
  icons.slice(0, 3).forEach((icon, index) => {
    const normalized = normalizeElement({ ...icon, kind: 'icon', label: icon?.label || `Icon ${index + 1}` });
    if (normalized) out.push(normalized);
  });
  return out.length ? out : Array.isArray(fallback) ? fallback : [];
}

function normalizeElement(item) {
  if (!item || typeof item !== 'object') return null;
  return {
    id: String(item.id || item.kind || item.label || 'element'),
    kind: String(item.kind || 'object'),
    label: String(item.label || item.kind || 'element'),
    x: Number.isFinite(Number(item.x)) ? Number(item.x) : null,
    y: Number.isFinite(Number(item.y)) ? Number(item.y) : null,
    color: String(item.color || ''),
    timingPhrase: String(item.timingPhrase || item.label || item.kind || ''),
    raw: String(item.raw || item.label || item.kind || ''),
  };
}

function normalizeImageSearch(value = {}, fallback = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const base = fallback && typeof fallback === 'object' && !Array.isArray(fallback) ? fallback : {};
  return {
    q: text(source.q || source.query, base.q || base.query),
    intent: text(source.intent || source.reason, base.intent || base.reason),
    orientation: text(source.orientation, base.orientation || 'any'),
    prefer: list(source.prefer || source.preferredKeywords, base.prefer || base.preferredKeywords).slice(0, 8),
    avoid: list(source.avoid || source.avoidKeywords, base.avoid || base.avoidKeywords).slice(0, 8),
    results: normalizeImageCandidates(source.results || source.candidates || base.results || base.candidates),
  };
}

function normalizeImageCandidates(value = []) {
  return Array.isArray(value)
    ? value.map(item => normalizeImageCandidate(item)).filter(item => item?.imageUrl)
    : [];
}

function normalizeImageCandidate(item = {}) {
  if (!item || typeof item !== 'object') return null;
  return {
    title: text(item.title),
    imageUrl: text(item.imageUrl || item.src || item.url),
    imageWidth: number(item.imageWidth ?? item.width, 0, 0),
    imageHeight: number(item.imageHeight ?? item.height, 0, 0),
  };
}

function normalizeImageAsset(value = {}, fallback = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const base = fallback && typeof fallback === 'object' && !Array.isArray(fallback) ? fallback : {};
  const src = text(source.src || source.imageUrl || source.url, base.src || base.imageUrl || base.url);
  return {
    title: text(source.title, base.title),
    src,
    width: number(source.width ?? source.imageWidth, number(base.width ?? base.imageWidth, 0, 0), 0),
    height: number(source.height ?? source.imageHeight, number(base.height ?? base.imageHeight, 0, 0), 0),
    alt: text(source.alt, base.alt || source.title || base.title),
  };
}

function normalizeOverlay(value = {}, fallback = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const base = fallback && typeof fallback === 'object' && !Array.isArray(fallback) ? fallback : {};
  return {
    opacity: number(source.opacity, number(base.opacity, 0.56, 0, 0.9), 0, 0.9),
  };
}

function normalizeAnnotationItems(value = [], fallback = [], max = 4) {
  const source = Array.isArray(value) && value.length ? value : fallback;
  if (!Array.isArray(source)) return [];
  return source
    .map((item, index) => {
      if (typeof item === 'string' || typeof item === 'number') {
        return { label: String(index + 1), text: String(item || '').trim(), x: 28 + index * 18, y: 28 + index * 14 };
      }
      if (!item || typeof item !== 'object') return null;
      return {
        label: text(item.label || item.number, String(index + 1)),
        text: text(item.text || item.title || item.value || item.statement),
        detail: text(item.detail || item.body || item.context),
        x: number(item.x, 28 + index * 18, 8, 92),
        y: number(item.y, 28 + index * 14, 8, 92),
      };
    })
    .filter(item => item?.text)
    .slice(0, max);
}

function normalizeLens(value = {}, fallback = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const base = fallback && typeof fallback === 'object' && !Array.isArray(fallback) ? fallback : {};
  return {
    x: number(source.x, number(base.x, 58, 8, 92), 8, 92),
    y: number(source.y, number(base.y, 42, 8, 92), 8, 92),
    size: number(source.size, number(base.size, 250, 140, 360), 140, 360),
  };
}

function normalizeSide(value = {}, fallback = {}, label = '') {
  return {
    label: text(value.label, fallback?.label || label),
    value: text(value.value, fallback?.value),
    color: text(value.color, fallback?.color),
    winner: Boolean(value.winner ?? fallback?.winner ?? false),
  };
}

function normalizeComparisonIssue(value = {}, fallback = {}, label = '') {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const base = fallback && typeof fallback === 'object' && !Array.isArray(fallback) ? fallback : {};
  return {
    label: text(source.label, base.label || label),
    title: text(source.title || source.value, base.title || base.value),
    detail: text(source.detail || source.body, base.detail || base.body),
    stat: text(source.stat || source.metric, base.stat || base.metric),
    color: text(source.color, base.color),
    winner: Boolean(source.winner ?? base.winner ?? false),
  };
}

function normalizeNewsItems(value = [], fallback = [], max = 5) {
  const source = Array.isArray(value) && value.length ? value : fallback;
  if (!Array.isArray(source)) return [];
  return source
    .map((item, index) => {
      if (typeof item === 'string' || typeof item === 'number') {
        return { label: String(index + 1).padStart(2, '0'), text: String(item || '').trim(), detail: '' };
      }
      if (!item || typeof item !== 'object') return null;
      return {
        label: text(item.label || item.number || item.time, String(index + 1).padStart(2, '0')),
        text: text(item.text || item.title || item.value || item.statement),
        detail: text(item.detail || item.body || item.context),
      };
    })
    .filter(item => item?.text)
    .slice(0, max);
}

function normalizeTimelineEvents(value = [], fallback = [], max = 5) {
  const source = Array.isArray(value) && value.length ? value : fallback;
  if (!Array.isArray(source)) return [];
  return source
    .map((item, index) => {
      if (typeof item === 'string' || typeof item === 'number') {
        return { time: String(index + 1).padStart(2, '0'), title: String(item || '').trim(), detail: '' };
      }
      if (!item || typeof item !== 'object') return null;
      return {
        time: text(item.time || item.label || item.date, String(index + 1).padStart(2, '0')),
        title: text(item.title || item.text || item.event || item.value),
        detail: text(item.detail || item.body || item.context),
      };
    })
    .filter(item => item?.title)
    .slice(0, max);
}

function normalizeChartLabels(value = [], fallback = [], max = 8) {
  const labels = list(value, fallback).slice(0, max);
  return labels.length ? labels : ['T1', 'T2', 'T3', 'T4', 'T5'];
}

function normalizeNumericList(value = [], fallback = [], max = 8) {
  const source = Array.isArray(value) && value.length ? value : fallback;
  const points = Array.isArray(source) ? source.map(Number).filter(Number.isFinite).slice(0, max) : [];
  return points.length ? points : [18, 31, 26, 44, 62];
}

function normalizeTimingPhrases(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, val]) => [String(key), String(val || '').trim()])
      .filter(([, val]) => val)
  );
}

function normalizeSfxTiming(value = {}, fallback = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
  return Object.fromEntries(
    Object.entries(source)
      .map(([key, val]) => [String(key), normalizeSfxTimingValue(val)])
      .filter(([, val]) => val !== null && val !== '')
  );
}

function normalizeSfxTimingValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric : trimmed;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const numeric = Number(value.at ?? value.start ?? value.time);
    if (Number.isFinite(numeric)) return numeric;
    const phrase = String(value.phrase ?? value.atPhrase ?? value.timingPhrase ?? '').trim();
    return phrase || null;
  }
  return null;
}

function list(value, fallback = []) {
  const source = Array.isArray(value) && value.length ? value : fallback;
  return Array.isArray(source) ? source.map(item => String(item || '').trim()).filter(Boolean) : [];
}

function text(value, fallback = '') {
  const raw = String(value ?? '').trim();
  return raw || String(fallback ?? '').trim();
}

function number(value, fallback, min = -Infinity, max = Infinity) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepMerge(base, override) {
  if (!override || typeof override !== 'object' || Array.isArray(override)) return clone(base);
  const out = clone(base);
  for (const [key, value] of Object.entries(override)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && out[key] && typeof out[key] === 'object' && !Array.isArray(out[key])) {
      out[key] = deepMerge(out[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

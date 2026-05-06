import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { SCENE_TEMPLATES, TEMPLATE_SCHEMAS } from '../src/renderer/hyperframesTemplateSchemas.js';
import { composeSceneHTML } from '../src/renderer/hyperframesTemplateSystem.js';
import { renderSceneVideo } from '../src/renderer/hyperframesRender.js';
import { mergeSceneAudio } from '../src/renderer/ffmpegMerge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CATALOG_DIR = path.join(ROOT, 'src', 'renderer', 'hyperframes', 'catalog', 'objectives');
const SHOULD_RENDER_MP4 = process.argv.includes('--render-mp4');

const OBJECTIVES = [
  {
    id: 'mac-dinh',
    name: 'Mặc định',
    description: 'Bộ template mặc định đang dùng trong pipeline hiện tại.',
    status: 'ready',
    templates: SCENE_TEMPLATES,
  },
  { id: 'explainer', name: 'Explainer', description: 'Video giải thích khái niệm, quy trình, dữ liệu và hiểu lầm theo cách dễ nắm bắt.', status: 'ready' },
  { id: 'breaking-news', name: 'Breaking News', description: 'Tin nóng / Bản tin khẩn', status: 'empty' },
  { id: 'product-demo', name: 'Product Demo', description: 'Trình diễn sản phẩm', status: 'empty' },
  { id: 'listicle', name: 'Listicle', description: 'Video dạng danh sách, kiểu Top 10', status: 'empty' },
  { id: 'documentary', name: 'Documentary', description: 'Phim tài liệu', status: 'empty' },
  { id: 'myth-busting', name: 'Myth Busting', description: 'Bóc trần hiểu lầm / phá bỏ quan niệm sai', status: 'empty' },
  { id: 'tutorial', name: 'Tutorial', description: 'Hướng dẫn', status: 'empty' },
  { id: 'entertainment', name: 'Entertainment', description: 'Giải trí thuần túy', status: 'empty' },
  { id: 'storytelling', name: 'Storytelling', description: 'Kể chuyện có mở, thân, kết', status: 'empty' },
  { id: 'personal-branding', name: 'Personal Branding', description: 'Xây dựng thương hiệu cá nhân', status: 'empty' },
  { id: 'sales-conversion', name: 'Sales / Conversion', description: 'Bán hàng trực tiếp', status: 'empty' },
  { id: 'lead-generation', name: 'Lead Generation', description: 'Thu khách tiềm năng', status: 'empty' },
  { id: 'community-building', name: 'Community Building', description: 'Xây cộng đồng', status: 'empty' },
  { id: 'opinion-commentary', name: 'Opinion / Commentary', description: 'Bình luận, quan điểm', status: 'empty' },
  { id: 'reaction', name: 'Reaction', description: 'Phản ứng', status: 'empty' },
  { id: 'behind-the-scenes', name: 'Behind the Scenes', description: 'Hậu trường', status: 'empty' },
  { id: 'case-study', name: 'Case Study', description: 'Phân tích tình huống thực tế', status: 'empty' },
  { id: 'motivation-inspiration', name: 'Motivation / Inspiration', description: 'Truyền động lực', status: 'empty' },
  { id: 'education-deep-dive', name: 'Education nâng cao / Deep dive', description: 'Đào sâu một chủ đề', status: 'empty' },
  { id: 'trend-riding', name: 'Trend Riding', description: 'Bắt trend để kéo reach', status: 'empty' },
  { id: 'experiment-test', name: 'Experiment / Test', description: 'Thử nghiệm format, content, audience', status: 'empty' },
  { id: 'narrative-persuasion', name: 'Narrative Persuasion', description: 'Dẫn dắt niềm tin bằng câu chuyện', status: 'empty' },
];

const DEMO_VOICE = {
  hook: 'Mở đầu bằng một ý thật mạnh để người xem phải dừng lại ngay.',
  comparison: 'Một bên là cách cũ chậm và rối, bên kia là cách mới rõ ràng hơn.',
  'comparison-vs': 'Trước đây mọi thứ diễn ra chậm, còn bây giờ tốc độ đã thay đổi hoàn toàn.',
  'stat-hero': 'Con số chín mươi phần trăm cho thấy xu hướng này đã trở thành trung tâm.',
  'stat-pill': 'Mức tăng năm trăm phần trăm là tín hiệu người xem không thể bỏ qua.',
  'feature-list': 'Có ba điểm cần nhớ: tốc độ, chi phí, và trải nghiệm người dùng.',
  'feature-stack': 'Sự thay đổi này đến từ nhiều lớp: hạ tầng, thói quen, và niềm tin.',
  callout: 'Điểm chính là đừng chỉ nhìn bề mặt, hãy nhìn vào động lực phía sau.',
  'news-card': 'Tin chính hôm nay cho thấy thị trường đang đổi hướng rất nhanh.',
  'image-background-hero': 'Một hình ảnh nền đủ mạnh có thể đặt toàn bộ câu chuyện vào đúng bối cảnh.',
  'image-inset-card': 'Hình ảnh minh họa giúp người xem nắm ý chính nhanh hơn nhiều so với chỉ đọc chữ.',
  'market-chart': 'Biểu đồ tăng lên cho thấy đà tăng chưa hề chậm lại.',
  'crypto-card-hero': 'Thẻ crypto đang bước vào chi tiêu hằng ngày với mức tăng năm trăm phần trăm.',
  'onchain-payment': 'Thanh toán on-chain giúp giao dịch minh bạch hơn ngay tại thời điểm sử dụng.',
  'payment-network-halo': 'Mạng thanh toán bao quanh giao dịch và kết nối người dùng với merchant.',
  outro: 'Theo dõi để xem tiếp những phân tích ngắn gọn và dễ hiểu hơn.',
};

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildSchema(template) {
  const info = TEMPLATE_SCHEMAS[template];
  return {
    template,
    description: info?.description || '',
    templateData: clone(info?.sample || {}),
    files: {
      template: 'template.html.tmpl',
      demoJson: 'demo.json',
      demoHtml: 'demo.html',
      demoMp4: 'demo.mp4',
    },
  };
}

function buildTemplateTmpl(template, schema) {
  return `<!--
Template: ${template}
Description: ${schema.description}

This file documents the HTML contract for this template folder.
Runtime rendering is currently implemented by:
src/renderer/hyperframesTemplateSystem.js

Required templateData sample:
${JSON.stringify(schema.templateData, null, 2)}
-->
<section class="scene-template-${template}" data-template="${template}">
  <!-- Replace this file with a real template implementation when this template becomes folder-rendered. -->
  <pre data-template-data>{{templateData}}</pre>
</section>
`;
}

function buildDemoScene(template, schema) {
  return {
    stt: 1,
    voice: DEMO_VOICE[template] || `Demo cho template ${template}.`,
    ttsVoice: DEMO_VOICE[template] || `Demo cho template ${template}.`,
    template,
    templateData: clone(schema.templateData),
    visual: `LAYOUT: ${template}. BACKGROUND: demo. MAIN ELEMENTS: demo templateData. APPEARANCE ORDER: ${(schema.templateData.appearanceOrder || []).join(' → ')}. TEXT OVERLAY: demo.`,
  };
}

async function renderDemoMp4(templateDir, htmlPath, mp4Path) {
  const silentPath = path.join(templateDir, 'demo_silent.mp4');
  const silenceAudioPath = path.join(templateDir, 'demo_silence.mp3');
  await renderSceneVideo(htmlPath, silentPath, 2.0, msg => console.log(`[demo] ${msg}`));
  await createSilentAudio(silenceAudioPath, 2.0);
  await mergeSceneAudio(silentPath, silenceAudioPath, mp4Path, htmlPath);
  fs.rmSync(silentPath, { force: true });
  fs.rmSync(silenceAudioPath, { force: true });
  const compositionDir = path.join(templateDir, 'hyperframes_demo');
  fs.rmSync(compositionDir, { recursive: true, force: true });
}

function createSilentAudio(outputPath, durationSec) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-y',
      '-f', 'lavfi',
      '-i', 'anullsrc=r=44100:cl=stereo',
      '-t', String(durationSec),
      '-q:a', '9',
      '-acodec', 'libmp3lame',
      outputPath,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    proc.stderr.on('data', chunk => err += chunk);
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg silent audio failed: ${err.slice(-500)}`)));
  });
}

async function main() {
  ensureDir(CATALOG_DIR);
  for (const objective of OBJECTIVES) {
    const objectiveDir = path.join(CATALOG_DIR, objective.id);
    ensureDir(objectiveDir);
    writeJson(path.join(objectiveDir, 'objective.json'), objective);
    fs.writeFileSync(
      path.join(objectiveDir, 'README.md'),
      `# ${objective.name}\n\n${objective.description}\n\nStatus: ${objective.status}\n\nTemplate folders live directly inside this objective folder.\n`,
      'utf8'
    );

    if (objective.id !== 'mac-dinh') continue;
    for (const template of objective.templates) {
      const templateDir = path.join(objectiveDir, template);
      ensureDir(templateDir);
      const schema = buildSchema(template);
      const scene = buildDemoScene(template, schema);
      const demo = { objective: objective.id, template, scenes: [scene] };
      const html = composeSceneHTML({
        scene,
        sceneCount: 1,
        durationSec: 2,
      });
      writeJson(path.join(templateDir, 'schema.json'), schema);
      fs.writeFileSync(path.join(templateDir, 'template.html.tmpl'), buildTemplateTmpl(template, schema), 'utf8');
      writeJson(path.join(templateDir, 'demo.json'), demo);
      fs.writeFileSync(path.join(templateDir, 'demo.html'), html, 'utf8');
      if (SHOULD_RENDER_MP4) {
        await renderDemoMp4(templateDir, path.join(templateDir, 'demo.html'), path.join(templateDir, 'demo.mp4'));
      } else {
        const mp4Path = path.join(templateDir, 'demo.mp4');
        if (!fs.existsSync(mp4Path)) fs.writeFileSync(mp4Path, '');
      }
    }
  }
  console.log(`Template catalog scaffolded at ${CATALOG_DIR}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

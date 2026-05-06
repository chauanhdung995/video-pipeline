const state = {
  config: null,
  objectives: [],
  templates: [],
  selectedObjective: '',
  selectedTemplate: '',
  files: null,
  summary: null,
  activeTab: 'schema',
  dirty: false,
  libraryBlocks: [],
  selectedBlock: null,
  editingBlockFile: '',
  librarySfx: [],
  selectedSfx: null,
  aiBusy: false,
  aiMode: 'create',
};

const el = {
  objectiveList: document.querySelector('#objectiveList'),
  templateList: document.querySelector('#templateList'),
  objectiveCount: document.querySelector('#objectiveCount'),
  templateCount: document.querySelector('#templateCount'),
  selectionPath: document.querySelector('#selectionPath'),
  selectionMeta: document.querySelector('#selectionMeta'),
  schemaEditor: document.querySelector('#schemaEditor'),
  demoEditor: document.querySelector('#demoEditor'),
  templateEditor: document.querySelector('#templateEditor'),
  htmlPreview: document.querySelector('#htmlPreview'),
  htmlPreviewFrame: document.querySelector('#htmlPreviewFrame'),
  htmlPreviewStage: document.querySelector('#htmlPreviewStage'),
  mp4Preview: document.querySelector('#mp4Preview'),
  mp4PreviewFrame: document.querySelector('#mp4PreviewFrame'),
  previewStatus: document.querySelector('#previewStatus'),
  saveBtn: document.querySelector('#saveBtn'),
  aiEditBtn: document.querySelector('#aiEditBtn'),
  renderBtn: document.querySelector('#renderBtn'),
  deleteTemplateBtn: document.querySelector('#deleteTemplateBtn'),
  renderMode: document.querySelector('#renderMode'),
  durationSec: document.querySelector('#durationSec'),
  aiGenerateBtn: document.querySelector('#aiGenerateBtn'),
  aiModal: document.querySelector('#aiModal'),
  aiModalEyebrow: document.querySelector('#aiModalEyebrow'),
  aiModalTitle: document.querySelector('#aiModalTitle'),
  aiGenerateForm: document.querySelector('#aiGenerateForm'),
  aiCloseBtn: document.querySelector('#aiCloseBtn'),
  aiCancelBtn: document.querySelector('#aiCancelBtn'),
  aiObjective: document.querySelector('#aiObjective'),
  aiTemplateNameLabel: document.querySelector('#aiTemplateNameLabel'),
  aiTemplateName: document.querySelector('#aiTemplateName'),
  aiPromptLabel: document.querySelector('#aiPromptLabel'),
  aiPrompt: document.querySelector('#aiPrompt'),
  aiRenderMp4: document.querySelector('#aiRenderMp4'),
  aiRenderMp4Label: document.querySelector('#aiRenderMp4Label'),
  aiSubmitBtn: document.querySelector('#aiSubmitBtn'),
  aiStatus: document.querySelector('#aiStatus'),
  refreshBtn: document.querySelector('#refreshBtn'),
  openHtmlBtn: document.querySelector('#openHtmlBtn'),
  openMp4Btn: document.querySelector('#openMp4Btn'),
  rootLink: document.querySelector('#rootLink'),
  createObjectiveForm: document.querySelector('#createObjectiveForm'),
  createTemplateForm: document.querySelector('#createTemplateForm'),
  newObjectiveName: document.querySelector('#newObjectiveName'),
  newTemplateName: document.querySelector('#newTemplateName'),
  blockList: document.querySelector('#blockList'),
  blockCount: document.querySelector('#blockCount'),
  blockPreview: document.querySelector('#blockPreview'),
  blockPreviewFrame: document.querySelector('#blockPreviewFrame'),
  blockPreviewStage: document.querySelector('#blockPreviewStage'),
  blockPreviewTitle: document.querySelector('#blockPreviewTitle'),
  openBlockBtn: document.querySelector('#openBlockBtn'),
  newBlockBtn: document.querySelector('#newBlockBtn'),
  uploadBlockBtn: document.querySelector('#uploadBlockBtn'),
  editBlockBtn: document.querySelector('#editBlockBtn'),
  copyBlockHtmlBtn: document.querySelector('#copyBlockHtmlBtn'),
  insertBlockRefBtn: document.querySelector('#insertBlockRefBtn'),
  deleteBlockBtn: document.querySelector('#deleteBlockBtn'),
  blockUploadInput: document.querySelector('#blockUploadInput'),
  blockEditorPanel: document.querySelector('#blockEditorPanel'),
  blockFileName: document.querySelector('#blockFileName'),
  blockEditor: document.querySelector('#blockEditor'),
  saveBlockBtn: document.querySelector('#saveBlockBtn'),
  cancelBlockEditBtn: document.querySelector('#cancelBlockEditBtn'),
  sfxList: document.querySelector('#sfxList'),
  sfxCount: document.querySelector('#sfxCount'),
  sfxPreview: document.querySelector('#sfxPreview'),
  sfxPreviewTitle: document.querySelector('#sfxPreviewTitle'),
  uploadSfxBtn: document.querySelector('#uploadSfxBtn'),
  copySfxPathBtn: document.querySelector('#copySfxPathBtn'),
  renameSfxBtn: document.querySelector('#renameSfxBtn'),
  deleteSfxBtn: document.querySelector('#deleteSfxBtn'),
  sfxUploadInput: document.querySelector('#sfxUploadInput'),
  log: document.querySelector('#log'),
};

function log(message) {
  el.log.textContent = message;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

async function uploadApi(path, formData) {
  const res = await fetch(path, {
    method: 'POST',
    body: formData,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

function setDirty(value) {
  state.dirty = Boolean(value);
  el.saveBtn.disabled = !state.selectedTemplate || !state.dirty;
  if (state.selectedTemplate) {
    el.selectionMeta.textContent = state.dirty ? 'Có thay đổi chưa lưu.' : summaryMeta();
  }
}

function summaryMeta() {
  if (!state.summary) return '';
  const files = state.summary.files || {};
  const mp4 = files.demoMp4?.exists ? `${formatBytes(files.demoMp4.size)} MP4` : 'chưa có MP4';
  const html = files.demoHtml?.exists ? 'có HTML' : 'chưa có HTML';
  return `${state.summary.description || 'Không có description'} · ${html} · ${mp4}`;
}

function formatBytes(value) {
  const n = Number(value) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function renderObjectives() {
  el.objectiveCount.textContent = String(state.objectives.length);
  el.objectiveList.innerHTML = state.objectives.map(item => `
    <button class="list-item ${item.id === state.selectedObjective ? 'active' : ''}" data-objective="${item.id}">
      <span class="item-title">${escapeHtml(item.name || item.id)}</span>
      <span class="item-sub">${escapeHtml(item.id)} · ${item.templateCount || 0} templates · ${escapeHtml(item.status || '')}</span>
    </button>
  `).join('');
}

function renderTemplates() {
  el.templateCount.textContent = String(state.templates.length);
  el.templateList.innerHTML = state.templates.map(item => `
    <button class="list-item ${item.template === state.selectedTemplate ? 'active' : ''}" data-template="${item.template}">
      <span class="item-title">${escapeHtml(item.template)}</span>
      <span class="item-sub">${escapeHtml(item.description || 'Không có description')}</span>
    </button>
  `).join('');
}

function renderSelection() {
  const hasTemplate = Boolean(state.selectedObjective && state.selectedTemplate);
  el.selectionPath.textContent = hasTemplate
    ? `${state.selectedObjective} / ${state.selectedTemplate}`
    : 'Chưa chọn template';
  el.selectionMeta.textContent = hasTemplate ? summaryMeta() : 'Chọn objective và template để chỉnh sửa.';
  el.saveBtn.disabled = !hasTemplate || !state.dirty;
  el.aiEditBtn.disabled = !hasTemplate || state.aiBusy;
  el.renderBtn.disabled = !hasTemplate;
  el.deleteTemplateBtn.disabled = !hasTemplate;
  el.openHtmlBtn.disabled = !state.summary?.urls?.demoHtml;
  el.openMp4Btn.disabled = !state.summary?.urls?.demoMp4 || !state.summary?.files?.demoMp4?.exists || state.summary.files.demoMp4.size === 0;
  updateLibraryButtons();
}

function renderEditors() {
  el.schemaEditor.value = state.files?.schemaJson || '';
  el.demoEditor.value = state.files?.demoJson || '';
  el.templateEditor.value = state.files?.templateHtml || '';
  setDirty(false);
}

function renderPreview() {
  if (!state.summary?.urls) {
    el.htmlPreview.removeAttribute('src');
    el.mp4Preview.removeAttribute('src');
    el.previewStatus.textContent = 'Chưa có preview';
    requestAnimationFrame(updatePreviewScales);
    return;
  }
  const stamp = Date.now();
  el.htmlPreview.src = `${state.summary.urls.demoHtml}&ui=${stamp}`;
  if (state.summary.files?.demoMp4?.exists && state.summary.files.demoMp4.size > 0) {
    el.mp4Preview.src = `${state.summary.urls.demoMp4}&ui=${stamp}`;
    el.previewStatus.textContent = `HTML + MP4 sẵn sàng · ${formatBytes(state.summary.files.demoMp4.size)}`;
  } else {
    el.mp4Preview.removeAttribute('src');
    el.previewStatus.textContent = 'Có HTML preview, chưa render MP4.';
  }
  requestAnimationFrame(updatePreviewScales);
}

function renderLibrary(library) {
  state.libraryBlocks = (library.blocks || []).map(item => typeof item === 'string'
    ? { file: item, label: item.replace(/\.html$/, ''), title: item.replace(/\.html$/, ''), width: 1080, height: 1920 }
    : item);
  state.librarySfx = (library.sfx || []).map(item => typeof item === 'string'
    ? { file: item, label: item.replace(/\.[^.]+$/, ''), url: `/assets/sfx/${encodePath(item)}` }
    : item);

  el.blockCount.textContent = `${state.libraryBlocks.length} blocks`;
  el.sfxCount.textContent = `${state.librarySfx.length} sounds`;
  el.blockList.innerHTML = state.libraryBlocks.map(item => blockPill(item)).join('');
  el.sfxList.innerHTML = state.librarySfx.map(item => sfxPill(item)).join('');

  const selectedBlock = state.libraryBlocks.find(item => item.file === state.selectedBlock?.file);
  if (selectedBlock) {
    selectBlock(selectedBlock);
  } else if (state.libraryBlocks.length) {
    selectBlock(state.libraryBlocks[0]);
  } else {
    clearBlockSelection();
  }

  const selectedSfx = state.librarySfx.find(item => item.file === state.selectedSfx?.file);
  if (selectedSfx) {
    selectSfx(selectedSfx);
  } else if (state.librarySfx.length) {
    selectSfx(state.librarySfx[0]);
  } else {
    clearSfxSelection();
  }
  updateLibraryButtons();
}

function blockPill(item) {
  const active = state.selectedBlock?.file === item.file ? ' active' : '';
  const meta = `${formatBytes(item.size || 0)} · ${Number(item.width) || 1080}×${Number(item.height) || 1920}`;
  return `<button class="pill${active}" type="button" data-block-file="${escapeAttr(item.file)}" title="${escapeAttr(item.title || item.file)}">${escapeHtml(item.label || item.file)} · ${escapeHtml(meta)}</button>`;
}

function sfxPill(item) {
  const active = state.selectedSfx?.file === item.file ? ' active' : '';
  const meta = item.ext ? ` · ${item.ext.replace('.', '').toUpperCase()} · ${formatBytes(item.size || 0)}` : '';
  return `<button class="pill${active}" type="button" data-sfx-file="${escapeAttr(item.file)}" title="${escapeAttr(item.file)}">${escapeHtml(item.label || item.file)}${escapeHtml(meta)}</button>`;
}

function encodePath(value) {
  return String(value || '').split('/').map(encodeURIComponent).join('/');
}

function updateScaleStage(frame, stage, width = 1080, height = 1920) {
  if (!frame || !stage) return;
  const rect = frame.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const scale = Math.max(0.01, Math.min(rect.width / width, rect.height / height));
  stage.style.setProperty('--stage-w', `${width}px`);
  stage.style.setProperty('--stage-h', `${height}px`);
  stage.style.setProperty('--stage-scale', String(scale));
}

function fitAspectFrame(frame, width, height) {
  if (!frame?.parentElement) return;
  const parent = frame.parentElement;
  const label = parent.querySelector('.preview-label');
  const parentRect = parent.getBoundingClientRect();
  const labelHeight = label ? label.getBoundingClientRect().height : 0;
  const maxWidth = parentRect.width;
  const maxHeight = Math.max(1, parentRect.height - labelHeight - 8);
  const scale = Math.max(0.01, Math.min(maxWidth / width, maxHeight / height));
  frame.style.width = `${Math.floor(width * scale)}px`;
  frame.style.height = `${Math.floor(height * scale)}px`;
}

function fitBlockFrame(width, height) {
  if (!el.blockPreviewFrame?.parentElement) return;
  const parent = el.blockPreviewFrame.parentElement;
  const header = parent.querySelector('.block-preview-head');
  const parentRect = parent.getBoundingClientRect();
  const headerHeight = header ? header.getBoundingClientRect().height : 0;
  const maxWidth = parentRect.width;
  const maxHeight = Math.max(1, parentRect.height - headerHeight - 8);
  const scale = Math.max(0.01, Math.min(maxWidth / width, maxHeight / height));
  el.blockPreviewFrame.style.width = `${Math.floor(width * scale)}px`;
  el.blockPreviewFrame.style.height = `${Math.floor(height * scale)}px`;
}

function updatePreviewScales() {
  fitAspectFrame(el.htmlPreviewFrame, 1080, 1920);
  fitAspectFrame(el.mp4PreviewFrame, 1080, 1920);
  updateScaleStage(el.htmlPreviewFrame, el.htmlPreviewStage, 1080, 1920);
  if (state.selectedBlock) {
    const width = Number(state.selectedBlock.width) || 1080;
    const height = Number(state.selectedBlock.height) || 1920;
    fitBlockFrame(width, height);
    updateScaleStage(el.blockPreviewFrame, el.blockPreviewStage, width, height);
    el.blockPreviewFrame?.style.setProperty('--block-ratio', `${width} / ${height}`);
  }
}

function selectBlock(block) {
  if (!block) return;
  state.selectedBlock = block;
  const width = Number(block.width) || 1080;
  const height = Number(block.height) || 1920;
  const src = `/api/blocks/preview?file=${encodeURIComponent(block.file)}&v=${Date.now()}`;
  el.blockPreviewTitle.textContent = `${block.label || block.file} · ${width}×${height}`;
  el.blockPreview.src = src;
  el.openBlockBtn.href = src;
  el.blockList.querySelectorAll('[data-block-file]').forEach(node => {
    node.classList.toggle('active', node.dataset.blockFile === block.file);
  });
  requestAnimationFrame(updatePreviewScales);
}

function clearBlockSelection() {
  state.selectedBlock = null;
  state.editingBlockFile = '';
  el.blockPreviewTitle.textContent = 'Chọn block để xem';
  el.blockPreview.removeAttribute('src');
  el.openBlockBtn.href = '#';
  el.blockEditorPanel.hidden = true;
  updateLibraryButtons();
}

function selectSfx(sfx) {
  if (!sfx) return;
  state.selectedSfx = sfx;
  const url = sfx.url || `/assets/sfx/${encodePath(sfx.file)}`;
  el.sfxPreviewTitle.textContent = `${sfx.file} · ${formatBytes(sfx.size || 0)}`;
  el.sfxPreview.src = `${url}${url.includes('?') ? '&' : '?'}ui=${Date.now()}`;
  el.sfxList.querySelectorAll('[data-sfx-file]').forEach(node => {
    node.classList.toggle('active', node.dataset.sfxFile === sfx.file);
  });
  updateLibraryButtons();
}

function clearSfxSelection() {
  state.selectedSfx = null;
  el.sfxPreviewTitle.textContent = 'Chọn sound effect để nghe thử';
  el.sfxPreview.removeAttribute('src');
  updateLibraryButtons();
}

function updateLibraryButtons() {
  const hasBlock = Boolean(state.selectedBlock);
  el.editBlockBtn.disabled = !hasBlock;
  el.copyBlockHtmlBtn.disabled = !hasBlock;
  el.insertBlockRefBtn.disabled = !hasBlock || !state.selectedTemplate;
  el.deleteBlockBtn.disabled = !hasBlock;
  const hasSfx = Boolean(state.selectedSfx);
  el.copySfxPathBtn.disabled = !hasSfx;
  el.renameSfxBtn.disabled = !hasSfx;
  el.deleteSfxBtn.disabled = !hasSfx;
}

async function loadConfig() {
  state.config = await api('/api/config');
  el.rootLink.href = `file://${state.config.catalogRoot}`;
}

async function loadLibrary() {
  renderLibrary(await api('/api/library'));
}

async function loadObjectives() {
  const data = await api('/api/objectives');
  state.objectives = data.objectives || [];
  if (!state.selectedObjective && state.objectives.length) {
    state.selectedObjective = state.objectives.find(item => item.id === 'explainer')?.id || state.objectives[0].id;
  }
  renderObjectives();
}

async function loadTemplates() {
  if (!state.selectedObjective) {
    state.templates = [];
    renderTemplates();
    return;
  }
  const data = await api(`/api/objectives/${encodeURIComponent(state.selectedObjective)}/templates`);
  state.templates = data.templates || [];
  if (!state.templates.some(item => item.template === state.selectedTemplate)) {
    state.selectedTemplate = state.templates[0]?.template || '';
  }
  renderTemplates();
}

async function loadTemplateFiles() {
  if (!state.selectedObjective || !state.selectedTemplate) {
    state.files = null;
    state.summary = null;
    renderSelection();
    renderPreview();
    return;
  }
  const data = await api(`/api/templates/${encodeURIComponent(state.selectedObjective)}/${encodeURIComponent(state.selectedTemplate)}`);
  state.files = data.files;
  state.summary = data.summary;
  renderSelection();
  renderEditors();
  renderPreview();
}

async function refreshAll({ keepSelection = true } = {}) {
  const oldObjective = state.selectedObjective;
  const oldTemplate = state.selectedTemplate;
  await loadObjectives();
  if (keepSelection && oldObjective && state.objectives.some(item => item.id === oldObjective)) {
    state.selectedObjective = oldObjective;
  }
  await loadTemplates();
  if (keepSelection && oldTemplate && state.templates.some(item => item.template === oldTemplate)) {
    state.selectedTemplate = oldTemplate;
  }
  renderObjectives();
  renderTemplates();
  await loadTemplateFiles();
}

async function selectObjective(id) {
  if (state.dirty && !confirm('Có thay đổi chưa lưu. Chuyển objective và bỏ thay đổi?')) return;
  state.selectedObjective = id;
  state.selectedTemplate = '';
  state.dirty = false;
  await loadTemplates();
  await loadTemplateFiles();
  renderObjectives();
}

async function selectTemplate(id) {
  if (state.dirty && !confirm('Có thay đổi chưa lưu. Chuyển template và bỏ thay đổi?')) return;
  state.selectedTemplate = id;
  state.dirty = false;
  renderTemplates();
  await loadTemplateFiles();
}

async function saveCurrent() {
  if (!state.selectedTemplate) return;
  log('Đang lưu file...');
  const data = await api(`/api/templates/${encodeURIComponent(state.selectedObjective)}/${encodeURIComponent(state.selectedTemplate)}`, {
    method: 'PUT',
    body: JSON.stringify({
      schemaJson: el.schemaEditor.value,
      demoJson: el.demoEditor.value,
      templateHtml: el.templateEditor.value,
    }),
  });
  state.summary = data.summary;
  setDirty(false);
  await loadTemplates();
  renderTemplates();
  renderSelection();
  log('Đã lưu.');
}

async function renderCurrent() {
  if (!state.selectedTemplate) return;
  if (state.dirty) await saveCurrent();
  el.renderBtn.disabled = true;
  el.renderBtn.textContent = 'Đang render...';
  log('Đang render demo.html và demo.mp4...');
  try {
    const data = await api(`/api/templates/${encodeURIComponent(state.selectedObjective)}/${encodeURIComponent(state.selectedTemplate)}/render`, {
      method: 'POST',
      body: JSON.stringify({
        mode: el.renderMode.value,
        durationSec: Number(el.durationSec.value) || 5,
      }),
    });
    state.summary = data.summary;
    renderPreview();
    renderSelection();
    log(`Render xong bằng mode: ${data.selectedMode}.`);
  } finally {
    el.renderBtn.disabled = false;
    el.renderBtn.textContent = 'Render';
  }
}

async function createObjective(event) {
  event.preventDefault();
  const name = el.newObjectiveName.value.trim();
  if (!name) return;
  const data = await api('/api/objectives', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  el.newObjectiveName.value = '';
  state.selectedObjective = data.objective.id;
  state.selectedTemplate = '';
  await refreshAll({ keepSelection: true });
  log(`Đã tạo objective ${data.objective.id}.`);
}

async function createTemplate(event) {
  event.preventDefault();
  const name = el.newTemplateName.value.trim();
  if (!name || !state.selectedObjective) return;
  const data = await api(`/api/objectives/${encodeURIComponent(state.selectedObjective)}/templates`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  el.newTemplateName.value = '';
  state.selectedTemplate = data.template.template;
  await refreshAll({ keepSelection: true });
  log(`Đã tạo template ${data.template.template}.`);
}

async function deleteCurrentTemplate() {
  if (!state.selectedTemplate) return;
  const label = `${state.selectedObjective}/${state.selectedTemplate}`;
  if (!confirm(`Xoá template ${label}? Hành động này xoá cả folder.`)) return;
  await api(`/api/templates/${encodeURIComponent(state.selectedObjective)}/${encodeURIComponent(state.selectedTemplate)}`, {
    method: 'DELETE',
    body: JSON.stringify({ confirm: true }),
  });
  state.selectedTemplate = '';
  state.dirty = false;
  await refreshAll({ keepSelection: true });
  log(`Đã xoá ${label}.`);
}

function setAiStatus(message, type = '') {
  el.aiStatus.textContent = message;
  el.aiStatus.classList.toggle('error', type === 'error');
  el.aiStatus.classList.toggle('success', type === 'success');
}

function openAiCreateModal() {
  state.aiMode = 'create';
  el.aiModalEyebrow.textContent = 'TrollLLM template generator';
  el.aiModalTitle.textContent = 'Tạo template bằng AI';
  el.aiTemplateNameLabel.textContent = 'Tên template muốn tạo';
  el.aiPromptLabel.textContent = 'Mô tả template';
  el.aiRenderMp4Label.textContent = 'Render MP4 ngay sau khi tạo (chậm hơn, nhưng có preview video ngay)';
  el.aiSubmitBtn.textContent = 'Tạo template';
  el.aiObjective.disabled = false;
  el.aiTemplateName.disabled = false;
  el.aiObjective.value = state.selectedObjective || 'explainer';
  el.aiTemplateName.value = '';
  el.aiPrompt.value = 'Tạo một template explainer 9:16 để giải thích một khái niệm khó bằng bố cục trực quan. Phong cách HyperFrames tối, hiện đại, có tiêu đề lớn, subtitle, 3 điểm giải thích, một takeaway cuối, nền có grid/noise và animation nhẹ liên tục.';
  setAiStatus(`Sử dụng TrollLLM ${state.config?.aiModel || ''} từ cấu hình app chính.`);
  el.aiModal.showModal();
  setTimeout(() => el.aiPrompt.focus(), 0);
}

function openAiEditModal() {
  if (!state.selectedTemplate) return;
  state.aiMode = 'edit';
  el.aiModalEyebrow.textContent = 'TrollLLM template editor';
  el.aiModalTitle.textContent = 'Sửa template bằng AI';
  el.aiTemplateNameLabel.textContent = 'Template đang sửa';
  el.aiPromptLabel.textContent = 'Yêu cầu chỉnh sửa';
  el.aiRenderMp4Label.textContent = 'Render MP4 ngay sau khi sửa (chậm hơn, nhưng có preview video ngay)';
  el.aiSubmitBtn.textContent = 'Sửa template';
  el.aiObjective.disabled = true;
  el.aiTemplateName.disabled = true;
  el.aiObjective.value = state.selectedObjective;
  el.aiTemplateName.value = state.selectedTemplate;
  el.aiPrompt.value = 'Giữ đúng phong cách HyperFrames 9:16 nhưng làm template này bắt mắt hơn: cải thiện bố cục, tăng hierarchy chữ, thêm chuyển động nền nhẹ liên tục, đảm bảo text tiếng Việt không bị cắt dấu và không tràn khỏi frame.';
  setAiStatus(`AI sẽ sửa ${state.selectedObjective}/${state.selectedTemplate} dựa trên 3 file đang mở trong editor.`);
  el.aiModal.showModal();
  setTimeout(() => el.aiPrompt.focus(), 0);
}

function closeAiModal() {
  if (state.aiBusy) return;
  el.aiModal.close();
}

async function generateTemplateWithAi(event) {
  event.preventDefault();
  if (state.aiBusy) return;
  const objective = el.aiObjective.value.trim() || state.selectedObjective || 'explainer';
  const templateName = el.aiTemplateName.value.trim();
  const prompt = el.aiPrompt.value.trim();
  if (prompt.length < 12) {
    setAiStatus('Hãy nhập mô tả template chi tiết hơn một chút.', 'error');
    return;
  }

  state.aiBusy = true;
  el.aiSubmitBtn.disabled = true;
  el.aiGenerateBtn.disabled = true;
  el.aiEditBtn.disabled = true;
  el.aiSubmitBtn.textContent = state.aiMode === 'edit' ? 'Đang sửa...' : 'Đang tạo...';
  setAiStatus(`Đang gửi ${state.aiMode === 'edit' ? 'yêu cầu chỉnh sửa' : 'mô tả'} cho TrollLLM. Quá trình này có thể mất 20-90 giây...`);
  log(state.aiMode === 'edit' ? 'Đang sửa template bằng AI...' : 'Đang tạo template bằng AI...');

  try {
    const data = state.aiMode === 'edit'
      ? await api(`/api/ai/templates/${encodeURIComponent(state.selectedObjective)}/${encodeURIComponent(state.selectedTemplate)}/edit`, {
          method: 'POST',
          body: JSON.stringify({
            prompt,
            renderMp4: el.aiRenderMp4.checked,
            schemaJson: el.schemaEditor.value,
            demoJson: el.demoEditor.value,
            templateHtml: el.templateEditor.value,
          }),
        })
      : await api('/api/ai/templates', {
          method: 'POST',
          body: JSON.stringify({
            objective,
            templateName,
            prompt,
            renderMp4: el.aiRenderMp4.checked,
          }),
        });
    state.selectedObjective = data.template.objective || state.selectedObjective;
    state.selectedTemplate = data.template.template || state.selectedTemplate;
    state.dirty = false;
    const actionLabel = state.aiMode === 'edit' ? 'Đã sửa' : 'Đã tạo';
    const renderWarning = data.renderError ? ` MP4 render lỗi: ${data.renderError}` : '';
    setAiStatus(`${actionLabel} ${data.template.objective}/${data.template.template}.${renderWarning}`, data.renderError ? 'error' : 'success');
    await refreshAll({ keepSelection: true });
    el.aiModal.close();
    log(data.renderError
      ? `AI ${state.aiMode === 'edit' ? 'đã sửa' : 'đã tạo'} template, nhưng render MP4 lỗi: ${data.renderError}`
      : `AI ${state.aiMode === 'edit' ? 'đã sửa' : 'đã tạo'} template ${data.template.objective}/${data.template.template}.`);
  } catch (error) {
    setAiStatus(error.message, 'error');
    log(error.message);
  } finally {
    state.aiBusy = false;
    el.aiSubmitBtn.disabled = false;
    el.aiGenerateBtn.disabled = false;
    el.aiEditBtn.disabled = !state.selectedTemplate;
    el.aiSubmitBtn.textContent = state.aiMode === 'edit' ? 'Sửa template' : 'Tạo template';
  }
}

function defaultBlockContent(file) {
  const label = blockRefName({ file });
  return `<div class="studio-block" data-width="1080" data-height="1080">
  <style>
    .studio-block {
      position: relative;
      width: 1080px;
      height: 1080px;
      display: grid;
      place-items: center;
      overflow: hidden;
      background: radial-gradient(circle at 25% 20%, rgba(34,211,238,.34), transparent 32%),
                  linear-gradient(145deg, #07111f, #16243a);
      color: #f8fafc;
      font-family: Inter, system-ui, sans-serif;
    }
    .studio-block::before {
      content: "";
      position: absolute;
      inset: -20%;
      background: linear-gradient(100deg, transparent 0 42%, rgba(248,250,252,.2) 48%, transparent 56%);
      filter: blur(18px);
      animation: block-shimmer 5s ease-in-out infinite;
    }
    .studio-block__label {
      position: relative;
      z-index: 1;
      padding: 24px 32px;
      border: 1px solid rgba(248,250,252,.18);
      border-radius: 8px;
      background: rgba(15,23,42,.72);
      font-size: 58px;
      font-weight: 900;
    }
    @keyframes block-shimmer {
      from { transform: translateX(-18%); }
      to { transform: translateX(18%); }
    }
  </style>
  <div class="studio-block__label">${escapeHtml(label)}</div>
</div>
`;
}

function blockRefName(block) {
  const parts = String(block?.file || '')
    .replace(/\.html$/i, '')
    .split('/')
    .filter(Boolean);
  if (!parts.length) return '';
  if (parts.at(-1) === 'index' && parts.length > 1) return parts.at(-2);
  return parts.at(-1);
}

function canonicalBlockPath(block) {
  if (!block?.file) return '';
  return `src/renderer/hyperframes/blocks/${block.file}`;
}

function canonicalSfxPath(sfx) {
  if (!sfx?.file) return '';
  return `assets/sfx/${sfx.file}`;
}

async function copyTextToClipboard(text) {
  if (!text) return false;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  return copied;
}

async function copySelectedBlockHtml() {
  if (!state.selectedBlock) return;
  const data = await api(`/api/blocks/file?file=${encodeURIComponent(state.selectedBlock.file)}`);
  const block = data.block || state.selectedBlock;
  const ref = blockRefName(block);
  const path = canonicalBlockPath(block);
  const content = [
    'Use this HyperFrames block as source material for the template.',
    `BLOCK_REF: ${ref}`,
    `BLOCK_FILE: ${path}`,
    'BLOCK_HTML_START',
    data.content || '',
    'BLOCK_HTML_END',
  ].join('\n');
  await copyTextToClipboard(content);
  log(`Đã copy HTML block: ${path} · ${formatBytes(content.length)}`);
}

async function copySelectedSfxPath() {
  const path = canonicalSfxPath(state.selectedSfx);
  if (!path) return;
  await copyTextToClipboard(path);
  log(`Đã copy đường dẫn SFX: ${path}`);
}

async function createBlock() {
  const rawName = prompt('Tên block mới, có thể nhập folder/name.html:', 'custom-block.html');
  if (!rawName) return;
  log('Đang tạo block...');
  const data = await api('/api/blocks', {
    method: 'POST',
    body: JSON.stringify({
      file: rawName,
      content: defaultBlockContent(rawName),
    }),
  });
  state.selectedBlock = data.block;
  await loadLibrary();
  log(`Đã tạo block ${data.block.file}.`);
}

async function openBlockEditor() {
  if (!state.selectedBlock) return;
  log('Đang mở block để sửa...');
  const data = await api(`/api/blocks/file?file=${encodeURIComponent(state.selectedBlock.file)}`);
  state.editingBlockFile = data.block.file;
  el.blockFileName.value = data.block.file;
  el.blockEditor.value = data.content || '';
  el.blockEditorPanel.hidden = false;
  log(`Đang sửa block ${data.block.file}.`);
}

async function saveBlockEditor() {
  if (!state.editingBlockFile && !state.selectedBlock) return;
  const currentFile = state.editingBlockFile || state.selectedBlock.file;
  const nextFile = el.blockFileName.value.trim() || currentFile;
  log('Đang lưu block...');
  const data = await api('/api/blocks/file', {
    method: 'PUT',
    body: JSON.stringify({
      file: currentFile,
      newFile: nextFile,
      content: el.blockEditor.value,
    }),
  });
  state.selectedBlock = data.block;
  state.editingBlockFile = data.block.file;
  await loadLibrary();
  log(`Đã lưu block ${data.block.file}.`);
}

async function deleteSelectedBlock() {
  if (!state.selectedBlock) return;
  const file = state.selectedBlock.file;
  if (!confirm(`Xoá block ${file}?`)) return;
  await api('/api/blocks/file', {
    method: 'DELETE',
    body: JSON.stringify({ file, confirm: true }),
  });
  state.selectedBlock = null;
  state.editingBlockFile = '';
  await loadLibrary();
  log(`Đã xoá block ${file}.`);
}

async function uploadBlockFile(file) {
  if (!file) return;
  const folder = prompt('Folder lưu block (để trống nếu lưu ở root):', '');
  if (folder === null) return;
  const form = new FormData();
  form.append('file', file);
  form.append('folder', folder);
  log('Đang tải block lên...');
  const data = await uploadApi('/api/blocks/upload', form);
  state.selectedBlock = data.block;
  await loadLibrary();
  log(`Đã tải block ${data.block.file}.`);
}

function insertSelectedBlockRef() {
  if (!state.selectedBlock || !state.selectedTemplate) return;
  let schema;
  try {
    schema = JSON.parse(el.schemaEditor.value.trim() || '{}');
  } catch (error) {
    log(`schema.json không hợp lệ: ${error.message}`);
    return;
  }
  schema.templateData = schema.templateData && typeof schema.templateData === 'object' ? schema.templateData : {};
  const refs = Array.isArray(schema.templateData.blockRefs) ? schema.templateData.blockRefs : [];
  const ref = blockRefName(state.selectedBlock);
  if (!ref) return;
  if (!refs.includes(ref)) refs.push(ref);
  schema.templateData.blockRefs = refs;
  el.schemaEditor.value = `${JSON.stringify(schema, null, 2)}\n`;
  setActiveTab('schema');
  setDirty(true);
  log(`Đã chèn blockRef: ${ref}.`);
}

async function uploadSfxFile(file) {
  if (!file) return;
  const category = prompt('Category lưu SFX (ví dụ: transition, emphasis, custom):', state.selectedSfx?.category || 'custom');
  if (category === null) return;
  const form = new FormData();
  form.append('file', file);
  form.append('category', category);
  log('Đang tải SFX lên...');
  const data = await uploadApi('/api/sfx/upload', form);
  state.selectedSfx = data.sfx;
  await loadLibrary();
  log(`Đã tải SFX ${data.sfx.file}.`);
}

async function renameSelectedSfx() {
  if (!state.selectedSfx) return;
  const nextFile = prompt('Tên mới hoặc category/name mới:', state.selectedSfx.file);
  if (!nextFile || nextFile === state.selectedSfx.file) return;
  log('Đang đổi tên SFX...');
  const data = await api('/api/sfx/file', {
    method: 'PUT',
    body: JSON.stringify({
      file: state.selectedSfx.file,
      newFile: nextFile,
    }),
  });
  state.selectedSfx = data.sfx;
  await loadLibrary();
  log(`Đã đổi tên SFX thành ${data.sfx.file}.`);
}

async function deleteSelectedSfx() {
  if (!state.selectedSfx) return;
  const file = state.selectedSfx.file;
  if (!confirm(`Xoá SFX ${file}?`)) return;
  await api('/api/sfx/file', {
    method: 'DELETE',
    body: JSON.stringify({ file, confirm: true }),
  });
  state.selectedSfx = null;
  await loadLibrary();
  log(`Đã xoá SFX ${file}.`);
}

function setActiveTab(tab) {
  state.activeTab = tab;
  for (const node of document.querySelectorAll('.tab')) {
    node.classList.toggle('active', node.dataset.tab === tab);
  }
  el.schemaEditor.classList.toggle('active', tab === 'schema');
  el.demoEditor.classList.toggle('active', tab === 'demo');
  el.templateEditor.classList.toggle('active', tab === 'template');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

el.objectiveList.addEventListener('click', event => {
  const button = event.target.closest('[data-objective]');
  if (button) selectObjective(button.dataset.objective).catch(error => log(error.message));
});

el.templateList.addEventListener('click', event => {
  const button = event.target.closest('[data-template]');
  if (button) selectTemplate(button.dataset.template).catch(error => log(error.message));
});

for (const editor of [el.schemaEditor, el.demoEditor, el.templateEditor]) {
  editor.addEventListener('input', () => setDirty(true));
}

document.querySelector('.tabs').addEventListener('click', event => {
  const button = event.target.closest('[data-tab]');
  if (button) setActiveTab(button.dataset.tab);
});

document.body.addEventListener('click', async event => {
  const blockFile = event.target.closest('[data-block-file]')?.dataset.blockFile;
  if (blockFile) {
    const block = state.libraryBlocks.find(item => item.file === blockFile);
    selectBlock(block);
    log(`Đã chọn block: ${blockFile}`);
    return;
  }
  const sfxFile = event.target.closest('[data-sfx-file]')?.dataset.sfxFile;
  if (sfxFile) {
    const sfx = state.librarySfx.find(item => item.file === sfxFile);
    selectSfx(sfx);
    log(`Đã chọn SFX: ${sfxFile}`);
  }
});

el.saveBtn.addEventListener('click', () => saveCurrent().catch(error => log(error.message)));
el.renderBtn.addEventListener('click', () => renderCurrent().catch(error => log(error.message)));
el.deleteTemplateBtn.addEventListener('click', () => deleteCurrentTemplate().catch(error => log(error.message)));
el.aiGenerateBtn.addEventListener('click', openAiCreateModal);
el.aiEditBtn.addEventListener('click', openAiEditModal);
el.aiGenerateForm.addEventListener('submit', event => generateTemplateWithAi(event).catch(error => log(error.message)));
el.aiCloseBtn.addEventListener('click', closeAiModal);
el.aiCancelBtn.addEventListener('click', closeAiModal);
el.aiModal.addEventListener('cancel', event => {
  if (state.aiBusy) event.preventDefault();
});
el.refreshBtn.addEventListener('click', () => refreshAll({ keepSelection: true }).catch(error => log(error.message)));
el.createObjectiveForm.addEventListener('submit', event => createObjective(event).catch(error => log(error.message)));
el.createTemplateForm.addEventListener('submit', event => createTemplate(event).catch(error => log(error.message)));
el.newBlockBtn.addEventListener('click', () => createBlock().catch(error => log(error.message)));
el.uploadBlockBtn.addEventListener('click', () => el.blockUploadInput.click());
el.editBlockBtn.addEventListener('click', () => openBlockEditor().catch(error => log(error.message)));
el.copyBlockHtmlBtn.addEventListener('click', () => copySelectedBlockHtml().catch(error => log(error.message)));
el.insertBlockRefBtn.addEventListener('click', () => insertSelectedBlockRef());
el.deleteBlockBtn.addEventListener('click', () => deleteSelectedBlock().catch(error => log(error.message)));
el.saveBlockBtn.addEventListener('click', () => saveBlockEditor().catch(error => log(error.message)));
el.cancelBlockEditBtn.addEventListener('click', () => {
  el.blockEditorPanel.hidden = true;
  state.editingBlockFile = '';
});
el.blockUploadInput.addEventListener('change', event => {
  const file = event.target.files?.[0];
  event.target.value = '';
  uploadBlockFile(file).catch(error => log(error.message));
});
el.uploadSfxBtn.addEventListener('click', () => el.sfxUploadInput.click());
el.copySfxPathBtn.addEventListener('click', () => copySelectedSfxPath().catch(error => log(error.message)));
el.renameSfxBtn.addEventListener('click', () => renameSelectedSfx().catch(error => log(error.message)));
el.deleteSfxBtn.addEventListener('click', () => deleteSelectedSfx().catch(error => log(error.message)));
el.sfxUploadInput.addEventListener('change', event => {
  const file = event.target.files?.[0];
  event.target.value = '';
  uploadSfxFile(file).catch(error => log(error.message));
});
el.openHtmlBtn.addEventListener('click', () => {
  if (state.summary?.urls?.demoHtml) window.open(state.summary.urls.demoHtml, '_blank');
});
el.openMp4Btn.addEventListener('click', () => {
  if (state.summary?.urls?.demoMp4) window.open(state.summary.urls.demoMp4, '_blank');
});
window.addEventListener('resize', updatePreviewScales);
el.htmlPreview.addEventListener('load', updatePreviewScales);
el.blockPreview.addEventListener('load', updatePreviewScales);

async function boot() {
  try {
    await loadConfig();
    await Promise.all([loadLibrary(), refreshAll({ keepSelection: false })]);
    log('Sẵn sàng.');
  } catch (error) {
    log(error.message);
  }
}

boot();

import { callAI } from '../services/aiRouter.js';

const TTS_NORMALIZE_PROMPT = `Bạn là biên tập viên chuyên chuẩn hóa lời dẫn cho TTS tiếng Việt.

NHIỆM VỤ:
- Nhận danh sách cảnh video với trường "voice" là bản hiển thị chuẩn chính tả.
- Tạo thêm trường "ttsVoice" là bản chuyên dùng cho TTS tiếng Việt đọc tự nhiên hơn.

MỤC TIÊU:
- GIỮ NGUYÊN nghĩa 100%.
- KHÔNG thêm ý mới, KHÔNG bớt ý, KHÔNG đổi giọng văn.
- CHỈ sửa những chỗ TTS tiếng Việt dễ đọc sai như:
  - số điện thoại, hotline, mã OTP, số tài khoản
  - từ tiếng Anh, viết tắt Latin, brand name, acronym
  - đơn vị như %, kg, km, USD, mm, cm
  - email, URL, @handle nếu có

QUY TẮC QUAN TRỌNG:
- "voice" gốc là bản để hiển thị phụ đề, không được sửa.
- "ttsVoice" là bản để đọc, có thể Việt hóa cách phát âm.
- Nếu một đoạn đã dễ đọc với TTS tiếng Việt thì giữ nguyên gần như hoàn toàn.
- Ưu tiên cách đọc tự nhiên của người Việt, không spelling máy móc toàn bộ câu.
- Với chuỗi số dài như số điện thoại: chuyển sang cách đọc từng số bằng chữ tiếng Việt.
- Với từ tiếng Anh phổ biến: đổi sang cách viết gần âm tiếng Việt nếu điều đó giúp TTS đọc đúng hơn.
- Nếu không chắc nên đổi như thế nào, giữ nguyên để tránh làm sai nghĩa.

GLOSSARY ƯU TIÊN:
- AI -> ây ai
- KPI -> cây bi ai
- CEO -> xi i ô
- sale -> xêu
- email -> i meo
- marketing -> ma két ting
- livestream -> lai chim
- TikTok -> tích tóc
- Facebook -> phây búc
- YouTube -> diu túp
- chatbot -> chát bót
- landing page -> len đing pết
- podcast -> pót cát

VÍ DỤ:
Input:
[
  {
    "stt": 1,
    "voice": "Gọi ngay số 0948389892 để nhận ưu đãi AI marketing 50%."
  }
]

Output:
[
  {
    "stt": 1,
    "ttsVoice": "Gọi ngay số không chín bốn tám ba tám chín tám chín hai để nhận ưu đãi ây ai ma két ting năm mươi phần trăm."
  }
]

TRẢ VỀ JSON ARRAY đúng schema:
[
  {
    "stt": 1,
    "ttsVoice": "..."
  }
]

DANH SÁCH CẢNH CẦN XỬ LÝ:
{{SCENES_JSON}}
`;

function normalizeTTSResult(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.scenes)) return result.scenes;
  if (Array.isArray(result?.items)) return result.items;
  const firstArr = result && Object.values(result).find(v => Array.isArray(v));
  if (firstArr) return firstArr;
  throw new Error('Kết quả chuẩn hóa TTS không phải array');
}

export async function normalizeTTSVoices({ scenes, keys, onLog }) {
  if (!Array.isArray(scenes) || !scenes.length) return scenes;

  const inputScenes = scenes.map(sc => ({
    stt: sc.stt,
    voice: sc.voice,
  }));

  onLog?.(`Chuẩn hóa lời đọc TTS cho ${scenes.length} cảnh...`);
  const prompt = TTS_NORMALIZE_PROMPT.replace('{{SCENES_JSON}}', JSON.stringify(inputScenes, null, 2));
  const { result } = await callAI({ prompt, isJson: true, keys, onLog });
  const normalized = normalizeTTSResult(result);
  const byStt = new Map(normalized.map(item => [Number(item.stt), String(item.ttsVoice || '').trim()]));

  return scenes.map(sc => {
    const ttsVoice = byStt.get(Number(sc.stt));
    return {
      ...sc,
      ttsVoice: ttsVoice || sc.voice,
    };
  });
}

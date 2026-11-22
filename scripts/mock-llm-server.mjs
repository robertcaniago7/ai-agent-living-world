/**
 * Mock LLM server — MENIRU endpoint OpenAI /v1/chat/completions.
 * HANYA untuk verifikasi pipeline Fase 3 (bukan jalur live).
 * Jalankan: node scripts/mock-llm-server.mjs  (port 8799)
 * Pakai: OPENAI_BASE_URL=http://localhost:8799/v1 OPENAI_API_KEY=dummy-mock-key
 *
 * Perilaku deterministik berdasarkan isi pesan:
 *  - pesan berisi "DECOMPOSE_TASK"  -> JSON {"subtasks":[...]} (4 subtask)
 *  - pesan berisi "EXECUTE_SUBTASK" -> tool_call write_artifact (1x), lalu
 *    setelah ada pesan role=tool -> jawaban teks ringkasan (selesai)
 *  - selain itu (chat)              -> jawaban teks singkat
 */
import http from 'node:http';

const PORT = Number(process.env.MOCK_PORT ?? 8799);

function completion({ text = '', toolCalls = null, model = 'mock-gpt' }) {
  return {
    id: `chatcmpl-mock-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: text || null,
          ...(toolCalls ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: toolCalls ? 'tool_calls' : 'stop',
      },
    ],
    usage: { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 },
  };
}

function handleChatCompletions(body) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const joined = messages.map((m) => String(m.content ?? '')).join('\n');
  const hasToolResult = messages.some((m) => m.role === 'tool');
  const model = String(body.model ?? 'mock-gpt');

  // 1) Dekomposisi tugas -> JSON subtask terstruktur.
  if (joined.includes('DECOMPOSE_TASK')) {
    const titleMatch = joined.match(/Tugas:\s*(.+)/);
    const title = titleMatch ? titleMatch[1].trim() : 'Tugas';
    const subtasks = [
      { title: `Riset awal: ${title}` },
      { title: `Susun kerangka: ${title}` },
      { title: `Tulis draf: ${title}` },
      { title: `Review akhir: ${title}` },
    ];
    return completion({ text: JSON.stringify({ subtasks }), model });
  }

  // 2) Setelah tool dieksekusi -> ringkasan akhir (subtask selesai).
  if (hasToolResult) {
    return completion({
      text: 'Subtugas selesai. Hasil sudah disimpan sebagai artefak dan ringkasan di atas adalah bukti pekerjaan.',
      model,
    });
  }

  // 3) Eksekusi subtask -> panggil write_artifact satu kali.
  if (joined.includes('EXECUTE_SUBTASK')) {
    const subMatch = joined.match(/Subtugas yang harus diselesaikan sekarang:\s*"([^"]+)"/);
    const subTitle = subMatch ? subMatch[1] : 'Subtugas';
    const taskMatch = joined.match(/Tugas:\s*(.+)/);
    const taskTitle = taskMatch ? taskMatch[1].trim() : 'Tugas';
    const content =
      `# ${subTitle}\n\n` +
      `Bagian dari tugas: ${taskTitle}.\n\n` +
      `Hasil subtugas ini dibuat oleh MOCK LLM (server verifikasi Fase 3, bukan model AI sungguhan).\n\n` +
      `## Isi\n` +
      `- Poin kerja 1: kerangka dan pendekatan untuk "${subTitle}".\n` +
      `- Poin kerja 2: langkah konkret yang sudah diselesaikan.\n` +
      `- Poin kerja 3: catatan untuk tahap berikutnya.\n`;
    return completion({
      text: '',
      model,
      toolCalls: [
        {
          id: `call-mock-${Date.now()}`,
          type: 'function',
          function: {
            name: 'write_artifact',
            arguments: JSON.stringify({
              title: subTitle,
              kind: 'document',
              filename: `${subTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.md`,
              content,
            }),
          },
        },
      ],
    });
  }

  // 4) Chat biasa.
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const q = lastUser ? String(lastUser.content ?? '').slice(0, 120) : '';
  return completion({
    text: `Mock LLM: terima kasih, pesanmu "${q}" sudah dibaca. Ini jawaban dari server mock (verifikasi Fase 3), bukan model AI sungguhan.`,
    model,
  });
}

const server = http.createServer((req, res) => {
  const send = (code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  };
  if (req.method === 'GET' && req.url === '/health') {
    send(200, { ok: true, mock: true });
    return;
  }
  if (req.method === 'POST' && req.url === '/v1/chat/completions') {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
    });
    req.on('end', () => {
      try {
        const body = JSON.parse(raw || '{}');
        send(200, handleChatCompletions(body));
      } catch {
        send(400, { error: { message: 'Body bukan JSON valid.' } });
      }
    });
    return;
  }
  send(404, { error: { message: 'Mock LLM: endpoint tidak dikenal.' } });
});

server.listen(PORT, () => {
  console.log(`[mock-llm] listening on http://localhost:${PORT} (POST /v1/chat/completions)`);
});

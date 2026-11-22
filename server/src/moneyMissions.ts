/**
 * Misi Uang — template workflow backend (Fase "Misi Uang").
 *
 * Tiap workflow adalah template task yang dieksekusi orchestrator yang
 * sudah ada (dekomposisi dilewati: subtask sudah ditentukan di sini,
 * tiap subtask dijalankan LLM via tool write_artifact / web_search).
 *
 * KEJUJURAN: agent hanya menyiapkan bahan jualan (riset, naskah, draf,
 * deskripsi). Akun toko, upload, posting, dan penerimaan uang tetap
 * milik user — agent TIDAK bisa membuka rekening/bank, mendaftar
 * Fiverr/Shopee Affiliate, atau menerima pembayaran sendiri.
 * Workflow yang selesai dicatat sebagai "potensi", BUKAN penghasilan,
 * sampai user mengonfirmasinya manual di dashboard Income.
 *
 * `topic` diisi user saat menjalankan workflow dari UI (mis. topik
 * Shorts, nama gig, URL/ID bounty, jenis produk, kategori Shopee).
 */

export type IncomeSource = 'shorts' | 'fiverr' | 'makefun' | 'shopee' | 'digital' | 'lain';

export const INCOME_SOURCE_LABELS: Record<IncomeSource, string> = {
  shorts: 'Shorts / TikTok',
  fiverr: 'Fiverr',
  makefun: 'make.fun',
  shopee: 'Shopee Affiliate',
  digital: 'Produk Digital',
  lain: 'Lain-lain',
};

export interface MoneyMission {
  /** id dipakai sebagai templateId saat POST /api/tasks. */
  id: string;
  title: string;
  description: string;
  /** Topik default bila user tidak mengisi. */
  defaultTopic: string;
  labelTopic: string;
  /** Agent yang disarankan (id agent_profiles; semuanya provider openai
   *  agar jalan di LIVE+mock; user boleh ganti di UI). */
  suggestedAgentId: string;
  /** Aliran penghasilan yang dicatat bila workflow selesai (potensi). */
  source: IncomeSource;
  /** Subtask yang di-seed ke DB (orchestrator mengeksekusinya berurutan). */
  subtasks: string[];
  /** Yang dikerjakan agent. */
  agentDoes: string[];
  /** Yang HARUS dikerjakan user sendiri. */
  userDoes: string[];
  /** Status akun eksternal yang relevan (bila ada). */
  accountNote?: string;
}

export const MONEY_MISSIONS: MoneyMission[] = [
  {
    id: 'misi-shorts',
    title: 'Shorts Script Pipeline',
    description:
      'Riset fakta → tulis naskah video pendek 60 detik → cek fakta → naskah siap pakai (.md). ' +
      'Topik: {topic}. Naskah berbahasa Indonesia, gaya "Fakta unik & sejarah dunia", hook kuat di 3 detik pertama.',
    defaultTopic: 'Fakta unik tentang luar angkasa',
    labelTopic: 'Topik video',
    suggestedAgentId: 'ag-copy',
    source: 'shorts',
    subtasks: [
      'Riset fakta: cari 3-5 fakta menarik + sumber (web_search)',
      'Tulis naskah 60 detik: hook, isi, penutup + CTA',
      'QA cek fakta: tandai klaim yang belum terverifikasi',
      'Susun artefak akhir: naskah .md siap pakai',
    ],
    agentDoes: ['Riset fakta + sumber', 'Tulis naskah 60 detik', 'Cek fakta (QA)', 'Artefak .md siap pakai'],
    userDoes: ['Rekam / generate video dari naskah', 'Upload ke TikTok / YouTube Shorts', 'Terima penghasilan (ads / monetisasi)'],
  },
  {
    id: 'misi-fiverr',
    title: 'Fiverr Gig Draft',
    description:
      'Riset gig sejenis di Fiverr → draf judul, deskripsi, dan paket harga → draf gig siap pakai (.md). ' +
      'Layanan: {topic}. Tulis dalam Bahasa Inggris (bahasa gig Fiverr), harga dalam USD.',
    defaultTopic: 'Desain Instagram post, poster, dan undangan digital di Canva',
    labelTopic: 'Layanan yang dijual',
    suggestedAgentId: 'ag-copy',
    source: 'fiverr',
    subtasks: [
      'Riset gig sejenis: harga, paket, dan kata kunci populer (web_search)',
      'Draf judul + deskripsi gig (Bahasa Inggris)',
      'Susun 3 paket harga (Basic / Standard / Premium)',
      'Susun artefak akhir: draf gig .md siap pakai',
    ],
    agentDoes: ['Riset gig sejenis', 'Draf judul + deskripsi + paket harga', 'Artefak .md siap pakai'],
    userDoes: ['Daftar / buka akun Fiverr sendiri', 'Buat gig + upload portofolio', 'Terima order & pembayaran (via Fiverr)'],
  },
  {
    id: 'misi-bounty',
    title: 'Bounty Brief',
    description:
      'Riset halaman bounty make.fun → ringkas syarat, hadiah, dan deadline → rencana pengerjaan (.md). ' +
      'Bounty: {topic}. Sertakan sumber (URL make.fun) bila ditemukan; jangan mengarang syarat/hadiah.',
    defaultTopic: 'Bounty terbaru di make.fun',
    labelTopic: 'Nama / URL bounty',
    suggestedAgentId: 'ag-ceo',
    source: 'makefun',
    subtasks: [
      'Riset halaman bounty make.fun: syarat, hadiah, deadline (web_search)',
      'Ringkas syarat + kriteria penilaian',
      'Susun rencana pengerjaan + estimasi usaha',
      'Susun artefak akhir: brief .md siap eksekusi',
    ],
    agentDoes: ['Riset syarat + hadiah + deadline bounty', 'Ringkasan + rencana pengerjaan', 'Artefak .md siap eksekusi'],
    userDoes: ['Daftar / ikut bounty di akun make.fun sendiri', 'Mengerjakan & submit entry', 'Terima hadiah (via wallet akunmu)'],
  },
  {
    id: 'misi-digital',
    title: 'Digital Product Pipeline',
    description:
      'Riset produk digital yang laku (template Canva, ebook singkat, preset, script) → buat konten produk ' +
      '(file .md/.txt + deskripsi listing + harga saran) → paket siap upload ke Lynk.id / Gumroad (.md). ' +
      'Produk: {topic}. JANGAN klaim produk otomatis ter-upload atau terjual.',
    defaultTopic: 'Template Canva postingan Instagram untuk UMKM kuliner',
    labelTopic: 'Jenis produk digital',
    suggestedAgentId: 'ag-dev1',
    source: 'digital',
    subtasks: [
      'Riset produk digital yang laku sejenis + kisaran harga (web_search)',
      'Buat konten produk: isi utama (.md/.txt)',
      'Tulis deskripsi listing + harga saran',
      'Susun artefak akhir: paket produk .md siap upload',
    ],
    agentDoes: ['Riset produk laku + harga', 'Buat konten produk', 'Deskripsi listing + harga saran', 'Artefak .md siap upload'],
    userDoes: ['Upload produk ke Lynk.id / Gumroad (akunmu)', 'Atur harga & payment di tokomu', 'Terima pembayaran dari pembeli'],
  },
  {
    id: 'misi-shopee',
    title: 'Shopee Affiliate Pipeline',
    description:
      'Riset produk Shopee yang tren / komisi bagus → tulis naskah promosi video pendek + caption + hashtag ' +
      '→ artefak .md siap pakai. Kategori / produk: {topic}. Akun Shopee Affiliate user SUDAH ADA — ' +
      'workflow ini TIDAK berisi langkah daftar akun. JANGAN klaim agent bisa posting atau menerima komisi.',
    defaultTopic: 'Produk rumah tangga viral di Shopee',
    labelTopic: 'Kategori / produk Shopee',
    suggestedAgentId: 'ag-copy',
    source: 'shopee',
    subtasks: [
      'Riset produk Shopee yang tren + komisi bagus (web_search)',
      'Pilih 3 produk rekomendasi + alasan',
      'Tulis naskah promosi video pendek + caption + hashtag',
      'Susun artefak akhir: naskah promosi .md siap pakai',
    ],
    agentDoes: ['Riset produk tren + komisi', 'Naskah promosi video pendek', 'Caption + hashtag', 'Artefak .md siap pakai'],
    userDoes: ['Ambil link affiliate dari akun Shopee-mu (sudah ada)', 'Rekam & posting video promosi', 'Tarik komisi manual dari Shopee'],
    accountNote: 'Akun Shopee Affiliate: sudah ada. Penarikan komisi adalah langkah manual — Lux akan mengingatkan saat waktunya.',
  },
];

export function getMoneyMission(id: string): MoneyMission | undefined {
  return MONEY_MISSIONS.find((m) => m.id === id);
}

/** Metadata publik untuk UI (tanpa subtask internal yang panjang — tetap dikirim, UI menampilkannya). */
export function listMoneyMissions(): MoneyMission[] {
  return MONEY_MISSIONS;
}

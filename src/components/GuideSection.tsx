import React from 'react';

const STEPS = [
  {
    step: '01. Salin Tautan Instagram',
    detail:
      'Buka Post, Carousel, Reels, atau Story di aplikasi maupun web Instagram, ketuk ikon Bagikan lalu pilih Salin Tautan.',
  },
  {
    step: '02. Pratinjau & Pilih Slide',
    detail:
      'Tempel tautan di kolom utama. Untuk Carousel, jelajahi filmstrip slide dan centang slide tertentu atau pilih unduh semua.',
  },
  {
    step: '03. Simpan Media atau Ekstrak Audio',
    detail:
      'Unduh foto HD atau video MP4 secara langsung. Untuk Reels, Anda juga dapat memisahkan dan menyimpan trek audionya saja.',
  },
];

export const GuideSection: React.FC = () => {
  return (
    <section id="cara-pakai" className="mx-auto max-w-6xl px-4 py-12 sm:px-6 border-t border-[#E4E4E7] dark:border-[#27272A]">
      <div className="max-w-2xl mb-8">
        <h2 className="font-display text-xl font-semibold tracking-tight text-[#09090B] dark:text-[#FAFAFA] sm:text-2xl">
          Cara Kerja Pengunduhan
        </h2>
        <p className="mt-2 text-sm text-[#52525B] dark:text-[#A1A1AA]">
          Dirancang agar cepat untuk tautan publik dan tetap siap menangani Story dengan sesi opsional.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {STEPS.map((item) => (
          <div
            key={item.step}
            className="rounded-xl border border-[#E4E4E7] bg-white p-6 dark:border-[#27272A] dark:bg-[#121216]"
          >
            <h3 className="font-display text-base font-semibold text-[#09090B] dark:text-[#FAFAFA]">
              {item.step}
            </h3>
            <p className="mt-2.5 text-sm text-[#52525B] dark:text-[#A1A1AA] leading-relaxed">
              {item.detail}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
};

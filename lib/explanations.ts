export type Explanation = {
  // What the indicator measures.
  apa: string;
  // How to read the value shown.
  cara: string;
  // How much to trust it, and when it fails.
  keandalan: string;
};

const EMA = (period: number, peran: string): Explanation => ({
  apa: `Rata-rata harga ${period} candle terakhir yang lebih menekankan harga terbaru. ${peran}`,
  cara: `Harga di atas EMA ${period} = kecenderungan naik; di bawah = kecenderungan turun. Garis EMA sering menjadi area pantulan (support/resistance dinamis).`,
  keandalan:
    "Sangat umum dipakai dan andal untuk membaca tren, tetapi lambat bereaksi dan memberi sinyal palsu saat pasar sideways.",
});

export const INDICATORS: Record<string, Explanation> = {
  "RSI (14)": {
    apa: "Relative Strength Index: membandingkan besarnya kenaikan dan penurunan 14 candle terakhir dalam skala 0–100.",
    cara: "Di bawah 30 = oversold (jenuh jual, peluang pantulan naik); di atas 70 = overbought (jenuh beli, rawan koreksi); 40–60 = netral.",
    keandalan:
      "Salah satu indikator paling populer. Cukup andal di pasar sideways, tetapi di tren kuat RSI bisa bertahan lama di zona ekstrem, jadi jangan dipakai sendirian.",
  },
  "Stochastic (14,3)": {
    apa: "Posisi harga penutupan terhadap rentang tertinggi–terendah 14 candle terakhir (%K), dihaluskan menjadi %D.",
    cara: "Di bawah 20 = oversold; di atas 80 = overbought. Persilangan %K menembus %D ke atas dari zona oversold sering dipakai sebagai sinyal beli.",
    keandalan:
      "Lebih cepat dari RSI, tetapi lebih banyak sinyal palsu. Paling berguna untuk timing masuk ketika tren besar sudah diketahui.",
  },
  "MACD (12,26,9)": {
    apa: "Selisih EMA 12 dan EMA 26 (garis MACD) dibandingkan dengan rata-ratanya 9 candle (garis sinyal). Nilai yang tampil adalah histogramnya.",
    cara: "Histogram positif dan membesar = momentum naik menguat; negatif dan membesar = momentum turun menguat. Persilangan garis MACD dan sinyal adalah sinyal perubahan arah.",
    keandalan:
      "Sangat umum dipakai untuk momentum tren. Andal di pasar yang bertren, tetapi sering bolak-balik (whipsaw) saat sideways dan sinyalnya terlambat.",
  },
  "EMA 20": EMA(20, "Mewakili tren jangka pendek."),
  "EMA 50": EMA(50, "Mewakili tren jangka menengah."),
  "EMA 200": EMA(200, "Mewakili tren jangka panjang dan paling banyak diperhatikan pelaku pasar besar."),
  "Tren EMA 50/200": {
    apa: "Hubungan EMA 50 dengan EMA 200. Golden cross = EMA 50 di atas EMA 200; death cross = sebaliknya.",
    cara: "Golden = tren besar naik, peluang beli saat koreksi; Death = tren besar turun, hati-hati membeli.",
    keandalan:
      "Sinyal tren jangka panjang yang paling dikenal dan cukup andal, tetapi sangat terlambat: persilangan baru terjadi setelah harga bergerak jauh.",
  },
  "Bollinger (20,2)": {
    apa: "Pita di sekitar rata-rata 20 candle, selebar 2 kali simpangan baku. Lebar pita menunjukkan volatilitas.",
    cara: "Harga menyentuh pita bawah = relatif murah (peluang pantulan); menyentuh pita atas = relatif mahal. Pita menyempit biasanya diikuti pergerakan besar.",
    keandalan:
      "Umum dipakai untuk melihat volatilitas dan harga ekstrem. Di tren kuat harga bisa 'berjalan' di sepanjang pita, jadi menyentuh pita bukan berarti pasti berbalik.",
  },
};

export const PIVOT: Explanation = {
  apa: "Pivot point klasik dari harga tertinggi, terendah, dan penutupan candle sebelumnya. S = support (penahan turun), R = resistance (penahan naik), P = titik tengah.",
  cara: "Harga di atas P cenderung menguat ke R1/R2; di bawah P cenderung melemah ke S1/S2. Level ini sering dipakai untuk target dan batas rugi.",
  keandalan:
    "Sangat umum dipakai trader harian. Bekerja karena banyak orang memakainya, tetapi harga bisa menembusnya saat ada berita besar.",
};

export const ATR: Explanation = {
  apa: "Average True Range: rata-rata jarak gerak harga per candle dalam 14 candle terakhir, ukuran volatilitas.",
  cara: "Dipakai untuk menentukan batas rugi dan target: batas rugi sekitar 1,5–2 kali ATR dari harga masuk agar tidak tersentuh oleh gerak acak biasa.",
  keandalan:
    "Bukan sinyal arah, tetapi alat manajemen risiko yang sangat andal dan dipakai hampir semua trader berpengalaman.",
};

export const SUMMARY: Explanation = {
  apa: "Ringkasan menghitung berapa indikator yang memberi sinyal beli, jual, atau netral, lalu merata-ratakannya.",
  cara: "Makin banyak indikator yang sepakat, makin kuat ringkasannya. Beli kuat/Jual kuat berarti mayoritas besar indikator searah.",
  keandalan:
    "Kesepakatan banyak indikator (konfluensi) lebih dapat dipercaya daripada satu indikator, tetapi tetap bukan kepastian. Konfirmasi dengan timeframe lebih besar dan berita.",
};

export const DIRECTION: Explanation = {
  apa: "Arah ditentukan dari suara faktor tren: posisi harga terhadap EMA 20/50/200, kemiringan EMA 20, MACD, RSI (di atas 55 beli, di bawah 45 jual), dan perubahan harga 10 candle terakhir.",
  cara: "NAIK jika sebagian besar faktor naik, TURUN jika sebagian besar turun, SIDEWAYS jika berimbang. Kekuatan sinyal = seberapa kompak faktor-faktor itu sepakat. Support/resistance adalah titik terendah/tertinggi 20 candle terakhir, dan rentang gerak diperkirakan dari ATR.",
  keandalan:
    "Pendekatan mengikuti tren (trend following) seperti ini yang paling umum dipakai dan paling konsisten dalam jangka panjang, tetapi sering salah di pasar sideways dan selalu sedikit terlambat. Gunakan horizon lebih besar sebagai acuan utama dan horizon kecil untuk timing.",
};

export const SENTIMENT_PARTS: Record<string, string> = {
  "Momentum (RSI)": "Nilai RSI langsung: makin tinggi, makin dominan pembeli dalam 14 candle terakhir.",
  Tren: "Porsi faktor tren (EMA, MACD, RSI, momentum) yang menunjuk naik dibanding turun.",
  "Tekanan beli":
    "Porsi volume yang dieksekusi oleh pembeli pasar (market buy) di Binance. Di atas 50% berarti pembeli lebih agresif daripada penjual.",
  "Posisi harga":
    "Letak harga di antara titik terendah (0%) dan tertinggi (100%) 20 candle terakhir. Dekat 100% berarti harga sedang di puncak rentangnya.",
};

export const SIGNALS: Explanation = {
  apa: "Sinyal BELI muncul saat garis MACD memotong ke atas garis sinyalnya ketika harga di atas EMA 50 (mengikuti tren), atau saat RSI naik keluar dari zona oversold (di bawah 30). Sinyal JUAL adalah kebalikannya: MACD memotong ke bawah saat harga di bawah EMA 50, atau RSI turun keluar dari zona overbought (di atas 70). Sinyal selalu bergantian beli lalu jual.",
  cara: "Rekam jejak menghitung setiap pasangan beli→jual di candle yang tampil: berapa persen yang berakhir untung dan rata-rata hasilnya. Volume beli vs jual membandingkan volume yang dieksekusi pembeli pasar (market buy) dengan penjual pasar di Binance.",
  keandalan:
    "Ini aturan klasik yang banyak dipakai, dan rekam jejaknya dihitung dari data sungguhan koin ini, tetapi tanpa biaya transaksi dan hanya untuk candle yang tampil. Hasil masa lalu tidak menjamin hasil berikutnya; pakai sinyal sebagai saat untuk memeriksa, bukan perintah otomatis.",
};

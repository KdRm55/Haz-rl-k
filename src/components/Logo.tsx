'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * public/logo.png varsa gösterir; yoksa sessizce gizler.
 * Resim, sayfa etkileşime hazır olmadan yüklenemezse onError kaçabilir; bu yüzden açılışta ayrıca denetlenir.
 */
export function LogoResmi({ className, alt }: { className?: string; alt: string }) {
  const [yok, setYok] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const i = ref.current;
    if (i?.complete && i.naturalWidth === 0) setYok(true);
  }, []);
  if (yok) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={ref} className={className} src="/logo.png" alt={alt} onError={() => setYok(true)} />;
}

export function Logo() {
  return <LogoResmi className="logo" alt="Sinop İlahiyat Fakültesi logosu" />;
}

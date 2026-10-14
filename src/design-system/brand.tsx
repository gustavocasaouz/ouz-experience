import Link from "next/link";

/** Logotipo oficial OUZ (vetor extraído de ouzgroup.com.br). Usa a cor do texto (currentColor). */
export function OuzLogo({ className = "h-6 w-auto", title = "OUZ" }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 117 32" className={className} role="img" aria-label={title} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d="M0 0.0202637H23.7346L31.9796 8.26522V31.9998H8.1338L0 23.9893V0.0202637ZM1.80201 1.82227V23.2348L8.87217 30.1978H30.1775V9.01164L22.9882 1.82227H1.80201Z" />
      <path fillRule="evenodd" clipRule="evenodd" d="M85.5585 0.0202637H109.113V1.82227H85.5585V0.0202637ZM116.83 31.9998H93.1604V30.1978H116.83V31.9998Z" />
      <path fillRule="evenodd" clipRule="evenodd" d="M43.0756 0H44.8776V23.235L51.9477 30.198H73.2531V7.14125H75.0551V32H51.2094L43.0756 23.9894V0Z" />
      <path fillRule="evenodd" clipRule="evenodd" d="M85.3549 30.7805L115.072 1.06372L115.709 1.70083L85.992 31.4176L85.3549 30.7805Z" />
    </svg>
  );
}

/** Símbolo OUZ (O, U e Z sobrepostos). */
export function OuzSymbol({ className = "size-8", title = "OUZ" }: { className?: string; title?: string }) {
  return (
    <svg viewBox="38 39 42 42" className={className} role="img" aria-label={title} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M78.7708 79.4685H49.6437L39.7336 69.6446V40.4314H68.9469L78.857 50.3415V79.4685H78.7708ZM50.5917 76.9695H76.2717V51.2894L67.8266 42.8443H42.2327V68.5244L50.5917 76.9695Z" />
      <path d="M77.5306 40.7578L40.0562 78.2323L40.9092 79.0854L78.3837 41.6109L77.5306 40.7578Z" />
    </svg>
  );
}

export function Wordmark({ href = "/", subtitle }: { href?: string; subtitle?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-3 text-ink" aria-label="OUZ — página inicial">
      <OuzLogo className="h-[22px] w-auto" />
      {subtitle && <span className="eyebrow hidden sm:inline border-l border-line pl-3">{subtitle}</span>}
    </Link>
  );
}

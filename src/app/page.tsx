import Link from 'next/link';
import Image from 'next/image';

const featured = [
  { href: '/mixes', label: 'Signal 001 — New Mix' },
  { href: '/work', label: 'Brand Archive — Identity Systems' },
  { href: '/news', label: 'Transmission Notes' },
];

export default function Home() {
  return (
    <div className="px-5 pt-8 page-enter">
      <div className="mb-10 space-y-1">
        {featured.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className="block text-sm text-white/70 hover:text-vr-white transition-colors duration-150"
          >
            {item.label}
          </Link>
        ))}
      </div>
      <div className="relative aspect-square w-full max-w-[480px]">
        <Image
          src="/images/photography/negative/imageedit_1_4032830485.jpg"
          alt=""
          fill
          className="object-cover"
          priority
          sizes="(max-width: 480px) 100vw, 480px"
        />
      </div>
    </div>
  );
}

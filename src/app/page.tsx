import Link from 'next/link';
import Image from 'next/image';
import { LissajousScope } from '@/components/LissajousScope';

const featured = [
  { href: '/listen', label: 'Signal 001 — New Mix' },
  { href: '/work', label: 'Brand Archive — Identity Systems' },
  { href: '/news', label: 'Transmission Notes' },
];

export default function Home() {
  return (
    <div className="px-4 sm:px-5 pt-2 sm:pt-3 page-enter">
      {/* Featured links */}
      <div className="mb-3 sm:mb-4 space-y-1">
        {featured.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className="block text-sm text-[rgba(200,196,187,0.7)] hover:text-[#e8e4d9] transition-colors duration-150"
          >
            {item.label}
          </Link>
        ))}
      </div>

      {/* Scope (left / top on mobile) + Image (right / bottom on mobile) */}
      <div className="flex flex-col md:flex-row md:items-start gap-6 md:gap-8">
        {/* Lissajous scope — primary element */}
        <div className="flex-1 min-w-0 max-w-full md:max-w-[400px]">
          <LissajousScope />
        </div>

        {/* Right column: transmit link + thermal photograph */}
        <div className="flex flex-col gap-2 w-full max-w-[260px] md:max-w-[200px] md:self-end md:ml-auto shrink-0">
          <Link
            href="/transmit"
            className="block text-right text-xs tracking-[0.15em] uppercase text-[rgba(200,196,187,0.7)] hover:text-[#e8e4d9] transition-colors duration-150"
          >
            ► send transmission
          </Link>
          <div className="relative aspect-square w-full">
            <Image
              src="/images/photography/infrared/Home_page_1.PNG"
              alt=""
              fill
              className="object-cover"
              priority
              sizes="(max-width: 768px) 260px, 200px"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export const routes = {
  fr: {
    home: '/',
    work: '/app',
    services: '/services',
    about: '/a-propos',
    contact: '/contact',
    legal: '/mentions-legales',
  },
  en: {
    home: '/en',
    work: '/en/work',
    services: '/en/services',
    about: '/en/about',
    contact: '/en/contact',
    legal: '/en/legal-notice',
  },
} as const;

export type Locale = keyof typeof routes;
export type PageKey = keyof (typeof routes)['fr'];

export function getPageKeyFromPath(
  pathname: string,
  locale: Locale,
): PageKey | null {
  const normalized = pathname.replace(/\/$/, '') || '/';
  const entry = Object.entries(routes[locale]).find(
    ([, path]) => path === normalized,
  );
  return (entry?.[0] as PageKey) ?? null;
}

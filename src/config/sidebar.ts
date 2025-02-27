import type { LinkItem } from 'virtual:sveltepress/theme-default';

export const sidebar: Record<string, LinkItem[]> = {
  '/getting-started/': [{
    title: 'Getting started',
    to: '/getting-started/',
  }],
  '/user/': [{
    title: 'User docs',
    collapsible: true,
    items: [
      {
        title: 'Intro to DI',
        to: '/user/intro-to-di/',
      },
      {
        title: 'Intro to DICC',
        to: '/user/intro-to-dicc/',
      },
      {
        title: 'Implicit services',
        to: '/user/implicit-services/',
      },
      {
        title: 'Explicit definitions',
        to: '/user/explicit-definitions/',
      },
      {
        title: 'Injection patterns',
        to: '/user/injection-patterns/',
      },
      {
        title: 'Auto factories',
        to: '/user/auto-factories/',
      },
      {
        title: 'Service decorators',
        to: '/user/service-decorators/',
      },
      {
        title: 'Merging containers',
        to: '/user/merging-containers/',
      },
      {
        title: 'Config and compilation',
        to: '/user/config-and-compilation/',
      },
    ],
  }],
  '/recipes/': [{
    title: 'Recipes',
    collapsible: true,
    items: [
      {
        title: 'Express.js',
        to: '/recipes/express/',
      }
    ],
  }],
};

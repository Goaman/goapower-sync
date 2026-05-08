import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'GoaPower Sync',
  description: 'Generic path-based sync protocol and reducers.',
  cleanUrls: true,
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/understand-snapshot/' },
      { text: 'API', link: '/api/' },
      { text: 'Interface', link: '/protocol/' },
    ],
    sidebar: [
      {
        text: 'GoaPower Sync',
        items: [
          { text: 'Overview', link: '/' },
          {
            text: 'Guide',
            link: '/guide/understand-snapshot/',
            items: [
              { text: 'Understand Snapshot', link: '/guide/understand-snapshot/' },
              { text: 'Understand Patch', link: '/guide/understand-patch/' },
            ],
          },
          { text: 'API', link: '/api/' },
          { text: 'Interface', link: '/protocol/' },
          {
            text: 'Examples',
            link: '/examples/bun-websocket/',
            items: [{ text: 'Bun WebSocket', link: '/examples/bun-websocket/' }],
          },
        ],
      },
    ],
    search: {
      provider: 'local',
    },
  },
});

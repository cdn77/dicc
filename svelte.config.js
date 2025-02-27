import adapter from '@sveltejs/adapter-static'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/**
 * @type {import('@sveltejs/kit').Config}
 */
const config = {
	extensions: ['.svelte', '.md'],
	preprocess: [vitePreprocess()],
	kit: {
		adapter: adapter({
			pages: 'dist',
		}),
		paths: {
			base: process.env.NODE_ENV === 'production' ? '/dicc' : ''
		},
	},
	compilerOptions: {
		runes: true,
	},
};

export default config;

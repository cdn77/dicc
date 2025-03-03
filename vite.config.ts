import { defaultTheme } from '@sveltepress/theme-default'
import { sveltepress } from '@sveltepress/vite'
import { defineConfig } from 'vite'
import { sidebar } from './src/config/sidebar';

const config = defineConfig({
	plugins: [
		sveltepress({
			theme: defaultTheme({
				navbar: [
					{
						title: 'Docs',
						to: '/getting-started/',
					},
				],
				sidebar,
				github: 'https://github.com/cdn77/dicc',
				logo: process.argv.includes('dev') ? '/dicc.svg' : '//cdn77.github.io/dicc/dicc.svg',
				themeColor: {
					light: '#fff',
					dark: '#000',
					primary: '#1e70c7',
					hover: '#4684c7',
					gradient: {
						start: '#4684c7',
						end: '#1e70c7',
					},
				},
				highlighter: {
					languages: ['bash', 'ts', 'yaml'],
				},
				preBuildIconifyIcons: {
					'vscode-icons': ['file-type-typescript-official'],
					'f7': ['rectangle-compress-vertical'],
				},
			}),
			siteConfig: {
				title: 'DICC',
				description: 'DI Container Compiler',
			},
		}),
	],
})

export default config

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './screens/App';
import './styles/global.css';

declare global {
	interface Window { Telegram: any }
}

function initTelegram() {
	if (window.Telegram?.WebApp) {
		const tg = window.Telegram.WebApp;
		try {
			tg.ready();
			tg.expand();
		} catch {}
	}
}

initTelegram();

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
import React from 'react';

type Props = {
	user: any;
	setUser: (u: any) => void;
};

export default function Upgrades({ user, setUser }: Props) {
	const upgrades = user.upgrades || {
		autoClicker: { level: 0, cost: 10, baseCost: 10, multiplier: 1.5 },
		clickPower: { level: 0, cost: 25, baseCost: 25, multiplier: 2 },
		starGenerator: { level: 0, cost: 50, baseCost: 50, multiplier: 2.5 }
	};

	async function buy(key: keyof typeof upgrades) {
		const up = upgrades[key];
		if (user.magnumCoins < up.cost) return;
		const nextLevel = (up.level || 0) + 1;
		const nextCost = Math.floor(up.baseCost * Math.pow(up.multiplier, nextLevel));
		const next = { ...upgrades, [key]: { ...up, level: nextLevel, cost: nextCost } };
		const nextCps = Math.max(1, user.cps) + (key === 'clickPower' ? 1 : 0);
		setUser((prev: any) => ({ ...prev, upgrades: next, cps: nextCps, magnumCoins: prev.magnumCoins - up.cost }));
		const uid = (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id;
		if (uid) {
			try {
				await fetch('/api/webapp/update-data', {
					method: 'POST', headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ userId: uid, upgrades: next, cps: nextCps, magnumCoins: user.magnumCoins - up.cost })
				});
			} catch {}
		}
	}

	return (
		<section>
			<h2 style={{ color: '#ffd700' }}>Улучшения</h2>
			<div style={{ display: 'grid', gap: 12 }}>
				{Object.entries(upgrades).map(([k, v]: any) => (
					<div key={k} style={{ padding: 12, border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, background: 'rgba(255,255,255,.05)' }}>
						<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
							<div>
								<div style={{ fontWeight: 700 }}>{k}</div>
								<div style={{ color: '#aaa', fontSize: 12 }}>Уровень: {v.level || 0}</div>
							</div>
							<button onClick={() => buy(k as any)} disabled={user.magnumCoins < v.cost}>
								Купить за {v.cost} MC
							</button>
						</div>
					</div>
				))}
			</div>
		</section>
	);
}
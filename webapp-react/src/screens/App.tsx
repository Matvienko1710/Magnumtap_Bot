import React, { useEffect, useMemo, useState } from 'react';
import './app.css';
import Upgrades from './Upgrades';
import Tasks from './Tasks';
import Exchange from './Exchange';
import Referrals from './Referrals';
import Achievements from './Achievements';
import Settings from './Settings';

type UserData = {
	userId?: number;
	username?: string;
	magnumCoins: number;
	stars: number;
	level: number;
	experience: number;
	clickCount: number;
	cps: number;
	minerActive: boolean;
	lastFarmAt?: string | null;
	farmCooldownMs?: number;
	upgrades?: any;
	tasks?: any;
	referralsCount?: number;
	referralEarnings?: number;
	settings?: any;
};

const sections = ['farming','upgrades','exchange','miner','tasks','referrals','achievements','settings'] as const;

type Section = typeof sections[number];

export default function App() {
	const [active, setActive] = useState<Section>('farming');
	const [user, setUser] = useState<UserData>({magnumCoins:1000,stars:0,level:1,experience:0,clickCount:0,cps:1,minerActive:false});

	// Load user via WebApp initData if available
	useEffect(() => {
		const tgUser = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
		const uid = tgUser?.id;
		if (!uid) return;
		fetch(`/api/webapp/user-data?user_id=${uid}`).then(r=>r.json()).then(data=>{
			if (data?.success && data.data) {
				setUser((prev)=>({ ...prev, ...data.data }));
			}
		}).catch(()=>{});
	}, []);

	// Telegram MainButton -> Tasks
	useEffect(()=>{
		const tg = (window as any).Telegram?.WebApp;
		if (!tg) return;
		try{
			tg.MainButton.setText('Задания');
			tg.MainButton.show();
			tg.MainButton.onClick(()=> setActive('tasks'));
			return ()=> tg.MainButton.offClick(()=> setActive('tasks'));
		}catch{}
	},[]);

	const nextAvailableAt = useMemo(()=>{
		if (!user.lastFarmAt || !user.farmCooldownMs) return 0;
		return new Date(user.lastFarmAt).getTime() + user.farmCooldownMs;
	}, [user.lastFarmAt, user.farmCooldownMs]);

	return (
		<div className="app">
			<header className="header">
				<div className="logo">Magnum Stars</div>
				<div className="balances">
					<div className="balance"><span>⭐</span>{Math.floor(user.stars).toLocaleString('ru-RU')}</div>
					<div className="balance"><span>🪙</span>{Math.floor(user.magnumCoins).toLocaleString('ru-RU')}</div>
				</div>
			</header>
			<main className="main">
				{active==='farming' && <Farming user={user} setUser={setUser} nextAvailableAt={nextAvailableAt} />}
				{active==='upgrades' && <Upgrades user={user} setUser={setUser} />}
				{active==='exchange' && <Exchange user={user} setUser={setUser} />}
				{active==='miner' && <Miner user={user} setUser={setUser} />}
				{active==='tasks' && <Tasks user={user} setUser={setUser} />}
				{active==='referrals' && <Referrals user={user} />}
				{active==='achievements' && <Achievements user={user} />}
				{active==='settings' && <Settings user={user} setUser={setUser} />}
			</main>
			<nav className="tabs">
				{sections.map(s=> (
					<button key={s} className={active===s?'active':''} onClick={()=>setActive(s)}>{s}</button>
				))}
			</nav>
		</div>
	);
}

function Farming({user,setUser,nextAvailableAt}:{user:UserData;setUser:(u:any)=>void;nextAvailableAt:number}){
	const [lock, setLock] = useState(false);
	const [pct, setPct] = useState(0);
	const uid = (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id;

	useEffect(()=>{
		let raf = 0;
		function tick(){
			if (!nextAvailableAt) { setPct(0); return; }
			const now = Date.now();
			const left = Math.max(0, nextAvailableAt - now);
			const total = user.farmCooldownMs || 5000;
			const elapsed = Math.min(total, total - left);
			setPct(Math.floor((elapsed/total)*100));
			if (left>0) raf = requestAnimationFrame(tick);
		}
		if (Date.now() < nextAvailableAt) raf = requestAnimationFrame(tick);
		return ()=> cancelAnimationFrame(raf);
	},[nextAvailableAt,user.farmCooldownMs]);

	async function farm(){
		if (lock) return;
		if (Date.now() < nextAvailableAt) return;
		setLock(true);
		try{
			if (!uid){
				setUser((prev:any)=>({ ...prev, magnumCoins: prev.magnumCoins + prev.cps, clickCount: prev.clickCount+1, experience: prev.experience+1 }));
				return;
			}
			const resp = await fetch('/api/webapp/farm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:uid})});
			if (resp.status===429){
				const j = await resp.json();
				setUser((prev:any)=>({ ...prev, farmCooldownMs: j.farmCooldownMs, lastFarmAt: new Date(j.nextAvailableAt - j.farmCooldownMs).toISOString() }));
				return;
			}
			const j = await resp.json();
			if (j.success){
				setUser((prev:any)=>({ ...prev, magnumCoins: j.magnumCoins, clickCount: prev.clickCount+1, experience: prev.experience+1, farmCooldownMs: j.farmCooldownMs, lastFarmAt: new Date(j.nextAvailableAt - j.farmCooldownMs).toISOString() }));
			}
		} finally {
			setLock(false);
		}
	}

	return (
		<section className="farming">
			<button className="farmBtn" onClick={farm} disabled={lock || Date.now()<nextAvailableAt}>Фармить</button>
			<div className="progress"><div className="fill" style={{transform:`scaleX(${pct/100})`}} /></div>
			<div className="hint">{Date.now()<nextAvailableAt?`Ожидание...`:'Готов к фарму'}</div>
		</section>
	);
}

function Miner({user,setUser}:{user:UserData;setUser:(u:any)=>void}){
	const uid = (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id;
	async function toggle(){
		const next = !user.minerActive;
		setUser((prev:any)=>({ ...prev, minerActive: next }));
		if (uid){
			try{await fetch('/api/webapp/miner/toggle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:uid,active:next})});}catch{}
		}
	}
	return (
		<section className="miner">
			<div className="status">Майнер: {user.minerActive?'Активен':'Неактивен'}</div>
			<button onClick={toggle}>{user.minerActive?'Остановить':'Запустить'}</button>
		</section>
	);
}
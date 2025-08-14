import React, { useEffect, useState } from 'react';

type Props={user:any};

export default function Referrals({user}:Props){
	const uid=(window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id;
	const [bot,setBot]=useState<string>('');
	useEffect(()=>{(async()=>{try{const r=await fetch('/api/bot-info');const j=await r.json();if(j.success) setBot(j.username||'');}catch{}})()},[]);
	const link= uid && bot? `https://t.me/${bot}?start=${uid}` : '';
	async function copy(){ try{ await navigator.clipboard.writeText(link);}catch{} }
	return (
		<section>
			<h2 style={{color:'#ffd700'}}>Рефералы</h2>
			<div style={{display:'grid',gap:8}}>
				<div>Приглашено: {user.referralsCount||0}</div>
				<div>Заработано: {user.referralEarnings||0} MC</div>
				{uid && bot && (
					<div style={{display:'flex',gap:8}}>
						<input value={link} readOnly style={{flex:1}} />
						<button onClick={copy}>Копировать</button>
					</div>
				)}
			</div>
		</section>
	);
}
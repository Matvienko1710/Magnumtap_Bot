import React, { useState } from 'react';

type Props = { user:any; setUser:(u:any)=>void };

export default function Exchange({user,setUser}:Props){
	const [from,setFrom]=useState<'mc'|'stars'>('mc');
	const [amount,setAmount]=useState<number>(0);
	const uid=(window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id;
	async function submit(){
		if(!uid||!amount) return;
		try{
			const r=await fetch('/api/webapp/exchange',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:uid,from,amount})});
			const j=await r.json();
			if(j.success){ setUser((p:any)=>({...p, magnumCoins:j.magnumCoins, stars:j.stars })); }
		}catch{}
	}
	return (
		<section>
			<h2 style={{color:'#ffd700'}}>Биржа</h2>
			<div style={{display:'grid',gap:10,maxWidth:360}}>
				<select value={from} onChange={(e)=>setFrom(e.target.value as any)}>
					<option value="mc">Magnum Coins → Stars</option>
					<option value="stars">Stars → Magnum Coins</option>
				</select>
				<input type="number" min={1} value={amount||''} placeholder="Сумма" onChange={(e)=>setAmount(Number(e.target.value))} />
				<button onClick={submit}>Обменять</button>
			</div>
		</section>
	);
}
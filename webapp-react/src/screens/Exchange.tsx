import React, { useEffect, useMemo, useState } from 'react';

type Props = { user:any; setUser:(u:any)=>void };

export default function Exchange({user,setUser}:Props){
	const [from,setFrom]=useState<'mc'|'stars'>('mc');
	const [amount,setAmount]=useState<number>(0);
	const [rate,setRate]=useState<number>(1);
	const commission=2.5/100;
	const uid=(window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id;

	useEffect(()=>{(async()=>{try{const r=await fetch('/api/webapp/exchange-rate');const j=await r.json();if(j.success) setRate(j.rate||1);}catch{}})()},[]);

	const preview=useMemo(()=>{
		if(!amount||amount<=0) return 0;
		if(from==='mc') return amount*rate*(1-commission);
		return (amount/rate)*(1-commission);
	},[amount,from,rate]);

	async function submit(){
		if(!uid||!amount) return;
		try{
			const r=await fetch('/api/webapp/exchange',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:uid,from,amount})});
			const j=await r.json();
			if(j.success){ setUser((p:any)=>({...p, magnumCoins:j.magnumCoins, stars:j.stars })); setRate(j.rate||rate); setAmount(0); }
		}catch{}
	}
	return (
		<section>
			<h2 style={{color:'#ffd700'}}>Биржа</h2>
			<div style={{color:'#aaa',marginBottom:8}}>Текущий курс: 1 MC ≈ {(rate).toFixed(6)} Stars</div>
			<div style={{display:'grid',gap:10,maxWidth:360}}>
				<select value={from} onChange={(e)=>setFrom(e.target.value as any)}>
					<option value="mc">Magnum Coins → Stars</option>
					<option value="stars">Stars → Magnum Coins</option>
				</select>
				<input type="number" min={1} value={amount||''} placeholder="Сумма" onChange={(e)=>setAmount(Number(e.target.value))} />
				<div style={{color:'#aaa'}}>Получите ≈ {preview?preview.toFixed(6):0} {from==='mc'?'Stars':'MC'} (после комиссии)</div>
				<button onClick={submit}>Обменять</button>
			</div>
		</section>
	);
}
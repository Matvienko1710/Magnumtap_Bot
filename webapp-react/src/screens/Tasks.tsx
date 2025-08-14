import React from 'react';

type Props = { user: any; setUser: (u:any)=>void };

export default function Tasks({ user, setUser }: Props){
	const tasks = user.tasks || { daily: [], achievements: [] };

	async function complete(group:'daily'|'achievements', id:string){
		const copy = JSON.parse(JSON.stringify(tasks));
		const i = copy[group].findIndex((t:any)=>t.id===id);
		if (i<0) return;
		if (copy[group][i].completed) return;
		copy[group][i].completed = true;
		setUser((prev:any)=>({ ...prev, tasks: copy, magnumCoins: prev.magnumCoins + (copy[group][i].reward||0) }));
		const uid = (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id;
		if (uid){
			try{await fetch('/api/webapp/update-data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:uid,tasks:copy,magnumCoins:user.magnumCoins + (copy[group][i].reward||0)})});}catch{}
		}
	}

	return (
		<section>
			<h2 style={{ color:'#ffd700' }}>Задания</h2>
			<h3 style={{ color:'#aaa' }}>Ежедневные</h3>
			<div style={{ display:'grid', gap:10 }}>
				{(tasks.daily||[]).map((t:any)=>(
					<div key={t.id} style={{ padding:12, border:'1px solid rgba(255,255,255,.1)', borderRadius:10 }}>
						<div style={{ fontWeight:700 }}>{t.name}</div>
						<div style={{ color:'#aaa', fontSize:12 }}>{t.description}</div>
						<div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:8 }}>
							<div>Награда: {t.reward} MC</div>
							<button onClick={()=>complete('daily', t.id)} disabled={t.completed}>{t.completed?'Готово':'Забрать'}</button>
						</div>
					</div>
				))}
			</div>
			<h3 style={{ color:'#aaa', marginTop:16 }}>Достижения</h3>
			<div style={{ display:'grid', gap:10 }}>
				{(tasks.achievements||[]).map((t:any)=>(
					<div key={t.id} style={{ padding:12, border:'1px solid rgba(255,255,255,.1)', borderRadius:10 }}>
						<div style={{ fontWeight:700 }}>{t.name}</div>
						<div style={{ color:'#aaa', fontSize:12 }}>{t.description}</div>
						<div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:8 }}>
							<div>Награда: {t.reward} MC</div>
							<button onClick={()=>complete('achievements', t.id)} disabled={t.completed}>{t.completed?'Готово':'Забрать'}</button>
						</div>
					</div>
				))}
			</div>
		</section>
	);
}
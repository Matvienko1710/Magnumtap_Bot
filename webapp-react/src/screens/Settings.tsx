import React, { useEffect, useState } from 'react';

type Props={user:any;setUser:(u:any)=>void};

export default function Settings({user,setUser}:Props){
	const [notifications,setNotifications]=useState(!!user?.settings?.notifications);
	const [sound,setSound]=useState(!!user?.settings?.sound);
	const [autoSave,setAutoSave]=useState(!!user?.settings?.autoSave);
	const uid=(window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id;

	useEffect(()=>{
		const settings={notifications,sound,autoSave};
		setUser((p:any)=>({...p,settings}));
		localStorage.setItem('magnumStarsWebApp',JSON.stringify({...user,settings}));
		(async()=>{if(uid){try{await fetch('/api/webapp/update-data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:uid,settings})});}catch{}}})();
	// eslint-disable-next-line react-hooks/exhaustive-deps
	},[notifications,sound,autoSave]);

	return (
		<section>
			<h2 style={{color:'#ffd700'}}>Настройки</h2>
			<div style={{display:'grid',gap:12}}>
				<label><input type="checkbox" checked={notifications} onChange={(e)=>setNotifications(e.target.checked)} /> Уведомления</label>
				<label><input type="checkbox" checked={sound} onChange={(e)=>setSound(e.target.checked)} /> Звуки</label>
				<label><input type="checkbox" checked={autoSave} onChange={(e)=>setAutoSave(e.target.checked)} /> Автосохранение</label>
			</div>
		</section>
	);
}
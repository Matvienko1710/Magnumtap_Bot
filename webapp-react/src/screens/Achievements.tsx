import React from 'react';

type Props={user:any};
export default function Achievements({user}:Props){
	const list=(user.tasks?.achievements)||[];
	return (
		<section>
			<h2 style={{color:'#ffd700'}}>Достижения</h2>
			<div style={{display:'grid',gap:10}}>
				{list.map((a:any)=>(
					<div key={a.id} style={{padding:12,border:'1px solid rgba(255,255,255,.1)',borderRadius:10}}>
						<div style={{fontWeight:700}}>{a.name}</div>
						<div style={{color:'#aaa',fontSize:12}}>{a.description}</div>
						<div style={{marginTop:6}}>Прогресс: {a.progress||0}/{a.target}</div>
					</div>
				))}
			</div>
		</section>
	);
}
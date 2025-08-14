import React, { useEffect, useState } from 'react';

export function useToast(){
	const [items,setItems]=useState<{id:number,text:string,type:'success'|'error'|'info'}[]>([]);
	function push(text:string,type:'success'|'error'|'info'='info'){
		const id=Date.now()+Math.random();
		setItems(prev=>[...prev,{id,text,type}]);
		setTimeout(()=> setItems(prev=>prev.filter(x=>x.id!==id)),3000);
	}
	const node=<Container items={items}/>;
	return { push, node };
}

function Container({items}:{items:{id:number,text:string,type:'success'|'error'|'info'}[]}){
	return (
		<div style={{position:'fixed',top:16,right:16,display:'grid',gap:8,zIndex:9999}}>
			{items.map(i=> (
				<div key={i.id} style={{padding:'10px 12px',borderRadius:8,background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.1)'}}>
					{i.text}
				</div>
			))}
		</div>
	);
}
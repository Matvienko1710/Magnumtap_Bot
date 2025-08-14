export async function get<T>(url:string):Promise<T>{
	const r=await fetch(url);return r.json();
}
export async function post<T>(url:string, body:any):Promise<T>{
	const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return r.json();
}
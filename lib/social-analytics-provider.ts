import {bufferRequest} from './buffer-publishing';
import {normaliseMetrics} from './social-learning';
export type ProviderMetrics={id:string;metricsUpdatedAt:string|null;metrics:Record<string,number>};
export async function readPostMetrics(ids:string[]):Promise<ProviderMetrics[]> {
 if(!ids.length)return [];
 if(ids.length>20||ids.some(id=>!id||id.length>150))throw Error('Invalid analytics batch.');
 const declarations=ids.map((_,i)=>`$id${i}:PostId!`).join(',');
 const selections=ids.map((_,i)=>`p${i}:post(input:{id:$id${i}}){id metricsUpdatedAt metrics{type value unit}}`).join('\n');
 const data=await bufferRequest<Record<string,{id:string;metricsUpdatedAt:string|null;metrics:unknown}>>(`query NovelForgePostMetrics(${declarations}){${selections}}`,Object.fromEntries(ids.map((id,i)=>['id'+i,id])));
 return ids.flatMap((id,i)=>{const row=data['p'+i];return row?.id===id?[{id,metricsUpdatedAt:row.metricsUpdatedAt,metrics:normaliseMetrics(row.metrics)}]:[];});
}

// Public list prices checked 2026-10-02. These are estimates, never invoices.
// Sources: https://developers.openai.com/api/docs/pricing and /models/<model>.
const prices:Record<string,{input:number;cached:number;output:number}>={
 'gpt-5.6-terra':{input:2,cached:0.2,output:12},
 'gpt-5.6-luna':{input:0.2,cached:0.02,output:1.2},
 'gpt-5.4-mini':{input:0.75,cached:0.075,output:4.5},
 'gpt-5-mini':{input:0.25,cached:0.025,output:2},
};
export const unknownCost=(provider:string)=>({provider,currency:'USD',amountUsd:null,kind:'unknown'});
export const providerCost=(amount:any)=>({provider:'DataForSEO',currency:'USD',amountUsd:typeof amount==='number'&&Number.isFinite(amount)&&amount>=0?amount:null,kind:typeof amount==='number'&&Number.isFinite(amount)&&amount>=0?'reported':'unknown'});
export function openaiCost(data:any,requestedModel:string){
 const model=typeof data?.model==='string'?data.model:requestedModel;
 const base=Object.keys(prices).find(k=>model===k||new RegExp('^'+k+'-\\d{4}-\\d{2}-\\d{2}$').test(model));
 const u=data?.usage,valid=(v:any)=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
 if(!base||!valid(u?.input_tokens)||!valid(u?.output_tokens)||!Array.isArray(data?.output)|| (data.service_tier&&!['default','auto'].includes(data.service_tier)))return {...unknownCost('OpenAI'),model};
 const rate=prices[base],input=u.input_tokens,output=u.output_tokens,cached=Math.min(input,valid(u.input_tokens_details?.cached_tokens)?u.input_tokens_details.cached_tokens:0);
 const cacheWriteTokens=Math.min(input-cached,valid(u.input_tokens_details?.cache_write_tokens)?u.input_tokens_details.cache_write_tokens:0);
 if(cacheWriteTokens>0&&!base.startsWith('gpt-5.6-'))return {...unknownCost('OpenAI'),model};
 const searches=data.output.filter((o:any)=>o.type==='web_search_call').length;
 const long=base.startsWith('gpt-5.6-')&&input>272000;
 const tokensUsd=((input-cached-cacheWriteTokens+cacheWriteTokens*1.25)*rate.input*(long?2:1)+cached*rate.cached*(long?2:1)+output*rate.output*(long?1.5:1))/1000000;
 const searchUsd=searches*0.01;
 return {provider:'OpenAI',currency:'USD',kind:'estimated',amountUsd:Number((tokensUsd+searchUsd).toFixed(8)),model,priceDate:'2026-10-02',source:'https://developers.openai.com/api/docs/pricing',inputTokens:input,cachedTokens:cached,cacheWriteTokens,outputTokens:output,searches,tokensUsd,searchUsd,note:'Schätzung aus gemeldetem Tokenverbrauch und Websuch-Aufrufen zum gespeicherten Standardtarif; keine Rechnung. Sondertarife und nicht ausgewiesene Suchinhalt-Tokens können abweichen.'};
}

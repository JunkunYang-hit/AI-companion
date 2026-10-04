import type {Settings} from '../shared/types';

// 保留来源和核验时间；过期价目不能自动用于新请求。
export const officialPriceUrl='https://api-docs.deepseek.com/zh-cn/quick_start/pricing/';
const snapshot={checkedAt:Date.UTC(2026,9,1),flash:{input:2,cached:0.04,output:8},pro:{input:9,cached:0.30,output:27}};
export function officialPrices(s:Settings,now=Date.now()) {
  if(s.provider!=='deepseek'||!/^https:\/\/api\.deepseek\.com\/?(?:v1\/?)?$/.test(s.baseUrl))return null;
  if(now-snapshot.checkedAt>30*86400_000)return null;
  const price=['deepseek-flash','deepseek-v4-flash','deepseek-v4-flash-vision-exp'].includes(s.model)?snapshot.flash:s.model==='deepseek-v4-pro'?snapshot.pro:null;
  return price?{inputPrice:price.input,cachedInputPrice:price.cached,outputPrice:price.output,priceSource:officialPriceUrl,priceCheckedAt:snapshot.checkedAt}:null;
}
export function applyOfficialPrices(s:Settings) {
  if(s.priceSource==='manual')return;
  if(s.priceSource===officialPriceUrl&&s.priceCheckedAt>snapshot.checkedAt&&Date.now()-s.priceCheckedAt<=30*86400_000)return;
  const price=officialPrices(s);if(price)Object.assign(s,price);
  else if(s.priceSource===officialPriceUrl)Object.assign(s,{inputPrice:null,outputPrice:null,cachedInputPrice:null,priceSource:'',priceCheckedAt:0});
}
export async function refreshOfficialPrices(s:Settings) {
  if(s.provider!=='deepseek'||!/^https:\/\/api\.deepseek\.com\/?(?:v1\/?)?$/.test(s.baseUrl))throw new Error('当前服务请使用自定义单价。');
  const response=await fetch(officialPriceUrl,{signal:AbortSignal.timeout(15000),redirect:'error'});
  if(!response.ok)throw new Error('官网价目暂时无法读取，请稍后重试。');
  const html=await response.text();if(html.length>1_000_000)throw new Error('官网价目格式已变化，请手动填写。');
  const text=html.replace(/<[^>]+>/g,' ').replace(/&[^;]+;/g,' ').replace(/\s+/g,' ');
  const prices=[...text.matchAll(/高峰时段\s*(\d+(?:\.\d+)?)\s*元\s*(\d+(?:\.\d+)?)\s*元/g)];
  if(prices.length!==3||!text.includes('deepseek-flash')||!text.includes('deepseek-v4-pro'))throw new Error('官网价目格式已变化，请手动填写。');
  const column=s.model==='deepseek-v4-pro'?2:['deepseek-flash','deepseek-v4-flash','deepseek-v4-flash-vision-exp'].includes(s.model)?1:0;
  if(!column)throw new Error('官网未列出此模型，请填写自定义单价。');
  const [cached,input,output]=prices.map(p=>Number(p[column]));
  if([cached,input,output].some(p=>!Number.isFinite(p)||p<0||p>10000)||cached>input)throw new Error('官网价目校验失败。');
  return {inputPrice:input,cachedInputPrice:cached,outputPrice:output,priceSource:officialPriceUrl,priceCheckedAt:Date.now()};
}
